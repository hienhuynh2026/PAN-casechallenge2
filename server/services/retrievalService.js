/**
 * retrievalService.js
 *
 * RAG-style semantic retrieval pipeline:
 *   1. Normalize job corpus → retrieval documents
 *   2. Normalize candidate profile → retrieval query
 *   3. Embed via Gemini (with caching + fallback)
 *   4. Retrieve top-K by cosine similarity
 *   5. Produce explainability evidence for each match
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  embedSingle,
  embedBatch,
  isGeminiEmbeddingConfigured,
  getStats: getEmbeddingStats,
  DEFAULT_MODEL,
} = require('./geminiEmbeddingService');
const { getRoleProfile } = require('../data/roleKnowledgeBase');

const jobs = require(path.join(__dirname, '../../data/sample_jobs.json'));

// ─── Similarity thresholds ───────────────────────────────────────────────────
const SIMILARITY_THRESHOLDS = {
  STRONG: 0.70,
  MODERATE: 0.50,
  WEAK: 0.30,
};

function classifyMatch(score) {
  if (score >= SIMILARITY_THRESHOLDS.STRONG) return 'strong';
  if (score >= SIMILARITY_THRESHOLDS.MODERATE) return 'moderate';
  if (score >= SIMILARITY_THRESHOLDS.WEAK) return 'weak';
  return 'none';
}

// ─── Cosine similarity for dense vectors ─────────────────────────────────────
function cosineVectorSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── TF-IDF fallback utilities ───────────────────────────────────────────────
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+.#/\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function cosineSimilarityMaps(mapA, mapB) {
  if (!mapA.size || !mapB.size) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (const v of mapA.values()) normA += v * v;
  for (const v of mapB.values()) normB += v * v;
  if (normA === 0 || normB === 0) return 0;
  for (const [token, valA] of mapA.entries()) {
    const valB = mapB.get(token);
    if (valB) dot += valA * valB;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function toTfMap(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}

function buildIdfMap(docsTokens) {
  const df = new Map();
  const total = docsTokens.length;
  for (const tokens of docsTokens) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) || 0) + 1);
  }
  const idf = new Map();
  for (const [t, freq] of df.entries()) {
    idf.set(t, Math.log((1 + total) / (1 + freq)) + 1);
  }
  return idf;
}

function toTfidfMap(tfMap, idfMap) {
  const out = new Map();
  const totalTerms = [...tfMap.values()].reduce((a, b) => a + b, 0) || 1;
  for (const [token, count] of tfMap.entries()) {
    out.set(token, (count / totalTerms) * (idfMap.get(token) || 0));
  }
  return out;
}

// ─── Job document normalization ──────────────────────────────────────────────

function normalizeJobDocument(job) {
  const parts = [
    job.title || '',
    job.company || '',
    job.description || '',
    `Required skills: ${(job.requiredSkills || []).join(', ')}`,
    `Preferred skills: ${(job.preferredSkills || []).join(', ')}`,
    `Experience level: ${job.experienceLevel || ''}`,
  ];
  return {
    id: String(job.id),
    title: job.title,
    company: job.company,
    description: job.description,
    requiredSkills: job.requiredSkills || [],
    preferredSkills: job.preferredSkills || [],
    experienceLevel: job.experienceLevel || '',
    embeddingText: parts.join('\n'),
  };
}

// ─── Profile document normalization ──────────────────────────────────────────

/**
 * Converts a parsed profile + resume text into a retrieval-ready document.
 * All inputs are optional; produces a deterministic text from whatever is available.
 */
function normalizeProfileDocument({ resumeText, skills, workExperience, projects, education, certifications, targetRole } = {}) {
  const parts = [];

  if (targetRole) parts.push(`Target role: ${targetRole}`);

  if (skills && skills.length > 0) {
    parts.push(`Skills: ${skills.join(', ')}`);
  }

  if (workExperience && workExperience.length > 0) {
    parts.push('Professional experience:');
    for (const exp of workExperience) {
      const line = [exp.title, exp.company, exp.location].filter(Boolean).join(' at ');
      parts.push(`- ${line}`);
      if (Array.isArray(exp.bullets)) {
        for (const b of exp.bullets) parts.push(`  ${b}`);
      }
    }
  }

  if (projects && projects.length > 0) {
    parts.push('Projects:');
    for (const proj of projects) {
      const tech = Array.isArray(proj.technologies) ? proj.technologies.join(', ') : '';
      parts.push(`- ${proj.name || 'Project'}${tech ? ` (${tech})` : ''}`);
      if (Array.isArray(proj.bullets)) {
        for (const b of proj.bullets) parts.push(`  ${b}`);
      }
    }
  }

  if (education) parts.push(`Education: ${education}`);
  if (certifications && certifications.length > 0) {
    parts.push(`Certifications: ${certifications.join(', ')}`);
  }

  // Append raw resume text as fallback signal if structured data is sparse
  if (resumeText && parts.length < 3) {
    parts.push(resumeText.slice(0, 2000));
  }

  return {
    embeddingText: parts.join('\n'),
    skills: skills || [],
    targetRole: targetRole || '',
  };
}

