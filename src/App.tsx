import { useEffect, useState } from "react";

// Placeholder: proves the frontend reaches the backend through the /api proxy.
export default function App() {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/models")
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return (await res.json()) as unknown[];
      })
      .then((models) => setCount(models.length))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main>
      <h1>jev-llm</h1>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <p>{count === null ? "Loading models..." : `${count} models available`}</p>
      )}
    </main>
  );
}
