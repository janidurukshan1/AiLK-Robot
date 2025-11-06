import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error("Set OPENAI_API_KEY in .env");
  process.exit(1);
}

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;
  if (!messages) return res.status(400).send("missing messages");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const body = {
    model: "gpt-4o-mini",
    messages,
    max_tokens: 512,
    temperature: 0.2,
    stream: true
  };

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("LLM error", text);
      res.write(`event: error\ndata: ${JSON.stringify({ error: text })}\n\n`);
      return res.end();
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let done = false;

    while (!done) {
      const { value, done: d } = await reader.read();
      done = d;
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          const payload = line.startsWith("data:") ? line.replace(/^data:\s*/, "") : line;
          if (payload.trim() === "[DONE]") {
            res.write(`event: done\ndata: [DONE]\n\n`);
          } else {
            res.write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
          }
        }
      }
    }
    res.write(`event: done\ndata: [DONE]\n\n`);
    res.end();
  } catch (err) {
    console.error(err);
    res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    res.end();
  }
});

app.get("/ping", (req, res) => res.send("ok"));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`AiLK Robot running on http://localhost:${port}`));
