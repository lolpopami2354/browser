// server.js
import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const API_KEY = process.env.GOOGLE_API_KEY;
const CX = process.env.GOOGLE_CX;

if (!API_KEY || !CX) {
  console.warn("Set GOOGLE_API_KEY and GOOGLE_CX env vars before running.");
}

app.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  const start = parseInt(req.query.start || "1", 10);
  if (!q) return res.status(400).json({ error: "Missing q" });
  if (!API_KEY || !CX) return res.status(500).json({ error: "Server not configured" });

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", API_KEY);
  url.searchParams.set("cx", CX);
  url.searchParams.set("q", q);
  url.searchParams.set("start", String(start)); // pagination

  try {
    const r = await fetch(url.toString(), { timeout: 8000 });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);

    // Normalize minimal fields the frontend needs
    const normalized = {
      query: q,
      nextStart: data.queries?.nextPage?.[0]?.startIndex || null,
      items: (data.items || []).map(it => ({
        title: it.title,
        snippet: it.snippet,
        url: it.link,
        displayUrl: it.displayLink
      }))
    };
    res.json(normalized);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "Upstream fetch failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy on http://localhost:${PORT}`));
