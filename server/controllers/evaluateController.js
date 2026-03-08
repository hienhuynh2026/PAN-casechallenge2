const { computeAlignmentScore } = require('../services/alignmentScoringService');
const { gradeResumeWithLLM, gradeResumeFallback } = require('../services/resumeGraderService');
const { findGapResources, findGapResourcesFallback } = require('../services/agentService');
const { getRoleProfile } = require('../data/roleKnowledgeBase');
const { evaluateWithRAG } = require('../services/ragScoringService');

// Full evaluation pipeline:
//   1. Heuristic alignment score (always runs, deterministic)
//   2. RAG retrieval — top-5 semantically similar jobs
//   3. Composite score (heuristic + retrieval + skill overlap)
//   4. Gate:
//      strong (≥70 + all guardrails)  → LLM deep grade
//      borderline (55–69, or guardrail failure) → alignment + static resources + borderlineNote
//      weak (< 55)                    → alignment + agentic gap-closing resources
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

  // Step 1-3: RAG evaluation (alignment + retrieval + composite)
  let ragResult;
  try {
    ragResult = await evaluateWithRAG(resumeText, targetRole);
  } catch (err) {
    return res.status(500).json({ error: `Evaluation failed: ${err.message}` });
  }

  const { alignment, retrieval, composite, explainability, missingSkillsHelp, scoringMethod } = ragResult;

  const result = {
    alignment,
    retrieval,
    composite,
    explainability,
    missingSkillsHelp,
    scoringMethod,
  };

  // Step 4: Gate
  if (alignment.goForLLM) {
    // Strong match — run LLM grading
    try {
      result.grade = await gradeResumeWithLLM(resumeText, targetRole, alignment);
      result.grade.isFallback = false;
      // Update scoring method to reflect LLM usage
      result.scoringMethod = {
        id: retrieval.embeddingUsed ? 'semantic_retrieval_plus_llm' : 'heuristic_plus_llm',
        label: retrieval.embeddingUsed ? 'Semantic Retrieval + AI Review' : 'Rule-Based Match + AI Review',
        description: retrieval.embeddingUsed
          ? 'Scores based on semantic job matching via embeddings, rule-based alignment, and LLM coaching.'
          : 'Scores based on keyword-based alignment rules with LLM-powered coaching.',
      };
    } catch (err) {
      console.warn('LLM grading failed, using fallback:', err.message);
      result.grade = gradeResumeFallback(alignment);
    }
  } else if (alignment.status === 'borderline') {
    result.agent = findGapResourcesFallback(targetRole, alignment.missingCategories);
    result.borderlineNote = alignment.borderlineNote;
  } else {
    // Weak match — run agentic gap-closing
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