// ─── Explainability: compute overlap evidence ────────────────────────────────

function normalizeSkill(s) { return s.toLowerCase().trim(); }

function computeOverlapEvidence(profileDoc, jobDoc) {
  const profileSkills = new Set((profileDoc.skills || []).map(normalizeSkill));

  const matchingSkills = [];
  const allJobSkills = [...jobDoc.requiredSkills, ...jobDoc.preferredSkills];
  for (const skill of allJobSkills) {
    if (profileSkills.has(normalizeSkill(skill))) matchingSkills.push(skill);
  }

  // Domain term overlap from description
  const profileText = profileDoc.embeddingText.toLowerCase();
  const domainTerms = [];
  const descWords = (jobDoc.description || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const uniqueDescWords = [...new Set(descWords)];
  for (const word of uniqueDescWords) {
    if (profileText.includes(word) && !matchingSkills.map(normalizeSkill).includes(word)) {
      domainTerms.push(word);
    }
  }

  // Education alignment
  const educationTerms = ['degree', 'bachelor', 'master', 'phd', 'university', 'college', 'certificate', 'diploma'];
  const hasEducationSignal = educationTerms.some((t) => profileText.includes(t));

  // Experience alignment based on experience level
  const expLevel = jobDoc.experienceLevel || '';
  const experienceAlignment = expLevel.toLowerCase() === 'entry' ? 'entry-level friendly'
    : expLevel.toLowerCase() === 'mid' ? 'mid-level position'
    : expLevel.toLowerCase() === 'senior' ? 'senior-level position'
    : 'unspecified level';

  return {
    matchingSkills,
    skillOverlapCount: matchingSkills.length,
    totalJobSkills: allJobSkills.length,
    skillOverlapRatio: allJobSkills.length > 0 ? Number((matchingSkills.length / allJobSkills.length).toFixed(3)) : 0,
    domainTerms: domainTerms.slice(0, 8),
    hasEducationSignal,
    experienceAlignment,
  };
}

// ─── Embedding index loading (precomputed) ───────────────────────────────────

let cachedIndexVectors = null;
let cachedIndexModel = null;
let cachedIndexDocsHash = null;

function getEmbeddingIndexPath() {
  const configured = process.env.EMBEDDING_INDEX_PATH;
  if (!configured) return path.resolve(__dirname, '../data/job_embeddings.index.json');
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

function computeDocsHash(docs) {
  return crypto.createHash('sha1').update(docs.join('\n')).digest('hex');
}

function loadIndexedJobEmbeddings(jobDocs, model) {
  const docsHash = computeDocsHash(jobDocs);
  if (cachedIndexVectors && cachedIndexModel === model && cachedIndexDocsHash === docsHash && cachedIndexVectors.length === jobDocs.length) {
    return cachedIndexVectors;
  }

  const indexPath = getEmbeddingIndexPath();
  if (!fs.existsSync(indexPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    if (parsed?.model !== model || parsed?.docsHash !== docsHash || !Array.isArray(parsed?.items) || parsed.items.length !== jobs.length) {
      return null;
    }
    const byId = new Map(parsed.items.map((item) => [String(item.id), item.vector]));
    const ordered = jobs.map((job) => byId.get(String(job.id)));
    if (ordered.some((v) => !Array.isArray(v) || v.length === 0)) return null;
    cachedIndexVectors = ordered;
    cachedIndexModel = model;
    cachedIndexDocsHash = docsHash;
    return ordered;
  } catch {
    return null;
  }
}

// ─── TF-IDF fallback retrieval ───────────────────────────────────────────────

function retrieveWithTfIdf(profileDoc, jobDocs, k = 5) {
  const queryTokens = tokenize(profileDoc.embeddingText);
  const jobTokenSets = jobDocs.map((jd) => tokenize(jd.embeddingText));
  const idf = buildIdfMap([...jobTokenSets, queryTokens]);
  const queryVec = toTfidfMap(toTfMap(queryTokens), idf);
  const profileSkills = new Set((profileDoc.skills || []).map(normalizeSkill));

  const ranked = jobDocs.map((jd, idx) => {
    const docVec = toTfidfMap(toTfMap(jobTokenSets[idx]), idf);
    const semanticScore = cosineSimilarityMaps(queryVec, docVec);
    const evidence = computeOverlapEvidence(profileDoc, jd);
    const roleBoost = jd.title.toLowerCase() === (profileDoc.targetRole || '').toLowerCase() ? 0.15 : 0;
    const blendedScore = (semanticScore * 0.65) + (evidence.skillOverlapRatio * 0.35) + roleBoost;

    return {
      ...jd,
      semanticScore: Number(semanticScore.toFixed(4)),
      retrievalScore: Number(blendedScore.toFixed(4)),
      matchStrength: classifyMatch(blendedScore),
      evidence,
    };
  }).sort((a, b) => b.retrievalScore - a.retrievalScore);

  return {
    topJobs: ranked.slice(0, k),
    allRanked: ranked,
    method: 'tfidf_fallback',
    embeddingUsed: false,
  };
}

// ─── Main semantic retrieval ─────────────────────────────────────────────────

/**
 * Retrieve top-K most relevant jobs for a candidate profile using semantic embeddings.
 * Falls back to TF-IDF if Gemini is unavailable or rate-limited.
 *
 * @param {Object} profileInput - { resumeText, skills, workExperience, projects, education, certifications, targetRole }
 * @param {number} k - number of results to return (default 5)
 * @returns {{ topJobs, method, embeddingUsed, embeddingStats, fallbackReason? }}
 */
async function retrieveTopJobs(profileInput, k = 5) {
  const profileDoc = normalizeProfileDocument(profileInput);
  const jobDocs = jobs.map(normalizeJobDocument);

  if (!isGeminiEmbeddingConfigured()) {
    return {
      ...retrieveWithTfIdf(profileDoc, jobDocs, k),
      fallbackReason: 'GEMINI_API_KEY not configured',
      embeddingStats: getEmbeddingStats(),
    };
  }

  try {
    const model = DEFAULT_MODEL;
    const jobTexts = jobDocs.map((jd) => jd.embeddingText);
    const docsHash = computeDocsHash(jobTexts);

    // Try precomputed index first
    let jobVectors = loadIndexedJobEmbeddings(jobTexts, model);
    let indexUsed = Boolean(jobVectors);

    // If no index, embed all jobs (batched)
    if (!jobVectors) {
      jobVectors = await embedBatch(jobTexts, model);
    }

    // Embed profile
    const profileVector = await embedSingle(profileDoc.embeddingText, model);

    // Compute similarities + evidence
    const ranked = jobDocs.map((jd, idx) => {
      const semanticScore = cosineVectorSimilarity(profileVector, jobVectors[idx]);
      const evidence = computeOverlapEvidence(profileDoc, jd);
      const roleBoost = jd.title.toLowerCase() === (profileDoc.targetRole || '').toLowerCase() ? 0.10 : 0;
      const blendedScore = (semanticScore * 0.55) + (evidence.skillOverlapRatio * 0.30) + roleBoost + (evidence.hasEducationSignal ? 0.05 : 0);

      return {
        ...jd,
        semanticScore: Number(semanticScore.toFixed(4)),
        retrievalScore: Number(blendedScore.toFixed(4)),
        matchStrength: classifyMatch(blendedScore),
        evidence,
      };
    }).sort((a, b) => b.retrievalScore - a.retrievalScore);

    return {
      topJobs: ranked.slice(0, k),
      allRanked: ranked,
      method: `gemini_embedding:${model}`,
      embeddingUsed: true,
      indexUsed,
      embeddingStats: getEmbeddingStats(),
    };
  } catch (err) {
    // Fallback to TF-IDF on any embedding error
    const embeddingStats = getEmbeddingStats();
    embeddingStats.fallbackCount++;
    return {
      ...retrieveWithTfIdf(profileDoc, jobDocs, k),
      fallbackReason: err.message,
      embeddingStats,
    };
  }
}

// ─── Retrieval metrics ───────────────────────────────────────────────────────

function computeRetrievalMetrics(rankedJobs, targetRole, k = 5) {
  const topK = rankedJobs.slice(0, k);
  const relevantTotal = jobs.filter((j) => j.title.toLowerCase() === targetRole.toLowerCase()).length;
  const rel = topK.map((j) => (j.title.toLowerCase() === targetRole.toLowerCase() ? 1 : 0));

  const precisionAtK = topK.length > 0 ? Number((rel.reduce((a, b) => a + b, 0) / topK.length).toFixed(3)) : 0;
  const recallAtK = relevantTotal > 0 ? Number((rel.reduce((a, b) => a + b, 0) / relevantTotal).toFixed(3)) : 0;

  let dcg = 0;
  for (let i = 0; i < rel.length; i++) dcg += rel[i] / Math.log2(i + 2);
  let idcg = 0;
  for (let i = 0; i < Math.min(relevantTotal, k); i++) idcg += 1 / Math.log2(i + 2);
  const ndcgAtK = idcg > 0 ? Number((dcg / idcg).toFixed(3)) : 0;

  let mrr = 0;
  for (let i = 0; i < rankedJobs.length; i++) {
    if (rankedJobs[i].title.toLowerCase() === targetRole.toLowerCase()) {
      mrr = Number((1 / (i + 1)).toFixed(3));
      break;
    }
  }

  return { k, relevantInTopK: rel.reduce((a, b) => a + b, 0), relevantTotal, precisionAtK, recallAtK, ndcgAtK, mrr };
}

module.exports = {
  retrieveTopJobs,
  normalizeJobDocument,
  normalizeProfileDocument,
  computeOverlapEvidence,
  computeRetrievalMetrics,
  cosineVectorSimilarity,
  classifyMatch,
  SIMILARITY_THRESHOLDS,
};
