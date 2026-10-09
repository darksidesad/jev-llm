# jev-llm-mvp

Objective: web MVP comparing Path A (LLM native tool calling) vs Path B (Jev picks tool + LLM answers from tool result). See ../../PLAN.md.

Mode: orchestrator (Claude) delegates code to Haiku 5.5 writers, reviews + tests. Skills: caveman (terse), ponytail (smallest change). TDD: off (no config); functional checks per task. Runner: `node --test` / `npm test`, `npm run build`.
Delivery: local git, conventional commits, no AI attribution. Branch: main (new repo).

## Tasks
- [x] T1 Scaffold: Vite+React+TS frontend, Hono backend (`server/`), .env loading, `npm run dev`
- [x] T2 Backend: GET /api/models (OpenRouter list, tools flag, free flag, price)
- [x] T3 Mock tools (get_order, get_weather, calculate, search_faq) + benchmark dataset (~20 q)
- [x] T4 Path A: POST /api/run/a
- [x] T5 Path B: POST /api/run/b (Jev Choice, arg resolution, answer from tool result only)
- [x] T6 Frontend: side-by-side UI, selectors, timings (frontend-design skill)
- [ ] T7 Benchmark runner + accuracy + LLM judge + results table
- [ ] T8 Clef adapter stub, final real-key tests, README run steps

## Evidence
T1-T3: haiku writer (delegated, mapping+write trigger). npm test 14/14 pass, build ok, /api/models 469 models (401 tools, 19 free) verified by me+haiku.

## Next
T7
T4-T5: haiku writer. 29\/29 tests, build ok, live smoke A+B with free model: Jev decision ~0.5s vs A first call 4-7s. Known gap: calc with number words -> missing_data.
T6: haiku writer + 1 fix round. Browser-verified: runs both paths, bars 87%/100% on shared scale, default model openai/gpt-oss-20b (free default got 429).
