const path = require('path');
const jobs = require(path.join(__dirname, '../../data/sample_jobs.json'));
const Groq = require('groq-sdk');

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

function buildFallbackRoadmap(missingSkills) {
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

async function getAIInsights(targetRole, totalJobs, missingSkills, matchedSkills, coverage) {
  const groq = getClient();
  if (!groq) throw new Error('GROQ_API_KEY not configured');

  const topMissing = missingSkills.slice(0, 12).map((s) => `${s.skill} (${s.frequency}%)`).join(', ');
  const topMatched = matchedSkills.slice(0, 8).map((s) => `${s.skill} (${s.frequency}%)`).join(', ');

  const prompt = `You are a career advisor. A user targeting "${targetRole}" roles has been compared against ${totalJobs} job postings.

Their skill coverage is ${coverage}%.
Skills they HAVE (with demand %): ${topMatched || 'None'}
Skills they LACK (with demand %): ${topMissing || 'None'}

Respond with a JSON object (no markdown, just raw JSON):
{
  "summary": "2-3 sentence strategic analysis of their position",
  "roadmap": [
    {
      "skill": "skill name",
      "priority": "High|Medium|Low",
      "frequency": 85,
      "estimatedWeeks": 4,
      "reason": "One sentence on why this skill matters for the role"
    }
  ]
}

For the roadmap, include up to 8 of the most impactful missing skills. Prioritize by frequency and strategic importance. If no skills are missing, return an empty roadmap with a congratulatory summary.`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 1500,
  });

  const content = response.choices[0]?.message?.content || '';
  return JSON.parse(content);
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

  const base = {
    targetRole,
    totalJobsAnalyzed: matchingJobs.length,
    skillFrequency,
    missingSkills,
    matchedSkills,
    coveragePercentage,
  };

  try {
    const ai = await getAIInsights(
      targetRole, matchingJobs.length, missingSkills, matchedSkills, coveragePercentage
    );

    if (ai && ai.summary && Array.isArray(ai.roadmap)) {
      return res.json({
        ...base,
        summary: ai.summary,
        roadmap: ai.roadmap,
        isFallback: false,
        gradingStatus: 'llm',
      });
    }
    throw new Error('AI returned invalid structure');
  } catch (err) {
    console.warn('Dashboard AI unavailable, using fallback:', err.message);
    const roadmap = buildFallbackRoadmap(missingSkills);
    const summary = buildFallbackSummary(
      targetRole, matchingJobs.length, missingSkills, matchedSkills, coveragePercentage
    );
    return res.json({
      ...base,
      summary,
      roadmap,
      isFallback: true,
      gradingStatus: 'fallback',
    });
  }
}

module.exports = { getDashboard, aggregateSkills };
