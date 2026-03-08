const Groq = require('groq-sdk');

let client = null;

function getClient() {
  if (!client && process.env.GROQ_API_KEY) {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

async function gradeResumeWithLLM(resumeText, targetRole, alignmentResult) {
  const groq = getClient();
  if (!groq) throw new Error('GROQ_API_KEY not configured');

  const strengths = alignmentResult.matchedStrengths.map((s) => s.category).join(', ') || 'None identified';
  const gaps = alignmentResult.missingCategories
    .map((g) => `${g.category} (missing: ${g.missing.slice(0, 3).join(', ')})`)
    .join('; ') || 'None';
  const coreMatched = alignmentResult.coreMatched.join(', ') || 'none';
  const coreMissed = alignmentResult.coreMissed.join(', ') || 'none';

  const prompt = `You are a senior technical recruiter and career coach performing a deep resume evaluation.

Target role: ${targetRole}
Semantic alignment pre-score: ${alignmentResult.alignmentScore}/100
Core skills matched: ${coreMatched}
Core skills missing: ${coreMissed}
Strength areas: ${strengths}
Gap areas: ${gaps}

Resume:
---
${resumeText.slice(0, 3000)}
---

Evaluate this resume on these dimensions:
- Role alignment (25 pts): fit for ${targetRole}
- Technical depth (25 pts): quality and range of skills/tools
- Project quality (20 pts): hands-on work evidence
- Clarity of impact (15 pts): quantified results
- Relevance of experience (15 pts): how directly applicable

Respond with raw JSON only (no markdown code fences):
{
  "overallScore": 78,
  "readinessLevel": "Ready|Almost Ready|Needs Work",
  "roleFitSummary": "2-3 sentence summary of fit for ${targetRole}",
  "strengths": ["specific strength 1", "specific strength 2", "specific strength 3"],
  "weakAreas": [
    { "area": "area name", "explanation": "specific explanation why it is weak" }
  ],
  "actionSteps": [
    { "priority": "High", "step": "specific action", "rationale": "why this matters for ${targetRole}" }
  ],
  "resumeImprovements": ["improvement 1", "improvement 2", "improvement 3"],
  "bulletRewrites": [
    { "original": "original bullet from resume", "improved": "stronger version with action + result + metric" }
  ]
}

Rules:
- Limit actionSteps to 3-5 items
- Be specific and role-focused, not generic
- Only include bulletRewrites if you can find actual bullets worth improving
- readinessLevel must be one of: Ready, Almost Ready, Needs Work`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content || '';
  // Strip markdown code fences if model wraps output
  const cleaned = content.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  return JSON.parse(cleaned);
}

// Rule-based fallback when Groq is unavailable
function gradeResumeFallback(alignmentResult) {
  const score = Math.min(Math.round(alignmentResult.alignmentScore * 0.95), 95);
  const readiness = score >= 80 ? 'Almost Ready' : score >= 65 ? 'Needs Work' : 'Needs Work';

  return {
    overallScore: score,
    readinessLevel: readiness,
    roleFitSummary: `Your resume shows ${alignmentResult.matchedStrengths.length > 0 ? 'some alignment' : 'limited alignment'} with the ${alignmentResult.targetRole} role. Alignment score: ${alignmentResult.alignmentScore}/100. Focus on filling the gap areas identified below.`,
    strengths: alignmentResult.matchedStrengths.map((s) => `${s.category}: ${s.matched.join(', ')}`),
    weakAreas: alignmentResult.missingCategories.slice(0, 3).map((g) => ({
      area: g.category,
      explanation: `Missing or underrepresented: ${g.missing.join(', ')}`,
    })),
    actionSteps: alignmentResult.missingCategories.slice(0, 3).map((g, i) => ({
      priority: i === 0 ? 'High' : i === 1 ? 'Medium' : 'Low',
      step: `Build demonstrated experience in ${g.category}`,
      rationale: `${g.category} is a key requirement for the ${alignmentResult.targetRole} role.`,
    })),
    resumeImprovements: [
      'Add quantifiable impact metrics to bullet points (e.g. "reduced load time by 30%")',
      'Include specific tool and technology names rather than generic descriptions',
      'Add a projects section that directly demonstrates skills relevant to the target role',
    ],
    bulletRewrites: [],
    isFallback: true,
  };
}

module.exports = { gradeResumeWithLLM, gradeResumeFallback };
