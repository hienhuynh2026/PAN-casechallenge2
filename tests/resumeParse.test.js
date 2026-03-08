const request = require('supertest');
const path = require('path');
const fs = require('fs');
const os = require('os');

jest.mock('../server/services/resumeAIService', () => ({
  extractResumeWithAI: jest.fn(),
}));

jest.mock('../server/services/groqService', () => ({
  analyzeGapWithAI: jest.fn(),
}));

const { extractResumeWithAI } = require('../server/services/resumeAIService');
const app = require('../server/index');

const SAMPLE_RESUME = path.join(__dirname, '../data/sample_resume.txt');

// ─── Shared contract assertions ───────────────────────────────────────────────
// Both AI and rule-based responses must satisfy these fields.
function assertResponseContract(body) {
  // Core data fields
  expect(typeof body.name).toBe('string');
  expect(typeof body.email).toBe('string');
  expect(typeof body.phone).toBe('string');
  expect(Array.isArray(body.skills)).toBe(true);
  expect(Array.isArray(body.workExperience)).toBe(true);
  expect(Array.isArray(body.projects)).toBe(true);
  expect(Array.isArray(body.certifications)).toBe(true);

  // Parse metadata
  expect(['ai', 'rule_based']).toContain(body.parseMode);
  expect(typeof body.parsedAt).toBe('string');
  expect(new Date(body.parsedAt).getTime()).not.toBeNaN(); // valid ISO date
  expect(Array.isArray(body.warnings)).toBe(true);
  expect(typeof body.isFallback).toBe('boolean');
  expect(body.isFallback).toBe(body.parseMode === 'rule_based'); // derived consistently

  // Confidence map
  expect(body.confidence).toBeDefined();
  const requiredConfidenceKeys = ['name', 'email', 'phone', 'skills', 'targetRole',
    'workExperience', 'projects', 'certifications'];
  for (const key of requiredConfidenceKeys) {
    expect(['high', 'medium', 'low']).toContain(body.confidence[key]);
  }

  // Each warning must have field + message
  for (const w of body.warnings) {
    expect(typeof w.field).toBe('string');
    expect(typeof w.message).toBe('string');
    expect(w.message.length).toBeGreaterThan(0);
  }

  // workExperience entries have required structure
  for (const exp of body.workExperience) {
    expect(typeof exp.title).toBe('string');
    expect(typeof exp.company).toBe('string');
    expect(Array.isArray(exp.bullets)).toBe(true);
  }

  // project entries have required structure
  for (const proj of body.projects) {
    expect(typeof proj.name).toBe('string');
    expect(Array.isArray(proj.bullets)).toBe(true);
    expect(Array.isArray(proj.technologies)).toBe(true);
  }
}

