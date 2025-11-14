// server.js
import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// Simple in-memory cache (LRU-ish)
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 min

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  const { ts, data } = entry;
  if (Date.now() - ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return data;
}
function setCache(key, data) {
  cache.set(key, { ts: Date.now(), data });
}

// Basic rate-limit (IP-based, per minute)
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "anon";
  const windowMs = 60 * 1000;
  const limit = 60; // 60 requests/min
  const now = Date.now();
  let entry = hits.get(ip);
  if (!entry || now - entry.ts > windowMs) {
    entry = { ts: now, count: 0 };
    hits.set(ip, entry);
  }
  entry.count++;
  if (entry.count > limit) {
    return res.status(429).json({ error: "Too Many Requests" });
  }
  next();
}

app.get("/search", rateLimit, async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "Missing q" });

  const cacheKey = `ddg:${q}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    // DuckDuckGo Instant Answer API (JSON)
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
    const r = await fetch(url, { timeout: 8000 });
    if (!r.ok) throw new Error(`Upstream error ${r.status}`);
    const data = await r.json();

    // Normalize to a simple result schema for the frontend
    const normalized = {
      query: q,
      heading: data.Heading || null,
      abstract: data.Abstract || null,
      abstractSource: data.AbstractSource || null,
      abstractURL: data.AbstractURL || null,
      relatedTopics: (data.RelatedTopics || [])
        .map(rt => {
          if (rt.Text && rt.FirstURL) return { text: rt.Text, url: rt.FirstURL };
          if (rt.Topics && Array.isArray(rt.Topics)) {
            return rt.Topics
              .filter(t => t.Text && t.FirstURL)
              .map(t => ({ text: t.Text, url: t.FirstURL }));
          }
          return null;
        })
        .flat()
        .filter(Boolean)
        .slice(0, 8)
    };

    setCache(cacheKey, normalized);
    res.json(normalized);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "Upstream fetch failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy listening on http://localhost:${PORT}`);
});
