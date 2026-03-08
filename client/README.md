# Client (React + Vite)

Frontend for Skill-Bridge Career Navigator.

## Run

From repo root:

```bash
npm run dev:client
```

Client runs on `http://localhost:3000` and proxies `/api/*` to backend `http://localhost:3847` (see `client/vite.config.js`).

## Main UI Areas

- Profile editor and resume upload/review
- Resume evaluator with score breakdown, guardrail feedback, and gated actions
- Job list, per-job gap analysis, and aggregate dashboard

## Notes

- For local dev, backend must be running or API requests will fail with proxy socket errors.
- If Groq is unavailable/rate-limited, UI still shows fallback outputs returned by the server.
