# Skill-Bridge Career Navigator

**Candidate Name:** Hien Huynh
**Scenario Chosen:** Skill-Bridge Career Navigator (Scenario 2)

A full-stack web application that helps students and early-career professionals identify the skills gap between their current experience and job posting requirements, then provides a personalized AI-powered learning roadmap.

---

## Quick Start

### Prerequisites

- Node.js v18+ and npm
- A [Groq API key](https://console.groq.com/) (free tier available)

### Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd PAN-casechallenge2

# 2. Configure environment variables
cp .env.example .env
# Edit .env and add your GROQ_API_KEY

# 3. Install all dependencies
npm run install:all          # installs server + client deps
npm install                  # installs root test deps

# 4. Start the backend (terminal 1)
npm run start:server         # runs on http://localhost:5000

# 5. Start the frontend (terminal 2)
npm run dev:client           # runs on http://localhost:3000
```

Open **http://localhost:3000** in your browser.

### Run Tests

```bash
npm test
```

---

## Project Structure

```
/
├── client/                  # React frontend (Vite)
│   └── src/
│       ├── components/
│       │   ├── ProfileForm.jsx     # Create/edit user profile
│       │   ├── ResumeUpload.jsx    # Resume file upload UI
│       │   ├── ResumeReview.jsx    # Review/edit extracted resume data
│       │   ├── GapDashboard.jsx   # Role-level gap analysis dashboard
│       │   ├── JobList.jsx         # Browse & filter job postings
│       │   └── GapAnalysis.jsx     # AI gap analysis + roadmap
│       ├── api.js                  # All fetch calls to the backend
│       ├── App.jsx                 # Top-level routing/state
│       └── App.css                 # Application styles
├── server/                  # Express backend
│   ├── routes/              # Route definitions
│   ├── controllers/         # Request handlers
│   │   ├── jobsController.js       # Job listing + filtering
│   │   ├── profileController.js    # Profile CRUD + validation
│   │   ├── gapController.js        # Gap analysis orchestration
│   │   ├── resumeController.js     # Resume upload + extraction
│   │   └── dashboardController.js  # Role-level gap aggregation
│   └── services/
│       ├── groqService.js          # Groq API integration (gap analysis)
│       ├── resumeAIService.js      # Groq API integration (resume extraction)
│       ├── resumeParserService.js  # Rule-based resume parser
│       └── fallbackService.js      # Rule-based gap analysis fallback
├── data/
│   ├── sample_jobs.json     # 105 synthetic job postings
│   └── sample_resume.txt    # Sample resume for testing
├── scripts/
│   └── generateJobs.js      # Dataset generator (run once)
├── tests/
│   ├── gapAnalysis.test.js  # Jest + supertest API tests (12 tests)
│   ├── resumeParse.test.js  # Resume upload + parser tests (8 tests)
│   └── dashboard.test.js    # Dashboard aggregation tests (6 tests)
├── .env.example
├── .gitignore
└── README.md
```

---

## Core Features

### Requirement 1 — CRUD + Search
- **Create:** Profile form with name, skills (tag input), education level, and target role
- **View:** Profile display + job postings with match percentage bars
- **Update:** Edit profile from gap analysis view; re-runs analysis with new skills
- **Search/Filter:** Filter jobs by title/company/description, required skill, and experience level

### Requirement 1B — Resume Upload & Profile Auto-Fill (New)
- Upload a `.txt` or `.pdf` resume to auto-fill profile fields instead of typing manually
- **AI-powered extraction** using Groq llama-3.3-70b-versatile for skills grouping, experience summarization, and target role inference
- **Rule-based fallback** with regex parsing for email, phone, section headers, and a curated list of 40+ known skills — kicks in automatically when AI is unavailable or returns malformed data
- **Review/edit screen** before any data is saved — the user stays in control of their profile
- Confidence badges (`Needs Review`, `Not Detected`) flag fields that may need manual correction
- Input validation: unsupported file types, empty files, oversized files (2MB limit), extraction failures
- Extracts: name, email, phone, education, skills, work experience, projects, certifications, inferred target role
- A synthetic sample resume (`data/sample_resume.txt`) is included for easy testing and demos

### Requirement 2 — Gap Analysis Dashboard (100+ Jobs)
- **Dashboard** compares the user's resume skills against **100+ job postings** for their target role
- Aggregates skill demand across all matching postings and shows frequency percentages (e.g., "Docker — 80% of Cloud Engineer postings")
- Coverage meter shows what percentage of demanded skills the user already has
- **AI insights** via Groq summarize the user's competitive position and generate a prioritized learning roadmap
- **Rule-based fallback** uses statistical aggregation when AI is unavailable
- **Single-job analysis** still available via the Job Postings tab for per-posting deep dives

### Requirement 2B — AI Gap Analysis + Fallback (Per-Job)
- Sends user skills + job required skills to **Groq llama-3.3-70b-versatile**
- Returns: missing skills, prioritized learning roadmap, free resource links, estimated weeks
- **Fallback:** If Groq is unavailable/errors/rate-limited, a rule-based set-difference is used with a curated static resource map (15+ skills mapped to free courses)
- A visible yellow banner notifies the user when fallback results are shown

### Requirement 3 — Input Validation + Tests
- Frontend: inline field-level error messages (empty name, no skills, no role)
- Backend: server-side validation returning 400 with descriptive messages
- **12 passing tests** covering happy path, edge case (no gaps), fallback, validation, job filtering

### Requirement 4 — Synthetic Dataset
- **105 job postings** in `data/sample_jobs.json` across 12 roles (8–10 per role)
- Generated via `scripts/generateJobs.js` with realistic skill variation per posting
- Roles: Frontend, Backend, Full Stack, Cloud, DevOps, SRE, Security Analyst, Cybersecurity, Cloud Security, Data Engineer, Data Analyst, ML Engineer

### Requirement 5 — Security
- API key stored in `.env` (never committed)
- `.env` is in `.gitignore`
- `.env.example` with placeholder values provided

---

## AI Disclosure

This project uses the **Groq API** with the `llama-3.3-70b-versatile` model for two features:

1. **Skills gap analysis:** The AI receives the user's listed skills and the job's required skills to generate a personalized learning roadmap.
2. **Resume extraction:** The AI receives uploaded resume text to extract structured fields (name, skills, experience, target role). Resume text is processed in-memory and never persisted on the server.

No personal data beyond what is explicitly entered or uploaded is sent to the API.

Claude (Anthropic) was used to assist with code generation during development. All generated code was reviewed and integrated by the candidate.

---

## Tradeoffs & Prioritization

| Decision | Rationale |
|---|---|
| File-based profile storage (JSON) | Eliminates DB setup friction for a take-home; profile is single-user per deployment |
| Vite proxy instead of CORS env config | Simplifies local dev — no env vars needed on the client side |
| Rule-based fallback with static map | Guarantees a useful response even with zero API availability; deterministic and testable |
| .txt + .pdf for resume upload (no .docx) | Avoids heavy dependencies; `pdf-parse` is lightweight (~50KB); .docx would add complexity beyond the timebox |
| Regex + known-skills list for resume fallback | Deterministic extraction for structured fields (email, phone); AI handles messy sections (skills grouping, role inference) |
| Review screen before profile save | Prevents bad AI output from corrupting the profile; user stays in control |
| Single profile per server | Scope is "early career user," not multi-user SaaS; keeps state management trivial |
| No Redux / no router library | App state fits in top-level `useState`; view switching is simple enough without a full router |

---

## Known Limitations

- **Single-user profile:** Only one profile is stored server-side. A multi-user version would require authentication and a real database.
- **No auth:** Any user accessing the server can overwrite the stored profile.
- **Groq JSON parsing:** If the model returns malformed JSON (rare), the fallback is triggered automatically.
- **No pagination:** All 12 jobs are returned in a single request; would need pagination for a larger dataset.
- **Client-side state only:** Refreshing on the gap analysis view returns to the jobs list (the selected job is not persisted in the URL).
- **Resume parsing:** Regex-based parsing depends on conventional section headers (EDUCATION, SKILLS, etc.). Unusual resume formats may yield incomplete extraction. The review screen lets the user correct any issues.
- **No .docx support:** Adding .docx would require a heavier parser library. Documented as a future improvement.
- **Resume fields vs. profile schema:** Email, phone, experience, projects, and certifications are extracted and displayed in the review screen, but only name, skills, education, and target role are mapped to the current profile schema. Extending the schema is a straightforward future enhancement.

---

## Demo Script — Resume Upload Feature (2–3 minutes)

> Use this script when presenting the feature in a walkthrough.

1. **Introduce the feature:** "Instead of manually typing every field, users can upload a resume to auto-fill their profile. This improves the Data Integration aspect of the platform."

2. **Open the profile form and click "Upload Resume to Auto-Fill."** "The app accepts .txt and .pdf files with a 2MB size limit. I'll use our synthetic sample resume for Alex Chen."

3. **Select `data/sample_resume.txt` and click "Parse Resume."** "Under the hood, the app first tries AI-powered extraction using Groq's Llama model. If the AI is unavailable or returns bad data, it falls back to rule-based regex parsing automatically."

4. **Walk through the review screen.** "Here's the review screen. Notice the confidence badges — 'Needs Review' and 'Not Detected' flag fields that may need manual correction. The target role was inferred by the AI, and the note at the bottom tells the user exactly which fields will be applied."

5. **Optionally edit a field, then click "Apply to Profile."** "When I click Apply, the extracted data fills in the profile form. Nothing is saved until I explicitly click Save — the user stays in control."

6. **Save the profile and continue to jobs.** "The name, skills, education, and target role are mapped to the existing profile. This makes profile creation much faster."

7. **Tradeoff talking points:**
   - "I chose .txt + .pdf over .docx to keep dependencies lightweight."
   - "AI handles messy extraction; regex handles structured fields deterministically."
   - "The review step prevents bad AI output from corrupting the profile."
   - "Future improvements: .docx support, skill normalization, multi-page PDF handling."

---

## Resume Evaluator — Hybrid Evaluation Pipeline (New Feature)

### How It Works

```
Resume Text + Target Role
           ↓
  Section-Aware Alignment Engine
  (Score 0–100 across 7 dimensions)
           ↓
     Hard Guardrails Check
  (3 independent minimum floors)
           ↓
  ┌────────────┬─────────────┐
  │ ≥ 75 AND   │ 55–74 OR    │  < 55
  │ all guards │ guard fails │
  │  Strong    │ Borderline  │  Weak
  ↓            ↓             ↓
LLM Grading  Show Score   Agent Gap-Closing
(Groq)       + Offer LLM  (deterministic
             on Request    resources + Groq
                           summary)
```

### Section-Aware Alignment Engine
A lightweight heuristic scoring algorithm across 7 dimensions. No ML library — fully explainable and runs in Node.js.

Resumes are split into named sections (SUMMARY, SKILLS, EXPERIENCE, PROJECTS, EDUCATION, CERTIFICATIONS). Each skill's credit depends on *where* it appears:

| Section | Credit | Rationale |
|---|---|---|
| Experience / Projects | 1.0× | Demonstrated in practice → full credit |
| Certifications | 0.8× | Formal credential → credible |
| Summary | 0.75× | Stated intent → partial credit |
| Skills section only | 0.65× | Listed but not demonstrated → reduced credit (anti-stuffing) |
| Elsewhere | 0.4× | Incidental mention → minimal credit |

This prevents keyword-stuffed resumes (all 10 core skills listed in a Skills table, no actual experience) from inflating their score.

| Dimension | Max Points | Purpose |
|---|---|---|
| Must-Have Skills | 40 | Core role-essential skills, section-weighted |
| Nice-to-Have Skills | 15 | Preferred/bonus skills |
| Tools & Platforms | 10 | Specific tooling familiarity |
| Domain Experience | 15 | Project language found in Experience/Projects (1.3× context boost) |
| Technical Breadth | 10 | Related concepts beyond the core skill list |
| Achievement Language | 5 | Action verbs — counted only in Experience/Projects |
| Quantified Results | 5 | Impact indicators (percentages, metrics, cost savings) |

### Hard Guardrails (beyond the score)
Three floors must ALL pass before a resume is sent to the LLM, regardless of total score:

| Guardrail | Requirement | Purpose |
|---|---|---|
| A — Coverage floor | ≥ 40% of must-have skills present anywhere | Prevents completely misaligned candidates |
| B — Evidence floor | ≥ 1 must-have skill in Experience or Projects | Prevents pure skills-section stuffing |
| C — Strong coverage | If score ≥ 75, core coverage must also be ≥ 60% | Prevents section-weighted inflation |

A resume that scores 77 but fails guardrail B is demoted to **borderline** — the UI shows the specific reason so the candidate knows exactly what to fix.

### Threshold Gating

| Score + Guardrails | Status | Action |
|---|---|---|
| Score ≥ 75 AND all 3 guardrails pass | Strong | LLM deep grading (Groq) |
| Score 55–74, OR score ≥ 75 with a failed guardrail | Borderline | Show alignment + guardrail reasons; offer manual grade on request |
| Score < 55 | Weak | Skip LLM; activate deterministic agent gap-closing |

### LLM Grading (Groq — strong only)
Scores across: role alignment, technical depth, project quality, impact clarity, experience relevance. Returns strengths, weak areas, prioritised action steps, and bullet rewrite suggestions.

### Agent Gap-Closing (deterministic-first)
Resources come from the role knowledge base — curated, stable, and always delivered. Groq is used **only** to write a short personalised 2–3 sentence summary. If Groq fails, a template summary is used. Resources never depend on Groq availability.

Per gap area, the agent returns:
- **Learn** — curated free resources (docs, tutorials, courses) linked directly
- **Build** — concrete project ideas that demonstrate the missing skill
- **Add to resume** — specific bullet suggestions that would improve the score
- **Quick wins** — actions completable this week

### Testing Scenarios

Sample resumes in `data/sample_resumes/`:

| File | Target Role | Expected Gate |
|---|---|---|
| `strong_frontend.txt` | Frontend Developer | Score ≥ 75, all guardrails pass → LLM grading |
| `borderline_data_analyst.txt` | Data Analyst | Score 55–74 → borderline |
| `weak_cloud_engineer.txt` | Cloud Engineer | Score < 55 → agent activated |

`tests/transferModel.test.js` covers: strong pass, borderline classification, weak block, keyword-stuffed guardrail B failure, and section parser correctness.

### Demo Talking Points

1. **Anti-stuffing:** Listing React in a Skills table gives 0.65× credit vs building with React in three jobs (1.0×). A stuffed resume cannot cheat past the guardrails.
2. **Explainability:** Score is broken into 7 visible dimensions. Guardrail failure reasons are shown in plain English.
3. **Gating:** Only resumes that score ≥ 75 AND pass all 3 guardrails reach the LLM — no budget wasted on weak candidates.
4. **Reliable resources:** Agent output never depends on Groq availability. Curated resources ship first; Groq adds a personalised summary only.
5. **Role specificity:** The knowledge base has structured profiles for 12 distinct tech roles.

### Tradeoffs

| Decision | Rationale |
|---|---|
| Keyword-based section-aware engine (not embeddings) | No Python/ML deps; runs in Node.js; fully explainable; section weighting captures the signal that matters most |
| Three hard guardrails separate from score | Score alone is gameable; guardrails catch stuffed resumes and misaligned candidates that score high artificially |
| Deterministic resources, Groq for summary only | Resources are always delivered; Groq failure only affects 2–3 sentences of introductory text |
| Single `/api/evaluate` endpoint | Simple for demo; production would use async job queue |
