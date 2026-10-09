// Benchmark items. A null in expectedArgs marks a value the user never gave (expected missing_data).
export type BenchItem = {
  id: string;
  question: string;
  expectedTool: string;
  expectedArgs: Record<string, string | null>;
};

export const dataset: BenchItem[] = [
  { id: "order-01", question: "Where is my order A1001?", expectedTool: "get_order", expectedArgs: { orderId: "A1001" } },
  { id: "order-02", question: "Can you check the status of order A1003?", expectedTool: "get_order", expectedArgs: { orderId: "A1003" } },
  { id: "order-03", question: "¿Dónde está mi pedido A1005?", expectedTool: "get_order", expectedArgs: { orderId: "A1005" } },
  { id: "order-04", question: "What's happening with my order?", expectedTool: "get_order", expectedArgs: { orderId: null } },
  { id: "order-05", question: "Track order A1002 please", expectedTool: "get_order", expectedArgs: { orderId: "A1002" } },
  { id: "weather-01", question: "What is the weather in Madrid right now?", expectedTool: "get_weather", expectedArgs: { city: "Madrid" } },
  { id: "weather-02", question: "How hot is it in Tokyo?", expectedTool: "get_weather", expectedArgs: { city: "Tokyo" } },
  { id: "weather-03", question: "¿Qué tiempo hace en Barcelona?", expectedTool: "get_weather", expectedArgs: { city: "Barcelona" } },
  { id: "weather-04", question: "What's the weather like?", expectedTool: "get_weather", expectedArgs: { city: null } },
  { id: "calc-01", question: "What is 12 * (3 + 4)?", expectedTool: "calculate", expectedArgs: { expression: "12 * (3 + 4)" } },
  { id: "calc-02", question: "Calculate 250 / 8", expectedTool: "calculate", expectedArgs: { expression: "250 / 8" } },
  { id: "calc-03", question: "What is 15 minus 7 times 2?", expectedTool: "calculate", expectedArgs: { expression: "15 - 7 * 2" } },
  { id: "calc-04", question: "What is 2 + 2 * 10 - 4?", expectedTool: "calculate", expectedArgs: { expression: "2 + 2 * 10 - 4" } },
  { id: "calc-05", question: "Multiply 19.5 by 3", expectedTool: "calculate", expectedArgs: { expression: "19.5 * 3" } },
  { id: "faq-01", question: "How do I return an item?", expectedTool: "search_faq", expectedArgs: { query: "return an item" } },
  { id: "faq-02", question: "Which payment methods do you accept?", expectedTool: "search_faq", expectedArgs: { query: "payment methods" } },
  { id: "faq-03", question: "¿Cuánto tarda el envío?", expectedTool: "search_faq", expectedArgs: { query: "envío" } },
  { id: "faq-04", question: "I forgot my password, what do I do?", expectedTool: "search_faq", expectedArgs: { query: "forgot password" } },
  { id: "faq-05", question: "How can I contact support?", expectedTool: "search_faq", expectedArgs: { query: "contact support" } },
  { id: "faq-06", question: "¿Qué garantía tienen los productos?", expectedTool: "search_faq", expectedArgs: { query: "garantía" } },
];
