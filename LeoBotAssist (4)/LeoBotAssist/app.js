const DAILY_LIMIT = 10;
const API_URL = "/.netlify/functions/ask"; // the brain (see HOW-TO-PUBLISH.txt)
const LIMIT_MESSAGE = "Go look it up yourself";

// Question 12 up to question 24: Leo bot refuses in different ways
const SASS = [
  "Nope. You do it.",
  "Still no. Google exists.",
  "I'm on a break. Ask someone else.",
  "Not my problem.",
  "Have you tried using your own brain?",
  "Wow, you're really still asking.",
  "I'm not even reading your questions anymore.",
  "Leo bot is tired. Leo bot is not helping.",
  "You do it. I believe in you.",
  "Seriously, stop. I'm warning you.",
  "My circuits are getting warm...",
  "Warning: Leo bot is losing patience.",
  "That's it. Ask one more time. I dare you.",
];
const SELF_DESTRUCT_AT = 25; // the 25th question

const home = document.getElementById("home");
const chat = document.getElementById("chat");
const ball = document.getElementById("ball");
const messages = document.getElementById("messages");
const form = document.getElementById("form");
const input = document.getElementById("question");
const sendBtn = document.getElementById("send");
const counter = document.getElementById("counter");
const alarm = document.getElementById("alarm");
const alarmCount = document.getElementById("alarm-count");
const crash = document.getElementById("crash");
const restartBtn = document.getElementById("restart");
const installBtn = document.getElementById("install");
const shareBtn = document.getElementById("share");
const hint = document.getElementById("hint");
const HINT_DEFAULT = hint.textContent;

// ---- the ball wiggles every few seconds ----
function wiggle() {
  ball.classList.remove("wiggle");
  void ball.offsetWidth; // restart the animation
  ball.classList.add("wiggle");
}
ball.addEventListener("animationend", () => ball.classList.remove("wiggle"));

function scheduleWiggle() {
  const wait = 3000 + Math.random() * 4000; // every 3-7 seconds
  setTimeout(() => {
    if (!home.hidden) wiggle();
    scheduleWiggle();
  }, wait);
}
scheduleWiggle();

// ---- daily counter (counts every question asked today, resets every day) ----
function today() {
  const d = new Date();
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

function getCount() {
  try {
    const saved = JSON.parse(localStorage.getItem("leo-usage") || "{}");
    return saved.date === today() ? saved.count : 0;
  } catch (e) {
    return 0;
  }
}

function setCount(count) {
  try {
    localStorage.setItem("leo-usage", JSON.stringify({ date: today(), count }));
  } catch (e) {}
}

function updateCounter() {
  const left = Math.max(0, DAILY_LIMIT - getCount());
  counter.textContent = left + " question" + (left === 1 ? "" : "s") + " left today";
}

// ---- UI helpers ----
function addMessage(text, who) {
  const el = document.createElement("div");
  el.className = "msg " + who;
  el.textContent = text;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
  return el;
}

function flashHint(text) {
  hint.textContent = text;
  setTimeout(() => { hint.textContent = HINT_DEFAULT; }, 2500);
}

// ---- the brain: asks the server, never throws, always gives a friendly result ----
async function askBrain(question) {
  const FAIL = { ok: false, answer: "My brain had a hiccup. Try again in a moment. (That one didn't count.)" };

  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: ctrl.signal,
      });
      const data = await res.json(); // throws if the server sent HTML (brain not deployed)
      if (data && data.ok && data.answer) return data;
      if (data && data.answer && data.ok === false) {
        // a clear message from the server (busy, key problem, slow down...): show it, don't retry
        return { ok: false, answer: data.answer + " (That one didn't count.)" };
      }
    } catch (e) {
      // network problem, timeout, or brain not deployed: retry once
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
  }

  if (!navigator.onLine) {
    return { ok: false, answer: "You're offline. Connect to the internet and ask again. (That one didn't count.)" };
  }
  return FAIL;
}

// ---- the 25th question: alarm, then crash ----
function selfDestruct() {
  input.blur();
  alarm.hidden = false;
  let n = 5;
  alarmCount.textContent = n;
  try {
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400, 200, 400, 200, 400]);
  } catch (e) {}

  const timer = setInterval(() => {
    n -= 1;
    if (n > 0) {
      alarmCount.textContent = n;
      return;
    }
    clearInterval(timer);
    alarm.hidden = true;
    chat.hidden = true;
    home.hidden = true;
    crash.hidden = false;
  }, 1000);
}

restartBtn.addEventListener("click", () => location.reload());

ball.addEventListener("click", () => {
  home.hidden = true;
  chat.hidden = false;
  if (!messages.children.length) {
    addMessage("Hello, I'm Leo bot! Ask me anything. I can answer " + DAILY_LIMIT + " questions per day.", "bot");
  }
  updateCounter();
  input.focus();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = input.value.trim();
  if (!question || sendBtn.disabled) return;

  addMessage(question, "user");
  input.value = "";

  const attempt = getCount() + 1; // which question of the day this is
  setCount(attempt);
  updateCounter();

  if (attempt > DAILY_LIMIT) {
    if (attempt === DAILY_LIMIT + 1) {
      addMessage(LIMIT_MESSAGE, "bot"); // 11th
    } else if (attempt < SELF_DESTRUCT_AT) {
      addMessage(SASS[attempt - DAILY_LIMIT - 2], "bot"); // 12th to 24th
    } else if (attempt === SELF_DESTRUCT_AT) {
      selfDestruct(); // 25th
    } else {
      addMessage("Leo bot is gone. Come back tomorrow.", "bot");
    }
    return;
  }

  // Questions 1-10: Leo bot answers
  sendBtn.disabled = true;
  const thinking = addMessage("...", "bot");

  const result = await askBrain(question);
  thinking.textContent = result.answer;

  if (!result.ok) {
    // a failed answer doesn't use up one of today's questions
    setCount(Math.max(0, getCount() - 1));
    updateCounter();
  }

  sendBtn.disabled = false;
  input.focus();
});

// ---- share with friends ----
shareBtn.addEventListener("click", async () => {
  const url = location.origin + location.pathname;
  const data = {
    title: "LeoBotAssist",
    text: "Meet Leo bot, the little ball that answers your questions. Careful, he gets grumpy after 10!",
    url,
  };
  try {
    if (navigator.share) {
      await navigator.share(data);
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return; // they closed the share sheet
  }
  try {
    await navigator.clipboard.writeText(url);
    flashHint("Link copied! Send it to your friends.");
  } catch (e) {
    window.prompt("Copy this link and send it to your friends:", url);
  }
});

// ---- install as an app ----
let installPrompt = null;
const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  if (!isStandalone) installBtn.hidden = false;
});

installBtn.addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  try { await installPrompt.userChoice; } catch (e) {}
  installPrompt = null;
  installBtn.hidden = true;
});

window.addEventListener("appinstalled", () => {
  installBtn.hidden = true;
  flashHint("Installed! Find LeoBotAssist on your home screen.");
});

// iPhone has no install button: show how to do it by hand
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone) {
  hint.textContent = HINT_DEFAULT + "  |  iPhone: tap Share, then Add to Home Screen";
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
