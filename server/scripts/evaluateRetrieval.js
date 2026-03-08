/**
 * evaluateRetrieval.js
 *
 * Measures retrieval quality on curated test cases.
 * Reports Precision@5, Recall@5, MRR, and nDCG@5.
 *
 * Usage:
 *   node server/scripts/evaluateRetrieval.js
 *
 * Requires GEMINI_API_KEY in .env for embedding-based evaluation.
 * Falls back to TF-IDF if unavailable.
 */

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { retrieveTopJobs, computeRetrievalMetrics } = require('../services/retrievalService');
const { isGeminiEmbeddingConfigured } = require('../services/geminiEmbeddingService');

// ─── Test cases: curated candidate profiles with expected relevant roles ─────

const TEST_CASES = [
  {
    name: 'Strong Frontend Developer',
    category: 'strong_professional_fit',
    profile: {
      resumeText: `
Senior Frontend Developer with 5 years experience building React applications.
Expert in JavaScript, TypeScript, HTML, CSS, and modern frontend tooling.
Built responsive dashboards, component libraries, and design systems.
Experience with Next.js, Redux, Jest, Tailwind CSS, Webpack, and Vite.
Led frontend architecture for a SaaS product serving 50K+ users.
Improved page load times by 40% through code splitting and lazy loading.
BS in Computer Science.
      `,
      skills: ['JavaScript', 'TypeScript', 'React', 'HTML', 'CSS', 'Next.js', 'Redux', 'Jest', 'Tailwind', 'Webpack', 'Vite'],
      targetRole: 'Frontend Developer',
    },
    expectedRelevantRole: 'Frontend Developer',
  },
  {
    name: 'Moderate Backend Developer',
    category: 'moderate_fit',
    profile: {
      resumeText: `
Junior developer with 1 year of experience. Built a REST API with Node.js and Express.
Familiar with SQL, PostgreSQL, and basic Docker. Used Git for version control.
Completed a bootcamp in full-stack web development.
Interested in backend engineering and cloud infrastructure.
      `,
      skills: ['Node.js', 'JavaScript', 'SQL', 'Git', 'Docker'],
      targetRole: 'Backend Developer',
    },
    expectedRelevantRole: 'Backend Developer',
  },
  {
    name: 'Poor Fit - Barista targeting Cloud Engineer',
    category: 'poor_fit',
    profile: {
      resumeText: `
Experienced barista with 3 years in food service.
Managed daily operations and trained new staff.
Strong communication and customer service skills.
High school diploma.
      `,
      skills: ['Customer Service', 'Team Management'],
      targetRole: 'Cloud Engineer',
    },
    expectedRelevantRole: 'Cloud Engineer',
  },
  {
    name: 'Education-heavy ML candidate',
    category: 'education_heavy',
    profile: {
      resumeText: `
Recent PhD graduate in Machine Learning from Stanford University.
Published 4 papers on deep learning and NLP. Expertise in PyTorch and TensorFlow.
Teaching assistant for graduate ML courses. Strong in Python, NumPy, Pandas.
Limited industry experience but strong research background.
Built a text classification system using BERT for sentiment analysis.
      `,
      skills: ['Python', 'Machine Learning', 'PyTorch', 'TensorFlow', 'NLP', 'Pandas', 'NumPy'],
      targetRole: 'Machine Learning Engineer',
    },
    expectedRelevantRole: 'Machine Learning Engineer',
  },
  {
    name: 'Strong Data Analyst',
    category: 'strong_professional_fit',
    profile: {
      resumeText: `
Data Analyst with 3 years experience at a fintech company.
Expert in SQL, Python, Tableau, and statistical analysis.
Built dashboards tracking KPIs for executive team. A/B testing experience.
Analyzed customer cohorts and improved retention by 15%.
Created automated reporting pipelines using Python and Airflow.
Bachelor's in Statistics.
      `,
      skills: ['SQL', 'Python', 'Tableau', 'Statistics', 'Excel', 'A/B testing', 'Pandas'],
      targetRole: 'Data Analyst',
    },
    expectedRelevantRole: 'Data Analyst',
  },
  {
    name: 'DevOps Engineer with SRE overlap',
    category: 'moderate_fit',
    profile: {
      resumeText: `
DevOps Engineer with focus on CI/CD and container orchestration.
Built GitHub Actions pipelines, managed Kubernetes clusters, used Terraform for IaC.
Experience with Prometheus, Grafana monitoring. Linux administration.
Python scripting for automation. Docker containerization.
      `,
      skills: ['CI/CD', 'Docker', 'Kubernetes', 'Linux', 'Python', 'Terraform', 'Prometheus', 'Grafana', 'Git'],
      targetRole: 'Site Reliability Engineer',
    },
    expectedRelevantRole: 'Site Reliability Engineer',
  },
];

