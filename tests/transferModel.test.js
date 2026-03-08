const fs = require('fs');
const path = require('path');
const { computeAlignmentScore, THRESHOLDS, parseSections } = require('../server/services/transferModelService');

// ─── Helper ───────────────────────────────────────────────────────────────────
function loadResume(filename) {
  return fs.readFileSync(path.join(__dirname, '../data/sample_resumes', filename), 'utf8');
}

// ─── Test 1: Strong resume → score ≥ 70, status = strong, goForLLM = true ────
describe('Strong Frontend Developer resume', () => {
  let result;

  beforeAll(() => {
    result = computeAlignmentScore(loadResume('strong_frontend.txt'), 'Frontend Developer');
  });

  test('score is at least 70', () => {
    expect(result.alignmentScore).toBeGreaterThanOrEqual(THRESHOLDS.STRONG);
  });

  test('status is strong', () => {
    expect(result.status).toBe('strong');
  });

  test('goForLLM is true', () => {
    expect(result.goForLLM).toBe(true);
  });

  test('no guardrail issues', () => {
    expect(result.guardrailIssues).toHaveLength(0);
  });

  test('core skills include JavaScript and React', () => {
    expect(result.coreMatched).toContain('JavaScript');
    expect(result.coreMatched).toContain('React');
  });

  test('returns a 7-dimension breakdown', () => {
    const dims = Object.keys(result.breakdown);
    expect(dims).toHaveLength(7);
  });
});

// ─── Test 2: Borderline resume → score 55–74, status = borderline, goForLLM = false ──
describe('Borderline Data Analyst resume (inline)', () => {
  // Inline resume that is stronger than borderline_data_analyst.txt but not
  // strong enough to clear all guardrails or reach 70. Has SQL, Python, and
  // Tableau in the skills section and some project work, but no core analytics
  // tools in experience and missing several key skills.
  const resume = `
Jordan Lee
jordan.lee@email.com

SUMMARY
Data-oriented analyst with experience in reporting and business intelligence. Comfortable with SQL, Excel, and Python.

SKILLS
SQL, Python, Excel, Tableau, Power BI, data analysis, statistics, data visualisation

EXPERIENCE

Business Analyst — Retail Inc (2022 – Present)
- Generated weekly sales reports using SQL queries and Excel pivot tables
- Created Tableau dashboards for the marketing team to track campaign performance
- Collaborated with stakeholders to define KPIs and reporting requirements

PROJECTS

Customer Churn Analysis (Python, pandas)
- Analysed a 10,000-row customer dataset using pandas to identify churn indicators
- Built a logistic regression model using scikit-learn with 78% accuracy
- Visualised findings with matplotlib charts

EDUCATION
Bachelor's Degree in Statistics — State University, 2022
`;

  let result;

  beforeAll(() => {
    result = computeAlignmentScore(resume, 'Data Analyst');
  });

  test('score is at least 55', () => {
    expect(result.alignmentScore).toBeGreaterThanOrEqual(THRESHOLDS.BORDERLINE);
  });

  test('score is below 70 OR guardrail failed → status is borderline', () => {
    expect(result.status).toBe('borderline');
  });

  test('goForLLM is false', () => {
    expect(result.goForLLM).toBe(false);
  });

  test('has matched at least one core skill', () => {
    expect(result.coreMatched.length).toBeGreaterThan(0);
  });
});

// ─── Test 3: Weak resume → score < 55, status = weak ────────────────────────
describe('Weak Cloud Engineer resume', () => {
  let result;

  beforeAll(() => {
    result = computeAlignmentScore(loadResume('weak_cloud_engineer.txt'), 'Cloud Engineer');
  });

  test('score is below 55', () => {
    expect(result.alignmentScore).toBeLessThan(THRESHOLDS.BORDERLINE);
  });

  test('status is weak', () => {
    expect(result.status).toBe('weak');
  });

  test('goForLLM is false', () => {
    expect(result.goForLLM).toBe(false);
  });

  test('has multiple guardrail issues', () => {
    expect(result.guardrailIssues.length).toBeGreaterThan(0);
  });

  test('most core cloud skills are missing', () => {
    expect(result.coreMissed.length).toBeGreaterThan(result.coreMatched.length);
  });
});

// ─── Test 4: Keyword-stuffed resume → guardrail B fires ──────────────────────
// Skills section is packed with every core skill, but experience is completely
// unrelated. Guardrail B requires ≥ 1 core skill in Experience or Projects.
describe('Keyword-stuffed resume — skills section only', () => {
  const stuffedResume = `
Pat Smith
pat@email.com

SUMMARY
Looking for a cloud role. Eager to learn.

SKILLS
AWS, Azure, GCP, Kubernetes, Docker, Terraform, Linux, Python, CI/CD, Ansible

EXPERIENCE

Barista — Coffee House (2021 – Present)
- Made coffee and served customers
- Trained new staff on drink preparation
- Managed daily opening and closing procedures

EDUCATION
High School Diploma, 2020
`;

  let result;

  beforeAll(() => {
    result = computeAlignmentScore(stuffedResume, 'Cloud Engineer');
  });

  test('goForLLM is false despite skills list', () => {
    expect(result.goForLLM).toBe(false);
  });

  test('guardrail B fires: no core skills in experience or projects', () => {
    const hasExpProjIssue = result.guardrailIssues.some(
      (issue) => /experience or projects/i.test(issue)
    );
    expect(hasExpProjIssue).toBe(true);
  });

  test('status is not strong', () => {
    expect(result.status).not.toBe('strong');
  });
});

// ─── Test 5: parseSections correctly splits resume text ───────────────────────
describe('parseSections', () => {
  test('assigns lines to correct sections', () => {
    const text = `
SKILLS
JavaScript React TypeScript

EXPERIENCE
Built a dashboard app at Acme Corp

PROJECTS
Deployed a Node.js API to AWS and monitored uptime
`;
    const sections = parseSections(text);
    expect(sections.skills).toContain('javascript');
    expect(sections.experience).toContain('dashboard');
    expect(sections.projects).toContain('node.js');
  });

  test('defaults unknown lines to other', () => {
    const text = 'Some random line with no heading';
    const sections = parseSections(text);
    expect(sections.other).toContain('some random line');
  });
});
