// Default-Export verwenden; nicht als { StreamingAvatar } importieren.
import StreamingAvatar from "@heygen/streaming-avatar";

// Fallback-Events, falls das SDK keine Named Exports liefert
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
let recognition;      // Web Speech API
let sttActive = false;

// ====== Helfer ======
function log(msg){ logEl.textContent += `${msg}\n`; logEl.scrollTop = logEl.scrollHeight; }
function setStreamStatus(kind){ // ok | busy | bad
  streamDot.classList.remove("status-ok","status-busy","status-bad");
  streamDot.classList.add(kind === "ok" ? "status-ok" : kind === "busy" ? "status-busy" : "status-bad");
}
async function fetchJSON(url, opts){ const r = await fetch(url, opts); if(!r.ok){ const t = await r.text(); throw new Error(t || r.statusText); } return r.json(); }

// ====== Bootstrap: HeyGen verbinden ======
(async function bootstrap(){
  try {
    // 1) Kurzlebiges Token vom Server holen
    const tok = await fetchJSON("/api/session-token", { method:"POST" });
    // 2) Avatar-Client initialisieren
    avatar = new StreamingAvatar({ token: tok.token });

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

    // 4) Session starten – Avatar anpassen, wenn du einen konkreten Namen hast
    const newSess = await avatar.newSession({
      avatarName: "default",  // TODO: hier echten Interactive-Avatar-Namen eintragen, z. B. "lily"
      quality: "high"
      // voice: "de-DE" // optional: konkrete Stimme wählen
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

// Button: Text senden
askBtn.addEventListener("click", () => sendAndSpeak(inputEl.value));

// ====== Speech-to-Speech (Push-to-Talk) ======
// Für Anfängerfreundlichkeit setzen wir auf die Web Speech API (Chrome/Edge). Safari/Firefox können zicken.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  recognition = new SR();
  recognition.lang = "de-DE";
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart  = () => { sttActive = true; pttBtn.textContent = "⏹️ Stop"; log("STT: Aufnahme gestartet…"); };
  recognition.onerror  = e  => { log(`STT Fehler: ${e.error}`); };
  recognition.onend    = () => { sttActive = false; pttBtn.textContent = "🎙️ Push-to-Talk"; document.getElementById("sttState").textContent = "inaktiv"; };
  recognition.onresult = async (e) => {
    let transcript = "";
    for (const res of e.results) { transcript += res[0].transcript + " "; }
    inputEl.value = transcript.trim();
    document.getElementById("sttState").textContent = "erkannt";
    // Wenn Ergebnis final, direkt senden
    if (e.results[e.results.length - 1].isFinal) {
      await sendAndSpeak(inputEl.value);
    }
  };

  pttBtn.addEventListener("click", () => {
    if (!sttActive) {
      try { recognition.start(); document.getElementById("sttState").textContent = "aufnehmen…"; }
      catch(e){ log(`STT Startfehler: ${e.message || e}`); }
    } else {
      recognition.stop();
    }
  });
} else {
  // Kein STT verfügbar: Knopf deaktivieren, damit du nicht drauf rumhämmers
  pttBtn.disabled = true;
  document.getElementById("sttState").textContent = "nicht unterstützt";
  log("Hinweis: Dein Browser unterstützt die Web Speech API nicht. Textfeld nutzen oder auf Chrome/Edge wechseln.");
}
