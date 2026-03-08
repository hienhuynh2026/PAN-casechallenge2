# Skill-Bridge Career Navigator

Full-stack app for resume parsing, profile management, role alignment scoring, semantic job retrieval, and AI-assisted coaching.

## Quick Start

### Prerequisites

- Node.js `22.12.x` (recommended via `nvm use` using `.nvmrc`)
- npm `10+`
- Optional: `GROQ_API_KEY` in `.env` for AI extraction/grading/summaries
- Optional: `GEMINI_API_KEY` in `.env` for semantic embedding retrieval

### Setup

```bash
# 1) Install dependencies
npm install
npm run install:all

# 2) Configure env
cp .env.example .env
# set GROQ_API_KEY and/or GEMINI_API_KEY if you want AI-backed features

# 2.5) Build job embedding index (recommended for faster retrieval)
npm run build:embeddings

# 3) Run backend and frontend
npm run dev:server   # backend on http://localhost:3847
npm run dev:client   # frontend on http://localhost:3000
```

Open `http://localhost:3000`.

## Architecture

```
client/              React + Vite UI
server/
  controllers/       API route handlers
  services/
    alignmentScoringService.js   Deterministic heuristic alignment (7 dimensions, guardrails)
    retrievalService.js          RAG semantic retrieval (embed + cosine similarity + TF-IDF fallback)
    ragScoringService.js         Composite scoring (heuristic + retrieval + skill overlap)
    geminiEmbeddingService.js    Gemini embedding client (batch API, caching, retry queue)
    agentService.js              Gap-closing resource discovery
    resumeGraderService.js       LLM deep grading
    resumeParserService.js       Rule-based resume parser
  scripts/
    buildJobEmbeddingIndex.js    Precompute embedding index for job corpus
    evaluateRetrieval.js         Retrieval quality evaluation with curated test cases
  data/
    roleKnowledgeBase.js         12 role profiles with skills, resources, project ideas
  db/
    database.js                  SQLite persistence (better-sqlite3)
data/
  sample_jobs.json               105 job postings across 12 roles
tests/                           Jest + supertest suites
```

## Key Features

### 1) RAG-Style Retrieval Pipeline

The evaluation pipeline uses a real retrieval-augmented approach:

1. **Parse profile** — extract structured data from resume
2. **Normalize profile** — build retrieval-friendly document (skills, experience, projects, education)
3. **Retrieve top 5 jobs** — semantic similarity via Gemini embeddings (or TF-IDF fallback)
4. **Compute alignment** — 7-dimension heuristic scoring with section weighting
5. **Composite scoring** — weighted blend of heuristic + semantic retrieval + skill overlap
6. **Gate decision** — route to LLM grading, gap analysis, or static resources
7. **Explainability** — per-job evidence showing why each job matched

#### Retrieval flow

```
Profile → Normalize → Embed (Gemini) → Cosine similarity → Top 5 jobs
                                         ↓
                              Precomputed job embeddings (index file)
                              or batch embed at runtime
                                         ↓
                              Blend: 55% semantic + 30% skill overlap + 10% role boost + 5% education
                                         ↓
                              Match classification: strong / moderate / weak / none
```

#### Per-job explainability includes:
- Matching skills between candidate and job
- Skill overlap ratio
- Domain term overlap from job descriptions
- Education signal presence
- Experience level alignment

### 2) Resume Evaluator Pipeline

`POST /api/evaluate` runs the full pipeline:

#### Scoring dimensions (0-100 total)

- Must-have skills: 40
- Nice-to-have skills: 15
- Tools/platforms: 10
- Project/domain signals: 15
- Related concepts: 10
- Action verbs: 5
- Impact language: 5

#### Section weighting (anti-stuffing)

- Experience/Projects: `1.0x`
- Certifications: `0.8x`
- Summary: `0.75x`
- Skills-only section: `0.5x`
- Other mentions: `0.4x`

#### Hard guardrails (all must pass for auto-LLM)

- A: at least `50%` of core skills present
- B: at least `2` core skills demonstrated in Experience/Projects
- C: if score `>= 70`, core raw coverage must be `>= 65%`
- D: core-skills dimension must contribute at least `16/40`

#### Gate outcomes

- `strong`: score `>= 70` and all guardrails pass → auto LLM deep grade
- `borderline`: score `55-69`, or `>=70` with failed guardrail → alignment + reasons + optional manual deep grade
- `weak`: score `<55` → skip LLM grade; return gap-closing resources

### 3) Missing Skills Help

Both the evaluator and dashboard attach curated learning resources to skill gaps:

- **Evaluator** (`POST /api/evaluate`): returns `missingSkillsHelp[]` — top 8 missing skills from the best-matching retrieved jobs, each with:
  - `whyItMatters` — grounded in job frequency (e.g., "Required by 4 of 5 top-matching jobs")
  - `howToImprove` — project idea from `roleKnowledgeBase.projectIdeas`
  - `resources` — 1-2 curated links (docs, courses, tutorials)
  - `isRequired` — whether the skill appears as required vs preferred
- **Dashboard** (`POST /api/dashboard`): each roadmap/Action Step item includes `resources[]`

#### Resource sourcing (no hallucinated links)

All learning resources come from two preset maps — never generated by an LLM:

1. **`SKILL_RESOURCES`** — direct skill-name lookup (~20 skills: Python, AWS, Docker, etc.)
2. **`roleKnowledgeBase.resourceHints`** — category-level fallback per role (e.g., ML Engineer "Deep Learning Frameworks" category links)

