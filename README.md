# Skill-Bridge Career Navigator

Full-stack app for resume parsing, profile management, role alignment scoring, and AI-assisted coaching.

## Quick Start

### Prerequisites

- Node.js `22.12.x` (recommended via `nvm use` using `.nvmrc`)
- npm `10+`
- Optional: `GROQ_API_KEY` in `.env` for AI extraction/grading/summaries

### Setup

```bash
# 1) Install dependencies
npm install
npm run install:all

# 2) Configure env
cp .env.example .env
# set GROQ_API_KEY if you want Groq-backed features

# 3) Run backend and frontend
npm run dev:server   # backend on http://localhost:3847
npm run dev:client   # frontend on http://localhost:3000
```

Open `http://localhost:3000`.

## Architecture

- `client/`: React + Vite UI
- `server/`: Express API
- `server/db/database.js`: SQLite persistence via `better-sqlite3`
- `server/services/transferModelService.js`: deterministic alignment scoring + gating
- `server/services/resumeAIService.js`: Groq extraction
- `server/services/resumeParserService.js`: rule-based fallback parser
- `tests/`: Jest + supertest suites for parser, pipeline, persistence, dashboard, and transfer model

## Key Features

### 1) Resume Upload + Structured Parsing

- Accepts `.pdf` and `.txt` (`2MB` max)
- Parse flow:
  - AI extraction via Groq (`llama-3.3-70b-versatile`) when available
  - Automatic fallback to deterministic parser when AI fails/rate-limits/returns bad JSON
- Extracts: contact info, education level, skills, work experience, projects, certifications, inferred target role
- Parser supports common section variants, including `Experience` / `Experiences`

### 2) Profile + CRUD

- Stores profile and structured resume entities in SQLite
- CRUD for:
  - profile core fields
  - work experience entries
  - projects
  - certifications
- Raw uploaded resume text is stored in `resume_uploads` for re-parse and audit/debug

### 3) Resume Evaluator Pipeline

`POST /api/evaluate` runs a deterministic scorer first, then gates expensive LLM grading.

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

- `strong`: score `>= 70` and all guardrails pass -> auto LLM deep grade
- `borderline`: score `55-69`, or `>=70` with failed guardrail -> alignment + reasons + optional manual deep grade
- `weak`: score `<55` -> skip LLM grade; return deterministic gap-closing resources (plus optional Groq summary)

## Groq Usage and Fallback Behavior

Groq is used for:

- resume extraction
- deep resume grading
- short personalized agent summary
- per-job gap-analysis narrative

If Groq fails (including `429` rate limits), the app falls back to deterministic behavior and still returns a usable response.

## API Overview

- `POST /api/resume/parse`: upload resume, parse, persist profile data
- `POST /api/resume/reparse`: rerun parse using latest stored raw resume text
- `GET/POST/PATCH /api/profile`: read/write profile
- `POST/PUT/DELETE /api/profile/work-experience/*`
- `POST/PUT/DELETE /api/profile/projects/*`
- `POST /api/evaluate`: alignment + gated routing
- `POST /api/evaluate/grade`: manual deep grade
- `POST /api/evaluate/agent`: manual agent recommendations
- `POST /api/dashboard`: role-level demand aggregation
- `POST /api/gap-analysis`: per-job gap analysis

## Tests

Run all tests:

```bash
npm test
```

Notes:

- Tests are Jest + supertest based.
- In restricted environments, socket/listen permissions can fail some suites even when logic is correct.

## Known Limitations

- Scoring is deterministic keyword/section heuristic; no semantic embeddings.
- Resume parsing quality depends on extracted PDF text quality and heading conventions.
- Groq free-tier quotas can trigger frequent `429` on heavy usage.
- No auth/multi-tenant isolation (single-user local workflow).

## Security Notes

- Keep `.env` out of source control.
- Rotate API keys if leaked.
- Do not commit real personal/sensitive resumes in public repos.
