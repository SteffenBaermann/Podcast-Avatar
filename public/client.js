import { StreamingAvatar, StreamingEvents } from "@heygen/streaming-avatar";

const videoEl = document.getElementById("avatarVideo");
const inputEl = document.getElementById("input");
const askBtn  = document.getElementById("askBtn");
const logEl   = document.getElementById("log");

let avatar;
let sessionId;

function log(msg){ logEl.textContent += `${msg}\n`; }

async function bootstrap() {
  // 1) Kurzzeit-Token vom Backend holen (echter HeyGen-Key bleibt auf dem Server)
  const tokRes = await fetch("/api/session-token", { method: "POST" });
  if (!tokRes.ok) { log("Fehler: session-token"); return; }
  const { token } = await tokRes.json();

  // 2) Avatar-Client initialisieren
  avatar = new StreamingAvatar({ token });

  // 3) Video-Stream anbinden
  avatar.on(StreamingEvents.STREAM_READY, (e) => {
    videoEl.srcObject = e.detail; // MediaStream
    log("STREAM_READY");
  });

  avatar.on(StreamingEvents.AVATAR_START_TALKING, () => log("Avatar spricht..."));
  avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => log("Avatar stoppt."));

  // 4) Session starten (Avatar/Qualität nach Bedarf)
  const newSess = await avatar.newSession({
    avatarName: "default",
    quality: "high"
    // voice: "de-DE"   // optional: konkrete Stimme
  });
  sessionId = newSess?.session_id || avatar.sessionId;
  log(`Session: ${sessionId}`);
}

askBtn.addEventListener("click", async () => {
  const userText = (inputEl.value || "").trim();
  if (!userText) return;

  // 1) GPT befragen
  const r1 = await fetch("/api/gpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: userText })
  });
  const { reply } = await r1.json();
  log(`GPT: ${reply}`);

  // 2) Avatar sprechen lassen
  const r2 = await fetch("/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, text: reply })
  });
  if (!r2.ok) {
    const err = await r2.text();
    log(`Speak Fehler: ${err}`);
  }
});

bootstrap().catch(err => log(`Bootstrap-Fehler: ${err?.message || err}`));
