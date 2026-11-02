const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "qwen3:4b";

export async function chat(prompt, signal) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [{ role: "user", content: prompt }],
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}`);
  }
  const data = await response.json();
  const reply = data?.message?.content;
  if (typeof reply !== "string") {
    throw new Error("Ollama response had no message.content");
  }
  return reply;
}