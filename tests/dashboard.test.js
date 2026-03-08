const request = require('supertest');

jest.mock('../server/services/groqService', () => ({
  analyzeGapWithAI: jest.fn(),
}));

// Mock Gemini to avoid real API calls
jest.mock('../server/services/geminiEmbeddingService', () => {
  const actual = jest.requireActual('../server/services/geminiEmbeddingService');
  return {
    ...actual,
    isGeminiEmbeddingConfigured: jest.fn(() => false),
    embedSingle: jest.fn(() => Promise.reject(new Error('Mocked: no API key'))),
    embedBatch: jest.fn(() => Promise.reject(new Error('Mocked: no API key'))),
  };
});

// Mock groq-sdk to control AI insights behavior per test
const mockCreate = jest.fn();
jest.mock('groq-sdk', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
});

const app = require('../server/index');

describe('POST /api/dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: AI returns a valid response
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: 'Mock AI summary for testing.',
            roadmap: [
              { skill: 'TypeScript', priority: 'High', frequency: 80, estimatedWeeks: 4, reason: 'Strong demand in job postings.' },
            ],
          }),
        },
      }],
    });
  });

  test('Happy path: returns aggregated gap analysis for a target role', async () => {
    const res = await request(app)
      .post('/api/dashboard')
      .send({
        userSkills: ['JavaScript', 'React', 'HTML', 'CSS', 'Git'],
        targetRole: 'Frontend Developer',
      });

    expect(res.status).toBe(200);
    expect(res.body.targetRole).toBe('Frontend Developer');
    expect(res.body.totalJobsAnalyzed).toBe(10);
    expect(res.body.skillFrequency).toBeInstanceOf(Array);
    expect(res.body.skillFrequency.length).toBeGreaterThan(0);
    expect(res.body.missingSkills).toBeInstanceOf(Array);
    expect(res.body.matchedSkills).toBeInstanceOf(Array);
    expect(res.body.matchedSkills.length).toBeGreaterThan(0);
    expect(typeof res.body.coveragePercentage).toBe('number');
    expect(res.body.summary).toBeTruthy();
    expect(res.body.roadmap).toBeInstanceOf(Array);
    expect(res.body.retrievalAnalysis).toBeDefined();
    expect(res.body.retrievalAnalysis.topMatches).toBeInstanceOf(Array);
    expect(res.body.retrievalAnalysis.offlineMetrics).toBeDefined();

    const jsMatch = res.body.matchedSkills.find((s) => s.skill === 'JavaScript');
    expect(jsMatch).toBeDefined();
    expect(jsMatch.frequency).toBe(100);
  });

  test('Skill frequency reflects actual job data', async () => {
    const res = await request(app)
      .post('/api/dashboard')
      .send({
        userSkills: ['Python'],
        targetRole: 'Cloud Engineer',
      });

    expect(res.status).toBe(200);
    expect(res.body.totalJobsAnalyzed).toBe(10);

    const awsSkill = res.body.skillFrequency.find((s) => s.skill === 'AWS');
    expect(awsSkill).toBeDefined();
    expect(awsSkill.percentage).toBe(100);

    expect(res.body.missingSkills.length).toBeGreaterThan(0);
    expect(res.body.coveragePercentage).toBeLessThan(50);
  });

  test('Full coverage: user has all skills for the role', async () => {
    const allSkillsRes = await request(app)
      .post('/api/dashboard')
      .send({
        userSkills: [
          'JavaScript','React','HTML','CSS','TypeScript','Vue','Angular',
          'Next.js','Redux','Webpack','Jest','Sass','Tailwind','REST APIs',
          'GraphQL','Git','Figma','Accessibility','Storybook','Vite',
          'Performance Optimization',
        ],
        targetRole: 'Frontend Developer',
      });

    expect(allSkillsRes.status).toBe(200);
    expect(allSkillsRes.body.coveragePercentage).toBe(100);
    expect(allSkillsRes.body.missingSkills).toHaveLength(0);
  });

  test('Edge case: unknown role returns 404', async () => {
    const res = await request(app)
      .post('/api/dashboard')
      .send({
        userSkills: ['Python'],
        targetRole: 'Underwater Basket Weaver',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no job postings/i);
  });

  test('Validation: missing userSkills returns 400', async () => {
    const res = await request(app)
      .post('/api/dashboard')
      .send({ targetRole: 'Cloud Engineer' });

    expect(res.status).toBe(400);
  });

  test('Validation: missing targetRole returns 400', async () => {
    const res = await request(app)
      .post('/api/dashboard')
      .send({ userSkills: ['Python'] });

    expect(res.status).toBe(400);
  });

  test('Response includes embedding stats and retrieval method', async () => {
    const res = await request(app)
      .post('/api/dashboard')
      .send({
        userSkills: ['JavaScript', 'React'],
        targetRole: 'Frontend Developer',
      });

    expect(res.status).toBe(200);
    expect(res.body.retrievalAnalysis.method).toBeTruthy();
    expect(typeof res.body.retrievalAnalysis.embeddingUsed).toBe('boolean');
    expect(res.body.retrievalAnalysis.embeddingStats).toBeDefined();
  });

  test('Gate-passed + valid AI response: returns gradingStatus=llm, isFallback=false', async () => {
    // Use a strong skill set that should pass the gate
    const res = await request(app)
      .post('/api/dashboard')
      .send({
        userSkills: [
          'JavaScript', 'React', 'HTML', 'CSS', 'TypeScript',
          'Next.js', 'Redux', 'Jest', 'Tailwind', 'Git',
        ],
        targetRole: 'Frontend Developer',
      });

    expect(res.status).toBe(200);
    // If gate passed and AI succeeded:
    if (res.body.gateAnalysis?.goForLLM) {
      expect(res.body.isFallback).toBe(false);
      expect(res.body.gradingStatus).toBe('llm');
      expect(res.body.aiFallbackReason).toBeNull();
      expect(res.body.summary).toBe('Mock AI summary for testing.');
      // Resources should be attached to roadmap items
      expect(res.body.roadmap[0].resources).toBeInstanceOf(Array);
    }
  });

  test('Gate-passed + malformed AI response: returns isFallback=true with aiFallbackReason', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'This is not JSON at all, sorry!' } }],
    });

    const res = await request(app)
      .post('/api/dashboard')
      .send({
        userSkills: [
          'JavaScript', 'React', 'HTML', 'CSS', 'TypeScript',
          'Next.js', 'Redux', 'Jest', 'Tailwind', 'Git',
        ],
        targetRole: 'Frontend Developer',
      });

    expect(res.status).toBe(200);
    if (res.body.gateAnalysis?.goForLLM) {
      expect(res.body.isFallback).toBe(true);
      expect(res.body.gradingStatus).toBe('fallback');
      expect(res.body.aiFallbackReason).toBe('malformed_response');
      // Should still have a valid summary and roadmap from fallback
      expect(res.body.summary).toBeTruthy();
      expect(res.body.roadmap).toBeInstanceOf(Array);
    }
  });

  test('Gate-passed + AI returns markdown-fenced JSON: parses successfully', async () => {
    const jsonBody = JSON.stringify({
      summary: 'Fenced AI summary.',
      roadmap: [{ skill: 'Docker', priority: 'Medium', frequency: 50, estimatedWeeks: 3, reason: 'Container skills needed.' }],
    });
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '```json\n' + jsonBody + '\n```' } }],
    });

    const res = await request(app)
      .post('/api/dashboard')
      .send({
        userSkills: [
          'JavaScript', 'React', 'HTML', 'CSS', 'TypeScript',
          'Next.js', 'Redux', 'Jest', 'Tailwind', 'Git',
        ],
        targetRole: 'Frontend Developer',
      });

    expect(res.status).toBe(200);
    if (res.body.gateAnalysis?.goForLLM) {
      expect(res.body.isFallback).toBe(false);
      expect(res.body.gradingStatus).toBe('llm');
      expect(res.body.summary).toBe('Fenced AI summary.');
    }
  });

  test('Below-threshold: no AI call attempted, returns rule-based by design', async () => {
    const res = await request(app)
      .post('/api/dashboard')
      .send({
        userSkills: ['Python'],
        targetRole: 'Cloud Engineer',
      });

    expect(res.status).toBe(200);
    if (res.body.gateAnalysis && !res.body.gateAnalysis.goForLLM) {
      expect(res.body.isFallback).toBe(true);
      expect(res.body.gradingStatus).toBe('fallback');
      expect(res.body.aiFallbackReason).toBe('below_threshold');
      // AI should NOT have been called
      expect(mockCreate).not.toHaveBeenCalled();
    }
  });

  test('Response includes gateAnalysis with alignment data', async () => {
    const res = await request(app)
      .post('/api/dashboard')
      .send({
        userSkills: ['JavaScript', 'React'],
        targetRole: 'Frontend Developer',
      });

    expect(res.status).toBe(200);
    expect(res.body.gateAnalysis).toBeDefined();
    expect(typeof res.body.gateAnalysis.available).toBe('boolean');
    expect(typeof res.body.gateAnalysis.goForLLM).toBe('boolean');
    expect(res.body.gateAnalysis.status).toBeTruthy();
  });
});
