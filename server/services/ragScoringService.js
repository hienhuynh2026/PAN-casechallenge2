/**
 * ragScoringService.js
 *
 * Combines semantic retrieval results with the existing heuristic alignment score
 * to produce a final composite score and decision.
 *
 * Flow:
 *   1. Heuristic alignment score (from alignmentScoringService)
 *   2. Semantic retrieval of top-5 jobs (from retrievalService)
 *   3. Structured skill/experience overlap per job
 *   4. Composite score = weighted blend of heuristic + retrieval evidence
 *   5. Final decision + explainability output
 */

const { computeAlignmentScore, THRESHOLDS } = require('./alignmentScoringService');
const { retrieveTopJobs, computeRetrievalMetrics, classifyMatch } = require('./retrievalService');
const { getRoleProfile } = require('../data/roleKnowledgeBase');

// Resource map for per-skill learning links (same as fallbackService)
const RESOURCE_MAP = {
  Python: [
    { name: 'CS50P on edX', url: 'https://cs50.harvard.edu/python/', type: 'Course' },
    { name: 'Python.org Official Tutorial', url: 'https://docs.python.org/3/tutorial/', type: 'Docs' },
  ],
  JavaScript: [
    { name: 'The Odin Project', url: 'https://www.theodinproject.com/', type: 'Course' },
    { name: 'MDN JavaScript Guide', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide', type: 'Docs' },
  ],
  React: [
    { name: 'React Official Docs', url: 'https://react.dev/learn', type: 'Docs' },
  ],
  TypeScript: [
    { name: 'TypeScript Handbook', url: 'https://www.typescriptlang.org/docs/handbook/intro.html', type: 'Docs' },
  ],
  'Node.js': [
    { name: 'Node.js Official Docs', url: 'https://nodejs.org/en/docs/guides', type: 'Docs' },
  ],
  AWS: [
    { name: 'AWS Cloud Practitioner Essentials (free)', url: 'https://explore.skillbuilder.aws/learn/course/134', type: 'Course' },
  ],
  Docker: [
    { name: 'Docker Getting Started', url: 'https://docs.docker.com/get-started/', type: 'Docs' },
  ],
  Kubernetes: [
    { name: 'Kubernetes Official Tutorial', url: 'https://kubernetes.io/docs/tutorials/', type: 'Docs' },
  ],
  SQL: [
    { name: 'SQLZoo', url: 'https://sqlzoo.net/', type: 'Tutorial' },
  ],
  Git: [
    { name: 'Pro Git (free book)', url: 'https://git-scm.com/book/en/v2', type: 'Docs' },
  ],
  Linux: [
    { name: 'Linux Journey', url: 'https://linuxjourney.com/', type: 'Course' },
  ],
  'Machine Learning': [
    { name: 'Google ML Crash Course', url: 'https://developers.google.com/machine-learning/crash-course', type: 'Course' },
  ],
  TensorFlow: [
    { name: 'TensorFlow Tutorials', url: 'https://www.tensorflow.org/tutorials', type: 'Docs' },
  ],
  Terraform: [
    { name: 'HashiCorp Terraform Tutorials', url: 'https://developer.hashicorp.com/terraform/tutorials', type: 'Tutorial' },
  ],
  'CI/CD': [
    { name: 'GitHub Actions Docs', url: 'https://docs.github.com/en/actions', type: 'Docs' },
  ],
  'Data Visualization': [
    { name: 'Tableau Free Training', url: 'https://www.tableau.com/learn/training', type: 'Course' },
  ],
  Statistics: [
    { name: 'Khan Academy Statistics', url: 'https://www.khanacademy.org/math/statistics-probability', type: 'Course' },
  ],
};

// ─── Scoring weights ────────────────────────────────────────────────────────
const WEIGHTS = {
  heuristicScore: 0.50,    // existing rule-based alignment
  semanticRetrievalScore: 0.20,  // avg cosine similarity of top-5
  skillOverlap: 0.15,      // avg skill overlap across top-5
  experienceRelevance: 0.10, // experience level alignment
  educationRelevance: 0.05,  // education signal presence
};

// ─── Composite scoring ──────────────────────────────────────────────────────

function computeCompositeScore(heuristicAlignment, retrievalResult) {
  const topJobs = retrievalResult.topJobs || [];
  if (topJobs.length === 0) {
    // No retrieval data — fall back to heuristic only
    return {
      compositeScore: heuristicAlignment.alignmentScore,
      heuristicWeight: 1.0,
      retrievalWeight: 0,
      components: {
        heuristic: heuristicAlignment.alignmentScore,
        semanticRetrieval: 0,
        skillOverlap: 0,
        experienceRelevance: 0,
        educationRelevance: 0,
      },
    };
  }

  // Semantic retrieval: average semantic similarity of top-5 (scaled to 0-100)
  const avgSemantic = topJobs.reduce((sum, j) => sum + (j.semanticScore || 0), 0) / topJobs.length;
  const semanticScore100 = Math.round(avgSemantic * 100);

  // Skill overlap: average across top-5
  const avgSkillOverlap = topJobs.reduce((sum, j) => sum + (j.evidence?.skillOverlapRatio || 0), 0) / topJobs.length;
  const skillOverlapScore100 = Math.round(avgSkillOverlap * 100);

  // Experience relevance: do any top-5 jobs match entry level (more accessible)?
  const expLevels = topJobs.map((j) => (j.experienceLevel || '').toLowerCase());
  const hasEntryLevel = expLevels.some((e) => e === 'entry');
  const hasMidLevel = expLevels.some((e) => e === 'mid');
  const experienceScore100 = hasEntryLevel ? 80 : hasMidLevel ? 60 : 40;

  // Education: any top-5 evidence has education signal?
  const hasEducation = topJobs.some((j) => j.evidence?.hasEducationSignal);
  const educationScore100 = hasEducation ? 70 : 30;

  const compositeScore = Math.min(100, Math.round(
    WEIGHTS.heuristicScore * heuristicAlignment.alignmentScore +
    WEIGHTS.semanticRetrievalScore * semanticScore100 +
    WEIGHTS.skillOverlap * skillOverlapScore100 +
    WEIGHTS.experienceRelevance * experienceScore100 +
    WEIGHTS.educationRelevance * educationScore100
  ));

  return {
    compositeScore,
    heuristicWeight: WEIGHTS.heuristicScore,
    retrievalWeight: 1 - WEIGHTS.heuristicScore,
    components: {
      heuristic: heuristicAlignment.alignmentScore,
      semanticRetrieval: semanticScore100,
      skillOverlap: skillOverlapScore100,
      experienceRelevance: experienceScore100,
      educationRelevance: educationScore100,
    },
  };
}

// ─── Main entry: full RAG evaluation ────────────────────────────────────────

/**
 * Run the full RAG-augmented evaluation:
 *   1. Heuristic alignment scoring
 *   2. Semantic retrieval of top-5 jobs
 *   3. Composite scoring
 *   4. Explainability
 *
 * @param {string} resumeText - raw resume text
 * @param {string} targetRole - target role name
 * @param {Object} profileData - optional structured profile { skills, workExperience, projects, education, certifications }
 * @returns {Object} full evaluation result
 */
async function evaluateWithRAG(resumeText, targetRole, profileData = {}) {
  // Step 1: Heuristic alignment (always runs, deterministic)
  const alignment = computeAlignmentScore(resumeText, targetRole);

  // Step 2: Semantic retrieval
  let retrieval;
  try {
    retrieval = await retrieveTopJobs({
      resumeText,
      skills: profileData.skills || alignment.coreMatched,
      workExperience: profileData.workExperience || [],
      projects: profileData.projects || [],
      education: profileData.education || '',
      certifications: profileData.certifications || [],
      targetRole,
    }, 5);
  } catch (err) {
    console.warn('RAG retrieval failed, using heuristic only:', err.message);
    retrieval = { topJobs: [], method: 'none', embeddingUsed: false, fallbackReason: err.message };
  }

  // Step 3: Composite score
  const composite = computeCompositeScore(alignment, retrieval);

  // Step 4: Determine best match and aggregate evidence
  const topJobs = (retrieval.topJobs || []).map((job) => ({
    id: job.id,
    title: job.title,
    company: job.company,
    experienceLevel: job.experienceLevel,
    description: job.description,
    semanticScore: job.semanticScore,
    retrievalScore: job.retrievalScore,
    matchStrength: job.matchStrength,
    evidence: job.evidence,
  }));

  const bestMatch = topJobs.length > 0 ? topJobs[0] : null;

  // Aggregate strengths and gaps
  const allMatchedSkills = new Set();
  const allMissingSkills = new Set();
  for (const job of topJobs) {
    for (const skill of (job.evidence?.matchingSkills || [])) allMatchedSkills.add(skill);
    const jobSkills = [...(job.requiredSkills || []), ...(job.preferredSkills || [])];
    for (const skill of jobSkills) {
      if (!allMatchedSkills.has(skill)) allMissingSkills.add(skill);
    }
  }

  // Compute retrieval metrics
  const metrics = retrieval.allRanked
    ? computeRetrievalMetrics(retrieval.allRanked, targetRole, 5)
    : null;

  // Step 5: Determine scoring method label
  const scoringMethod = determineScoringMethod(retrieval, alignment);

  // Step 6: Missing skills help (grounded in retrieved jobs + curated resources)
  // Use raw retrieval.topJobs which includes requiredSkills/preferredSkills from normalizeJobDocument
  const missingSkillsHelp = computeMissingSkillsHelp(retrieval, targetRole);

  return {
    alignment,
    retrieval: {
      topJobs,
      bestMatch,
      method: retrieval.method,
      embeddingUsed: retrieval.embeddingUsed || false,
      indexUsed: retrieval.indexUsed || false,
      fallbackReason: retrieval.fallbackReason || null,
      metrics,
      embeddingStats: retrieval.embeddingStats || null,
    },
    composite,
    explainability: {
      overallStrengths: [...allMatchedSkills].slice(0, 15),
      overallGaps: [...allMissingSkills].slice(0, 15),
      thresholdComparison: {
        heuristicScore: alignment.alignmentScore,
        compositeScore: composite.compositeScore,
        strongThreshold: THRESHOLDS.STRONG,
        borderlineThreshold: THRESHOLDS.BORDERLINE,
      },
    },
    missingSkillsHelp,
    scoringMethod,
  };
}

// ─── Scoring method label (honest labeling) ──────────────────────────────────

function determineScoringMethod(retrieval, alignment) {
  const embeddingActive = retrieval.embeddingUsed || false;
  const llmActive = alignment.goForLLM || false;

  if (embeddingActive && llmActive) {
    return {
      id: 'semantic_retrieval_plus_llm',
      label: 'Semantic Retrieval + AI Review',
      description: 'Scores based on semantic job matching via embeddings, rule-based alignment, and LLM coaching.',
    };
  }
  if (embeddingActive) {
    return {
      id: 'semantic_retrieval_plus_rules',
      label: 'Semantic Retrieval + Rules',
      description: 'Scores based on semantic job matching via embeddings combined with rule-based skill alignment.',
    };
  }
  if (llmActive) {
    return {
      id: 'heuristic_plus_llm',
      label: 'Rule-Based Match + AI Review',
      description: 'Scores based on keyword-based alignment rules with LLM-powered coaching.',
    };
  }
  if (retrieval.method === 'tfidf_fallback') {
    return {
      id: 'heuristic_plus_tfidf',
      label: 'Rule-Based Match + TF-IDF Retrieval',
      description: 'Scores based on keyword alignment and TF-IDF lexical similarity. Embedding service unavailable.',
    };
  }
  return {
    id: 'heuristic_only',
    label: 'Rule-Based Match Engine',
    description: 'Scores based on deterministic keyword alignment and section-weighted rules.',
  };
}

// ─── Missing Skills Help ────────────────────────────────────────────────────

/**
 * Compute prioritized missing skills with explanations and curated resources.
 *
 * Prioritization: skills that appear in more top-5 jobs rank higher.
 * Only includes skills the candidate is actually missing (not matched).
 * Resources come from roleKnowledgeBase.resourceHints and RESOURCE_MAP — never generated.
 *
 * @param {Object} retrieval - retrieval result with topJobs
 * @param {string} targetRole - target role name
 * @returns {Array} sorted list of missing skill help objects (max 8)
 */
function computeMissingSkillsHelp(retrieval, targetRole) {
  const topJobs = (retrieval && retrieval.topJobs) || [];
  if (topJobs.length === 0) return [];

  // Collect matched skills across all top jobs
  const matchedSkillsLower = new Set();
  for (const job of topJobs) {
    for (const skill of (job.evidence?.matchingSkills || [])) {
      matchedSkillsLower.add(skill.toLowerCase().trim());
    }
  }

  // Count how many top jobs require each missing skill (frequency = importance)
  const skillFrequency = new Map(); // skill (original case) → count
  const skillIsRequired = new Map(); // skill → whether it appears as required (not just preferred)
  for (const job of topJobs) {
    const required = new Set((job.requiredSkills || []).map((s) => s.toLowerCase().trim()));
    const allSkills = [...(job.requiredSkills || []), ...(job.preferredSkills || [])];
    for (const skill of allSkills) {
      const lower = skill.toLowerCase().trim();
      if (matchedSkillsLower.has(lower)) continue;
      if (!skillFrequency.has(skill)) {
        skillFrequency.set(skill, 0);
        skillIsRequired.set(skill, false);
      }
      skillFrequency.set(skill, skillFrequency.get(skill) + 1);
      if (required.has(lower)) skillIsRequired.set(skill, true);
    }
  }

  if (skillFrequency.size === 0) return [];

  // Sort by frequency (desc), then required > preferred
  const sorted = [...skillFrequency.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const aReq = skillIsRequired.get(a[0]) ? 1 : 0;
      const bReq = skillIsRequired.get(b[0]) ? 1 : 0;
      return bReq - aReq;
    })
    .slice(0, 8);

  // Look up role profile for resourceHints and projectIdeas
  const roleProfile = getRoleProfile(targetRole);
  const gapCategories = roleProfile?.gapCategories || {};
  const resourceHints = roleProfile?.resourceHints || {};
  const projectIdeas = roleProfile?.projectIdeas || {};

  // Build a skill → category lookup
  const skillToCategory = {};
  for (const [category, skills] of Object.entries(gapCategories)) {
    for (const s of skills) {
      skillToCategory[s.toLowerCase().trim()] = category;
    }
  }

  return sorted.map(([skill, frequency]) => {
    const lower = skill.toLowerCase().trim();
    const isRequired = skillIsRequired.get(skill);
    const jobCount = topJobs.length;

    // Why it matters
    const whyItMatters = isRequired
      ? `Required by ${frequency} of ${jobCount} top-matching jobs for ${targetRole}.`
      : `Listed as preferred in ${frequency} of ${jobCount} top-matching jobs.`;

    // Find category for this skill
    const category = skillToCategory[lower] || null;

    // How to improve: use project idea from roleKnowledgeBase if available
    let howToImprove = null;
    if (category && projectIdeas[category] && projectIdeas[category].length > 0) {
      howToImprove = projectIdeas[category][0];
    }

    // Resources: first check RESOURCE_MAP for exact skill, then roleKnowledgeBase category hints
    let resources = [];
    if (RESOURCE_MAP[skill]) {
      resources = RESOURCE_MAP[skill].slice(0, 2);
    } else if (category && resourceHints[category]) {
      resources = resourceHints[category].slice(0, 2);
    }

    return {
      skill,
      frequency,
      isRequired,
      whyItMatters,
      howToImprove,
      resources,
      category,
    };
  });
}

module.exports = {
  evaluateWithRAG,
  computeCompositeScore,
  computeMissingSkillsHelp,
  determineScoringMethod,
  WEIGHTS,
};