// ─── POST /api/resume/parse ────────────────────────────────────────────────────
describe('POST /api/resume/parse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Rule-based mode: response satisfies full API contract', async () => {
    extractResumeWithAI.mockRejectedValue(new Error('skip AI'));

    const res = await request(app)
      .post('/api/resume/parse')
      .attach('resume', SAMPLE_RESUME);

    expect(res.status).toBe(200);
    assertResponseContract(res.body);
    expect(res.body.parseMode).toBe('rule_based');
    expect(res.body.isFallback).toBe(true);
  });

  test('Rule-based mode: extracts structured fields from sample resume', async () => {
    extractResumeWithAI.mockRejectedValue(new Error('skip AI'));

    const res = await request(app)
      .post('/api/resume/parse')
      .attach('resume', SAMPLE_RESUME);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('ALEX CHEN');
    expect(res.body.email).toBe('alex.chen@email.com');
    expect(res.body.phone).toBe('(555) 123-4567');
    expect(res.body.skills.length).toBeGreaterThan(5);
    expect(res.body.skills).toEqual(expect.arrayContaining(['JavaScript', 'Python', 'React', 'Docker']));
    expect(res.body.education).toBeTruthy();
    // Education level should be inferred from "Bachelor's Degree in Computer Science"
    expect(res.body.educationLevel).toBe("Bachelor's Degree");
    expect(res.body.confidence.email).toBe('high');
    expect(res.body.confidence.phone).toBe('high');
  });

  test('Rule-based mode: work experience is structured (separate entries, not one blob)', async () => {
    extractResumeWithAI.mockRejectedValue(new Error('skip AI'));

    const res = await request(app)
      .post('/api/resume/parse')
      .attach('resume', SAMPLE_RESUME);

    expect(res.status).toBe(200);
    expect(res.body.workExperience.length).toBeGreaterThanOrEqual(2);
    for (const exp of res.body.workExperience) {
      expect(exp.title).toBeTruthy();
      expect(Array.isArray(exp.bullets)).toBe(true);
    }
  });

  test('Rule-based mode: projects are structured (separate entries)', async () => {
    extractResumeWithAI.mockRejectedValue(new Error('skip AI'));

    const res = await request(app)
      .post('/api/resume/parse')
      .attach('resume', SAMPLE_RESUME);

    expect(res.status).toBe(200);
    expect(res.body.projects.length).toBeGreaterThanOrEqual(1);
    for (const proj of res.body.projects) {
      expect(proj.name).toBeTruthy();
      expect(Array.isArray(proj.bullets)).toBe(true);
    }
  });

  test('Rule-based mode: certifications extracted as array of strings', async () => {
    extractResumeWithAI.mockRejectedValue(new Error('skip AI'));

    const res = await request(app)
      .post('/api/resume/parse')
      .attach('resume', SAMPLE_RESUME);

    expect(res.status).toBe(200);
    expect(res.body.certifications.length).toBeGreaterThan(0);
    for (const cert of res.body.certifications) {
      expect(typeof cert).toBe('string');
    }
  });

  test('AI mode: response satisfies same API contract', async () => {
    extractResumeWithAI.mockResolvedValue({
      name: 'Alex Chen',
      email: 'alex.chen@email.com',
      phone: '(555) 123-4567',
      educationLevel: "Bachelor's Degree",
      targetRole: 'Cloud Engineer',
      skills: ['JavaScript', 'Python', 'React', 'AWS', 'Docker', 'Kubernetes'],
      workExperience: [
        { title: 'SWE Intern', company: 'CloudScale Inc.', location: '', startDate: 'Jun 2024', endDate: 'Aug 2024', bullets: ['Built APIs'] },
      ],
      projects: [
        { name: 'CloudDeploy Dashboard', technologies: ['React', 'Node.js'], date: '', bullets: ['Monitored AWS resources'] },
      ],
      certifications: ['AWS Cloud Practitioner'],
    });

    const res = await request(app)
      .post('/api/resume/parse')
      .attach('resume', SAMPLE_RESUME);

    expect(res.status).toBe(200);
    assertResponseContract(res.body);
    expect(res.body.parseMode).toBe('ai');
    expect(res.body.isFallback).toBe(false);
  });

  test('AI mode: confidence fields are "high" for present fields', async () => {
    extractResumeWithAI.mockResolvedValue({
      name: 'Alex Chen',
      email: 'alex.chen@email.com',
      phone: '(555) 123-4567',
      educationLevel: "Bachelor's Degree",
      targetRole: 'Cloud Engineer',
      skills: ['JavaScript', 'React'],
      workExperience: [
        { title: 'SWE Intern', company: 'CloudScale', location: '', startDate: 'Jun 2024', endDate: 'Aug 2024', bullets: [] },
      ],
      projects: [],
      certifications: [],
    });

    const res = await request(app)
      .post('/api/resume/parse')
      .attach('resume', SAMPLE_RESUME);

    expect(res.status).toBe(200);
    expect(res.body.confidence.name).toBe('high');
    expect(res.body.confidence.email).toBe('high');
    expect(res.body.confidence.targetRole).toBe('high');
    expect(res.body.confidence.skills).toBe('high');
    expect(res.body.confidence.workExperience).toBe('high');
    // Empty projects → 'low' in AI mode (AI said there are none)
    expect(res.body.confidence.projects).toBe('low');
  });

  test('AI mode: no warnings for a fully populated response', async () => {
    extractResumeWithAI.mockResolvedValue({
      name: 'Alex Chen',
      email: 'alex.chen@email.com',
      phone: '(555) 123-4567',
      educationLevel: "Bachelor's Degree",
      targetRole: 'Cloud Engineer',
      skills: ['JavaScript', 'React'],
      workExperience: [{ title: 'SWE', company: 'Acme', location: '', startDate: '', endDate: '', bullets: [] }],
      projects: [{ name: 'App', technologies: [], date: '', bullets: [] }],
      certifications: [],
    });

    const res = await request(app)
      .post('/api/resume/parse')
      .attach('resume', SAMPLE_RESUME);

    expect(res.status).toBe(200);
    // name, targetRole, skills, workExperience all present → no blocking warnings
    const blockingFields = ['name', 'targetRole', 'skills', 'workExperience'];
    const blockingWarnings = res.body.warnings.filter((w) => blockingFields.includes(w.field));
    expect(blockingWarnings).toHaveLength(0);
  });

  test('Warnings are generated for empty fields', async () => {
    extractResumeWithAI.mockRejectedValue(new Error('skip AI'));

    const minimalResume = 'just some text with no structure at all';
    const tmpFile = path.join(os.tmpdir(), 'minimal-resume.txt');
    fs.writeFileSync(tmpFile, minimalResume);

    const res = await request(app)
      .post('/api/resume/parse')
      .attach('resume', tmpFile);

    fs.unlinkSync(tmpFile);
    expect(res.status).toBe(200);
    // Minimal resume → should have warnings for missing fields
    expect(res.body.warnings.length).toBeGreaterThan(0);
    // Each warning must be properly formed
    for (const w of res.body.warnings) {
      expect(w.field).toBeTruthy();
      expect(w.message).toBeTruthy();
    }
  });

  test('Both modes return identical top-level field names (rendering contract)', async () => {
    const aiResult = {
      name: 'Test User', email: 'test@test.com', phone: '555-0000',
      educationLevel: "Bachelor's Degree", targetRole: 'Frontend Developer',
      skills: ['React'], workExperience: [], projects: [], certifications: [],
    };

    // Run AI mode
    extractResumeWithAI.mockResolvedValue(aiResult);
    const aiRes = await request(app).post('/api/resume/parse').attach('resume', SAMPLE_RESUME);

    // Run rule-based mode
    extractResumeWithAI.mockRejectedValue(new Error('skip'));
    const ruleRes = await request(app).post('/api/resume/parse').attach('resume', SAMPLE_RESUME);

    const aiKeys   = Object.keys(aiRes.body).sort();
    const ruleKeys = Object.keys(ruleRes.body).sort();
    expect(aiKeys).toEqual(ruleKeys);
  });

  test('Edge case: no file uploaded returns 400', async () => {
    const res = await request(app).post('/api/resume/parse');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no file/i);
  });

  test('Edge case: whitespace-only file returns 400', async () => {
    const tmpFile = path.join(os.tmpdir(), 'test-empty-resume.txt');
    fs.writeFileSync(tmpFile, '   \n  \n   ');
    const res = await request(app).post('/api/resume/parse').attach('resume', tmpFile);
    fs.unlinkSync(tmpFile);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no text content|empty/i);
  });

  test('Edge case: AI returns malformed data, rule-based fallback is used', async () => {
    extractResumeWithAI.mockResolvedValue({ bad: 'data' });
    const res = await request(app).post('/api/resume/parse').attach('resume', SAMPLE_RESUME);
    expect(res.status).toBe(200);
    expect(res.body.parseMode).toBe('rule_based');
    expect(res.body.isFallback).toBe(true);
    expect(res.body.skills.length).toBeGreaterThan(0);
  });
});

