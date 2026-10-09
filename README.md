# jev-llm

The core idea: a small model without native tool calling (for example `cohere/command-r7b-12-2024`, a 7B model; models around 1B follow the facts too poorly) cannot call tools by itself. Jev picks the tool and its arguments, and code runs it, so the small model gets tool use anyway.

To try it, add a contender with a no-tools model in native mode and another in Jev mode. The native one fails because the model has no native tool calling, and the Jev one still answers from the real tool result.

A small web app that compares ways of answering a customer question that needs a tool. Each **contender** is a model with a mode:

- **Native mode (path A, baseline):** an LLM with native tool calling picks the tool, writes its arguments, and answers.
- **Jev mode (path B):** the decision model Jev picks the tool and its arguments, plain code runs the tool, and the chosen LLM answers using only the tool result.

The **Compare** tab runs one question through up to four contenders in parallel, with timings. The **Benchmark** tab runs 20 labeled questions through the same contenders, checks tool and argument accuracy, and has a judge model score clarity and faithfulness.

## Usage

- Pick any model and any mode for each contender (1 to 4). Contenders do not share a model. Defaults: `openai/gpt-oss-20b` in native mode, `cohere/command-r7b-12-2024` in Jev mode.
- "Add contender" copies the last contender's model and takes the opposite mode. Each contender has its own Remove button.
- Example: "DeepSeek V4 flash" in native mode against "Mistral" in Jev mode. Pick both, type a question, and press Run all (or Ctrl/Cmd+Enter).
- The contender list is saved in this browser and is still there on the next visit.

## Setup

1. Install dependencies: `npm install`
   (If Device Guard blocks `npm` on your machine, `node --run` works as a replacement for the scripts below.)
2. Create `.env` in the project root with your OpenRouter key:
   ```
   OPENROUTER_KEY=sk-or-...
   ```
3. Start the API (port 3001) and the web app (port 5173): `npm run dev`
   (Alternative when npm is blocked: `node --run dev`.)
4. Open http://localhost:5173.

The server exits at startup if `OPENROUTER_KEY` is empty. The browser never sees the key.

## Flows

**Path A:** question, then an LLM with the tool definitions, then the tool call with LLM-written arguments, then the tool runs, then the LLM writes the final answer.

**Path B:** question, then Jev chooses a tool, then the arguments are resolved, then the tool runs, then the LLM answers from the tool result only.

Argument resolution in Path B:
- Closed set (city): a second Jev choice over the known cities.
- Order id and math expression: a regex in code.
- FAQ search: the full question is passed as the query.
- Missing value: the tool returns `missing_data`, and the answer asks the user for it.

The UI labels which values came from Jev and which from code.

## How Jev is called

Jev is called through OpenRouter at `POST /api/alpha/decisions` with model `~typesafe/jev-latest`. Only **Choice** questions are used. Jev returns one of the listed options with probabilities and never free text, so every argument is either a Choice over a closed set or comes from code. See `server/openrouter.ts` and `server/decider.ts`.

## Tests

```
npm test     # node:test, server/**/*.test.ts
npm run build  # type check and production build
```

## Known gaps

- Calculator number words such as "minus" and "times" are not converted, so `calculate` gets no expression and returns `missing_data`. Only digits and operators are extracted.
- Free OpenRouter models are often rate limited (HTTP 429). The default is the cheap paid model `openai/gpt-oss-20b`.
- The benchmark judge is itself an LLM, so its scores are indicative, not ground truth.

## Adding Clef

`server/decider.ts` defines the `Decider` interface, with `decide(question) -> { tool, args, argSource, probabilities }`. Jev is the current implementation. A Clef implementation (served through Workers AI or Requesty, not OpenRouter) only has to return the same shape. Passing it into `runPathB` in place of the Jev decider is then a small wiring change.
