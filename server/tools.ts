// Mock tools with fixed data. No network, no real side effects.

export const CITIES = ["Madrid", "Barcelona", "London", "Paris", "New York", "Tokyo"] as const;
export const ORDER_IDS = ["A1001", "A1002", "A1003", "A1004", "A1005"] as const;

type OrderId = (typeof ORDER_IDS)[number];
type City = (typeof CITIES)[number];

const ORDERS: Record<OrderId, { status: string; eta: string | null; items: string[] }> = {
  A1001: { status: "shipped", eta: "2026-10-11", items: ["wireless mouse"] },
  A1002: { status: "processing", eta: "2026-10-14", items: ["USB-C cable", "phone case"] },
  A1003: { status: "delivered", eta: "2026-10-05", items: ["desk lamp"] },
  A1004: { status: "cancelled", eta: null, items: ["keyboard"] },
  A1005: { status: "shipped", eta: "2026-10-12", items: ["monitor stand"] },
};

const WEATHER: Record<City, { tempC: number; condition: string }> = {
  Madrid: { tempC: 24, condition: "sunny" },
  Barcelona: { tempC: 22, condition: "partly cloudy" },
  London: { tempC: 14, condition: "rain" },
  Paris: { tempC: 16, condition: "cloudy" },
  "New York": { tempC: 18, condition: "clear" },
  Tokyo: { tempC: 20, condition: "windy" },
};

// Keywords match as substrings of the lowercased query, so partial words and Spanish forms work.
const FAQ: { question: string; answer: string; keywords: string[] }[] = [
  {
    question: "How do I return an item?",
    answer: "Returns are accepted within 30 days of delivery with the original receipt.",
    keywords: ["return", "refund", "devol"],
  },
  {
    question: "How long does shipping take?",
    answer: "Standard shipping takes 3 to 5 business days.",
    keywords: ["shipping", "ship", "delivery", "envío", "envio", "tarda"],
  },
  {
    question: "Which payment methods do you accept?",
    answer: "We accept Visa, Mastercard, American Express and PayPal.",
    keywords: ["payment", "pay", "card"],
  },
  {
    question: "What warranty do products have?",
    answer: "Every product has a 2-year warranty against manufacturing defects.",
    keywords: ["warranty", "guarantee", "garantía", "garantia", "defect"],
  },
  {
    question: "How do I reset my password?",
    answer: "Use the 'Forgot password' link on the login page to get a reset email.",
    keywords: ["password", "forgot", "login"],
  },
  {
    question: "How can I contact support?",
    answer: "Write to support@example.com or use the chat button; replies take under 24 hours.",
    keywords: ["contact", "support", "help"],
  },
];

export type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties: false;
    };
  };
};

export const toolDefs: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_order",
      description: "Get the status, ETA and items of an order by its id (format A1001).",
      parameters: {
        type: "object",
        properties: { orderId: { type: "string", description: "Order id, e.g. A1001" } },
        required: ["orderId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the current temperature and condition for one supported city.",
      parameters: {
        type: "object",
        properties: { city: { type: "string", enum: [...CITIES], description: "City name" } },
        required: ["city"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Evaluate an arithmetic expression with numbers, + - * /, parentheses and dots.",
      parameters: {
        type: "object",
        properties: { expression: { type: "string", description: "e.g. 12 * (3 + 4)" } },
        required: ["expression"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_faq",
      description: "Search the FAQ and return the best matching question and answer.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "What the user wants to know" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];

export type ToolResult = Record<string, unknown>;

const missing = (...fields: string[]): ToolResult => ({ error: "missing_data", missing: fields });

function text(args: Record<string, unknown>, key: string): string | null {
  const v = args[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

// Recursive-descent evaluator: only digits, dots, + - * / and parentheses are ever parsed.
function evaluate(expression: string): number {
  if (expression.length > 200 || !/^[\d+\-*/().\s]+$/.test(expression)) throw new Error("unsupported");
  const tokens = expression.match(/\d+\.?\d*|\.\d+|[()+\-*/]/g) ?? [];
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  const factor = (): number => {
    const t = next();
    if (t === "-") return -factor();
    if (t === "(") {
      const v = expr();
      if (next() !== ")") throw new Error("syntax");
      return v;
    }
    if (t !== undefined && /^[\d.]/.test(t)) return Number(t);
    throw new Error("syntax");
  };
  const term = (): number => {
    let v = factor();
    while (peek() === "*" || peek() === "/") v = next() === "*" ? v * factor() : v / factor();
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === "+" || peek() === "-") v = next() === "+" ? v + term() : v - term();
    return v;
  };

  const value = expr();
  if (pos !== tokens.length || !Number.isFinite(value)) throw new Error("syntax");
  return value;
}

export function runTool(name: string, args: Record<string, unknown>): ToolResult {
  switch (name) {
    case "get_order": {
      const orderId = text(args, "orderId");
      if (!orderId) return missing("orderId");
      if (!Object.hasOwn(ORDERS, orderId)) return { found: false, orderId };
      return { orderId, ...ORDERS[orderId as OrderId] };
    }
    case "get_weather": {
      const city = text(args, "city");
      const match = CITIES.find((c) => c.toLowerCase() === city?.toLowerCase());
      if (!match) return { error: "missing_data", missing: ["city"], allowed: [...CITIES] };
      return { city: match, ...WEATHER[match as City] };
    }
    case "calculate": {
      const expression = text(args, "expression");
      if (!expression) return missing("expression");
      try {
        return { expression, result: evaluate(expression) };
      } catch {
        return { error: "missing_data", missing: ["expression"], reason: "unsupported expression" };
      }
    }
    case "search_faq": {
      const query = text(args, "query");
      if (!query) return missing("query");
      const q = query.toLowerCase();
      let best: (typeof FAQ)[number] | undefined;
      let bestScore = 0;
      for (const entry of FAQ) {
        const score = entry.keywords.filter((k) => q.includes(k)).length;
        if (score > bestScore) [best, bestScore] = [entry, score];
      }
      return best ? { found: true, question: best.question, answer: best.answer } : { found: false, query };
    }
    default:
      return { error: "unknown_tool", name };
  }
}
