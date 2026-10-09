import { jevDecide, type JevChoiceAnswer, type JevChoiceQuestion } from "./openrouter";
import { CITIES } from "./tools";

export const JEV_DEFAULT_MODEL = "~typesafe/jev-latest";

export type Decision = {
  tool: string | null;
  args: Record<string, unknown>;
  argSource: Record<string, "jev" | "code">;
  probabilities: Record<string, number>;
  confidence?: number;
};

// A later Clef implementation plugs into this same interface.
export interface Decider {
  decide(question: string): Promise<Decision>;
}

const TOOL_CRITERIA: Record<string, string> = {
  get_order: "The user asks about the status, ETA or items of an order.",
  get_weather: "The user asks about the weather or temperature in a city.",
  calculate: "The user asks to compute an arithmetic expression.",
  search_faq: "The user asks a general question about returns, shipping, payments, warranty, passwords or support.",
  none: "No tool fits; anything else.",
};

const CITY_CRITERIA: Record<string, string> = {
  ...Object.fromEntries(CITIES.map((city) => [city, `The question is about ${city}.`])),
  none: "No city is named in the question.",
};

// Order ids look like A1001: one letter and four digits.
export function extractOrderId(question: string): string | undefined {
  return question.match(/\bA\d{4}\b/i)?.[0].toUpperCase();
}

// First run of digits, operators and parentheses that contains an operator, e.g. "12 * (3 + 4)".
// Number words ("minus", "times") are not converted, so those questions yield undefined.
export function extractExpression(question: string): string | undefined {
  for (const match of question.matchAll(/[\d(][\d\s+\-*/().]*[\d)]/g)) {
    if (/[+\-*/]/.test(match[0])) return match[0].trim();
  }
  return undefined;
}

async function jevChoice(
  model: string,
  state: Record<string, unknown>,
  instructions: string,
  criteria: Record<string, string>,
): Promise<JevChoiceAnswer> {
  const question: JevChoiceQuestion = { type: "choice", instructions, criteria };
  const res = await jevDecide({ model, state, questions: { choice: question } });
  const answer = res.answers?.choice;
  if (answer?.type !== "choice") throw new Error(`Jev returned no choice answer: ${JSON.stringify(res)}`);
  // Guard against a choice outside the options we sent, so it cannot reach runTool silently.
  if (!Object.hasOwn(criteria, answer.choice)) throw new Error(`Jev chose "${answer.choice}", which is not an option`);
  return answer;
}

export function createJevDecider(model = JEV_DEFAULT_MODEL): Decider {
  return {
    async decide(question) {
      const state = { question };
      const tool = await jevChoice(
        model,
        state,
        "Which tool should answer this question? Pick none if no tool fits.",
        TOOL_CRITERIA,
      );
      const chosen = tool.choice === "none" ? null : tool.choice;
      const decision: Decision = {
        tool: chosen,
        args: {},
        argSource: {},
        probabilities: tool.probabilities,
        confidence: tool.confidence,
      };

      if (chosen === "get_weather") {
        const city = await jevChoice(
          model,
          state,
          "Which city is the question about? Pick none if no city is named.",
          CITY_CRITERIA,
        );
        decision.args.city = city.choice === "none" ? undefined : city.choice;
        decision.argSource.city = "jev";
      } else if (chosen === "get_order") {
        decision.args.orderId = extractOrderId(question);
        decision.argSource.orderId = "code";
      } else if (chosen === "calculate") {
        decision.args.expression = extractExpression(question);
        decision.argSource.expression = "code";
      } else if (chosen === "search_faq") {
        decision.args.query = question;
        decision.argSource.query = "code";
      }
      return decision;
    },
  };
}
