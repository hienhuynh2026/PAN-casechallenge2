const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const jobs = require(path.join(__dirname, '../../data/sample_jobs.json'));
const {
  embedBatch,
  isGeminiEmbeddingConfigured,
  DEFAULT_MODEL,
  getStats,
} = require('../services/geminiEmbeddingService');
const { normalizeJobDocument } = require('../services/retrievalService');

const OUTPUT_PATH = (() => {
  const configured = process.env.EMBEDDING_INDEX_PATH;
  if (!configured) return path.resolve(__dirname, '../data/job_embeddings.index.json');
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(process.cwd(), configured);
})();

function computeDocsHash(docs) {
  return crypto.createHash('sha1').update(docs.join('\n')).digest('hex');
}

async function main() {
  if (!isGeminiEmbeddingConfigured()) {
    throw new Error('GEMINI_API_KEY is required to build the embedding index');
  }

  const model = process.env.EMBEDDING_MODEL || DEFAULT_MODEL;

  // Use normalized job documents (consistent with retrieval pipeline)
  const jobDocs = jobs.map(normalizeJobDocument);
  const docs = jobDocs.map((jd) => jd.embeddingText);

  console.log(`Embedding ${docs.length} jobs using batch API (model: ${model})...`);
  const vectors = await embedBatch(docs, model);

  const payload = {
    version: 2,
    model,
    docsHash: computeDocsHash(docs),
    createdAt: new Date().toISOString(),
    totalJobs: jobs.length,
    items: jobs.map((job, idx) => ({
      id: String(job.id),
      vector: vectors[idx],
    })),
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const stats = getStats();
  console.log(`Embedding index written: ${OUTPUT_PATH}`);
  console.log(`Model: ${model} | Jobs: ${jobs.length} | API calls: ${stats.embeddingRequests} | Cache hits: ${stats.cacheHits}`);
}

main().catch((err) => {
  console.error('Failed to build embedding index:', err.message);
  process.exit(1);
});
