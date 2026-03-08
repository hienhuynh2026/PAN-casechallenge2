const { computeAlignmentScore } = require('../services/transferModelService');
const { gradeResumeWithLLM, gradeResumeFallback } = require('../services/resumeGraderService');
const { findGapResources, findGapResourcesFallback } = require('../services/agentService');
const { getRoleProfile } = require('../data/roleKnowledgeBase');

// Full evaluation pipeline:
//   1. Transfer model computes alignment score (always runs, deterministic)
//   2. Gate:
//      strong (≥75 + all guardrails)  → LLM deep grade
//      borderline (55–74, or guardrail failure) → alignment + static resources + borderlineNote
//      weak (< 55)                    → alignment + agentic gap-closing resources
//
// Borderline users now receive curated static resources so every user gets
// actionable next steps regardless of gate status.
async function evaluateResume(req, res) {
  const { resumeText, targetRole } = req.body;

  if (!resumeText || !resumeText.trim()) {
    return res.status(400).json({ error: 'Resume text is required.' });
  }
  if (!targetRole || !targetRole.trim()) {
    return res.status(400).json({ error: 'Target role is required.' });
  }
  if (!getRoleProfile(targetRole)) {
    return res.status(400).json({ error: `Unknown role: ${targetRole}` });
  }

  // Step 1: Transfer model — always runs
  let alignment;
  try {
    alignment = computeAlignmentScore(resumeText, targetRole);
  } catch (err) {
    return res.status(500).json({ error: `Alignment computation failed: ${err.message}` });
  }

  const result = { alignment };

  // Step 2: Gate
  if (alignment.goForLLM) {
    // Strong match — run LLM grading
    try {
      result.grade = await gradeResumeWithLLM(resumeText, targetRole, alignment);
      result.grade.isFallback = false;
    } catch (err) {
      console.warn('LLM grading failed, using fallback:', err.message);
      result.grade = gradeResumeFallback(alignment);
    }
  } else if (alignment.status === 'borderline') {
    // Borderline — provide static resources + explanation. No LLM call here;
    // user can request full deep grade manually via the /grade endpoint.
    result.agent = findGapResourcesFallback(targetRole, alignment.missingCategories);
    result.borderlineNote = alignment.borderlineNote;
  } else {
    // Weak match — run agentic gap-closing (static resources + optional Groq summary)
    try {
      result.agent = await findGapResources(
        targetRole, alignment.missingCategories, alignment.alignmentScore
      );
    } catch (err) {
      console.warn('Agent service failed, using fallback:', err.message);
      result.agent = findGapResourcesFallback(targetRole, alignment.missingCategories);
    }
  }

  res.json(result);
}

// Manual deep grade — for borderline resumes or user-requested re-evaluation
async function deepGrade(req, res) {
  const { resumeText, targetRole, alignmentResult } = req.body;

  if (!resumeText || !targetRole) {
    return res.status(400).json({ error: 'resumeText and targetRole are required.' });
  }

  let alignment = alignmentResult;
  if (!alignment) {
    try {
      alignment = computeAlignmentScore(resumeText, targetRole);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  try {
    const grade = await gradeResumeWithLLM(resumeText, targetRole, alignment);
    res.json({ grade: { ...grade, isFallback: false } });
  } catch (err) {
    console.warn('LLM grading failed, using fallback:', err.message);
    res.json({ grade: gradeResumeFallback(alignment) });
  }
}

// Manual agent trigger — for any resume that needs resource discovery
async function agentRecommend(req, res) {
  const { targetRole, missingCategories, alignmentScore } = req.body;

  if (!targetRole || !missingCategories) {
    return res.status(400).json({ error: 'targetRole and missingCategories are required.' });
  }

  try {
    const agent = await findGapResources(targetRole, missingCategories, alignmentScore || 0);
    res.json({ agent });
  } catch (err) {
    console.warn('Agent service failed, using fallback:', err.message);
    res.json({ agent: findGapResourcesFallback(targetRole, missingCategories) });
  }
}

module.exports = { evaluateResume, deepGrade, agentRecommend };
