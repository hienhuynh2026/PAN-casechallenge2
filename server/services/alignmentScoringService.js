const { getRoleProfile } = require('../data/roleKnowledgeBase');

const THRESHOLDS = {
  STRONG: 70,
  BORDERLINE: 55,
};

const SECTION_WEIGHTS = {
  experienceOrProjects: 1.0,
  certifications: 0.8,
  summary: 0.75,
  skills: 0.5,
  other: 0.4,
};

const CORE_SCORE_FLOOR_PCT = 0.40;

function parseSections(text) {
  const sections = {
    summary: '', skills: '', experience: '', projects: '',
    education: '', certifications: '', other: '',
  };

  const SECTION_PATTERNS = {
    summary: /^(summary|objective|profile|about me|professional summary|career summary)/i,
    skills: /^(skills|technical skills|technologies|tech stack|competencies|proficiencies|tools|core competencies)/i,
    experience: /^(experience|work experience|work history|employment|professional experience|positions|employment history|career history)/i,
    projects: /^(projects?|personal projects?|portfolio|side projects?|open source|key projects?|selected projects?)/i,
    education: /^(education|academic background|degree|university|college|qualifications)/i,
    certifications: /^(certifications?|certificates?|credentials?|licenses?|awards?|accreditations?)/i,
  };

  let current = 'other';

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.length < 60) {
      let found = false;
      for (const [name, pattern] of Object.entries(SECTION_PATTERNS)) {
        if (pattern.test(trimmed)) {
          current = name;
          found = true;
          break;
        }
      }
      if (found) continue;
    }

    sections[current] += ` ${trimmed.toLowerCase()}`;
  }

  return sections;
}

function sectionWeightedScore(sections, fullText, term) {
  const expProj = `${sections.experience} ${sections.projects}`;
  if (matchTerm(expProj, term)) return SECTION_WEIGHTS.experienceOrProjects;
  if (matchTerm(sections.certifications, term)) return SECTION_WEIGHTS.certifications;
  if (matchTerm(sections.summary, term)) return SECTION_WEIGHTS.summary;
  if (matchTerm(sections.skills, term)) return SECTION_WEIGHTS.skills;
  if (matchTerm(fullText, term)) return SECTION_WEIGHTS.other;
  return 0;
}

