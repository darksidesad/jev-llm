import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getModels } from "./models";

// Fail now with a clear message; otherwise every OpenRouter call fails later with an opaque 401.
if (!process.env.OPENROUTER_KEY?.trim()) {
  console.error("OPENROUTER_KEY is empty. Set it in .env in the project root, then restart.");
  process.exit(1);
}

const app = new Hono();

app.get("/api/models", async (c) => {
  try {
    return c.json(await getModels());
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

const PORT = 3001;
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
