const path = require('path');
const jobs = require(path.join(__dirname, '../../data/sample_jobs.json'));
const Groq = require('groq-sdk');
const db = require('../db/database');
const { retrieveTopJobs, computeRetrievalMetrics } = require('../services/retrievalService');
const { getStats: getEmbeddingStats } = require('../services/geminiEmbeddingService');
const { getRoleProfile } = require('../data/roleKnowledgeBase');
const { computeAlignmentScore } = require('../services/alignmentScoringService');

// Curated per-skill resources (same source as ragScoringService)
const SKILL_RESOURCES = {
  Python: [
    { name: 'CS50P on edX', url: 'https://cs50.harvard.edu/python/', type: 'Course' },
    { name: 'Python.org Official Tutorial', url: 'https://docs.python.org/3/tutorial/', type: 'Docs' },
  ],
  JavaScript: [
    { name: 'The Odin Project', url: 'https://www.theodinproject.com/', type: 'Course' },
    { name: 'MDN JavaScript Guide', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide', type: 'Docs' },
  ],
  React: [{ name: 'React Official Docs', url: 'https://react.dev/learn', type: 'Docs' }],
  TypeScript: [{ name: 'TypeScript Handbook', url: 'https://www.typescriptlang.org/docs/handbook/intro.html', type: 'Docs' }],
  'Node.js': [{ name: 'Node.js Official Docs', url: 'https://nodejs.org/en/docs/guides', type: 'Docs' }],
  AWS: [{ name: 'AWS Cloud Practitioner Essentials (free)', url: 'https://explore.skillbuilder.aws/learn/course/134', type: 'Course' }],
  Docker: [{ name: 'Docker Getting Started', url: 'https://docs.docker.com/get-started/', type: 'Docs' }],
  Kubernetes: [{ name: 'Kubernetes Official Tutorial', url: 'https://kubernetes.io/docs/tutorials/', type: 'Docs' }],
  SQL: [{ name: 'SQLZoo', url: 'https://sqlzoo.net/', type: 'Tutorial' }],
  Git: [{ name: 'Pro Git (free book)', url: 'https://git-scm.com/book/en/v2', type: 'Docs' }],
  Linux: [{ name: 'Linux Journey', url: 'https://linuxjourney.com/', type: 'Course' }],
  'Machine Learning': [{ name: 'Google ML Crash Course', url: 'https://developers.google.com/machine-learning/crash-course', type: 'Course' }],
  TensorFlow: [{ name: 'TensorFlow Tutorials', url: 'https://www.tensorflow.org/tutorials', type: 'Docs' }],
  Terraform: [{ name: 'HashiCorp Terraform Tutorials', url: 'https://developer.hashicorp.com/terraform/tutorials', type: 'Tutorial' }],
  'CI/CD': [{ name: 'GitHub Actions Docs', url: 'https://docs.github.com/en/actions', type: 'Docs' }],
  'Data Visualization': [{ name: 'Tableau Free Training', url: 'https://www.tableau.com/learn/training', type: 'Course' }],
  Statistics: [{ name: 'Khan Academy Statistics', url: 'https://www.khanacademy.org/math/statistics-probability', type: 'Course' }],
  'Apache Spark': [{ name: 'Apache Spark Docs', url: 'https://spark.apache.org/docs/latest/', type: 'Docs' }],
  'Network Security': [{ name: 'Cybrary Network Security', url: 'https://www.cybrary.it/course/network-security/', type: 'Course' }],
  SIEM: [{ name: 'Splunk Free Training', url: 'https://www.splunk.com/en_us/training/free-courses/splunk-fundamentals-1.html', type: 'Course' }],
  'Penetration Testing': [{ name: 'TryHackMe', url: 'https://tryhackme.com/', type: 'Tutorial' }],
};

/**
 * Look up curated resources for a skill name, falling back to roleKnowledgeBase category hints.
 */
function getResourcesForSkill(skillName, targetRole) {
  if (SKILL_RESOURCES[skillName]) return SKILL_RESOURCES[skillName].slice(0, 2);

  const roleProfile = getRoleProfile(targetRole);
  if (!roleProfile) return [];

  const gapCategories = roleProfile.gapCategories || {};
  const resourceHints = roleProfile.resourceHints || {};
  const lower = skillName.toLowerCase().trim();

  for (const [category, skills] of Object.entries(gapCategories)) {
    if (skills.some((s) => s.toLowerCase().trim() === lower)) {
      return (resourceHints[category] || []).slice(0, 2);
    }
  }
  return [];
}

let client = null;
function getClient() {
  if (!client && process.env.GROQ_API_KEY) {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

function aggregateSkills(matchingJobs, userSkills) {
  const skillCount = {};
  const total = matchingJobs.length;

  for (const job of matchingJobs) {
    const allSkills = [...job.requiredSkills, ...job.preferredSkills];
    const seen = new Set();
    for (const skill of allSkills) {
      if (!seen.has(skill)) {
        seen.add(skill);
        skillCount[skill] = (skillCount[skill] || 0) + 1;
      }
    }
  }

  const normalizedUser = userSkills.map((s) => s.toLowerCase().trim());

  const skillFrequency = Object.entries(skillCount)
    .map(([skill, count]) => ({
      skill,
      count,
      percentage: Math.round((count / total) * 100),
      userHas: normalizedUser.includes(skill.toLowerCase().trim()),
    }))
    .sort((a, b) => b.percentage - a.percentage);

  const missingSkills = skillFrequency
    .filter((s) => !s.userHas)
    .map((s) => ({ skill: s.skill, frequency: s.percentage }));

  const matchedSkills = skillFrequency
    .filter((s) => s.userHas)
    .map((s) => ({ skill: s.skill, frequency: s.percentage }));

  const totalUniqueSkills = skillFrequency.length;
  const coveragePercentage = totalUniqueSkills > 0
    ? Math.round((matchedSkills.length / totalUniqueSkills) * 100)
    : 0;

  return { skillFrequency, missingSkills, matchedSkills, coveragePercentage };
}

function buildStructuredProfileText(profile = {}, fallbackSkills = []) {
  const lines = [];

  if (profile.name) lines.push(`${profile.name}`);
  lines.push('SUMMARY');
  lines.push(`Target role: ${profile.targetRole || ''}`.trim());

  lines.push('SKILLS');
  lines.push((profile.skills && profile.skills.length > 0 ? profile.skills : fallbackSkills).join(', '));

  if (Array.isArray(profile.workExperience) && profile.workExperience.length > 0) {
    lines.push('WORK EXPERIENCE');
    for (const exp of profile.workExperience) {
      lines.push([exp.title, exp.company, exp.location].filter(Boolean).join(' | '));
      lines.push([exp.startDate, exp.endDate].filter(Boolean).join(' - '));
      for (const bullet of exp.bullets || []) lines.push(`- ${bullet}`);
    }
  }

  if (Array.isArray(profile.projects) && profile.projects.length > 0) {
    lines.push('PROJECTS');
    for (const project of profile.projects) {
      lines.push(project.name || '');
      if (Array.isArray(project.technologies) && project.technologies.length > 0) {
        lines.push(project.technologies.join(', '));
      }
      for (const bullet of project.bullets || []) lines.push(`- ${bullet}`);
    }
  }

  if (Array.isArray(profile.certifications) && profile.certifications.length > 0) {
    lines.push('CERTIFICATIONS');
    for (const cert of profile.certifications) lines.push(`- ${cert}`);
  }

  return lines.filter(Boolean).join('\n');
}

function buildGateInputText(userSkills, targetRole) {
  let rawResumeText = '';
  let structuredText = '';

  try {
    const latestUpload = db.getLatestRawText();
    rawResumeText = latestUpload?.raw_text || '';
  } catch (err) {
    console.warn('Could not read latest raw resume text for gate analysis:', err.message);
  }

  try {
    const profile = db.readProfile();
    if (profile) structuredText = buildStructuredProfileText(profile, userSkills);
  } catch (err) {
    console.warn('Could not read structured profile for gate analysis:', err.message);
  }

  if (!rawResumeText.trim() && !structuredText.trim()) {
    return {
      text: `SUMMARY\nTarget role: ${targetRole}\nSKILLS\n${userSkills.join(', ')}`,
      source: 'skills_only',
    };
  }

  if (rawResumeText.trim() && structuredText.trim()) {
    return { text: `${rawResumeText}\n\n${structuredText}`, source: 'raw_plus_profile' };
  }

  if (rawResumeText.trim()) {
    return { text: rawResumeText, source: 'latest_resume_upload' };
  }

  return { text: structuredText, source: 'profile_structured' };
}

function getGateAnalysis(userSkills, targetRole) {
  const { text, source } = buildGateInputText(userSkills, targetRole);

  try {
    const alignment = computeAlignmentScore(text, targetRole);
    return {
      available: true,
      source,
      status: alignment.status,
      goForLLM: alignment.goForLLM,
      alignmentScore: alignment.alignmentScore,
      coreSkillCoverage: alignment.coreSkillCoverage,
      coreInExpOrProjCount: alignment.coreInExpOrProjCount,
      guardrailIssues: alignment.guardrailIssues,
    };
  } catch (err) {
    return {
      available: false,
      source,
      status: 'unknown',
      goForLLM: false,
      alignmentScore: null,
      coreSkillCoverage: null,
      coreInExpOrProjCount: null,
      guardrailIssues: [],
      error: err.message,
    };
  }
}

function buildFallbackRoadmap(missingSkills, targetRole) {
  const PRIORITY_THRESHOLDS = { high: 60, medium: 30 };
  return missingSkills.slice(0, 10).map((s) => {
    let priority = 'Low';
    if (s.frequency >= PRIORITY_THRESHOLDS.high) priority = 'High';
    else if (s.frequency >= PRIORITY_THRESHOLDS.medium) priority = 'Medium';
    return {
      skill: s.skill,
      priority,
      frequency: s.frequency,
      estimatedWeeks: priority === 'High' ? 6 : priority === 'Medium' ? 4 : 2,
      resources: getResourcesForSkill(s.skill, targetRole),
    };
  });
}

function buildFallbackSummary(targetRole, totalJobs, missingSkills, matchedSkills, coverage) {
  if (missingSkills.length === 0) {
    return `Your skills cover all ${totalJobs} ${targetRole} postings analyzed. You are well-positioned for this role.`;
  }
  const topMissing = missingSkills.slice(0, 3).map((s) => s.skill).join(', ');
  return `Across ${totalJobs} ${targetRole} postings, your skills cover ${coverage}% of demanded skills. The most common gaps are: ${topMissing}. Focus on high-frequency skills first to maximize your competitiveness.`;
}

/**
 * Extract JSON from LLM output, handling markdown fences and extra text.
 */
function extractJSON(raw) {
  // Try raw parse first
  try { return JSON.parse(raw); } catch { /* continue */ }

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* continue */ }
  }

  // Try to find first { ... } block
  const braceStart = raw.indexOf('{');
  const braceEnd = raw.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    try { return JSON.parse(raw.slice(braceStart, braceEnd + 1)); } catch { /* continue */ }
  }

  throw new Error('Could not extract valid JSON from AI response');
}

