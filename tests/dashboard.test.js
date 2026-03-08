const request = require('supertest');

jest.mock('../server/services/groqService', () => ({
  analyzeGapWithAI: jest.fn(),
}));

const app = require('../server/index');

describe('POST /api/dashboard', () => {
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
});
