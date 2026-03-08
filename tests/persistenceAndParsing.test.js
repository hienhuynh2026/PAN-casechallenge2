/**
 * persistenceAndParsing.test.js
 *
 * Tests for:
 *   1. SQLite persistence (profile survives across require() calls)
 *   2. Structured resume parsing (work experience and projects as arrays)
 *   3. Fallback parsing correctness
 *   4. Profile CRUD API endpoints
 */

// Set test database path BEFORE any modules load (Jest hoists jest.mock but not process.env)
// We use __dirname which is available in Jest factories
process.env.SKILLBRIDGE_DB_PATH = __dirname + '/../server/data/test_skillbridge.db';

const request = require('supertest');
const path = require('path');
const fs = require('fs');

// ─── Mock Groq to avoid API calls ────────────────────────────────────────────
jest.mock('../server/services/resumeAIService', () => ({
  extractResumeWithAI: jest.fn().mockRejectedValue(new Error('No Groq in tests')),
}));

const TEST_DB = __dirname + '/../server/data/test_skillbridge.db';
const app = require('../server/index');
const { parseResume, parseWorkExperienceLines, parseProjectLines } = require('../server/services/resumeParserService');
const db = require('../server/db/database');

// ─── Clean test DB before/after each suite run ────────────────────────────────
beforeAll(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

afterAll(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

// ─── Unit: structured parsing ─────────────────────────────────────────────────
describe('parseWorkExperienceLines — structured extraction', () => {
  const WORK_LINES = [
    'Software Engineering Intern — CloudScale Inc.',
    'June 2024 – August 2024',
    '- Built REST API microservices using Node.js and Express',
    '- Automated infrastructure provisioning with Terraform',
    '- Implemented CI/CD pipelines using GitHub Actions',
    '',
    'Teaching Assistant — UC Berkeley, CS 61B Data Structures',
    'January 2024 – May 2024',
    '- Led weekly lab sections of 30+ students',
    '- Created supplementary learning materials',
  ];

  test('Extracts 2 separate work experience entries', () => {
    const result = parseWorkExperienceLines(WORK_LINES);
    expect(result).toHaveLength(2);
  });

  test('First entry: title, company, dates, bullets are correct', () => {
    const result = parseWorkExperienceLines(WORK_LINES);
    const first = result[0];
    expect(first.title).toBe('Software Engineering Intern');
    expect(first.company).toContain('CloudScale');
    expect(first.startDate).toMatch(/june/i);
    expect(first.endDate).toMatch(/august/i);
    expect(first.bullets).toHaveLength(3);
    expect(first.bullets[0]).toContain('Node.js');
  });

  test('Second entry: Teaching Assistant role extracted', () => {
    const result = parseWorkExperienceLines(WORK_LINES);
    const second = result[1];
    expect(second.title).toBe('Teaching Assistant');
    expect(second.company).toContain('UC Berkeley');
    expect(second.bullets).toHaveLength(2);
  });

  test('Bullets are NOT mixed across entries', () => {
    const result = parseWorkExperienceLines(WORK_LINES);
    // Ensure first entry bullets don't contain second entry content
    const firstBulletText = result[0].bullets.join(' ');
    expect(firstBulletText).not.toContain('lab sections');
    // Ensure second entry bullets don't contain first entry content
    const secondBulletText = result[1].bullets.join(' ');
    expect(secondBulletText).not.toContain('Terraform');
  });
});

describe('parseProjectLines — structured extraction', () => {
  const PROJECT_LINES = [
    'CloudDeploy Dashboard',
    '- Full-stack app (React + Node.js) for monitoring AWS resource usage',
    '- Integrated AWS SDK to display real-time EC2 and S3 metrics',
    '- Deployed with Docker Compose on a VPS with automated health checks',
    '',
    'StudyBuddy',
    '- Collaborative study platform built with Django and PostgreSQL',
    '- Implemented real-time chat using WebSockets',
    '- Achieved 500+ active users during finals week',
  ];

  test('Extracts 2 separate project entries', () => {
    const result = parseProjectLines(PROJECT_LINES);
    expect(result).toHaveLength(2);
  });

  test('First project name is correct', () => {
    const result = parseProjectLines(PROJECT_LINES);
    expect(result[0].name).toBe('CloudDeploy Dashboard');
    expect(result[0].bullets).toHaveLength(3);
  });

  test('Second project name and bullets are correct', () => {
    const result = parseProjectLines(PROJECT_LINES);
    expect(result[1].name).toBe('StudyBuddy');
    expect(result[1].bullets).toHaveLength(3);
    expect(result[1].bullets[2]).toContain('500+');
  });

  test('Bullets belong to the correct project', () => {
    const result = parseProjectLines(PROJECT_LINES);
    const firstText = result[0].bullets.join(' ');
    const secondText = result[1].bullets.join(' ');
    expect(firstText).not.toContain('WebSockets');
    expect(secondText).not.toContain('AWS SDK');
  });
});

describe('parseResume — full structured output from sample resume', () => {
  const sampleText = fs.readFileSync(
    path.join(__dirname, '../data/sample_resume.txt'), 'utf-8'
  );

  test('Returns structured workExperience array (not a string)', () => {
    const result = parseResume(sampleText);
    expect(Array.isArray(result.workExperience)).toBe(true);
    expect(result.workExperience.length).toBeGreaterThanOrEqual(2);
  });

  test('Returns structured projects array (not a string)', () => {
    const result = parseResume(sampleText);
    expect(Array.isArray(result.projects)).toBe(true);
    expect(result.projects.length).toBeGreaterThanOrEqual(1);
  });

  test('Each workExperience entry has required fields', () => {
    const result = parseResume(sampleText);
    for (const exp of result.workExperience) {
      expect(typeof exp.title).toBe('string');
      expect(typeof exp.company).toBe('string');
      expect(Array.isArray(exp.bullets)).toBe(true);
    }
  });

  test('Each project entry has required fields', () => {
    const result = parseResume(sampleText);
    for (const proj of result.projects) {
      expect(typeof proj.name).toBe('string');
      expect(Array.isArray(proj.bullets)).toBe(true);
      expect(Array.isArray(proj.technologies)).toBe(true);
    }
  });

  test('Skills array is non-empty', () => {
    const result = parseResume(sampleText);
    expect(result.skills.length).toBeGreaterThan(0);
  });

  test('Certifications are extracted as array of strings', () => {
    const result = parseResume(sampleText);
    expect(Array.isArray(result.certifications)).toBe(true);
    expect(result.certifications.length).toBeGreaterThan(0);
    result.certifications.forEach((c) => expect(typeof c).toBe('string'));
  });
});

// ─── API: profile persistence ─────────────────────────────────────────────────
describe('POST /api/profile — persistence', () => {
  const testProfile = {
    name: 'Test User',
    skills: ['JavaScript', 'React', 'Node.js'],
    educationLevel: "Bachelor's Degree",
    targetRole: 'Frontend Developer',
    workExperience: [
      {
        title: 'Software Engineer',
        company: 'Acme Corp',
        location: 'Remote',
        startDate: 'Jan 2023',
        endDate: 'Present',
        bullets: ['Built features', 'Fixed bugs'],
      },
    ],
    projects: [
      {
        name: 'My App',
        technologies: ['React', 'Node.js'],
        date: 'Jan 2025',
        bullets: ['Built the UI', 'Deployed to AWS'],
      },
    ],
    certifications: ['AWS Cloud Practitioner — Amazon, 2024'],
  };

  test('Profile saves successfully and returns full structured data', async () => {
    const res = await request(app).post('/api/profile').send(testProfile);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test User');
    expect(res.body.skills).toContain('React');
    expect(Array.isArray(res.body.workExperience)).toBe(true);
    expect(res.body.workExperience).toHaveLength(1);
    expect(Array.isArray(res.body.projects)).toBe(true);
    expect(res.body.projects).toHaveLength(1);
    expect(Array.isArray(res.body.certifications)).toBe(true);
    expect(res.body.certifications).toContain('AWS Cloud Practitioner — Amazon, 2024');
  });

  test('GET /api/profile returns the same data without re-upload', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test User');
    expect(res.body.targetRole).toBe('Frontend Developer');
    expect(Array.isArray(res.body.workExperience)).toBe(true);
    expect(res.body.workExperience[0].title).toBe('Software Engineer');
    expect(res.body.workExperience[0].bullets).toContain('Built features');
  });

  test('Profile is still accessible after a second require() of the app module', () => {
    // Simulate re-load by re-requiring the db module — data should still be there
    const freshRead = require('../server/db/database').readProfile();
    expect(freshRead).not.toBeNull();
    expect(freshRead.name).toBe('Test User');
  });
});

describe('POST /api/profile — validation', () => {
  test('Missing name returns 400', async () => {
    const res = await request(app)
      .post('/api/profile')
      .send({ skills: ['JS'], targetRole: 'Frontend Developer' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  test('Empty skills array returns 400', async () => {
    const res = await request(app)
      .post('/api/profile')
      .send({ name: 'Test', skills: [], targetRole: 'Frontend Developer' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/skill/i);
  });

  test('Missing targetRole returns 400', async () => {
    const res = await request(app)
      .post('/api/profile')
      .send({ name: 'Test', skills: ['JS'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/target role/i);
  });
});

describe('Work experience and project CRUD endpoints', () => {
  let expId;
  let projId;

  test('POST /api/profile/work-experience adds an entry', async () => {
    const res = await request(app)
      .post('/api/profile/work-experience')
      .send({ title: 'New Role', company: 'New Co', location: '', startDate: 'Jan 2025', endDate: 'Present', bullets: ['Did X'] });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expId = res.body.id;
  });

  test('PUT /api/profile/work-experience/:id updates an entry', async () => {
    const res = await request(app)
      .put(`/api/profile/work-experience/${expId}`)
      .send({ title: 'Updated Role', company: 'New Co', location: 'Remote', startDate: 'Jan 2025', endDate: 'Present', bullets: ['Did X', 'Did Y'] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('DELETE /api/profile/work-experience/:id removes an entry', async () => {
    const res = await request(app).delete(`/api/profile/work-experience/${expId}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('POST /api/profile/projects adds a project', async () => {
    const res = await request(app)
      .post('/api/profile/projects')
      .send({ name: 'My Project', technologies: ['React'], date: 'Jan 2025', bullets: ['Built it'] });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    projId = res.body.id;
  });

  test('DELETE /api/profile/projects/:id removes a project', async () => {
    const res = await request(app).delete(`/api/profile/projects/${projId}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
