// backend/index.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const GROQ_BASE = "https://api.groq.com/openai/v1"; // Groq OpenAI-compatible base URL. See docs.
const GROQ_KEY = process.env.GROQ_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_ID = process.env.TELEGRAM_ADMIN_ID; // numeric string

app.use(bodyParser.json());
app.get("/", (req,res)=> res.send("AI chat backend alive"));

// simple REST chat endpoint (fallback)
app.post("/api/chat", async (req,res)=> {
  const { sessionId, message } = req.body;
  if(!message) return res.status(400).json({error:"no message"});

  try {
    // ask Groq (OpenAI-compatible chat.completions)
    const payload = {
      model: "gpt-4o-mini", // جایگزین کن با مدل مناسب که در کنسول Groq فعاله
      messages: [{role:"user", content: message}],
      max_tokens: 800
    };

    const groqResp = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const groqJson = await groqResp.json();

    const aiText = groqJson?.choices?.[0]?.message?.content ?? "";

    // simple heuristic: اگر جواب خیلی کوتاه یا "I don't know" بود، forward to telegram
    const needsHuman = !aiText || aiText.toLowerCase().includes("i'm not sure") || aiText.length < 10;

    if(needsHuman) {
      // notify admin on telegram
      const forwardText = `📩 New user question (session ${sessionId}):\n${message}\n\nReply with /reply <sessionId> your message`;
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ chat_id: TELEGRAM_ADMIN_ID, text: forwardText })
      });

      return res.json({ from: "bot", text: "متأسفم — پاسخ مشخصی ندارم. شما را به اپراتور انسانی متصل می‌کنم." , humanRequired: true });
    }

    return res.json({ from: "bot", text: aiText, humanRequired: false });

  } catch(err){
    console.error(err);
    return res.status(500).json({error:"server error"});
  }
});

// socket.io for real-time communication
io.on("connection", (socket) => {
  console.log("socket connected", socket.id);
  socket.on("user_message", async ({ sessionId, text }) => {
    // mirror logic from REST: ask Groq
    try {
      const payload = {
        model: "gpt-4o-mini",
        messages: [{role:"user", content: text}],
        max_tokens: 800
      };
      const groqResp = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const groqJson = await groqResp.json();
      const aiText = groqJson?.choices?.[0]?.message?.content ?? "";

      const needsHuman = !aiText || aiText.toLowerCase().includes("i'm not sure") || aiText.length < 10;

      if(needsHuman){
        // send notification to admin
        const forwardText = `📩 New user question (session ${sessionId}):\n${text}\n\nReply with /reply ${sessionId} your message`;
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ chat_id: TELEGRAM_ADMIN_ID, text: forwardText })
        });

        socket.emit("bot_message", { from: "bot", text: "متأسفانه نتوانستم پاسخ دهم. اپراتور انسانی بررسی می‌کند..." , humanRequired: true});
        return;
      }

      socket.emit("bot_message", { from: "bot", text: aiText, humanRequired: false });
    } catch(e){
      console.error(e);
      socket.emit("bot_message", { from: "bot", text: "خطا در سرور." });
    }
  });

  // admin replies will be routed to specific sockets via another endpoint (see /telegram/webhook or admin API)
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log("listening on", PORT));
