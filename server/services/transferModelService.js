/**
 * transferModelService.js
 *
 * Lightweight heuristic alignment engine — NOT a neural transfer model.
 * Described honestly as a stronger alignment filter that goes beyond raw
 * keyword counting via three mechanisms:
 *
 *   1. Section-aware scoring  — skills evidenced in Experience/Projects
 *      receive full credit (1.0×). Skills listed only in a Skills section
 *      receive 0.5× credit (tightened anti-stuffing). A resume cannot inflate
 *      its score by listing every technology it has never actually used.
 *
 *   2. Hard guardrails        — four minimum conditions that must ALL pass
 *      before goForLLM is true, regardless of the total score:
 *        (A) ≥ 50% of must-have skills found anywhere in the resume
 *        (B) ≥ 2 must-have skills demonstrated in Experience or Projects
 *        (C) If score ≥ STRONG, core skill raw coverage must be ≥ 65%
 *        (D) Core skills dimension must contribute ≥ 40% of its max (≥16/40)
 *            — prevents candidates with weak core skills from passing purely
 *            on preferred/tools/concepts inflation
 *
 *   3. Context-boosted signals — project domain language found inside
 *      Experience / Projects sections earns a 1.3× boost vs. generic
 *      mentions. Action verbs only count when found in those sections.
 *
 * Tradeoffs vs. previous version:
 *   - Skills-only weight lowered 0.65 → 0.5: harsher penalty for listing
 *     skills without demonstrating them in context.
 *   - Guardrail A raised 40% → 50%: need at least half of must-have skills
 *     present (previously only 2/5).
 *   - Guardrail B raised from ≥1 → ≥2 core skills in exp/projects.
 *   - Guardrail C raised from 60% → 65% core raw coverage for strong pass.
 *   - New Guardrail D: core score floor prevents preferred/tools/concepts
 *     from masking a fundamentally weak core.
 *
 * Still keyword-based; paraphrasing and synonyms are not captured.
 * Section detection depends on conventional resume headings.
 * Suitable for demo / take-home; production would layer in embeddings.
 */

const { getRoleProfile } = require('../data/roleKnowledgeBase');

// ─── Thresholds ──────────────────────────────────────────────────────────────
const THRESHOLDS = {
  STRONG:     70, // score ≥ 70 AND all guardrails pass → pass to LLM
  BORDERLINE: 55, // score 55–69 → alignment + static resources, offer manual grade
  // below 55 = weak → activate gap-closing resources; do not send to LLM
};

// How much credit a skill gets depending on which resume section it appears in.
// Skills-only weight is 0.5 (tightened from 0.65) to better penalise listing
// technologies the candidate has never demonstrably used.
const SECTION_WEIGHTS = {
  experienceOrProjects: 1.0, // demonstrated in practice → full credit
  certifications:       0.8, // formal credential → credible
  summary:              0.75, // stated intent → some credit
  skills:               0.5,  // listed only → half credit (anti-stuffing, tightened)
  other:                0.4,  // mentioned elsewhere → minimal credit
};

// Minimum core-dimension contribution before a resume can pass to LLM.
// If the core skills score is below this share of the 40-pt max (i.e., < 16 pts),
// the candidate's technical core is too weak regardless of how well other
// dimensions score. This prevents preferred/tools/concepts from compensating
// for a fundamentally misaligned core skill set.
const CORE_SCORE_FLOOR_PCT = 0.40; // 40 % of max → 16 pts

// ─── Section parser ───────────────────────────────────────────────────────────
function parseSections(text) {
  const sections = {
    summary: '', skills: '', experience: '', projects: '',
    education: '', certifications: '', other: '',
  };

  const SECTION_PATTERNS = {
    summary:        /^(summary|objective|profile|about me|professional summary|career summary)/i,
    skills:         /^(skills|technical skills|technologies|tech stack|competencies|proficiencies|tools|core competencies)/i,
    experience:     /^(experience|work experience|work history|employment|professional experience|positions|employment history|career history)/i,
    projects:       /^(projects?|personal projects?|portfolio|side projects?|open source|key projects?|selected projects?)/i,
    education:      /^(education|academic background|degree|university|college|qualifications)/i,
    certifications: /^(certifications?|certificates?|credentials?|licenses?|awards?|accreditations?)/i,
  };

  let current = 'other';

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.length < 60) {
      let found = false;
      for (const [name, pattern] of Object.entries(SECTION_PATTERNS)) {
        if (pattern.test(trimmed)) { current = name; found = true; break; }
      }
      if (found) continue;
    }

    sections[current] += ' ' + trimmed.toLowerCase();
  }

  return sections;
}

