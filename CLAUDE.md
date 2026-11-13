# SpotMe: rules for AI coding agents

SpotMe is an AI gym rep counter and form checker. It's a portfolio project, so code quality and readability matter as much as features.

## Project map

- `notebooks/`: Kaggle research notebooks (pose extraction, counters, form model). **Read-only.** Never edit them.
- `web/`: React + Vite + TypeScript frontend.
- `server/`: FastAPI backend (Python venv at `server/.venv`).

## v1 scope (don't build beyond this unless asked)

The user uploads or records a workout video → MediaPipe pose runs **in the browser** → landmarks are sent to FastAPI → the server returns rep counts + per-rep grades → the frontend shows results with an overlay replay (skeleton, rep count, live angle, grade per rep).

- Exercises: squat, alternating dumbbell bicep curl (counted per arm), push-up.
- No login, no database. History is stored in the browser (localStorage).
- Raw video never leaves the browser; only landmarks are sent to the server.

## Stack

- **Frontend:** React, TypeScript (strict), Vite, Tailwind CSS v4, axios (one shared client in `src/api/client.ts`), TanStack Query (all server calls go through query/mutation hooks), React Router v7, `@mediapipe/tasks-vision`, Canvas 2D for the overlay, Recharts for charts.
- **Backend:** FastAPI + Pydantic, numpy, pandas, scipy, uvicorn. pytest for tests, ruff for lint/format.

## Commands

- Server: `cd server && source .venv/bin/activate && uvicorn main:app --reload --port 8000`
- Web: `cd web && npm run dev` (Vite proxies `/api` → `localhost:8000`)
- Checks: `cd web && npm run build && npm run lint` · `cd server && pytest && ruff check .`

## Code style

- **Full, descriptive variable names.** No single letters or cryptic abbreviations (`landmarks`, not `lm`; `frame_index`, not `i`), except trivial loop counters.
- Short comments explaining what each block does and why.
- TypeScript: strict mode, no `any`, typed API responses in `src/types/`.
- Python: type hints on all functions, Pydantic models for every request/response.
- Use the `@/` import alias in `web/src`.
- Keep functions small and files focused. Prefer clarity over cleverness.

## Conventions

- Every API route lives under `/api` (Nginx routes `/api` to FastAPI in production).
- Frontend calls the API only through `src/api/` functions plus TanStack Query hooks, never with raw `fetch`/axios in components.
- Mobile-first UI: people use this on their phones at the gym.
- Counting and grading logic on the server should match the notebook results (e.g. `squat_1` = 6 reps). If you change a threshold, say so explicitly.

## Hard rules

- **Never commit or push.** The owner reviews and commits.
- **Never add a dependency without asking first** (name it and say why).
- **Never commit data:** no videos, `.zip`, `.npz`, `.parquet`, `.csv` datasets, or `.task` model files.
- Fitness-AQA data is non-commercial: it must never be added to this repo in any form.
- Don't touch files outside the task's scope. If something else looks broken, report it instead of fixing it.
- Ask before making large refactors or changing the folder structure.

## Before you finish a task

1. Run the relevant checks (build, lint, tests) and report the results honestly, including anything you couldn't verify.
2. Summarize: files changed or created, what each change does, and anything the owner should check by hand.