async function getAIInsights(
  targetRole,
  totalJobs,
  missingSkills,
  matchedSkills,
  coverage,
  gateAnalysis,
  topMatches
) {
  const groq = getClient();
  if (!groq) throw new Error('GROQ_API_KEY not configured');

  const topMissing = missingSkills.slice(0, 12).map((s) => `${s.skill} (${s.frequency}%)`).join(', ');
  const topMatched = matchedSkills.slice(0, 8).map((s) => `${s.skill} (${s.frequency}%)`).join(', ');
  const topRetrieved = (topMatches || [])
    .slice(0, 3)
    .map((j) => `${j.title} @ ${j.company} (score ${j.retrievalScore})`)
    .join('; ');
  const guardrailText = gateAnalysis?.guardrailIssues?.length
    ? gateAnalysis.guardrailIssues.join('; ')
    : 'none';

  const prompt = `You are a senior career coach writing premium-quality guidance for a candidate who already passed the deterministic threshold for AI review.

Candidate target role: "${targetRole}".
Market sample size: ${totalJobs} postings.
Deterministic gate status: ${gateAnalysis?.status || 'unknown'}.
Deterministic gate score: ${gateAnalysis?.alignmentScore ?? 'unknown'}/100.
Core skill coverage: ${gateAnalysis?.coreSkillCoverage ?? 'unknown'}%.
Guardrail issues: ${guardrailText}.
Top retrieved jobs: ${topRetrieved || 'not available'}.

Their skill coverage is ${coverage}%.
Skills they HAVE (with demand %): ${topMatched || 'None'}
Skills they LACK (with demand %): ${topMissing || 'None'}

Respond with a JSON object (no markdown, just raw JSON):
{
  "summary": "A detailed 5-8 sentence assessment. Include: (1) strongest market-fit signals with concrete skills, (2) key remaining risks/gaps, (3) interview positioning guidance, and (4) a practical next-step strategy.",
  "roadmap": [
    {
      "skill": "skill name",
      "priority": "High|Medium|Low",
      "frequency": 85,
      "estimatedWeeks": 4,
      "reason": "Two concise sentences: why this matters for this role, plus one concrete artifact/task to prove it."
    }
  ]
}

Rules:
- Make the summary specific to the provided skills and market frequencies. Avoid generic filler.
- Explicitly name at least 3 matched strengths and at least 2 highest-impact gaps when gaps exist.
- Roadmap must be ordered by impact and include 5-8 items when gaps exist.
- If no gaps exist, return an empty roadmap and focus summary on interview/storytelling optimization and portfolio proof points.
- Return valid JSON only.`;

  const MAX_ATTEMPTS = 2;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 1500,
      });

      const content = response.choices[0]?.message?.content || '';
      const parsed = extractJSON(content);

      if (parsed && parsed.summary && Array.isArray(parsed.roadmap)) {
        return parsed;
      }
      lastError = new Error('AI returned valid JSON but missing summary or roadmap fields');
    } catch (err) {
      lastError = err;
      // Only retry on parse errors or transient issues, not rate limits
      if (err.message?.includes('rate_limit') || err.status === 429) {
        throw err; // Don't retry rate limits, fail fast
      }
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`Dashboard AI attempt ${attempt} failed, retrying:`, err.message);
      }
    }
  }

  throw lastError;
}