// ─── Run evaluation ─────────────────────────────────────────────────────────

async function runEvaluation() {
  console.log('=== Retrieval Quality Evaluation ===\n');
  console.log(`Embedding configured: ${isGeminiEmbeddingConfigured()}`);
  console.log(`Test cases: ${TEST_CASES.length}\n`);

  const results = [];
  const aggregateMetrics = {
    totalPrecision: 0,
    totalRecall: 0,
    totalMRR: 0,
    totalNDCG: 0,
    count: 0,
  };

  for (const tc of TEST_CASES) {
    console.log(`--- ${tc.name} (${tc.category}) ---`);
    console.log(`  Target: ${tc.profile.targetRole}`);

    try {
      const retrieval = await retrieveTopJobs(tc.profile, 5);
      const metrics = retrieval.allRanked
        ? computeRetrievalMetrics(retrieval.allRanked, tc.expectedRelevantRole, 5)
        : { precisionAtK: 0, recallAtK: 0, mrr: 0, ndcgAtK: 0 };

      console.log(`  Method: ${retrieval.method}`);
      console.log(`  Top 5 retrieved:`);
      for (const job of retrieval.topJobs) {
        const relevant = job.title.toLowerCase() === tc.expectedRelevantRole.toLowerCase() ? 'Y' : 'N';
        console.log(`    [${relevant}] ${job.title} @ ${job.company} (score: ${job.retrievalScore}, match: ${job.matchStrength})`);
        if (job.evidence?.matchingSkills?.length > 0) {
          console.log(`        Skills matched: ${job.evidence.matchingSkills.join(', ')}`);
        }
      }
      console.log(`  Precision@5: ${metrics.precisionAtK}`);
      console.log(`  Recall@5:    ${metrics.recallAtK}`);
      console.log(`  MRR:         ${metrics.mrr}`);
      console.log(`  nDCG@5:      ${metrics.ndcgAtK}`);
      console.log();

      aggregateMetrics.totalPrecision += metrics.precisionAtK;
      aggregateMetrics.totalRecall += metrics.recallAtK;
      aggregateMetrics.totalMRR += metrics.mrr;
      aggregateMetrics.totalNDCG += metrics.ndcgAtK;
      aggregateMetrics.count++;

      results.push({
        name: tc.name,
        category: tc.category,
        targetRole: tc.profile.targetRole,
        expectedRole: tc.expectedRelevantRole,
        method: retrieval.method,
        topJobTitles: retrieval.topJobs.map((j) => j.title),
        metrics,
      });
    } catch (err) {
      console.log(`  ERROR: ${err.message}\n`);
      results.push({
        name: tc.name,
        category: tc.category,
        error: err.message,
      });
    }
  }

  // Aggregate
  const n = aggregateMetrics.count || 1;
  console.log('=== Aggregate Results ===');
  console.log(`  Avg Precision@5: ${(aggregateMetrics.totalPrecision / n).toFixed(3)}`);
  console.log(`  Avg Recall@5:    ${(aggregateMetrics.totalRecall / n).toFixed(3)}`);
  console.log(`  Avg MRR:         ${(aggregateMetrics.totalMRR / n).toFixed(3)}`);
  console.log(`  Avg nDCG@5:      ${(aggregateMetrics.totalNDCG / n).toFixed(3)}`);

  // Save results
  const outputPath = path.resolve(__dirname, '../data/retrieval_evaluation_results.json');
  const output = {
    evaluatedAt: new Date().toISOString(),
    embeddingConfigured: isGeminiEmbeddingConfigured(),
    testCaseCount: TEST_CASES.length,
    aggregate: {
      avgPrecisionAt5: Number((aggregateMetrics.totalPrecision / n).toFixed(3)),
      avgRecallAt5: Number((aggregateMetrics.totalRecall / n).toFixed(3)),
      avgMRR: Number((aggregateMetrics.totalMRR / n).toFixed(3)),
      avgNDCGAt5: Number((aggregateMetrics.totalNDCG / n).toFixed(3)),
    },
    results,
  };

  require('fs').writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`\nResults saved to: ${outputPath}`);
}

runEvaluation().catch((err) => {
  console.error('Evaluation failed:', err.message);
  process.exit(1);
});
