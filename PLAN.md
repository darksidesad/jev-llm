# jev-llm — MVP Plan

## Goal

A small web app that compares two ways of answering a user question that needs a tool, side by side, on **speed** and **quality**:

- **Path A (baseline):** an LLM with native tool calling picks the tool, generates its arguments, calls it, and writes the answer.
- **Path B (Jev):** the decision model Jev picks the tool, plain code runs it, and an LLM (which does not need tool-calling support) writes the answer using only the tool result.

Hypotheses: (1) tool selection is faster with a decision model; (2) the answering LLM stays grounded because it only sees what the tool returned.

## Scope

In scope:
- One question box that runs A and B in parallel, shown in two columns.
- Independent model selectors for A and B, fed by the OpenRouter models list.
- Four mock tools with fixed data.
- A benchmark of ~20 labeled questions with a "run all" button and a results table.
- Latency and quality metrics.

Out of scope for the MVP: Clef (kept behind an adapter interface), auth, database, deployment, multi-turn chat.

## Architecture

- **Frontend:** Vite + React + TypeScript. Visual design follows the `frontend-design` skill.
- **Backend:** small Node server (Hono). Holds `OPENROUTER_KEY`; the browser never sees it.
- **Provider:** everything goes through OpenRouter with a single key.
  - LLMs: `POST /api/v1/chat/completions`
  - Jev: `POST /api/alpha/decisions` with model `~typesafe/jev-latest`
  - Model list: `GET /api/v1/models` (public)
- **Decider interface:** `decide(question, tools) -> { tool, args }`. Jev is the first implementation; Clef plugs in later.

## Flows

**Path A:** question -> LLM with `tools` -> tool call (LLM-generated args) -> run tool -> LLM final answer.

**Path B:** question -> Jev Choice over tools -> argument resolution -> run tool -> LLM answers from the tool result only.

Argument resolution in B (Jev cannot generate free text):
- Closed set (e.g. city): a second Jev Choice over the known values.
- Free value (order id, math expression): regex extractor in code.
- Missing argument: the tool returns `missing_data`, and the LLM asks the user for it.

The UI shows which part was done by Jev and which by code.

## Mock tools

| Tool | Arguments | Source |
| --- | --- | --- |
| `get_order` | order id (free value) | fixed table |
| `get_weather` | city (closed set) | fixed table |
| `calculate` | expression (free value) | local evaluator |
| `search_faq` | query | fixed FAQ entries |

## Metrics

- **Latency:** per stage (decision, tool, LLM) and total, per path.
- **Tool accuracy:** chosen tool and arguments vs. the expected ones across the ~20 benchmark questions.
- **Answer quality:** score from an LLM judge (clarity and faithfulness to the tool result). The judge model is selectable from the OpenRouter list.

## UI

- One question box; A and B start together.
- Two columns, each with: chosen tool, arguments, answer, stage timings, and errors shown verbatim.
- Model selectors with search, filters (free only, tools-capable only) and price.
  - A lists only models that support tools.
  - B lists all models.
  - Both default to the same cheap or free model, so the only variable is who picks the tool.
- Benchmark view: "run all" button and a results table.

## Assumptions

- Local only. No database, no deployment.
- Free OpenRouter models may be rate limited or fail; the UI surfaces the error instead of hiding it.
- Jev output is typed decisions with probabilities, so Choice is used for tool selection and for closed-set arguments.

## Milestones

1. Scaffold: Vite + React + TS frontend, Hono backend, `.env` loading (`OPENROUTER_KEY`).
2. Models endpoint and selectors.
3. Mock tools and benchmark dataset.
4. Path A end to end.
5. Path B end to end (Jev Choice, argument resolution, answer from tool result only).
6. Side-by-side UI with timings.
7. Benchmark runner, accuracy and LLM-judge scoring, results table.
8. Design pass with `frontend-design`; Clef adapter interface stub.

## Open items

- Confirm the exact request and response shape of the Decisions API against the [Jev docs](https://openrouter.ai/docs/guides/community/jev.md) when implementing milestone 5.
- Clef access (Workers AI or Requesty) is deferred.