function computeAlignmentScore(resumeText, targetRole) {
  const profile = getRoleProfile(targetRole);
  if (!profile) throw new Error(`Unknown role: ${targetRole}`);

  const sections = parseSections(resumeText);
  const fullText = resumeText.toLowerCase();
  const expProj = `${sections.experience} ${sections.projects}`;

  let coreWeightedSum = 0;
  const coreMatched = [];
  const coreMissed = [];

  for (const skill of profile.coreSkills) {
    const w = sectionWeightedScore(sections, fullText, skill);
    if (w > 0) {
      coreMatched.push(skill);
      coreWeightedSum += w;
    } else {
      coreMissed.push(skill);
    }
  }

  const coreScore = profile.coreSkills.length > 0
    ? (coreWeightedSum / profile.coreSkills.length) * 40
    : 0;

  const prefMatched = profile.preferredSkills.filter((s) => matchTerm(fullText, s));
  const prefScore = profile.preferredSkills.length > 0
    ? Math.min((prefMatched.length / profile.preferredSkills.length) * 20, 15)
    : 0;

  const toolsMatched = profile.tools.filter((s) => matchTerm(fullText, s));
  const toolsScore = profile.tools.length > 0
    ? Math.min((toolsMatched.length / profile.tools.length) * 15, 10)
    : 0;

  const projectMatchedInContext = profile.projectLanguage.filter((s) =>
    expProj.includes(s.toLowerCase())
  );
  const projectMatchedAny = profile.projectLanguage.filter((s) =>
    fullText.includes(s.toLowerCase())
  );
  const effectiveProjectCount = Math.min(projectMatchedInContext.length * 1.3, projectMatchedAny.length);
  const projectScore = profile.projectLanguage.length > 0
    ? Math.min((effectiveProjectCount / profile.projectLanguage.length) * 20, 15)
    : 0;

  const conceptMatched = profile.relatedConcepts.filter((s) =>
    fullText.includes(s.toLowerCase())
  );
  const conceptScore = profile.relatedConcepts.length > 0
    ? Math.min((conceptMatched.length / profile.relatedConcepts.length) * 15, 10)
    : 0;

  const verbMatched = profile.actionVerbs.filter((s) =>
    expProj.includes(s.toLowerCase())
  );
  const verbScore = profile.actionVerbs.length > 0
    ? Math.min((verbMatched.length / profile.actionVerbs.length) * 8, 5)
    : 0;

  const impactMatched = profile.impactIndicators.filter((s) =>
    fullText.includes(s.toLowerCase())
  );
  const impactScore = profile.impactIndicators.length > 0
    ? Math.min((impactMatched.length / profile.impactIndicators.length) * 8, 5)
    : 0;

  const rawScore = coreScore + prefScore + toolsScore + projectScore +
    conceptScore + verbScore + impactScore;
  const alignmentScore = Math.min(Math.round(rawScore), 100);

  const dimensionHits = [coreMatched, prefMatched, toolsMatched, projectMatchedAny, conceptMatched]
    .filter((m) => m.length > 0).length;
  const confidence = dimensionHits >= 4 ? 'high'
    : dimensionHits >= 2 ? 'medium' : 'low';

  const coreRawCoverage = coreMatched.length / Math.max(profile.coreSkills.length, 1);
  const coreInExpOrProj = profile.coreSkills.filter((s) => matchTerm(expProj, s));
  const coreScoreFloor = 40 * CORE_SCORE_FLOOR_PCT;
  const guardrailIssues = [];

  if (coreRawCoverage < 0.5) {
    guardrailIssues.push(
      `Only ${coreMatched.length} of ${profile.coreSkills.length} must-have skills found` +
      ' — need at least 50% coverage for LLM review'
    );
  }

  if (coreInExpOrProj.length < 2) {
    guardrailIssues.push(
      `Only ${coreInExpOrProj.length} must-have skill(s) demonstrated in Experience or Projects` +
      ' — at least 2 required to show genuine role experience'
    );
  }

  if (alignmentScore >= THRESHOLDS.STRONG && coreRawCoverage < 0.65) {
    guardrailIssues.push(
      `Core skill coverage is ${Math.round(coreRawCoverage * 100)}%` +
      ' — 65% required for full LLM review'
    );
  }

  if (coreScore < coreScoreFloor) {
    guardrailIssues.push(
      `Core skills score (${Math.round(coreScore)}/40) is below the minimum floor of ${coreScoreFloor} pts` +
      ' — too few must-have skills are demonstrated to qualify for LLM review'
    );
  }

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

  const matchedStrengths = [];
  const missingCategories = [];

  for (const [category, skills] of Object.entries(profile.gapCategories)) {
    const matched = skills.filter((s) => matchTerm(fullText, s));
    const missing = skills.filter((s) => !matchTerm(fullText, s));
    const matchRate = matched.length / skills.length;

    if (matchRate >= 0.5) {
      matchedStrengths.push({ category, matched });
    } else {
      missingCategories.push({ category, missing, critical: matchRate < 0.2 });
    }
  }

  let borderlineNote = null;
  if (status === 'borderline') {
    const issues = guardrailIssues.length > 0
      ? ` Specific issues: ${guardrailIssues.join('; ')}.`
      : '';
    borderlineNote =
      `Your resume shows potential for the ${targetRole} role (score: ${alignmentScore}/100) ` +
      'but needs stronger demonstrated experience before qualifying for full review.' +
      issues +
      ' Prioritise adding concrete projects and experience entries that showcase your must-have skills.';
  }

  return {
    alignmentScore,
    confidence,
    status,
    targetRole,
    coreMatched,
    coreMissed,
    coreSkillCoverage: Math.round(coreRawCoverage * 100),
    coreInExpOrProjCount: coreInExpOrProj.length,
    guardrailIssues,
    borderlineNote,
    matchedStrengths,
    missingCategories,
    goForLLM: status === 'strong',
    breakdown: {
      coreSkills: Math.round(coreScore),
      preferredSkills: Math.round(prefScore),
      tools: Math.round(toolsScore),
      projectSignals: Math.round(projectScore),
      relatedConcepts: Math.round(conceptScore),
      actionVerbs: Math.round(verbScore),
      impactLanguage: Math.round(impactScore),
    },
  };
}

function matchTerm(text, term) {
  const lower = term.toLowerCase();
  if (/\s/.test(lower)) return text.includes(lower);
  const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

module.exports = { computeAlignmentScore, THRESHOLDS, parseSections };