// ─── Rule-based parser unit tests ─────────────────────────────────────────────
describe('Rule-based parser unit tests', () => {
  const { parseResume } = require('../server/services/resumeParserService');

  test('Extracts email and phone from unstructured text', () => {
    const text = 'John Doe\njohn@example.com | 555-987-6543\nSome other content';
    const result = parseResume(text);
    expect(result.email).toBe('john@example.com');
    expect(result.phone).toBe('555-987-6543');
    expect(result.name).toBe('John Doe');
  });

  test('Returns empty fields for minimal text with no recognizable content', () => {
    const text = 'just some random text with no structure';
    const result = parseResume(text);
    expect(result.email).toBe('');
    expect(result.phone).toBe('');
    expect(result.skills).toEqual([]);
    expect(result.confidence.email).toBe('low');
    expect(result.confidence.skills).toBe('low');
  });

  test('Extracts skills from a SKILLS section', () => {
    const text = 'Jane Smith\n\nSKILLS\nLanguages: Python, Java, Go\nTools: Docker, Kubernetes\n\nEDUCATION\nBS Computer Science';
    const result = parseResume(text);
    expect(result.skills).toEqual(expect.arrayContaining(['Python', 'Docker', 'Kubernetes']));
    expect(result.education).toBeTruthy();
  });

  test('Infers educationLevel from education text', () => {
    const tests = [
      { text: "Bachelor's Degree in CS, UC Berkeley 2024", expected: "Bachelor's Degree" },
      { text: 'Master of Science in Machine Learning, MIT', expected: "Master's Degree" },
      { text: 'PhD in Computer Science, Stanford University', expected: 'PhD' },
      { text: 'Coding Bootcamp, App Academy', expected: 'Bootcamp' },
      { text: 'Associate Degree in Information Technology', expected: 'Associate Degree' },
    ];
    const { inferEducationLevel } = require('../server/services/resumeParserService');
    // inferEducationLevel is not exported yet — test via parseResume
    for (const { text: eduText, expected } of tests) {
      const fullResume = `Test Person\n\nEDUCATION\n${eduText}`;
      const result = parseResume(fullResume);
      expect(result.educationLevel).toBe(expected);
    }
  });
});
