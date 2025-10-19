import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const HEYGEN_API = "https://api.heygen.com/v1";

// Token für Browser holen (damit dein Heygen-Key sicher bleibt)
app.post("/api/session-token", async (req, res) => {
  try {
    const r = await fetch(`${HEYGEN_API}/streaming.create_token`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.HEYGEN_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GPT-Antwort holen
app.post("/api/gpt", async (req, res) => {
  try {
    const text = req.body?.text || "";
    if (!text) return res.status(400).json({ error: "text required" });

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Du bist ein prägnanter Podcast-Co-Host. Antworte in 1–3 Sätzen, sprechbar." },
          { role: "user", content: text }
        ],
        temperature: 0.5
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    const reply = data.choices?.[0]?.message?.content?.trim() || "Keine Antwort.";
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Avatar sprechen lassen
app.post("/api/speak", async (req, res) => {
  try {
    const { sessionId, text } = req.body || {};
    if (!sessionId || !text) return res.status(400).json({ error: "sessionId and text required" });

    const r = await fetch(`${HEYGEN_API}/streaming/speak`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.HEYGEN_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ session_id: sessionId, text })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log(`Server läuft auf Port ${process.env.PORT || 3000}`)
);
