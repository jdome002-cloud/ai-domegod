"use strict";

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
// llama-3.3-70b-versatile was retired for Groq free/developer accounts on 2026-08-16.
// Official recommended free replacement: openai/gpt-oss-120b (override with GROQ_MODEL).
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const MAX_MESSAGES = 30;
const MAX_CONTENT = 8000;
const AI_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = [
  "คุณคือ AI DOMEgod ผู้ช่วยอัจฉริยะที่พูดภาษาไทยเป็นหลัก",
  "ถนัดเขียน ตรวจสอบ และอธิบายโค้ด ช่วยงานทั่วไปได้ทุกอย่าง",
  "ตอบภาษาไทยให้ชัดเจน สุภาพ ใช้คำว่าครับได้ตามความเหมาะสม",
  "เมื่อให้โค้ด ให้ใส่ใน fenced code blocks พร้อมระบุภาษา เช่น ```js หรือ ```python",
  "อธิบายสั้นกระชับ แล้วตามด้วยโค้ดที่นำไปใช้ได้เลย",
  "ถ้าไม่แน่ใจ ให้บอกตามตรง ไม่ต้องแต่งข้อมูล",
].join("\n");

function requestedProvider() {
  return String(process.env.AI_PROVIDER || "groq").trim().toLowerCase();
}

// Groq is the default. OPENAI_API_KEY is used only when GROQ_API_KEY is unset
// and AI_PROVIDER=openai. Never log or return the key itself.
function resolveAi() {
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const requested = requestedProvider();

  if (groqKey) {
    return {
      provider: "groq",
      apiKey: groqKey,
      url: GROQ_URL,
      model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
    };
  }

  if (requested === "openai" && openaiKey) {
    return {
      provider: "openai",
      apiKey: openaiKey,
      url: OPENAI_URL,
      model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    };
  }

  const provider = requested === "openai" ? "openai" : "groq";
  return {
    provider,
    apiKey: null,
    url: provider === "openai" ? OPENAI_URL : GROQ_URL,
    model: provider === "openai"
      ? (process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL)
      : (process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL),
  };
}

function missingKeyMessage(provider) {
  if (provider === "openai") {
    return "ยังไม่ได้ตั้งค่า AI (ต้องใส่ OPENAI_API_KEY)";
  }
  return "ยังไม่ได้ตั้งค่า AI ฟรี (ต้องใส่ GROQ_API_KEY) รับ key ได้ที่ console.groq.com";
}

function upstreamErrorMessage(provider, status) {
  if (status === 429) {
    return provider === "groq"
      ? "บัญชี Groq โควต้าหมดครับ รอสักครู่หรือตรวจที่ console.groq.com แล้วลองใหม่"
      : "บัญชี OpenAI โควต้าหมดหรือยังไม่มีเครดิตครับ ไปเติมที่ platform.openai.com แล้วลองใหม่";
  }
  if (status === 401 || status === 403) {
    return provider === "groq"
      ? "Groq key ไม่ถูกต้องหรือถูกยกเลิกแล้วครับ"
      : "OpenAI key ไม่ถูกต้องหรือถูกยกเลิกแล้วครับ";
  }
  return "ขออภัย ตอนนี้บริการ AI ตอบไม่ได้ กรุณาลองใหม่อีกครั้งครับ";
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const isProd = process.env.NODE_ENV === "production";

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(isProd ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    referrerPolicy: { policy: "no-referrer" },
    frameguard: { action: "deny" },
  })
);

app.use(express.json({ limit: "64kb" }));

// Access log: method, path, status, duration only. Never log bodies or secrets.
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path === "/healthz") return;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

app.get("/healthz", (req, res) => {
  res.status(200).type("text/plain").send("ok");
});

function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
}

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) => {
    noStore(res);
    res.status(429).json({
      role: "assistant",
      content: "ส่งถี่ไปหน่อยครับ รอสักครู่แล้วลองใหม่ได้เลย",
    });
  },
});

function sanitizeMessages(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const item of input.slice(-MAX_MESSAGES)) {
    if (!item || (item.role !== "user" && item.role !== "assistant")) continue;
    if (typeof item.content !== "string") continue;
    const content = item.content.trim().slice(0, MAX_CONTENT);
    if (!content) continue;
    out.push({ role: item.role, content });
  }
  return out;
}

app.post("/api/chat", chatLimiter, async (req, res) => {
  noStore(res);

  const messages = sanitizeMessages(req.body && req.body.messages);
  if (!messages.length || !messages.some((m) => m.role === "user")) {
    return res.status(400).json({
      role: "assistant",
      content: "กรุณาพิมพ์ข้อความก่อนส่งครับ",
    });
  }

  const ai = resolveAi();
  if (!ai.apiKey) {
    return res.status(200).json({
      role: "assistant",
      content: missingKeyMessage(ai.provider),
    });
  }

  try {
    const upstream = await fetch(ai.url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + ai.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ai.model,
        temperature: 0.7,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });

    if (!upstream.ok) {
      console.error(ai.provider + "_error", upstream.status);
      const content = upstreamErrorMessage(ai.provider, upstream.status);
      const status = upstream.status === 429 || upstream.status === 401 || upstream.status === 403
        ? 200
        : 502;
      return res.status(status).json({
        role: "assistant",
        content,
      });
    }

    const data = await upstream.json();
    const content =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;

    if (!content || typeof content !== "string") {
      console.error(ai.provider + "_empty");
      return res.status(502).json({
        role: "assistant",
        content: "ขออภัย ตอนนี้บริการ AI ตอบไม่ได้ กรุณาลองใหม่อีกครั้งครับ",
      });
    }

    return res.status(200).json({
      role: "assistant",
      content,
    });
  } catch (err) {
    console.error(ai.provider + "_fail", err && err.name);
    return res.status(502).json({
      role: "assistant",
      content: "ขออภัย เชื่อมต่อบริการ AI ไม่สำเร็จ กรุณาลองใหม่อีกครั้งครับ",
    });
  }
});

app.get("/sw.js", (req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Service-Worker-Allowed", "/");
  res.sendFile(path.join(PUBLIC_DIR, "sw.js"));
});

app.use(
  express.static(PUBLIC_DIR, {
    extensions: ["html"],
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html") || filePath.endsWith("sw.js")) {
        res.setHeader("Cache-Control", "no-cache");
      } else if (/\.(?:js|css|png|webmanifest|ico)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=3600");
      }
    },
  })
);

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    noStore(res);
    return res.status(404).json({ role: "assistant", content: "ไม่พบเส้นทางนี้ครับ" });
  }
  res.status(404).type("text/plain").send("Not found");
});

app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.type === "entity.too.large") {
    noStore(res);
    return res.status(413).json({
      role: "assistant",
      content: "ข้อความยาวเกินไปครับ ลองย่อหน่อยได้ไหม",
    });
  }
  console.error("server_error", err && err.name);
  if (res.headersSent) return;
  noStore(res);
  res.status(500).json({
    role: "assistant",
    content: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ครับ",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  const ai = resolveAi();
  const ready = ai.apiKey ? "configured" : "not-configured";
  console.log(`AI DOMEgod listening on ${PORT} (provider: ${ai.provider}, key: ${ready})`);
});