Skills not covered by either map receive no resource links. Live web search would require an additional API (e.g., Tavily, Serper, or Perplexity).

### 4) Composite Scoring

Final score combines:

| Component | Weight | Source |
|-----------|--------|--------|
| Heuristic alignment | 50% | Rule-based 7-dimension scoring |
| Semantic retrieval | 20% | Avg cosine similarity of top-5 jobs |
| Skill overlap | 15% | Avg skill overlap across top-5 |
| Experience relevance | 10% | Experience level alignment |
| Education relevance | 5% | Education signal presence |

### 5) Honest System Labeling

The UI shows accurate labels for the scoring method used:

| Method ID | Label | When |
|-----------|-------|------|
| `semantic_retrieval_plus_llm` | Semantic Retrieval + AI Review | Gemini embeddings + LLM grading |
| `semantic_retrieval_plus_rules` | Semantic Retrieval + Rules | Gemini embeddings + heuristic only |
| `heuristic_plus_llm` | Rule-Based Match + AI Review | No embeddings + LLM grading |
| `heuristic_plus_tfidf` | Rule-Based Match + TF-IDF Retrieval | TF-IDF fallback mode |
| `heuristic_only` | Rule-Based Match Engine | No retrieval available |

No labels imply a "transformer model" or "deep learning" when the logic is heuristic/rule-based.

### 6) Gemini Free-Tier Rate Limit Strategy

The embedding service handles Gemini free-tier limits without API key rotation (limits are per-project):

- **Batch embedding**: Uses `batchEmbedContents` API to embed up to 100 texts per request
- **Content-hash caching**: In-memory cache keyed by SHA-256 of text content; avoids re-embedding identical content
- **Precomputed job index**: Job embeddings built offline via `npm run build:embeddings`; only profile is embedded at request time
- **Retry queue**: Sequential queue with exponential backoff (1s → 2s → 4s) on 429 responses
- **Configurable delay**: `EMBEDDING_REQUEST_DELAY_MS` (default 700ms) between batched requests
- **TF-IDF fallback**: Automatic fallback to lexical retrieval when embedding service is throttled or unavailable
- **Instrumentation**: Cache hit rate, API call count, retry count, queue wait time, fallback frequency exposed via API responses

### 7) Resume Upload + Parsing

- Accepts `.pdf` and `.txt` (`2MB` max)
- AI extraction via Groq → deterministic parser fallback
- Extracts: contact info, education, skills, work experience, projects, certifications

### 8) Profile + CRUD

- SQLite persistence for profile, work experience, projects, skills, certifications
- Raw resume text stored for re-parsing

## Embedding Index Workflow

```bash
# Build index whenever data/sample_jobs.json changes
npm run build:embeddings

# Or directly:
cd server && node scripts/buildJobEmbeddingIndex.js
```

At runtime:
- One Gemini embedding call for the user profile
- Cosine similarity against cached job vectors from index file
- Automatic TF-IDF fallback if Gemini is unavailable

## Retrieval Quality Evaluation

```bash
# Run evaluation on curated test cases
node server/scripts/evaluateRetrieval.js
```

Reports Precision@5, Recall@5, MRR, nDCG@5 across:
- Strong professional fit
- Moderate fit
- Poor fit
- Education-heavy candidate

Results saved to `server/data/retrieval_evaluation_results.json`.

## Fallback Behavior

Every feature degrades gracefully:

| Feature | Primary | Fallback |
|---------|---------|----------|
| Job retrieval | Gemini embeddings | TF-IDF lexical similarity |
| Resume grading | Groq LLM | Deterministic rule-based grade |
| Gap resources | Groq summary + KB | Static resources from KB |
| Skill help links | Curated skill/category maps | No links for unmapped skills |
| Dashboard insights | Groq AI analysis | Aggregated job posting stats |
| Embedding calls | Batch API + cache | In-memory TF-IDF vectors |

The app is fully functional with no API keys configured.

## API Overview

- `POST /api/evaluate`: full RAG evaluation (alignment + retrieval + composite + gate + missingSkillsHelp)
- `POST /api/evaluate/grade`: manual deep grade
- `POST /api/evaluate/agent`: manual agent recommendations
- `POST /api/dashboard`: role-level demand aggregation with retrieval
- `POST /api/resume/parse`: upload resume, parse, persist
- `POST /api/resume/reparse`: rerun parse on stored text
- `GET/POST/PATCH /api/profile`: read/write profile
- `POST/PUT/DELETE /api/profile/work-experience/*`
- `POST/PUT/DELETE /api/profile/projects/*`
- `POST /api/gap-analysis`: per-job gap analysis

## Tests

```bash
npm test
```

Tests mock all external services (Groq, Gemini). No API keys needed.

## Known Limitations

- Scoring gate remains deterministic keyword/section heuristic for explainability
- Resume parsing quality depends on extracted PDF text quality
- Gemini free-tier quotas can throttle embedding calls on heavy usage (mitigated by caching and batching)
- No auth/multi-tenant isolation (single-user local workflow)
- Embedding vectors are stored in a JSON file, not a vector database (sufficient for ~100 jobs)
- Learning resource links are curated/preset (~20 skills + role category hints); skills outside those maps get no links without a web search API

## Security Notes

- Keep `.env` out of source control
- Rotate API keys if leaked
- Do not commit real personal/sensitive resumes in public repos