async function getDashboard(req, res) {
  const { userSkills, targetRole } = req.body;

  if (!userSkills || !Array.isArray(userSkills) || userSkills.length === 0) {
    return res.status(400).json({ error: 'userSkills array is required.' });
  }
  if (!targetRole || !targetRole.trim()) {
    return res.status(400).json({ error: 'targetRole is required.' });
  }

  const matchingJobs = jobs.filter(
    (j) => j.title.toLowerCase() === targetRole.toLowerCase().trim()
  );

  if (matchingJobs.length === 0) {
    return res.status(404).json({ error: `No job postings found for role: ${targetRole}` });
  }

  const { skillFrequency, missingSkills, matchedSkills, coveragePercentage } =
    aggregateSkills(matchingJobs, userSkills);

  // Use the shared retrieval service
  let retrieval;
  let retrievalFallbackReason = null;
  try {
    retrieval = await retrieveTopJobs({ skills: userSkills, targetRole }, 5);
    retrievalFallbackReason = retrieval.fallbackReason || null;
  } catch (err) {
    retrievalFallbackReason = err.message;
    console.warn('Retrieval failed:', err.message);
    retrieval = { topJobs: [], method: 'none', embeddingUsed: false };
  }

  const topMatches = (retrieval.topJobs || []).map((j) => ({
    id: j.id,
    title: j.title,
    company: j.company,
    experienceLevel: j.experienceLevel,
    retrievalScore: j.retrievalScore,
    semanticScore: j.semanticScore,
    matchStrength: j.matchStrength,
    skillOverlapRatio: j.evidence?.skillOverlapRatio || 0,
    isRelevantToTargetRole: j.title.toLowerCase() === targetRole.toLowerCase(),
  }));

  const metrics = retrieval.allRanked
    ? computeRetrievalMetrics(retrieval.allRanked, targetRole, 5)
    : { k: 5, precisionAtK: 0, recallAtK: 0, ndcgAtK: 0, mrr: 0 };

  const gateAnalysis = getGateAnalysis(userSkills, targetRole);

  const base = {
    targetRole,
    totalJobsAnalyzed: matchingJobs.length,
    skillFrequency,
    missingSkills,
    matchedSkills,
    coveragePercentage,
    gateAnalysis,
    retrievalAnalysis: {
      method: retrieval.method,
      embeddingConfigured: Boolean(process.env.GEMINI_API_KEY),
      embeddingUsed: retrieval.embeddingUsed || false,
      embeddingIndexUsed: retrieval.indexUsed || false,
      fallbackReason: retrievalFallbackReason,
      topMatches,
      offlineMetrics: metrics,
      embeddingStats: getEmbeddingStats(),
      onlineMetricsToTrack: [
        'job_click_through_rate',
        'save_or_bookmark_rate',
        'apply_start_rate',
        'apply_completion_rate',
      ],
    },
  };

  // Preserve LLM quota for strong candidates only.
  if (!gateAnalysis.goForLLM) {
    const roadmap = buildFallbackRoadmap(missingSkills, targetRole);
    const summary = buildFallbackSummary(
      targetRole, matchingJobs.length, missingSkills, matchedSkills, coveragePercentage
    );
    return res.json({
      ...base,
      summary,
      roadmap,
      isFallback: true,
      aiFallbackReason: 'below_threshold',
      gradingStatus: 'fallback',
    });
  }

  try {
    const ai = await getAIInsights(
      targetRole,
      matchingJobs.length,
      missingSkills,
      matchedSkills,
      coveragePercentage,
      gateAnalysis,
      topMatches
    );

    // Attach curated resources to AI roadmap items (AI doesn't generate URLs)
    const roadmapWithResources = ai.roadmap.map((item) => ({
      ...item,
      resources: getResourcesForSkill(item.skill, targetRole),
    }));
    return res.json({
      ...base,
      summary: ai.summary,
      roadmap: roadmapWithResources,
      isFallback: false,
      aiFallbackReason: null,
      gradingStatus: 'llm',
    });
  } catch (err) {
    console.warn('Dashboard AI unavailable, using fallback:', err.message);
    const roadmap = buildFallbackRoadmap(missingSkills, targetRole);
    const summary = buildFallbackSummary(
      targetRole, matchingJobs.length, missingSkills, matchedSkills, coveragePercentage
    );

    // Classify the failure reason for the UI
    let aiFallbackReason = 'unknown';
    const msg = err.message || '';
    if (msg.includes('rate_limit') || msg.includes('429') || msg.includes('Rate limit')) {
      aiFallbackReason = 'rate_limit';
    } else if (msg.includes('not configured')) {
      aiFallbackReason = 'no_api_key';
    } else if (msg.includes('JSON') || msg.includes('parse') || msg.includes('missing summary')) {
      aiFallbackReason = 'malformed_response';
    } else if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED')) {
      aiFallbackReason = 'network_error';
    }

    return res.json({
      ...base,
      summary,
      roadmap,
      isFallback: true,
      aiFallbackReason,
      gradingStatus: 'fallback',
    });
  }
}

module.exports = { getDashboard, aggregateSkills };
