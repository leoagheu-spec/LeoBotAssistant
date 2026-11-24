// LeoBotAssist brain: a Netlify serverless function that talks to Google's Gemini API.
// The API key stays here on the server, never in the app.
//
// Netlify > Site configuration > Environment variables:
//   GEMINI_API_KEY = your key from https://aistudio.google.com/apikey   (required)
//   GEMINI_MODEL   = optional, tried first before the built-in fallbacks
//
// Open  https://YOUR-SITE.netlify.app/.netlify/functions/ask  in a browser to check the brain is online.

const FALLBACK_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.6-flash"];
const SYSTEM_PROMPT =
  "You are Leo bot, a friendly little assistant inside a small app. Keep answers short, clear and helpful. " +
  "Answer in the same language the user writes in.";

const DEADLINE_MS = 9000;       // Netlify functions time out at ~10s, so stop trying before that
const PER_TRY_MS = 6000;
const MAX_PER_HOUR_PER_IP = 40; // soft guard so one person can't drain the free quota

// best-effort memory (resets when Netlify restarts the function)
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_HOUR_PER_IP;
}

function reply(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(obj),
  };
}

async function askModel(model, question, key, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
      {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: question }] }],
          generationConfig: { maxOutputTokens: 600 },
        }),
      }
    );

    let data = {};
    try { data = await res.json(); } catch (e) {}

    if (!res.ok) return { ok: false, status: res.status };

    const cand = data.candidates && data.candidates[0];
    const parts = cand && cand.content && cand.content.parts;
    const text = parts ? parts.map((p) => p.text || "").join("").trim() : "";
    if (text) return { ok: true, text };

    // The model answered with nothing (usually a safety block): don't try other models, tell the user.
    return { ok: false, status: 200, blocked: true };
  } catch (e) {
    return { ok: false, status: 0 }; // timeout or network error
  } finally {
    clearTimeout(timer);
  }
}

exports.handler = async (event) => {
  const key = process.env.GEMINI_API_KEY;

  // Health check: open the function URL in a browser
  if (event.httpMethod === "GET") {
    return reply(200, { ok: true, brain: key ? "online" : "missing GEMINI_API_KEY in Netlify settings" });
  }
  if (event.httpMethod !== "POST") {
    return reply(405, { ok: false, answer: "Method not allowed." });
  }

  if (!key) {
    return reply(200, { ok: false, answer: "Leo bot's brain isn't connected yet (the owner needs to add the API key)." });
  }

  let question = "";
  try { question = String(JSON.parse(event.body || "{}").question || "").trim().slice(0, 1000); } catch (e) {}
  if (!question) return reply(200, { ok: false, answer: "Ask me something first!" });

  const ip = (event.headers && (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"])) || "unknown";
  if (rateLimited(String(ip).split(",")[0].trim())) {
    return reply(200, { ok: false, answer: "Whoa, slow down! Too many questions from your connection. Try again in a bit." });
  }

  const models = [];
  if (process.env.GEMINI_MODEL) models.push(process.env.GEMINI_MODEL.trim());
  for (const m of FALLBACK_MODELS) if (!models.includes(m)) models.push(m);

  const started = Date.now();
  for (const model of models) {
    const remaining = DEADLINE_MS - (Date.now() - started);
    if (remaining < 1500) break;
    const r = await askModel(model, question, key, Math.min(PER_TRY_MS, remaining));
    if (r.ok) return reply(200, { ok: true, answer: r.text });
    if (r.blocked) {
      return reply(200, { ok: true, answer: "Hmm, I can't answer that one. Try asking it a different way!" });
    }
    if (r.status === 401 || r.status === 403) {
      return reply(200, { ok: false, answer: "Leo bot's brain key isn't working (the owner should check the API key)." });
    }
    // 404 (model gone), 429 (busy / free limit), 5xx, timeout -> try the next model
  }

  return reply(200, { ok: false, answer: "Leo bot's brain is busy right now. Try again in a minute." });
};
