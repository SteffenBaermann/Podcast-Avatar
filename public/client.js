// Default-Export verwenden; nicht als { StreamingAvatar } importieren.
import StreamingAvatar from "@heygen/streaming-avatar";

// Fallback-Events
const StreamingEvents = {
  STREAM_READY: "STREAM_READY",
  AVATAR_START_TALKING: "AVATAR_START_TALKING",
  AVATAR_STOP_TALKING: "AVATAR_STOP_TALKING"
};

// ====== UI ======
const videoEl   = document.getElementById("avatarVideo");
const inputEl   = document.getElementById("input");
const askBtn    = document.getElementById("askBtn");
const pttBtn    = document.getElementById("pttBtn");
const logEl     = document.getElementById("log");
const streamDot = document.getElementById("streamDot");
const streamLbl = document.getElementById("streamLabel");

let avatar;
let sessionId;

// ====== Helfer ======
function log(msg){ logEl.textContent += `${msg}\n`; logEl.scrollTop = logEl.scrollHeight; }
function setStreamStatus(kind){ // ok | busy | bad
  streamDot.classList.remove("status-ok","status-busy","status-bad");
  streamDot.classList.add(kind === "ok" ? "status-ok" : kind === "busy" ? "status-busy" : "status-bad");
}
async function fetchJSON(url, opts){ const r = await fetch(url, opts); const t = await r.text(); if(!r.ok){ throw new Error(t || r.statusText); } try { return JSON.parse(t); } catch { return t; } }

// ====== Bootstrap: HeyGen verbinden ======
(async function bootstrap(){
  try {
    // 1) Kurzlebiges Token vom Server holen (Server liefert { data: { token }, error: null })
    const raw = await fetchJSON("/api/session-token", { method:"POST" });
    const token = raw?.token || raw?.data?.token;   // <- WICHTIG: richtig extrahieren
    if(!token) throw new Error("Kein Token erhalten. Antwort: " + JSON.stringify(raw));

    // 2) Avatar-Client initialisieren
    avatar = new StreamingAvatar({ token });

    // 3) Video-Stream anbinden
    avatar.on(StreamingEvents.STREAM_READY, (e) => {
      videoEl.srcObject = e.detail; // MediaStream
      setStreamStatus("ok");
      streamLbl.textContent = "STREAM_READY – Avatar verbunden.";
      log("STREAM_READY");
    });
    avatar.on(StreamingEvents.AVATAR_START_TALKING, () => log("Avatar spricht..."));
    avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => log("Avatar stoppt."));

    setStreamStatus("busy");
    streamLbl.textContent = "Verbinde Avatar…";

    // 4) Session starten – bei Bedarf avatarName anpassen (z. B. "lily")
    const newSess = await avatar.newSession({
      avatarName: "default",
      quality: "high"
      // voice: "de-DE"
    });
    sessionId = newSess?.session_id || avatar.sessionId;
    log(`Session: ${sessionId}`);
  } catch (err){
    setStreamStatus("bad");
    streamLbl.textContent = "Fehler beim Verbinden. Details in der Konsole.";
    console.error(err);
    log(`Fehler beim Verbinden: ${err.message || err}`);
  }
})();

// ====== Text senden → GPT → Avatar spricht ======
async function sendAndSpeak(userText){
  if(!userText?.trim()) return;
  try {
    askBtn.disabled = true; pttBtn.disabled = true;
    const { reply } = await fetchJSON("/api/gpt", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ text: userText.trim() })
    });
    log(`GPT: ${reply}`);

    await fetchJSON("/api/speak", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ sessionId, text: reply })
    });
  } catch (err){
    log(`Speak Fehler: ${err.message || err}`);
    console.error(err);
  } finally {
    askBtn.disabled = false; pttBtn.disabled = false;
  }
}
askBtn.addEventListener("click", () => sendAndSpeak(inputEl.value));

// ====== Speech-to-Speech: bis 60 Sekunden am Stück ======
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let sttTimer;
let sttActive = false;

if (SR) {
  recognition = new SR();
  recognition.lang = "de-DE";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  let buffer = "";

  recognition.onstart  = () => {
    buffer = "";
    sttActive = true;
    pttBtn.textContent = "⏹️ Aufnahme stoppen";
    document.getElementById("sttState").textContent = "aufnehmen…";
    log("STT: Aufnahme gestartet (max. 60s) …");

    clearTimeout(sttTimer);
    sttTimer = setTimeout(() => {
      log("STT: 60s erreicht – stoppe.");
      recognition.stop();
    }, 60000);
  };

  recognition.onerror  = e  => { log(`STT Fehler: ${e.error}`); };
  recognition.onresult = (e) => {
    let latest = "";
    for (const res of e.results) latest += res[0].transcript + " ";
    inputEl.value = latest.trim();
    buffer = latest.trim();
  };

  recognition.onend    = async () => {
    clearTimeout(sttTimer);
    sttActive = false;
    pttBtn.textContent = "🎙️ Push-to-Talk";
    document.getElementById("sttState").textContent = "inaktiv";
    if (buffer) await sendAndSpeak(buffer);  // erst am Ende senden
  };

  pttBtn.addEventListener("click", () => {
    if (!sttActive) {
      try { recognition.start(); }
      catch(e){ log(`STT Startfehler: ${e.message || e}`); }
    } else {
      recognition.stop();
    }
  });
} else {
  pttBtn.disabled = true;
  document.getElementById("sttState").textContent = "nicht unterstützt";
  log("Hinweis: Dein Browser unterstützt die Web Speech API nicht. Textfeld nutzen oder auf Chrome/Edge wechseln.");
}