// ─── Section-weighted term scoring ───────────────────────────────────────────
// Returns the highest applicable weight for a term across all sections.
// "Found in experience AND skills" returns 1.0, not 1.5 (no double-counting).
function sectionWeightedScore(sections, fullText, term) {
  const expProj = sections.experience + ' ' + sections.projects;
  if (matchTerm(expProj, term))                return SECTION_WEIGHTS.experienceOrProjects;
  if (matchTerm(sections.certifications, term)) return SECTION_WEIGHTS.certifications;
  if (matchTerm(sections.summary, term))        return SECTION_WEIGHTS.summary;
  if (matchTerm(sections.skills, term))         return SECTION_WEIGHTS.skills;
  if (matchTerm(fullText, term))                return SECTION_WEIGHTS.other;
  return 0;
}

// ─── Main scoring function ───────────────────────────────────────────────────
function computeAlignmentScore(resumeText, targetRole) {
  const profile = getRoleProfile(targetRole);
  if (!profile) throw new Error(`Unknown role: ${targetRole}`);

  const sections = parseSections(resumeText);
  const fullText = resumeText.toLowerCase();
  const expProj  = sections.experience + ' ' + sections.projects;

  // ── Dimension 1: Core Skills (40 pts, section-weighted) ─────────────────
  // Primary anti-stuffing dimension. Skills listed in the Skills section earn
  // 0.5× (down from 0.65); demonstrated in Experience/Projects earns 1.0×.
  let coreWeightedSum = 0;
  const coreMatched = [];
  const coreMissed  = [];

  for (const skill of profile.coreSkills) {
    const w = sectionWeightedScore(sections, fullText, skill);
    if (w > 0) { coreMatched.push(skill); coreWeightedSum += w; }
    else        { coreMissed.push(skill); }
  }

  const coreScore = profile.coreSkills.length > 0
    ? (coreWeightedSum / profile.coreSkills.length) * 40
    : 0;

  // ── Dimension 2: Preferred / nice-to-have skills (15 pts) ───────────────
  const prefMatched = profile.preferredSkills.filter(s => matchTerm(fullText, s));
  const prefScore = profile.preferredSkills.length > 0
    ? Math.min((prefMatched.length / profile.preferredSkills.length) * 20, 15)
    : 0;

  // ── Dimension 3: Tools & platforms (10 pts) ─────────────────────────────
  const toolsMatched = profile.tools.filter(s => matchTerm(fullText, s));
  const toolsScore = profile.tools.length > 0
    ? Math.min((toolsMatched.length / profile.tools.length) * 15, 10)
    : 0;

  // ── Dimension 4: Project domain signals (15 pts) ────────────────────────
  // Signals found in Experience/Projects sections get a 1.3× boost.
  const projectMatchedInContext = profile.projectLanguage.filter(s =>
    expProj.includes(s.toLowerCase())
  );
  const projectMatchedAny = profile.projectLanguage.filter(s =>
    fullText.includes(s.toLowerCase())
  );
  const effectiveProjectCount = Math.min(
    projectMatchedInContext.length * 1.3,
    projectMatchedAny.length
  );
  const projectScore = profile.projectLanguage.length > 0
    ? Math.min((effectiveProjectCount / profile.projectLanguage.length) * 20, 15)
    : 0;

  // ── Dimension 5: Related concepts / technical breadth (10 pts) ──────────
  const conceptMatched = profile.relatedConcepts.filter(s =>
    fullText.includes(s.toLowerCase())
  );
  const conceptScore = profile.relatedConcepts.length > 0
    ? Math.min((conceptMatched.length / profile.relatedConcepts.length) * 15, 10)
    : 0;

  // ── Dimension 6: Achievement language / action verbs (5 pts) ────────────
  // Only counted when appearing in Experience or Projects — prevents score
  // inflation from generic skill descriptions.
  const verbMatched = profile.actionVerbs.filter(s =>
    expProj.includes(s.toLowerCase())
  );
  const verbScore = profile.actionVerbs.length > 0
    ? Math.min((verbMatched.length / profile.actionVerbs.length) * 8, 5)
    : 0;

  // ── Dimension 7: Quantified impact language (5 pts) ─────────────────────
  const impactMatched = profile.impactIndicators.filter(s =>
    fullText.includes(s.toLowerCase())
  );
  const impactScore = profile.impactIndicators.length > 0
    ? Math.min((impactMatched.length / profile.impactIndicators.length) * 8, 5)
    : 0;

  const rawScore = coreScore + prefScore + toolsScore + projectScore +
                   conceptScore + verbScore + impactScore;
  const alignmentScore = Math.min(Math.round(rawScore), 100);

  // ── Confidence ────────────────────────────────────────────────────────────
  const dimensionHits = [coreMatched, prefMatched, toolsMatched,
                          projectMatchedAny, conceptMatched]
    .filter(m => m.length > 0).length;
  const confidence = dimensionHits >= 4 ? 'high'
    : dimensionHits >= 2 ? 'medium' : 'low';

  // ── Hard guardrails ───────────────────────────────────────────────────────
  // All four must pass before goForLLM is true. These run independently of the
  // total score — a high score with weak guardrails → borderline, not strong.
  const coreRawCoverage  = coreMatched.length / Math.max(profile.coreSkills.length, 1);
  const coreInExpOrProj  = profile.coreSkills.filter(s => matchTerm(expProj, s));
  const coreScoreFloor   = 40 * CORE_SCORE_FLOOR_PCT; // 16 pts
  const guardrailIssues  = [];

  // (A) Must-have coverage floor — raised from 40% to 50%
  if (coreRawCoverage < 0.5) {
    guardrailIssues.push(
      `Only ${coreMatched.length} of ${profile.coreSkills.length} must-have skills found` +
      ` — need at least 50% coverage for LLM review`
    );
  }

  // (B) Experience/project evidence — raised from ≥1 to ≥2 demonstrated skills
  if (coreInExpOrProj.length < 2) {
    guardrailIssues.push(
      `Only ${coreInExpOrProj.length} must-have skill(s) demonstrated in Experience or Projects` +
      ` — at least 2 required to show genuine role experience`
    );
  }

  // (C) Stronger core coverage required before LLM deep grade — raised from 60% to 65%
  if (alignmentScore >= THRESHOLDS.STRONG && coreRawCoverage < 0.65) {
    guardrailIssues.push(
      `Core skill coverage is ${Math.round(coreRawCoverage * 100)}%` +
      ` — 65% required for full LLM review`
    );
  }

  // (D) Core score floor — prevents other dimensions from masking a weak core.
  // Even if preferred, tools, and concepts are strong, the core skills dimension
  // must contribute at least 40% of its 40-pt maximum (16 pts).
  if (coreScore < coreScoreFloor) {
    guardrailIssues.push(
      `Core skills score (${Math.round(coreScore)}/40) is below the minimum floor of ${coreScoreFloor} pts` +
      ` — too few must-have skills are demonstrated to qualify for LLM review`
    );
  }

  // ── Status and gate decision ──────────────────────────────────────────────
  //   strong     → score ≥ STRONG AND all four guardrails pass
  //   borderline → score in [55–69], OR score ≥ STRONG but a guardrail failed
  //   weak       → score < BORDERLINE
  let status;
  if (alignmentScore >= THRESHOLDS.STRONG && guardrailIssues.length === 0) {
    status = 'strong';
  } else if (
    alignmentScore >= THRESHOLDS.BORDERLINE ||
    (alignmentScore >= THRESHOLDS.STRONG && guardrailIssues.length > 0)
  ) {
    status = 'borderline';
  } else {
    status = 'weak';
  }

  // ── Gap category analysis ─────────────────────────────────────────────────
  const matchedStrengths  = [];
  const missingCategories = [];

  for (const [category, skills] of Object.entries(profile.gapCategories)) {
    const matched   = skills.filter(s => matchTerm(fullText, s));
    const missing   = skills.filter(s => !matchTerm(fullText, s));
    const matchRate = matched.length / skills.length;

    if (matchRate >= 0.5) {
      matchedStrengths.push({ category, matched });
    } else {
      missingCategories.push({ category, missing, critical: matchRate < 0.2 });
    }
  }

  // ── Borderline context note ───────────────────────────────────────────────
  // Surfaced in the UI to explain why the resume did not auto-qualify for
  // full LLM review, and what to improve first.
  let borderlineNote = null;
  if (status === 'borderline') {
    const issues = guardrailIssues.length > 0
      ? ` Specific issues: ${guardrailIssues.join('; ')}.`
      : '';
    borderlineNote =
      `Your resume shows potential for the ${targetRole} role (score: ${alignmentScore}/100) ` +
      `but needs stronger demonstrated experience before qualifying for full review.` +
      issues +
      ` Prioritise adding concrete projects and experience entries that showcase your must-have skills.`;
  }

  return {
    alignmentScore,
    confidence,
    status,
    targetRole,
    coreMatched,
    coreMissed,
    coreSkillCoverage:    Math.round(coreRawCoverage * 100),
    coreInExpOrProjCount: coreInExpOrProj.length,
    guardrailIssues,
    borderlineNote,
    matchedStrengths,
    missingCategories,
    goForLLM: status === 'strong',
    breakdown: {
      coreSkills:      Math.round(coreScore),
      preferredSkills: Math.round(prefScore),
      tools:           Math.round(toolsScore),
      projectSignals:  Math.round(projectScore),
      relatedConcepts: Math.round(conceptScore),
      actionVerbs:     Math.round(verbScore),
      impactLanguage:  Math.round(impactScore),
    },
  };
}

// ─── Term matching ────────────────────────────────────────────────────────────
// Single-word terms use word boundaries to prevent false positives
// (e.g. "Go" matching "good"). Multi-word terms use substring search.
function matchTerm(text, term) {
  const lower = term.toLowerCase();
  if (/\s/.test(lower)) return text.includes(lower);
  const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

module.exports = { computeAlignmentScore, THRESHOLDS, parseSections };
