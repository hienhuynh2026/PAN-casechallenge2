/**
 * Tests for the gap analysis feature.
 *
 * These tests use supertest against the Express app and mock the Groq service
 * so they run without a real API key.
 */

const request = require('supertest');

// Mock the groqService so tests never hit the real API
jest.mock('../server/services/groqService', () => ({
  analyzeGapWithAI: jest.fn(),
}));

const { analyzeGapWithAI } = require('../server/services/groqService');

// Load the app AFTER mocking
const app = require('../server/index');

describe('POST /api/gap-analysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Happy path: user submits a valid profile and selects a job → receives gap analysis with missing skills and roadmap', async () => {
    const mockResult = {
      missingSkills: ['Docker', 'Kubernetes'],
      roadmap: [
        {
          skill: 'Docker',
          priority: 'High',
          resources: [{ name: 'Docker Getting Started', url: 'https://docs.docker.com/get-started/', type: 'Docs' }],
          estimatedWeeks: 4,
        },
        {
          skill: 'Kubernetes',
          priority: 'High',
          resources: [{ name: 'KodeKloud Free Labs', url: 'https://kodekloud.com', type: 'Course' }],
          estimatedWeeks: 6,
        },
      ],
      totalEstimatedWeeks: 10,
      summary: 'You are missing 2 skills. Follow the roadmap to close the gap.',
    };

    analyzeGapWithAI.mockResolvedValue(mockResult);

    const res = await request(app)
      .post('/api/gap-analysis')
      .send({
        userSkills: ['JavaScript', 'React', 'Node.js', 'SQL', 'Git'],
        jobSkills: ['JavaScript', 'React', 'Node.js', 'SQL', 'Git', 'Docker', 'Kubernetes'],
        jobTitle: 'DevOps Engineer',
      });

    expect(res.status).toBe(200);
    expect(res.body.missingSkills).toEqual(['Docker', 'Kubernetes']);
    expect(res.body.roadmap).toHaveLength(2);
    expect(res.body.totalEstimatedWeeks).toBe(10);
    expect(res.body.isFallback).toBe(false);
  });

  test('Edge case: user skills already match all required skills → returns no-gaps result', async () => {
    const mockResult = {
      missingSkills: [],
      roadmap: [],
      totalEstimatedWeeks: 0,
      summary: 'Congratulations! Your skills match all required skills for this role.',
    };

    analyzeGapWithAI.mockResolvedValue(mockResult);

    const res = await request(app)
      .post('/api/gap-analysis')
      .send({
        userSkills: ['JavaScript', 'React', 'HTML', 'CSS', 'Git'],
        jobSkills: ['JavaScript', 'React', 'HTML', 'CSS', 'Git'],
        jobTitle: 'Frontend Developer',
      });

    expect(res.status).toBe(200);
    expect(res.body.missingSkills).toEqual([]);
    expect(res.body.roadmap).toHaveLength(0);
    expect(res.body.summary).toMatch(/congratulations/i);
    expect(res.body.isFallback).toBe(false);
  });

  test('Fallback: when Groq API fails, rule-based fallback is used and isFallback is true', async () => {
    analyzeGapWithAI.mockRejectedValue(new Error('Groq API unavailable'));

    const res = await request(app)
      .post('/api/gap-analysis')
      .send({
        userSkills: ['Python', 'SQL'],
        jobSkills: ['Python', 'SQL', 'AWS', 'Docker', 'Kubernetes'],
        jobTitle: 'Cloud Engineer',
      });

    expect(res.status).toBe(200);
    expect(res.body.isFallback).toBe(true);
    expect(res.body.missingSkills).toEqual(expect.arrayContaining(['AWS', 'Docker', 'Kubernetes']));
    expect(res.body.roadmap.length).toBeGreaterThan(0);
  });

  test('Validation: missing userSkills returns 400', async () => {
    const res = await request(app)
      .post('/api/gap-analysis')
      .send({ jobSkills: ['React'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  test('Validation: missing jobSkills returns 400', async () => {
    const res = await request(app)
      .post('/api/gap-analysis')
      .send({ userSkills: ['React'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe('GET /api/jobs', () => {
  test('Returns all jobs without filters', async () => {
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('Filters by search term', async () => {
    const res = await request(app).get('/api/jobs?search=Frontend');
    expect(res.status).toBe(200);
    expect(res.body.every((j) => j.title.toLowerCase().includes('frontend') || j.description.toLowerCase().includes('frontend'))).toBe(true);
  });

  test('Filters by experience level', async () => {
    const res = await request(app).get('/api/jobs?level=Entry');
    expect(res.status).toBe(200);
    expect(res.body.every((j) => j.experienceLevel === 'Entry')).toBe(true);
  });
});

describe('POST /api/profile', () => {
  test('Returns 400 for missing name', async () => {
    const res = await request(app)
      .post('/api/profile')
      .send({ skills: ['JavaScript'], targetRole: 'Frontend Developer' });
    expect(res.status).toBe(400);
  });

  test('Returns 400 for empty skills array', async () => {
    const res = await request(app)
      .post('/api/profile')
      .send({ name: 'Test User', skills: [], targetRole: 'Frontend Developer' });
    expect(res.status).toBe(400);
  });

  test('Returns 400 for missing targetRole', async () => {
    const res = await request(app)
      .post('/api/profile')
      .send({ name: 'Test User', skills: ['JavaScript'] });
    expect(res.status).toBe(400);
  });

  // Skipped: requires better-sqlite3 native module (compiled for different Node version in this env)

});
