/**
 * evaluatorPipeline.test.js
 *
 * Integration tests for the full evaluation pipeline:
 *   - Transfer model (alignment scoring + guardrails)
 *   - RAG retrieval (semantic job matching)
 *   - Gate decisions (strong / borderline / weak)
 *   - Agent service (resource delivery with and without Groq)
 *   - API endpoints (/api/evaluate, /api/evaluate/grade, /api/evaluate/agent)
 *
 * All Groq and Gemini calls are mocked. No API key or network access required.
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');

// ─── Mock Groq services before requiring the app ─────────────────────────────
jest.mock('../server/services/resumeGraderService', () => ({
  gradeResumeWithLLM: jest.fn(),
  gradeResumeFallback: jest.fn((alignment) => ({
    overallScore: Math.round(alignment.alignmentScore * 0.95),
    readinessLevel: 'Almost Ready',
    roleFitSummary: 'Fallback grade summary.',
    strengths: [],
    weakAreas: [],
    actionSteps: [],
    resumeImprovements: [],
    bulletRewrites: [],
    isFallback: true,
  })),
}));

jest.mock('../server/services/agentService', () => {
  const actual = jest.requireActual('../server/services/agentService');
  return {
    ...actual,
    findGapResources: jest.fn(actual.findGapResources),
  };
});

// Mock Gemini embedding service to avoid real API calls
jest.mock('../server/services/geminiEmbeddingService', () => {
  const actual = jest.requireActual('../server/services/geminiEmbeddingService');
  return {
    ...actual,
    isGeminiEmbeddingConfigured: jest.fn(() => false),
    embedSingle: jest.fn(() => Promise.reject(new Error('Mocked: no API key'))),
    embedBatch: jest.fn(() => Promise.reject(new Error('Mocked: no API key'))),
  };
});

const { gradeResumeWithLLM } = require('../server/services/resumeGraderService');
const { findGapResources } = require('../server/services/agentService');
const app = require('../server/index');

// ─── Load sample resumes ──────────────────────────────────────────────────────
const RESUMES_DIR = path.join(__dirname, '../data/sample_resumes');
const strongFrontend    = fs.readFileSync(path.join(RESUMES_DIR, 'strong_frontend.txt'), 'utf8');
const borderlineAnalyst = fs.readFileSync(path.join(RESUMES_DIR, 'borderline_data_analyst.txt'), 'utf8');
const weakCloud         = fs.readFileSync(path.join(RESUMES_DIR, 'weak_cloud_engineer.txt'), 'utf8');

// ─── Unit tests: transfer model scoring ──────────────────────────────────────
const { computeAlignmentScore, THRESHOLDS } = require('../server/services/alignmentScoringService');

describe('computeAlignmentScore — scoring and guardrails', () => {
  test('Strong frontend resume: scores >= 70 with all guardrails passing', () => {
    const result = computeAlignmentScore(strongFrontend, 'Frontend Developer');
    expect(result.alignmentScore).toBeGreaterThanOrEqual(THRESHOLDS.STRONG);
    expect(result.status).toBe('strong');
    expect(result.goForLLM).toBe(true);
    expect(result.guardrailIssues).toHaveLength(0);
    expect(result.coreMatched.length).toBeGreaterThanOrEqual(4);
    expect(result.coreInExpOrProjCount).toBeGreaterThanOrEqual(2);
  });

  test('Borderline/weak data analyst resume: score below STRONG, does not go to LLM', () => {
    const result = computeAlignmentScore(borderlineAnalyst, 'Data Analyst');
    expect(result.goForLLM).toBe(false);
    expect(result.alignmentScore).toBeLessThan(THRESHOLDS.STRONG);
    expect(['weak', 'borderline']).toContain(result.status);
  });

  test('Weak cloud engineer resume: scores below borderline threshold', () => {
    const result = computeAlignmentScore(weakCloud, 'Cloud Engineer');
    expect(result.alignmentScore).toBeLessThan(THRESHOLDS.BORDERLINE);
    expect(result.status).toBe('weak');
    expect(result.goForLLM).toBe(false);
    expect(result.coreMatched).toHaveLength(0);
    expect(result.guardrailIssues.length).toBeGreaterThan(0);
  });

  test('Weak resume: guardrail A (core coverage) fails', () => {
    const result = computeAlignmentScore(weakCloud, 'Cloud Engineer');
    const guardrailAFailed = result.guardrailIssues.some(msg =>
      msg.toLowerCase().includes('must-have skills found')
    );
    expect(guardrailAFailed).toBe(true);
  });

  test('Weak resume: guardrail B (experience evidence) fails', () => {
    const result = computeAlignmentScore(weakCloud, 'Cloud Engineer');
    const guardrailBFailed = result.guardrailIssues.some(msg =>
      msg.toLowerCase().includes('demonstrated in experience or projects')
    );
    expect(guardrailBFailed).toBe(true);
  });

  test('Borderline resume: borderlineNote is populated', () => {
    const borderlineResume = `
SUMMARY
Junior developer with some experience in JavaScript and basic React.

SKILLS
JavaScript, HTML, CSS, React (beginner), some Node.js

EXPERIENCE
Web Intern — Company X (3 months)
- Assisted with HTML/CSS updates to the company website
- Used JavaScript for minor UI fixes

PROJECTS
Todo App (JavaScript, HTML, CSS)
- Built a simple to-do list using vanilla JavaScript

EDUCATION
Associate Degree in Computer Science, 2023
`;
    const result = computeAlignmentScore(borderlineResume, 'Frontend Developer');
    if (result.status === 'borderline') {
      expect(result.borderlineNote).toBeTruthy();
      expect(result.borderlineNote).toContain('Frontend Developer');
    }
  });

  test('Skills-only stuffed resume: section-weighting deflates core score', () => {
    const stuffedResume = `
SUMMARY
Passionate learner with interest in cloud engineering.

SKILLS
AWS, Linux, Python, Networking, Git, Terraform, Kubernetes, Docker, Ansible

EXPERIENCE
Data Entry Clerk — Office Inc (2 years)
- Entered data into spreadsheets
- Filed paperwork

EDUCATION
High School Diploma, 2020
`;
    const result = computeAlignmentScore(stuffedResume, 'Cloud Engineer');
    expect(result.goForLLM).toBe(false);
    expect(result.coreInExpOrProjCount).toBeLessThan(2);
  });
});

// ─── Integration tests: API pipeline ──────────────────────────────────────────
describe('POST /api/evaluate — full pipeline with RAG', () => {
  beforeEach(() => jest.clearAllMocks());

  test('Strong resume passes to LLM grading and includes retrieval data', async () => {
    gradeResumeWithLLM.mockResolvedValue({
      overallScore: 88,
      readinessLevel: 'Ready',
      roleFitSummary: 'Excellent fit.',
      strengths: ['React expertise', 'TypeScript usage'],
      weakAreas: [],
      actionSteps: [{ priority: 'Low', step: 'Add more testing', rationale: 'Good to have' }],
      resumeImprovements: [],
      bulletRewrites: [],
    });

    const res = await request(app)
      .post('/api/evaluate')
      .send({ resumeText: strongFrontend, targetRole: 'Frontend Developer' });

    expect(res.status).toBe(200);
    expect(res.body.alignment.status).toBe('strong');
    expect(res.body.alignment.goForLLM).toBe(true);
    expect(res.body.grade).toBeDefined();
    expect(res.body.grade.overallScore).toBe(88);
    expect(res.body.grade.isFallback).toBe(false);
    expect(res.body.agent).toBeUndefined();

    // RAG-specific fields
    expect(res.body.retrieval).toBeDefined();
    expect(res.body.retrieval.topJobs).toBeInstanceOf(Array);
    expect(res.body.retrieval.method).toBeTruthy();
    expect(res.body.composite).toBeDefined();
    expect(typeof res.body.composite.compositeScore).toBe('number');
    expect(res.body.scoringMethod).toBeDefined();
    expect(res.body.scoringMethod.label).toBeTruthy();
    expect(res.body.scoringMethod.id).toBeTruthy();
    expect(res.body.explainability).toBeDefined();
  });

  test('Strong resume: LLM failure triggers grade fallback, not a 500', async () => {
    gradeResumeWithLLM.mockRejectedValue(new Error('Groq rate limit exceeded'));

    const res = await request(app)
      .post('/api/evaluate')
      .send({ resumeText: strongFrontend, targetRole: 'Frontend Developer' });

    expect(res.status).toBe(200);
    expect(res.body.alignment.status).toBe('strong');
    expect(res.body.grade).toBeDefined();
    expect(res.body.grade.isFallback).toBe(true);
  });

  test('Weak resume routes to agent gap-closing, not LLM', async () => {
    const res = await request(app)
      .post('/api/evaluate')
      .send({ resumeText: weakCloud, targetRole: 'Cloud Engineer' });

    expect(res.status).toBe(200);
    expect(res.body.alignment.status).toBe('weak');
    expect(res.body.alignment.goForLLM).toBe(false);
    expect(gradeResumeWithLLM).not.toHaveBeenCalled();
    expect(res.body.agent).toBeDefined();
    expect(res.body.agent.categories).toBeDefined();
    expect(res.body.agent.quickWins).toBeDefined();

    // Retrieval still present even for weak resume
    expect(res.body.retrieval).toBeDefined();
    expect(res.body.scoringMethod).toBeDefined();
  });

  test('Weak resume agent: resources are always returned even when Groq summary fails', async () => {
    findGapResources.mockImplementationOnce(async (targetRole, missingCategories) => {
      const { findGapResourcesFallback } = jest.requireActual('../server/services/agentService');
      return findGapResourcesFallback(targetRole, missingCategories);
    });

    const res = await request(app)
      .post('/api/evaluate')
      .send({ resumeText: weakCloud, targetRole: 'Cloud Engineer' });

    expect(res.status).toBe(200);
    expect(res.body.agent).toBeDefined();
    expect(res.body.agent.isFallback).toBe(true);
    expect(Array.isArray(res.body.agent.categories)).toBe(true);
    res.body.agent.categories.forEach((cat) => {
      expect(cat.gap).toBeTruthy();
      expect(Array.isArray(cat.build)).toBe(true);
    });
  });

  test('Borderline/weak resume: does not auto-trigger LLM, always receives resources', async () => {
    const res = await request(app)
      .post('/api/evaluate')
      .send({ resumeText: borderlineAnalyst, targetRole: 'Data Analyst' });

    expect(res.status).toBe(200);
    expect(res.body.alignment.goForLLM).toBe(false);
    expect(gradeResumeWithLLM).not.toHaveBeenCalled();
    expect(res.body.agent).toBeDefined();
    expect(Array.isArray(res.body.agent.categories)).toBe(true);
    expect(Array.isArray(res.body.agent.quickWins)).toBe(true);
    expect(res.body.agent.summary).toBeTruthy();
    if (res.body.alignment.status === 'borderline') {
      expect(res.body.borderlineNote).toBeTruthy();
    }
  });

  test('Response includes honest scoring method label', async () => {
    gradeResumeWithLLM.mockResolvedValue({
      overallScore: 85,
      readinessLevel: 'Ready',
      roleFitSummary: 'Good.',
      strengths: [],
      weakAreas: [],
      actionSteps: [],
      resumeImprovements: [],
      bulletRewrites: [],
    });

    const res = await request(app)
      .post('/api/evaluate')
      .send({ resumeText: strongFrontend, targetRole: 'Frontend Developer' });

    expect(res.status).toBe(200);
    const method = res.body.scoringMethod;
    expect(method).toBeDefined();
    // With mocked Gemini (disabled), should not claim semantic retrieval
    expect(method.label).not.toContain('Transformer');
    expect(method.label).not.toContain('Deep Learning');
    expect(method.id).toBeTruthy();
    expect(method.description).toBeTruthy();
  });

  test('Response includes missingSkillsHelp with curated resources', async () => {
    const res = await request(app)
      .post('/api/evaluate')
      .send({ resumeText: weakCloud, targetRole: 'Cloud Engineer' });

    expect(res.status).toBe(200);
    expect(res.body.missingSkillsHelp).toBeInstanceOf(Array);
    expect(res.body.missingSkillsHelp.length).toBeGreaterThan(0);

    const firstSkill = res.body.missingSkillsHelp[0];
    expect(firstSkill.skill).toBeTruthy();
    expect(typeof firstSkill.frequency).toBe('number');
    expect(typeof firstSkill.isRequired).toBe('boolean');
    expect(firstSkill.whyItMatters).toBeTruthy();
    // Resources should be curated (have name + url)
    if (firstSkill.resources.length > 0) {
      expect(firstSkill.resources[0].name).toBeTruthy();
      expect(firstSkill.resources[0].url).toBeTruthy();
    }
  });

  test('Strong resume still gets missingSkillsHelp for non-matched skills', async () => {
    gradeResumeWithLLM.mockResolvedValue({
      overallScore: 88,
      readinessLevel: 'Ready',
      roleFitSummary: 'Excellent fit.',
      strengths: [],
      weakAreas: [],
      actionSteps: [],
      resumeImprovements: [],
      bulletRewrites: [],
    });

    const res = await request(app)
      .post('/api/evaluate')
      .send({ resumeText: strongFrontend, targetRole: 'Frontend Developer' });

    expect(res.status).toBe(200);
    expect(res.body.missingSkillsHelp).toBeInstanceOf(Array);
    // Strong resume may still have some missing skills from job postings
  });

  test('Validation: missing resumeText returns 400', async () => {
    const res = await request(app)
      .post('/api/evaluate')
      .send({ targetRole: 'Frontend Developer' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  test('Validation: unknown targetRole returns 400', async () => {
    const res = await request(app)
      .post('/api/evaluate')
      .send({ resumeText: 'some resume text', targetRole: 'Astronaut' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown role/i);
  });
});

// ─── Unit tests: agent service static resources ───────────────────────────────
describe('findGapResourcesFallback — static resource delivery', () => {
  const { findGapResourcesFallback } = require('../server/services/agentService');

  test('Always returns a well-formed response for a known role', () => {
    const missingCategories = [
      { category: 'Cloud Platforms', missing: ['AWS', 'GCP'], critical: true },
      { category: 'Containers & Orchestration', missing: ['Docker', 'Kubernetes'], critical: false },
    ];

    const result = findGapResourcesFallback('Cloud Engineer', missingCategories);
    expect(result.isFallback).toBe(true);
    expect(result.summary).toBeTruthy();
    expect(Array.isArray(result.categories)).toBe(true);
    expect(result.categories).toHaveLength(2);
    expect(Array.isArray(result.quickWins)).toBe(true);
    expect(result.timelineEstimate).toBeTruthy();
  });

  test('Each category has learn resources, build ideas, and resume tips', () => {
    const missingCategories = [
      { category: 'CI/CD Pipelines', missing: ['GitHub Actions', 'Jenkins'], critical: false },
    ];

    const result = findGapResourcesFallback('DevOps Engineer', missingCategories);
    const cat = result.categories[0];
    expect(cat.gap).toBe('CI/CD Pipelines');
    expect(Array.isArray(cat.learn)).toBe(true);
    expect(cat.learn.length).toBeGreaterThan(0);
    cat.learn.forEach((r) => {
      expect(r.name).toBeTruthy();
      expect(r.url).toBeTruthy();
      expect(r.type).toBeTruthy();
    });
    expect(Array.isArray(cat.build)).toBe(true);
    expect(Array.isArray(cat.addToResume)).toBe(true);
    expect(cat.improveNext).toBeTruthy();
  });

  test('Works for all 12 supported roles without throwing', () => {
    const { getAllRoleNames } = require('../server/data/roleKnowledgeBase');
    const roles = getAllRoleNames();
    const dummyMissing = [{ category: 'Core Languages', missing: ['Python'], critical: false }];

    roles.forEach((role) => {
      expect(() => findGapResourcesFallback(role, dummyMissing)).not.toThrow();
    });
  });
});

// ─── Integration: manual deep grade endpoint ──────────────────────────────────
describe('POST /api/evaluate/grade — manual deep grade', () => {
  beforeEach(() => jest.clearAllMocks());

  test('Deep grade works for borderline resume (manual escalation)', async () => {
    gradeResumeWithLLM.mockResolvedValue({
      overallScore: 62,
      readinessLevel: 'Needs Work',
      roleFitSummary: 'Shows some potential but needs more SQL and visualization experience.',
      strengths: ['Excel proficiency', 'Business context understanding'],
      weakAreas: [{ area: 'Data Visualization', explanation: 'No BI tools mentioned' }],
      actionSteps: [{ priority: 'High', step: 'Learn Tableau', rationale: 'Core tool for Data Analyst' }],
      resumeImprovements: ['Add Tableau/Power BI to skills'],
      bulletRewrites: [],
    });

    const res = await request(app)
      .post('/api/evaluate/grade')
      .send({ resumeText: borderlineAnalyst, targetRole: 'Data Analyst' });

    expect(res.status).toBe(200);
    expect(res.body.grade).toBeDefined();
    expect(res.body.grade.overallScore).toBe(62);
    expect(res.body.grade.isFallback).toBe(false);
  });

  test('Deep grade falls back gracefully when Groq fails', async () => {
    gradeResumeWithLLM.mockRejectedValue(new Error('Network error'));

    const res = await request(app)
      .post('/api/evaluate/grade')
      .send({ resumeText: borderlineAnalyst, targetRole: 'Data Analyst' });

    expect(res.status).toBe(200);
    expect(res.body.grade.isFallback).toBe(true);
  });
});
