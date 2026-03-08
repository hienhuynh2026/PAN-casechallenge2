const crypto = require('crypto');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = process.env.EMBEDDING_MODEL || 'gemini-embedding-001';
const REQUEST_DELAY_MS = Number(process.env.EMBEDDING_REQUEST_DELAY_MS || 700);
const MAX_BATCH_SIZE = 100; // Gemini batchEmbedContents supports up to 100

// ─── Instrumentation counters ────────────────────────────────────────────────
const stats = {
  cacheHits: 0,
  cacheMisses: 0,
  embeddingRequests: 0,
  retryCount: 0,
  fallbackCount: 0,
  totalQueueWaitMs: 0,
  queuedRequests: 0,
};

function getStats() {
  const total = stats.cacheHits + stats.cacheMisses;
  return {
    ...stats,
    cacheHitRate: total > 0 ? Number((stats.cacheHits / total).toFixed(3)) : 0,
    avgQueueWaitMs: stats.queuedRequests > 0
      ? Math.round(stats.totalQueueWaitMs / stats.queuedRequests)
      : 0,
  };
}

function resetStats() {
  Object.keys(stats).forEach((k) => { stats[k] = 0; });
}

// ─── Content-hash embedding cache ────────────────────────────────────────────
const embeddingCache = new Map();

function contentHash(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
}

function getCachedEmbedding(text) {
  const hash = contentHash(text);
  if (embeddingCache.has(hash)) {
    stats.cacheHits++;
    return embeddingCache.get(hash);
  }
  stats.cacheMisses++;
  return null;
}

function setCachedEmbedding(text, vector) {
  embeddingCache.set(contentHash(text), vector);
}

function getCacheSize() {
  return embeddingCache.size;
}

function clearCache() {
  embeddingCache.clear();
}

// ─── Rate-limit queue with exponential backoff ───────────────────────────────
let requestQueue = Promise.resolve();
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

function enqueue(fn) {
  const queueStart = Date.now();
  stats.queuedRequests++;
  requestQueue = requestQueue.then(async () => {
    stats.totalQueueWaitMs += Date.now() - queueStart;
    return fn();
  });
  return requestQueue;
}

async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok) return response;

    if (response.status === 429 && attempt < retries) {
      stats.retryCount++;
      const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    const body = await response.text();
    throw new Error(`Gemini embedding request failed (${response.status}): ${body}`);
  }
}

// ─── Core API ────────────────────────────────────────────────────────────────

function isGeminiEmbeddingConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function embedSingle(text, model = DEFAULT_MODEL) {
  if (!isGeminiEmbeddingConfigured()) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const cached = getCachedEmbedding(text);
  if (cached) return cached;

  return enqueue(async () => {
    // Check cache again inside queue (another request may have populated it)
    const cached2 = getCachedEmbedding(text);
    if (cached2) return cached2;

    stats.embeddingRequests++;
    const endpoint = `${GEMINI_API_BASE}/models/${model}:embedContent?key=${process.env.GEMINI_API_KEY}`;
    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: String(text || '') }] },
      }),
    });

    const json = await response.json();
    const values = json?.embedding?.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('Gemini embedding response missing vector values');
    }
    setCachedEmbedding(text, values);

    if (REQUEST_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    }
    return values;
  });
}

/**
 * Batch embed using Gemini batchEmbedContents API.
 * Sends up to MAX_BATCH_SIZE texts per request, reducing API call count.
 * Returns cached vectors for texts already seen.
 */
async function embedBatch(texts, model = DEFAULT_MODEL) {
  if (!isGeminiEmbeddingConfigured()) {
    throw new Error('GEMINI_API_KEY not configured');
  }
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('embedBatch requires a non-empty text array');
  }

  // Separate cached from uncached
  const results = new Array(texts.length);
  const uncachedIndices = [];

  for (let i = 0; i < texts.length; i++) {
    const cached = getCachedEmbedding(texts[i]);
    if (cached) {
      results[i] = cached;
    } else {
      uncachedIndices.push(i);
    }
  }

  if (uncachedIndices.length === 0) return results;

  // Process uncached in batches
  for (let start = 0; start < uncachedIndices.length; start += MAX_BATCH_SIZE) {
    const batchIndices = uncachedIndices.slice(start, start + MAX_BATCH_SIZE);
    const batchTexts = batchIndices.map((i) => texts[i]);

    await enqueue(async () => {
      stats.embeddingRequests++;
      const endpoint = `${GEMINI_API_BASE}/models/${model}:batchEmbedContents?key=${process.env.GEMINI_API_KEY}`;
      const response = await fetchWithRetry(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: batchTexts.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text: String(text || '') }] },
          })),
        }),
      });

      const json = await response.json();
      const embeddings = json?.embeddings;
      if (!Array.isArray(embeddings) || embeddings.length !== batchTexts.length) {
        throw new Error('Gemini batch embedding response invalid');
      }

      for (let j = 0; j < batchIndices.length; j++) {
        const vector = embeddings[j]?.values;
        if (!Array.isArray(vector) || vector.length === 0) {
          throw new Error(`Missing vector for batch item ${j}`);
        }
        results[batchIndices[j]] = vector;
        setCachedEmbedding(texts[batchIndices[j]], vector);
      }

      if (REQUEST_DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      }
    });
  }

  return results;
}

/**
 * Legacy sequential embedMany — kept for backward compatibility.
 * Prefer embedBatch for new code.
 */
async function embedMany(texts, model = DEFAULT_MODEL) {
  return embedBatch(texts, model);
}

module.exports = {
  DEFAULT_MODEL,
  embedSingle,
  embedMany,
  embedBatch,
  isGeminiEmbeddingConfigured,
  getStats,
  resetStats,
  getCachedEmbedding,
  setCachedEmbedding,
  getCacheSize,
  clearCache,
  contentHash,
};
