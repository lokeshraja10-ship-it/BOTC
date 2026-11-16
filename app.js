import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, onSnapshot, query, where, serverTimestamp, arrayUnion, writeBatch } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { ROLES, ROLE_MAP, TEAMS, TEAM_LABEL, isEvil, teamCounts, FIRST_NIGHT, OTHER_NIGHT, REMINDERS } from "./roles.js";

/* ---------------- setup ---------------- */
const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);

const S = {
  user: null, mode: null, code: null, game: null,
  grim: { roles: {}, bluffs: [] }, claims: {}, votes: {}, actions: {}, chat: {},
  priv: null, notes: "", unsubs: [], voteTimer: null,
  ui: { grim: true, chatOpen: false, modalLive: null, overlayKey: "", chatSeen: 0, chatOpts: "" }
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const uid = () => S.user?.uid;
const isGM = () => S.mode === "gm";
const seats = () => S.game?.seats || [];
const seatById = id => seats().find(s => s.id === id);
const mySeat = () => Object.keys(S.claims).find(k => S.claims[k] === uid()) || null;
const teamClass = r => (r ? (isEvil(r.team) ? "evil" : "good") : "");
const tsMs = t => (t?.toMillis ? t.toMillis() : typeof t === "number" ? t : Date.now());

function toast(msg, kind = "") {
  const t = document.createElement("div");
  t.className = "toast " + kind; t.textContent = msg;
  $("#toasts").appendChild(t); setTimeout(() => t.remove(), 4500);
}
function errMsg(e) {
  console.error(e);
  const c = e?.code || "";
  if (c.includes("permission-denied")) return "Permission denied – publish the supplied firestore.rules in Firebase.";
  if (c.includes("unauthorized-domain")) return "Add this website's domain in Firebase → Authentication → Settings → Authorized domains.";
  if (c.includes("admin-restricted-operation") || c.includes("operation-not-allowed")) return "Enable Google and Anonymous sign-in in Firebase → Authentication → Sign-in method.";
  if (c.includes("popup-closed")) return "Sign-in window was closed.";
  return e?.message || String(e);
}
const onErr = e => toast(errMsg(e), "err");
const safe = fn => async (...a) => { try { await fn(...a); } catch (e) { onErr(e); } };

const gRef = () => doc(db, "games", S.code);
const dref = (...p) => doc(db, "games", S.code, ...p);
const cref = (...p) => collection(db, "games", S.code, ...p);

let authResolve; const authReady = new Promise(r => (authResolve = r));
onAuthStateChanged(auth, u => { S.user = u; authResolve(u); });

/* ---------------- modal ---------------- */
function openModal(html, bind, live = null) {
  $("#mbody").innerHTML = html; $("#modal").hidden = false;
  S.ui.modalLive = live; if (bind) bind($("#mbody"));
}
function closeModal() { $("#modal").hidden = true; $("#mbody").innerHTML = ""; S.ui.modalLive = null; }
$("#modalClose").onclick = closeModal;
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });

/* ---------------- landing ---------------- */
async function boot() {
  await authReady;
  const h = location.hash.replace("#", "").trim();
  if (/^\d{4}$/.test(h)) $("#joinCode").value = h;
  const last = JSON.parse(localStorage.getItem("ts_last") || "null");
  if (last && S.user && (!h || h === last.code)) {
    const okMode = last.mode === "gm" ? !S.user.isAnonymous : true;
    if (okMode) {
      $("#resumeBox").hidden = false;
      $("#resumeBox").innerHTML = `<button class="btn gold">↩ Resume session ${esc(last.code)} as ${last.mode === "gm" ? "Storyteller" : "player"}</button>`;
      $("#resumeBox button").onclick = safe(async () => {
        const s = await getDoc(doc(db, "games", last.code));
        if (!s.exists()) { localStorage.removeItem("ts_last"); $("#resumeBox").hidden = true; return toast("That session no longer exists.", "err"); }
        enterGame(last.code, s.data().ownerUid === uid() ? "gm" : "player");
      });
    }
  }
  if (S.user && !S.user.isAnonymous) showHostPanel();
}

$("#joinCode").addEventListener("keydown", e => { if (e.key === "Enter") $("#joinBtn").click(); });
$("#joinBtn").onclick = safe(async () => {
  const code = $("#joinCode").value.trim();
  if (!/^\d{4}$/.test(code)) return toast("Enter the 4-digit session code.", "err");
  if (!auth.currentUser) await signInAnonymously(auth);
  S.user = auth.currentUser;
  const s = await getDoc(doc(db, "games", code));
  if (!s.exists()) return toast(`No session ${code} found.`, "err");
  enterGame(code, s.data().ownerUid === uid() ? "gm" : "player");
});

$("#hostBtn").onclick = safe(async () => {
  if (!auth.currentUser || auth.currentUser.isAnonymous) await signInWithPopup(auth, new GoogleAuthProvider());
  S.user = auth.currentUser; showHostPanel();
});

async function showHostPanel() {
  const p = $("#hostPanel"); p.hidden = false;
  p.innerHTML = `<p class="muted small">Signed in as ${esc(S.user.displayName || S.user.email)}</p>
    <button id="newGame" class="btn gold big">✨ Create new session</button>
    <div class="gamelist" id="myGames"></div>`;
  $("#newGame").onclick = safe(createGame);
  try {
    const qs = await getDocs(query(collection(db, "games"), where("ownerUid", "==", uid())));
    const list = qs.docs.map(d => d.data()).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)).slice(0, 6);
    $("#myGames").innerHTML = list.map(g => `<button class="btn ghost" data-open="${esc(g.code)}">Open session ${esc(g.code)} · ${(g.seats || []).length} players</button>`).join("");
    $$("[data-open]", p).forEach(b => (b.onclick = () => enterGame(b.dataset.open, "gm")));
  } catch (e) { console.warn(e); }
}

async function createGame() {
  let code = null;
  for (let i = 0; i < 10 && !code; i++) {
    const c = String(Math.floor(1000 + Math.random() * 9000));
    if (!(await getDoc(doc(db, "games", c))).exists()) code = c;
  }
  if (!code) throw new Error("Could not create a session code – try again.");
  await setDoc(doc(db, "games", code), {
    code, ownerUid: uid(), createdAt: serverTimestamp(), edition: "Trouble Brewing",
    phase: "setup", day: 0, night: 0, seats: [], nomination: null, awake: null,
    announcement: "Welcome to the Town Square.",
    chat: { publicMode: "all", publicSeats: [], pairs: [] }
  });
  await setDoc(doc(db, "games", code, "gm", "grimoire"), { roles: {}, bluffs: [] });
  enterGame(code, "gm");
  setTimeout(addPlayersModal, 400);
}

/* ---------------- enter game & listeners ---------------- */
function stopSubs() { S.unsubs.forEach(u => u()); S.unsubs = []; if (S.voteTimer) { clearInterval(S.voteTimer); S.voteTimer = null; } }

function enterGame(code, mode) {
  stopSubs();
  Object.assign(S, { code, mode, game: null, grim: { roles: {}, bluffs: [] }, claims: {}, votes: {}, actions: {}, chat: {}, priv: null });
  S.ui.overlayKey = ""; S.ui.chatOpts = "";
  S.ui.chatSeen = Number(localStorage.getItem("ts_seen_" + code) || 0);
  localStorage.setItem("ts_last", JSON.stringify({ code, mode }));
  history.replaceState(null, "", "#" + code);
  $("#landing").hidden = true; $("#game").hidden = false;
  $("#grimBtn").hidden = mode !== "gm"; $("#nightBtn").hidden = mode !== "gm";
  $("#meBtn").hidden = mode === "gm"; $("#notesBtn").hidden = mode === "gm";
  const U = S.unsubs, me = uid();

  U.push(onSnapshot(gRef(), s => {
    if (!s.exists()) { toast("This session has been closed."); return leave(); }
    S.game = s.data(); render();
  }, onErr));
  U.push(onSnapshot(cref("seatClaims"), s => { S.claims = {}; s.forEach(d => (S.claims[d.id] = d.data().uid)); render(); renderChatOptions(); }, onErr));
  U.push(onSnapshot(cref("votes"), s => { S.votes = {}; s.forEach(d => (S.votes[d.id] = d.data())); render(); }, onErr));

  const chatSnap = s => { s.docChanges().forEach(c => { if (c.type === "removed") delete S.chat[c.doc.id]; else S.chat[c.doc.id] = { id: c.doc.id, ...c.doc.data() }; }); renderChat(); };
  if (mode === "gm") {
    U.push(onSnapshot(dref("gm", "grimoire"), s => { S.grim = { roles: {}, bluffs: [], ...(s.exists() ? s.data() : {}) }; render(); }, onErr));
    U.push(onSnapshot(cref("actions"), s => { S.actions = {}; s.forEach(d => (S.actions[d.id] = d.data())); render(); }, onErr));
    U.push(onSnapshot(cref("chat"), chatSnap, onErr));
  } else {
    U.push(onSnapshot(dref("private", me), s => { const prev = S.priv; S.priv = s.exists() ? s.data() : null; onPrivate(prev); render(); }, onErr));
    U.push(onSnapshot(dref("notes", me), s => { S.notes = s.exists() ? s.data().text || "" : ""; }, onErr));
    [where("kind", "==", "public"), where("fromUid", "==", me), where("toUid", "==", me)]
      .forEach(w => U.push(onSnapshot(query(cref("chat"), w), chatSnap, onErr)));
  }
}

function leave() {
  stopSubs(); localStorage.removeItem("ts_last");
  history.replaceState(null, "", location.pathname);
  $("#game").hidden = true; $("#landing").hidden = false; $("#nightOverlay").hidden = true;
  document.body.className = "setup"; closeModal();
}

/* ---------------- rendering ---------------- */
let rq = false;
function render() { if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; doRender(); }); }
window.addEventListener("resize", render);

function doRender() {
  const g = S.game; if (!g) return;
  document.body.className = g.phase === "night" ? "night" : g.phase === "day" ? "day" : "setup";
  const ph = g.phase === "night" ? `☾ Night ${g.night}` : g.phase === "day" ? `☀ Day ${g.day}` : "Setup";
  $("#status").innerHTML = `Session <b>${esc(g.code)}</b> · ${esc(g.edition || "Trouble Brewing")} · ${ph}`;
  $("#grimBtn").style.opacity = S.ui.grim ? 1 : 0.5;
  $("#seatHint").hidden = isGM() || !!mySeat() || !seats().length;
  renderBoard(); renderNightOverlay();
  if (S.ui.modalLive && !$("#modal").hidden) S.ui.modalLive();
}

function seatView(s) {
  const me = mySeat();
  if (isGM() && S.ui.grim) {
    const r = S.grim.roles?.[s.id] || {};
    return { role: ROLE_MAP[r.role] || null, shown: r.shown && r.shown !== r.role ? ROLE_MAP[r.shown] : null, rem: r.reminders || [] };
  }
  if (!isGM() && s.id === me && S.priv?.role) return { role: ROLE_MAP[S.priv.role] || null, shown: null, rem: [] };
  return { role: null, shown: null, rem: [] };
}

function handUp(s) {
  const nom = S.game?.nomination; if (!nom) return false;
  if (nom.manual && nom.manual[s.id] !== undefined) return !!nom.manual[s.id];
  const u = S.claims[s.id]; const v = u && S.votes[u];
  return !!(v && v.key === nom.key && v.hand);
}

function boardSize() {
  const w = window.innerWidth, h = window.innerHeight - 58;
  return Math.max(300, Math.min(w - 16, h - 16, 1100));
}

function renderBoard() {
  const g = S.game, list = seats(), n = list.length, size = boardSize(), me = mySeat(), nom = g.nomination;
  const board = $("#board");
  const vh = window.innerHeight - 58, portrait = vh > size * 1.15;
  const height = portrait ? Math.min(vh - 70, size * 1.55) : size;
  board.style.width = size + "px"; board.style.height = height + "px";
  board.classList.toggle("compact", size < 560);
  const perim = Math.PI * 0.82 * (size + height) / 2;
  const tok = Math.round(Math.max(40, Math.min(118, (perim / Math.max(n, 5)) * 0.56, size * 0.17)));
  board.style.setProperty("--tok", tok + "px");

  $("#seats").innerHTML = list.map((s, i) => {
    const a = (-90 + 360 * i / Math.max(n, 1)) * Math.PI / 180;
    const x = 50 + 41 * Math.cos(a), y = 50 + 41 * Math.sin(a);
    const v = seatView(s), claimed = !!S.claims[s.id];
    const lockedVal = nom?.locked ? nom.locked[s.id] : undefined;
    const cls = ["seat", s.dead && "dead", s.id === me && "mine", !claimed && "free",
      nom?.nominee === s.id && "nominee", nom?.nominator === s.id && "nominator", g.awake === s.id && "awake"].filter(Boolean).join(" ");
    return `<button class="${cls}" data-seat="${s.id}" style="left:${x}%;top:${y}%" title="${esc(s.name)}">
      <div class="token ${v.role ? teamClass(v.role) : "blank"}">
        ${v.role ? `<span class="ico">${v.role.icon}</span><span class="rname">${esc(v.role.name)}</span>` : `<span class="ico">${claimed || isGM() || me ? "" : "＋"}</span>`}
        ${s.dead ? `<span class="shroud"></span>` : ""}
        ${nom && nom.state !== "done" && lockedVal === undefined && handUp(s) ? `<span class="hand">✋</span>` : ""}
        ${lockedVal !== undefined ? `<span class="lock ${lockedVal ? "yes" : "no"}">${lockedVal ? "✓" : "–"}</span>` : ""}
      </div>
      ${s.dead && s.ghost !== false ? `<span class="ghostvote" title="Ghost vote available">👻</span>` : ""}
      <div class="plate">${esc(s.name)}</div>
      ${v.shown ? `<span class="thinks">thinks: ${esc(v.shown.name)}</span>` : ""}
      ${v.rem.length ? `<div class="rems">${v.rem.slice(0, 5).map(r => `<span class="rem">${esc(r)}</span>`).join("")}</div>` : ""}
      ${isGM() && !claimed ? `<span class="nodev" title="No device has taken this seat">no device</span>` : ""}
    </button>`;
  }).join("");
  $$("#seats .seat").forEach(b => (b.onclick = () => seatClick(b.dataset.seat)));

  const clock = $("#clock");
  if (nom && nom.index >= 0 && n) { clock.classList.add("on"); clock.style.transform = `rotate(${(360 * nom.index / n)}deg)`; }
  else if (nom && n) { const i = list.findIndex(s => s.id === nom.nominee); clock.classList.add("on"); clock.style.transform = `rotate(${(360 * i / n)}deg)`; }
  else clock.classList.remove("on");

  renderCenter();
}

function renderCenter() {
  const g = S.game, list = seats(), n = list.length, alive = list.filter(s => !s.dead).length;
  const voters = list.filter(s => !s.dead || s.ghost !== false).length;
  const need = Math.ceil(alive / 2), counts = teamCounts(n), nom = g.nomination;
  const ph = g.phase === "night" ? `☾ Night ${g.night}` : g.phase === "day" ? `☀ Day ${g.day}` : "Setup";
  let h = `<div class="edition">${esc(g.edition || "Trouble Brewing")}</div>
    <div class="phase">${ph}</div>
    <div class="stats"><span>👥 ${n}</span><span>❤ ${alive}</span><span>🗳 ${voters}</span><span>⚖ ${need}</span></div>
    ${counts ? `<div class="teams">${TEAMS.map((t, i) => `<span class="t-${t}" title="${TEAM_LABEL[t]}">${counts[i]}</span>`).join("")}</div>` : n ? `<div class="muted small">5–15 players supported</div>` : ""}`;

  if (nom) {
    const ne = seatById(nom.nominee), nr = seatById(nom.nominator);
    h += `<div class="nombox"><div class="muted small">${nr ? esc(nr.name) + " nominates" : "Nominated"}</div>
      <div class="big">${esc(ne?.name || "?")}</div>
      <div class="tally">${nom.votes || 0} <span class="small muted">/ ${need} needed</span></div>
      <div class="small muted">${nom.state === "open" ? "Raise your hand to vote" : nom.state === "running" ? "Counting votes…" : (nom.votes || 0) >= need ? "Enough votes to go on the block" : "Not enough votes"}</div>`;
    const ms = mySeat(), msSeat = ms && seatById(ms);
    if (!isGM() && msSeat && nom.state !== "done" && !(nom.locked && nom.locked[ms] !== undefined)) {
      const canVote = !msSeat.dead || msSeat.ghost !== false;
      const up = handUp(msSeat);
      h += canVote ? `<button id="handBtn" class="btn ${up ? "green" : "gold"}" style="margin-top:8px">${up ? "✋ Hand raised – lower" : "✋ Raise hand"}</button>`
        : `<div class="small muted">You have used your ghost vote.</div>`;
    }
    if (isGM()) {
      h += `<div class="btnrow" style="justify-content:center">
        ${nom.state === "open" ? `<button class="btn red sm" id="runVote">▶ Start vote</button>` : ""}
        ${nom.state === "done" ? `<button class="btn red sm" id="execNom">☠ Execute</button>` : ""}
        <button class="btn ghost sm" id="clearNom">Clear</button></div>`;
    }
    h += `</div>`;
  } else if (g.announcement) h += `<div class="announce">${esc(g.announcement)}</div>`;

  if (isGM() && !nom) {
    h += `<div class="btnrow" style="justify-content:center">
      ${g.phase !== "night" ? `<button class="btn blue sm" id="goNight">☾ Start night</button>` : `<button class="btn gold sm" id="goDay">☀ Start day</button>`}
      ${g.phase === "day" ? `<button class="btn red sm" id="nomBtn">⚖ Nomination</button>` : ""}</div>`;
  }
  $("#center").innerHTML = h;
  const on = (id, f) => { const e = $("#" + id); if (e) e.onclick = safe(f); };
  on("handBtn", toggleHand); on("runVote", runVote); on("clearNom", () => updateDoc(gRef(), { nomination: null }));
  on("execNom", () => killSeat(nom.nominee, true)); on("goNight", startNight); on("goDay", startDay); on("nomBtn", () => nominateModal());
}

/* ---------------- seat interactions ---------------- */
function seatClick(id) {
  if (isGM()) return gmSeatModal(id);
  const me = mySeat();
  if (!me) {
    if (S.claims[id]) return toast("That seat is already taken.", "err");
    return claimSeat(id);
  }
  if (id === me) return myCharacterModal();
  const pair = pairKeyAllowed(me, id);
  if (pair && S.claims[id]) { openChat(); $("#chatTo").value = "seat:" + id; }
}

const claimSeat = safe(async id => {
  const s = seatById(id);
  if (!confirm(`Sit down as ${s.name}?`)) return;
  const cur = mySeat();
  if (cur) await deleteDoc(dref("seatClaims", cur));
  await setDoc(dref("seatClaims", id), { uid: uid(), at: serverTimestamp() });
  toast(`You are seated as ${s.name}.`, "ok");
});

const toggleHand = async () => {
  const nom = S.game.nomination, me = mySeat(); if (!nom || !me) return;
  const cur = handUp(seatById(me));
  await setDoc(dref("votes", uid()), { key: nom.key, seat: me, hand: !cur, at: Date.now() });
};

/* ---------------- GM: seats & grimoire ---------------- */
const saveSeats = arr => updateDoc(gRef(), { seats: arr });
const setGrim = (id, patch) => setDoc(dref("gm", "grimoire"), { roles: { [id]: patch } }, { merge: true });

function roleOptions(sel, withNone = true) {
  return (withNone ? `<option value="">— none —</option>` : "") + TEAMS.map(t => `<optgroup label="${TEAM_LABEL[t]}">${ROLES.filter(r => r.team === t).map(r => `<option value="${r.id}" ${sel === r.id ? "selected" : ""}>${r.icon} ${r.name}</option>`).join("")}</optgroup>`).join("");
}

function gmSeatModal(id) {
  const s = seatById(id); if (!s) return;
  const r = S.grim.roles?.[id] || {}, role = ROLE_MAP[r.role], rems = r.reminders || [];
  const g = S.game, nom = g.nomination, others = seats().filter(x => x.id !== id);
  const claimed = !!S.claims[id];
  openModal(`
    <h2>${role ? role.icon + " " : ""}${esc(s.name)}</h2>
    <p class="muted small">${claimed ? "✅ A device is seated here." : "⚪ No device has taken this seat yet."} ${role ? `· <span class="align ${teamClass(role)}">${isEvil(role.team) ? "EVIL" : "GOOD"}</span>` : ""}</p>
    <div class="grid2">
      <label>Character<select id="mRole">${roleOptions(r.role)}</select></label>
      <label>Shown to player as <span class="small">(Drunk etc.)</span><select id="mShown">${roleOptions(r.shown || "", true)}</select></label>
    </div>
    <div class="btnrow">
      <button class="btn ${s.dead ? "green" : "red"}" id="mDead">${s.dead ? "❤ Revive" : "☠ Mark dead"}</button>
      ${s.dead ? `<button class="btn ghost" id="mGhost">${s.ghost !== false ? "👻 Remove ghost vote" : "👻 Restore ghost vote"}</button>` : ""}
      ${g.phase === "night" ? `<button class="btn gold" id="mWake">${g.awake === id ? "😴 Put to sleep" : "👁 Wake player"}</button>` : ""}
      ${g.phase === "day" && !nom ? `<button class="btn red" id="mNom">⚖ Nominate…</button>` : ""}
      ${nom && nom.state !== "done" ? `<button class="btn ghost" id="mHand">${handUp(s) ? "✋ Lower hand (manual)" : "✋ Raise hand (manual)"}</button>` : ""}
    </div>
    <div class="sect"><h3>Reminder tokens</h3>
      <div class="chips">${REMINDERS.map(x => `<button class="chip ${rems.includes(x) ? "on" : ""}" data-rem="${esc(x)}">${esc(x)}</button>`).join("")}
      ${rems.filter(x => !REMINDERS.includes(x)).map(x => `<button class="chip on" data-rem="${esc(x)}">${esc(x)}</button>`).join("")}</div>
      <div class="row" style="display:flex;gap:6px"><input id="mRemTxt" placeholder="Custom reminder"><button class="btn ghost sm" id="mRemAdd">Add</button></div>
    </div>
    <div class="sect"><h3>Send private information</h3>
      <textarea id="mInfo" placeholder="e.g. One of Asha or Ravi is the Chef."></textarea>
      <div class="btnrow"><button class="btn gold" id="mSend">📨 Send to ${esc(s.name)}</button></div>
    </div>
    <div class="sect"><h3>Seat</h3>
      <div style="display:flex;gap:6px"><input id="mName" value="${esc(s.name)}" maxlength="30"><button class="btn ghost sm" id="mRename">Rename</button></div>
      <div class="btnrow">
        <button class="btn ghost sm" id="mLeft">◀ Move</button><button class="btn ghost sm" id="mRight">Move ▶</button>
        ${claimed ? `<button class="btn ghost sm" id="mUnseat">Release device</button>` : ""}
        <button class="btn red sm" id="mRemove">Remove seat</button>
      </div>
    </div>`, root => {
    const on = (sel, f) => { const e = $(sel, root); if (e) e.onclick = safe(f); };
    $("#mRole", root).onchange = safe(async e => { const v = e.target.value || null; await setGrim(id, { role: v, shown: v === "drunk" ? (r.shown || null) : v }); gmSeatModal(id); });
    $("#mShown", root).onchange = safe(async e => setGrim(id, { shown: e.target.value || null }));
    on("#mDead", async () => { await killSeat(id, !s.dead, false); closeModal(); });
    on("#mGhost", async () => { await saveSeats(seats().map(x => x.id === id ? { ...x, ghost: x.ghost === false } : x)); closeModal(); });
    on("#mWake", async () => { await updateDoc(gRef(), { awake: g.awake === id ? null : id }); closeModal(); });
    on("#mNom", () => nominateModal(id));
    on("#mHand", async () => { await updateDoc(gRef(), { ["nomination.manual." + id]: !handUp(s) }); closeModal(); });
    $$("[data-rem]", root).forEach(b => (b.onclick = safe(async () => {
      const x = b.dataset.rem, next = rems.includes(x) ? rems.filter(y => y !== x) : [...rems, x];
      await setGrim(id, { reminders: next }); gmSeatModal(id);
    })));
    on("#mRemAdd", async () => { const x = $("#mRemTxt", root).value.trim(); if (x) { await setGrim(id, { reminders: [...rems, x] }); gmSeatModal(id); } });
    on("#mSend", async () => { const t = $("#mInfo", root).value.trim(); if (!t) return; await sendInfo(id, t); $("#mInfo", root).value = ""; });
    on("#mRename", async () => { const nm = $("#mName", root).value.trim(); if (nm) { await saveSeats(seats().map(x => x.id === id ? { ...x, name: nm } : x)); closeModal(); } });
    on("#mLeft", () => moveSeat(id, -1)); on("#mRight", () => moveSeat(id, 1));
    on("#mUnseat", async () => { await deleteDoc(dref("seatClaims", id)); closeModal(); });
    on("#mRemove", async () => {
      if (!confirm(`Remove ${s.name}'s seat?`)) return;
      await saveSeats(seats().filter(x => x.id !== id));
      if (claimed) await deleteDoc(dref("seatClaims", id));
      closeModal();
    });
  });
}

async function moveSeat(id, d) {
  const arr = [...seats()], i = arr.findIndex(s => s.id === id), j = (i + d + arr.length) % arr.length;
  [arr[i], arr[j]] = [arr[j], arr[i]]; await saveSeats(arr);
}

async function killSeat(id, dead = true, announce = true) {
  const s = seatById(id);
  const patch = { seats: seats().map(x => x.id === id ? { ...x, dead, ghost: dead ? (x.ghost !== false) : true } : x) };
  if (announce && dead) { patch.announcement = `${s.name} has been executed.`; patch.nomination = null; }
  await updateDoc(gRef(), patch);
}

async function sendInfo(seatId, text) {
  const u = S.claims[seatId];
  if (!u) return toast(`${seatById(seatId)?.name} has no device seated – tell them in person.`, "err");
  await setDoc(dref("private", u), { inbox: arrayUnion({ text, at: Date.now(), night: S.game.night || 0, day: S.game.day || 0 }) }, { merge: true });
  toast("Sent privately to " + seatById(seatId).name, "ok");
}

function addPlayersModal() {
  openModal(`<h2>Add players</h2>
    <p class="muted">Enter names <b>in seating order</b>, clockwise, one per line. The order is saved and never changes unless you move a seat.</p>
    <textarea id="names" style="min-height:200px" placeholder="Lokesh&#10;Vidula&#10;Sruthi&#10;Nagaraj"></textarea>
    <div class="btnrow"><button class="btn gold" id="addNames">Add to the circle</button></div>`, root => {
    $("#addNames", root).onclick = safe(async () => {
      const names = $("#names", root).value.split("\n").map(x => x.trim()).filter(Boolean);
      if (!names.length) return;
      if (seats().length + names.length > 20) return toast("Maximum 20 seats.", "err");
      const add = names.map(n => ({ id: "s" + Math.random().toString(36).slice(2, 9), name: n.slice(0, 30), dead: false, ghost: true }));
      await saveSeats([...seats(), ...add]); closeModal(); toast(`${add.length} seats added. Share the join link!`, "ok");
    });
  });
}

/* ---------------- GM: role distribution ---------------- */
async function randomise() {
  const list = seats(), n = list.length, c = teamCounts(n);
  if (!c || n < 5) return toast("Trouble Brewing needs 5–15 players.", "err");
  if (Object.values(S.grim.roles || {}).some(r => r.role) && !confirm("Replace the current characters?")) return;
  let [tf, os, mn, dm] = c;
  const pick = (team, k, ex = []) => shuffle(ROLES.filter(r => r.team === team && !ex.includes(r.id))).slice(0, k).map(r => r.id);
  const minions = pick("minion", mn);
  if (minions.includes("baron")) { os += 2; tf -= 2; }
  const outs = pick("outsider", Math.min(os, 4)); tf += os - outs.length;
  const towns = pick("townsfolk", tf);
  const inPlay = ["imp", ...minions, ...outs, ...towns];
  const free = ROLES.filter(r => r.team === "townsfolk" && !inPlay.includes(r.id)).map(r => r.id);
  const drunkShown = outs.includes("drunk") ? shuffle(free)[0] : null;
  const bluffPool = ROLES.filter(r => !isEvil(r.team) && !inPlay.includes(r.id) && r.id !== drunkShown).map(r => r.id);
  const deal = shuffle(inPlay), roles = {};
  list.forEach((s, i) => { const id = deal[i]; roles[s.id] = { role: id, shown: id === "drunk" ? drunkShown : id, reminders: id === "drunk" ? ["Drunk"] : [] }; });
  if (inPlay.includes("fortune_teller")) {
    const good = list.filter(s => !isEvil(ROLE_MAP[roles[s.id].role].team));
    const rh = shuffle(good)[0]; if (rh) roles[rh.id].reminders = [...roles[rh.id].reminders, "Red herring"];
  }
  await setDoc(dref("gm", "grimoire"), { roles, bluffs: shuffle(bluffPool).slice(0, 3) });
  toast("Characters dealt. Check the Grimoire, then use “Send characters”.", "ok");
}

async function sendRoles() {
  let sent = 0, missing = [];
  const b = writeBatch(db);
  for (const s of seats()) {
    const r = S.grim.roles?.[s.id], u = S.claims[s.id];
    if (!r?.role) { missing.push(s.name + " (no character)"); continue; }
    if (!u) { missing.push(s.name + " (no device)"); continue; }
    b.set(dref("private", u), { role: r.shown || r.role, seat: s.id, name: s.name, dealtAt: Date.now() }, { merge: true }); sent++;
  }
  await b.commit();
  toast(`Characters sent to ${sent} player(s).${missing.length ? " Not sent: " + missing.join(", ") : ""}`, missing.length ? "" : "ok");
}

async function sendEvilInfo() {
  const list = seats(), roles = S.grim.roles || {};
  const demon = list.filter(s => roles[s.id]?.role === "imp"), minions = list.filter(s => ROLE_MAP[roles[s.id]?.role]?.team === "minion");
  if (!demon.length) return toast("No Demon in the Grimoire yet.", "err");
  const bl = (S.grim.bluffs || []).map(b => ROLE_MAP[b]?.name).filter(Boolean);
  for (const m of minions) await sendInfo(m.id, `😈 Your Demon is ${demon.map(d => d.name).join(", ")}.${minions.length > 1 ? " Fellow Minions: " + minions.filter(x => x.id !== m.id).map(x => x.name).join(", ") + "." : ""}`);
  for (const d of demon) await sendInfo(d.id, `🩸 Your Minions: ${minions.map(m => m.name).join(", ") || "none"}. Your bluffs (not in play): ${bl.join(", ") || "none set"}.`);
}

function bluffsModal() {
  const b = S.grim.bluffs || [];
  const good = ROLES.filter(r => !isEvil(r.team));
  const opt = sel => `<option value="">—</option>` + good.map(r => `<option value="${r.id}" ${sel === r.id ? "selected" : ""}>${r.icon} ${r.name}</option>`).join("");
  openModal(`<h2>😈 Demon bluffs</h2><p class="muted">Three good characters that are <b>not</b> in play.</p>
    ${[0, 1, 2].map(i => `<label>Bluff ${i + 1}<select data-bluff="${i}">${opt(b[i])}</select></label>`).join("")}
    <div class="btnrow"><button class="btn gold" id="saveBluffs">Save</button></div>`, root => {
    $("#saveBluffs", root).onclick = safe(async () => {
      await setDoc(dref("gm", "grimoire"), { bluffs: $$("[data-bluff]", root).map(s => s.value).filter(Boolean) }, { merge: true });
      closeModal(); toast("Bluffs saved.", "ok");
    });
  });
}

/* ---------------- GM: day / night / voting ---------------- */
async function startNight() {
  const g = S.game;
  await updateDoc(gRef(), { phase: "night", night: (g.night || 0) + 1, awake: null, nomination: null, announcement: "Night has fallen." });
  nightOrderModal();
}
async function startDay() {
  const g = S.game;
  await updateDoc(gRef(), { phase: "day", day: (g.day || 0) + 1, awake: null, nomination: null, announcement: `Dawn of day ${(g.day || 0) + 1}.` });
}

function nominateModal(nominee = null) {
  const alive = seats();
  const opts = sel => alive.map(s => `<option value="${s.id}" ${sel === s.id ? "selected" : ""}>${esc(s.name)}${s.dead ? " ☠" : ""}</option>`).join("");
  openModal(`<h2>⚖ Nomination</h2>
    <div class="grid2"><label>Nominator<select id="nNr"><option value="">— Storyteller —</option>${opts()}</select></label>
    <label>Nominee<select id="nNe">${opts(nominee)}</select></label></div>
    <label>Clock speed<select id="nSp"><option value="900">Fast</option><option value="1400" selected>Normal</option><option value="2200">Slow</option></select></label>
    <div class="btnrow"><button class="btn red" id="nGo">Open the vote</button></div>
    <p class="muted small">Players raise their hands on their phones. When you press “Start vote”, the clock hand sweeps clockwise from the seat after the nominee and locks each hand in public.</p>`, root => {
    $("#nGo", root).onclick = safe(async () => {
      S.voteSpeed = Number($("#nSp", root).value);
      await updateDoc(gRef(), { nomination: { key: String(Date.now()), nominee: $("#nNe", root).value, nominator: $("#nNr", root).value || null, state: "open", index: -1, locked: {}, votes: 0, manual: {} } });
      closeModal();
    });
  });
}

async function runVote() {
  const nom = S.game.nomination; if (!nom || S.voteTimer) return;
  const list = seats(), n = list.length, start = list.findIndex(s => s.id === nom.nominee);
  const order = []; for (let k = 1; k <= n; k++) order.push(list[(start + k) % n].id);
  let votes = 0, step = 0; const locked = {}, ghostUsed = [];
  await updateDoc(gRef(), { "nomination.state": "running", "nomination.locked": {}, "nomination.votes": 0 });
  S.voteTimer = setInterval(async () => {
    try {
      if (!S.game.nomination || S.game.nomination.key !== nom.key) { clearInterval(S.voteTimer); S.voteTimer = null; return; }
      if (step >= order.length) {
        clearInterval(S.voteTimer); S.voteTimer = null;
        const upd = { "nomination.state": "done", "nomination.votes": votes };
        if (ghostUsed.length) upd.seats = seats().map(s => ghostUsed.includes(s.id) ? { ...s, ghost: false } : s);
        await updateDoc(gRef(), upd); return;
      }
      const s = seatById(order[step++]); if (!s) return;
      let up = handUp(s);
      if (up && s.dead) { if (s.ghost !== false) ghostUsed.push(s.id); else up = false; }
      if (up) votes++;
      locked[s.id] = up;
      await updateDoc(gRef(), { "nomination.index": seats().findIndex(x => x.id === s.id), "nomination.locked": { ...locked }, "nomination.votes": votes });
    } catch (e) { onErr(e); clearInterval(S.voteTimer); S.voteTimer = null; }
  }, S.voteSpeed || 1400);
}

/* ---------------- night order ---------------- */
function nightOrderModal() {
  const build = () => {
    const g = S.game, first = (g.night || 1) <= 1, order = first ? FIRST_NIGHT : OTHER_NIGHT, list = seats(), roles = S.grim.roles || {};
    const rows = order.map(rid => {
      if (rid === "_minion" || rid === "_demon") {
        if (list.length < 7) return "";
        return `<div class="nightrow"><div class="mini">${rid === "_minion" ? "🗡️" : "🩸"}</div><div class="info"><b>${rid === "_minion" ? "Minion info" : "Demon info"}</b>
          <div class="small muted">${rid === "_minion" ? "Minions learn who the Demon is." : "The Demon learns its Minions and three bluffs."}</div></div>
          ${rid === "_demon" ? `<button class="btn gold sm" data-evil>Send evil info</button>` : ""}</div>`;
      }
      const role = ROLE_MAP[rid];
      const who = list.filter(s => roles[s.id]?.role === rid || (roles[s.id]?.role === "drunk" && roles[s.id]?.shown === rid));
      if (!who.length) return `<div class="nightrow off"><div class="mini">${role.icon}</div><div class="info"><b>${role.name}</b> <span class="small muted">not in play</span></div></div>`;
      return who.map(s => {
        const u = S.claims[s.id], act = u && S.actions[u] && S.actions[u].night === g.night ? S.actions[u] : null;
        const drunk = roles[s.id]?.role === "drunk";
        return `<div class="nightrow ${s.dead && rid !== "ravenkeeper" ? "off" : ""}"><div class="mini">${role.icon}</div>
          <div class="info"><b>${role.name}</b> · ${esc(s.name)} ${drunk ? "<span class='small' style='color:#f6d98a'>(Drunk)</span>" : ""} ${s.dead ? "☠" : ""}
          <div class="small muted">${esc(role.night)}</div>
          ${act ? `<div class="act">➜ ${esc([(act.targets || []).join(", "), act.text].filter(Boolean).join(" · "))}</div>` : ""}</div>
          <button class="btn ${g.awake === s.id ? "gold" : "ghost"} sm" data-wake="${s.id}">${g.awake === s.id ? "Awake" : "Wake"}</button>
          <button class="btn ghost sm" data-info="${s.id}">Info</button></div>`;
      }).join("");
    }).join("");
    $("#mbody").innerHTML = `<h2>${first ? "🌙 First night" : "🌙 Night " + (g.night || "")}</h2>
      <p class="muted small">Wake each player in order. Their phone shows a private action screen; everyone else sees the night sky. Choices appear here in green.</p>
      ${rows}
      <div class="btnrow"><button class="btn ghost" id="sleepAll">😴 Everyone asleep</button>${g.phase === "night" ? `<button class="btn gold" id="toDay">☀ Start day</button>` : ""}</div>`;
    const root = $("#mbody");
    $$("[data-wake]", root).forEach(b => (b.onclick = safe(() => updateDoc(gRef(), { awake: S.game.awake === b.dataset.wake ? null : b.dataset.wake }))));
    $$("[data-info]", root).forEach(b => (b.onclick = () => infoPrompt(b.dataset.info)));
    $$("[data-evil]", root).forEach(b => (b.onclick = safe(sendEvilInfo)));
    $("#sleepAll", root).onclick = safe(() => updateDoc(gRef(), { awake: null }));
    const td = $("#toDay", root); if (td) td.onclick = safe(async () => { closeModal(); await startDay(); });
  };
  openModal("", null, build); build();
}

function infoPrompt(seatId) {
  const s = seatById(seatId);
  const text = prompt(`Private information for ${s.name}:`);
  if (text && text.trim()) safe(sendInfo)(seatId, text.trim());
}

/* ---------------- player: private ---------------- */
function onPrivate(prev) {
  if (!S.priv) return;
  if (S.priv.role && (!prev || prev.role !== S.priv.role || prev.dealtAt !== S.priv.dealtAt)) setTimeout(myCharacterModal, 300);
  const a = (prev?.inbox || []).length, b = (S.priv.inbox || []).length;
  if (prev && b > a) { toast("📨 New information from the Storyteller"); if (S.game?.phase !== "night") myCharacterModal(); }
}

function myCharacterModal() {
  const r = ROLE_MAP[S.priv?.role];
  const inbox = [...(S.priv?.inbox || [])].reverse();
  openModal(`<div class="reveal">
    ${r ? `<p class="muted">You are</p><div class="bigtok ${teamClass(r)}"><span class="ico">${r.icon}</span><span class="rname">${esc(r.name)}</span></div>
      <div class="align ${teamClass(r)}">${isEvil(r.team) ? "EVIL" : "GOOD"} · ${TEAM_LABEL[r.team].replace(/s$/, "")}</div>
      <p style="font-family:var(--body);font-size:1.15rem">${esc(r.ability)}</p>`
      : `<h2>Waiting for your character…</h2><p class="muted">The Storyteller has not dealt characters yet.</p>`}
    <p class="small muted">Keep this screen private.</p></div>
    <div class="sect inbox"><h3>📨 From the Storyteller</h3>
      ${inbox.length ? inbox.map(m => `<div class="msg st"><div class="who">${m.night ? "Night " + m.night : m.day ? "Day " + m.day : "Setup"}</div>${esc(m.text)}</div>`).join("") : `<p class="muted small">Nothing yet.</p>`}</div>
    <div class="btnrow"><button class="btn ghost sm" id="leaveSeat">Leave my seat</button></div>`, root => {
    $("#leaveSeat", root).onclick = safe(async () => { const m = mySeat(); if (m && confirm("Leave your seat?")) { await deleteDoc(dref("seatClaims", m)); closeModal(); } });
  });
}

function notesModal() {
  openModal(`<h2>📝 My notes</h2><p class="muted small">Only you can read these.</p>
    <textarea id="notesTxt" style="min-height:260px">${esc(S.notes)}</textarea>
    <div class="btnrow"><button class="btn gold" id="saveNotes">Save</button></div>`, root => {
    $("#saveNotes", root).onclick = safe(async () => { S.notes = $("#notesTxt", root).value; await setDoc(dref("notes", uid()), { text: S.notes, at: Date.now() }); toast("Notes saved.", "ok"); closeModal(); });
  });
}

/* ---------------- player: night overlay ---------------- */
function renderNightOverlay() {
  const ov = $("#nightOverlay"), g = S.game;
  if (isGM() || g.phase !== "night") { ov.hidden = true; S.ui.overlayKey = ""; return; }
  const me = mySeat(), awake = me && g.awake === me, inboxN = (S.priv?.inbox || []).length;
  const key = [g.night, awake, inboxN, S.priv?.role, seats().length].join("|");
  ov.hidden = false;
  if (key === S.ui.overlayKey) return;
  S.ui.overlayKey = key;
  const r = ROLE_MAP[S.priv?.role];
  if (!awake) {
    ov.innerHTML = `<div class="nightcard"><div class="moon"></div><h2>Night ${g.night}</h2>
      <p style="font-family:var(--body);font-size:1.2rem;color:#c9d3f5">Close your eyes… The Storyteller is moving through the town.</p>
      <p class="muted small">This screen will change if the Storyteller wakes you.</p>
      <div class="btnrow" style="justify-content:center"><button class="btn ghost sm" id="ovMe">🎭 My character</button><button class="btn ghost sm" id="ovNotes">📝 Notes</button></div></div>`;
  } else {
    const last = (S.priv?.inbox || []).filter(m => m.night === g.night).reverse();
    ov.innerHTML = `<div class="nightcard"><div class="moon" style="width:70px;height:70px"></div><h2>You are awake</h2>
      ${r ? `<div class="align ${teamClass(r)}">${r.icon} ${esc(r.name)}</div><p class="muted">${esc(r.ability)}</p>` : ""}
      ${last.length ? `<div class="panel">${last.map(m => `<div class="msg st">${esc(m.text)}</div>`).join("")}</div>` : ""}
      <div class="panel"><b>Your choice</b><p class="muted small">Tap players if your ability asks you to choose.</p>
        <div class="chips">${seats().filter(s => s.id !== me || r?.id === "imp").map(s => `<button class="chip" data-t="${esc(s.name)}">${esc(s.name)}${s.dead ? " ☠" : ""}</button>`).join("")}</div>
        <textarea id="actTxt" placeholder="Optional note to the Storyteller"></textarea>
        <div class="btnrow"><button class="btn gold" id="actSend">Send to Storyteller</button></div></div></div>`;
    $$("[data-t]", ov).forEach(b => (b.onclick = () => b.classList.toggle("on")));
    $("#actSend", ov).onclick = safe(async () => {
      const targets = $$("[data-t].on", ov).map(b => b.dataset.t), text = $("#actTxt", ov).value.trim();
      await setDoc(dref("actions", uid()), { seat: me, night: g.night, targets, text, at: Date.now() });
      toast("Sent to the Storyteller. Close your eyes.", "ok");
    });
  }
  const m = $("#ovMe", ov); if (m) m.onclick = myCharacterModal;
  const n = $("#ovNotes", ov); if (n) n.onclick = notesModal;
}

/* ---------------- chat ---------------- */
function pairKeyAllowed(a, b) { const p = S.game?.chat?.pairs || []; return p.includes(a + "|" + b) || p.includes(b + "|" + a); }
function canPublic(seatId) { const c = S.game?.chat || {}; return c.publicMode === "all" || (c.publicMode === "selected" && (c.publicSeats || []).includes(seatId)); }

function openChat() { S.ui.chatOpen = true; $("#chat").classList.add("open"); renderChatOptions(); markSeen(); }
function closeChat() { S.ui.chatOpen = false; $("#chat").classList.remove("open"); }
$("#chatBtn").onclick = () => (S.ui.chatOpen ? closeChat() : openChat());
$("#chatClose").onclick = closeChat;

function markSeen() { const all = Object.values(S.chat); S.ui.chatSeen = all.reduce((m, x) => Math.max(m, tsMs(x.at)), S.ui.chatSeen); localStorage.setItem("ts_seen_" + S.code, S.ui.chatSeen); renderBadge(); }
function renderBadge() {
  const n = Object.values(S.chat).filter(m => tsMs(m.at) > S.ui.chatSeen && m.fromUid !== uid()).length;
  $("#chatBadge").hidden = !n; $("#chatBadge").textContent = n;
}

function renderChat() {
  const list = Object.values(S.chat).sort((a, b) => tsMs(a.at) - tsMs(b.at)), me = uid();
  $("#chatList").innerHTML = list.length ? list.map(m => {
    const priv = m.kind === "private", st = m.fromSeat === "ST";
    const time = new Date(tsMs(m.at)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `<div class="msg ${priv ? "priv" : ""} ${st ? "st" : ""} ${m.fromUid === me ? "mine" : ""}">
      <div class="who"><b>${esc(m.fromName)}</b>${priv ? ` 🔒 → ${esc(m.toName)}` : " · everyone"} · ${time}</div>${esc(m.text)}</div>`;
  }).join("") : `<p class="muted small">No messages yet.</p>`;
  $("#chatList").scrollTop = 1e9;
  if (S.ui.chatOpen) markSeen(); else renderBadge();
  renderChatOptions();
}

function renderChatOptions() {
  if (!S.game) return;
  const me = mySeat(), opts = [];
  if (isGM()) {
    opts.push(["public", "📢 Everyone (as Storyteller)"]);
    seats().filter(s => S.claims[s.id]).forEach(s => opts.push(["seat:" + s.id, "🔒 " + s.name]));
  } else if (me) {
    if (canPublic(me)) opts.push(["public", "📢 Everyone"]);
    seats().filter(s => s.id !== me && S.claims[s.id] && pairKeyAllowed(me, s.id)).forEach(s => opts.push(["seat:" + s.id, "🔒 " + s.name]));
  }
  const sig = JSON.stringify(opts);
  const hint = isGM() ? "You can see every public and private message." :
    !me ? "Take your seat to chat." : opts.length ? "The Storyteller can read private messages." : "The Storyteller has not enabled messaging for you.";
  $("#chatHint").textContent = hint;
  const dis = !opts.length;
  $("#chatText").disabled = dis; $("#chatForm button").disabled = dis;
  if (sig === S.ui.chatOpts) return;
  S.ui.chatOpts = sig;
  const sel = $("#chatTo"), cur = sel.value;
  sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
  if (opts.some(o => o[0] === cur)) sel.value = cur;
  sel.hidden = !opts.length;
}

$("#chatForm").addEventListener("submit", safe(async e => {
  e.preventDefault();
  const text = $("#chatText").value.trim(), to = $("#chatTo").value; if (!text || !to) return;
  const me = mySeat(), base = { fromUid: uid(), text: text.slice(0, 500), at: serverTimestamp() };
  if (isGM()) Object.assign(base, { fromSeat: "ST", fromName: "Storyteller" });
  else Object.assign(base, { fromSeat: me, fromName: seatById(me)?.name || "?" });
  if (to === "public") Object.assign(base, { kind: "public", toUid: null, toSeat: null, toName: null });
  else { const sid = to.slice(5); Object.assign(base, { kind: "private", toSeat: sid, toUid: S.claims[sid], toName: seatById(sid)?.name || "?" }); }
  await addDoc(cref("chat"), base);
  $("#chatText").value = "";
}));

function chatControlModal() {
  const c = { publicMode: "all", publicSeats: [], pairs: [], ...(S.game.chat || {}) };
  let pairs = [...c.pairs];
  const name = id => seatById(id)?.name || "?";
  const build = () => {
    $("#mbody").innerHTML = `<h2>💬 Messaging controls</h2>
      <div class="sect"><h3>Public messages (everyone can read)</h3>
        <div class="radio">${[["all", "Everyone can post"], ["selected", "Only selected players"], ["off", "Off"]].map(([v, l]) => `<label><input type="radio" name="pm" value="${v}" ${c.publicMode === v ? "checked" : ""}> ${l}</label>`).join("")}</div>
        <div class="checks" id="pubSeats">${seats().map(s => `<label><input type="checkbox" value="${s.id}" ${c.publicSeats.includes(s.id) ? "checked" : ""}> ${esc(s.name)}</label>`).join("")}</div></div>
      <div class="sect"><h3>Private conversations (only these pairs)</h3>
        <div class="pairlist">${pairs.length ? pairs.map(p => { const [a, b] = p.split("|"); return `<span class="pair">${esc(name(a))} ↔ ${esc(name(b))}<button data-rm="${p}">✕</button></span>`; }).join("") : `<span class="muted small">No private conversations allowed.</span>`}</div>
        <div class="grid2"><select id="pA">${seats().map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select>
        <select id="pB">${seats().map((s, i) => `<option value="${s.id}" ${i === 1 ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></div>
        <div class="btnrow"><button class="btn ghost sm" id="pAdd">＋ Allow pair</button><button class="btn ghost sm" id="pNb">Allow neighbours</button><button class="btn ghost sm" id="pAll">Allow everyone</button><button class="btn ghost sm" id="pClr">Clear all</button></div></div>
      <div class="btnrow"><button class="btn gold" id="cSave">Save permissions</button></div>
      <p class="muted small">You (Storyteller) can always read every message and message anyone.</p>`;
    const root = $("#mbody");
    $$(".radio input", root).forEach(r => (r.onchange = () => (c.publicMode = r.value)));
    $$("#pubSeats input", root).forEach(x => (x.onchange = () => (c.publicSeats = $$("#pubSeats input:checked", root).map(i => i.value))));
    const key = (a, b) => [a, b].sort().join("|");
    $$("[data-rm]", root).forEach(b => (b.onclick = () => { pairs = pairs.filter(p => p !== b.dataset.rm); build(); }));
    $("#pAdd", root).onclick = () => { const a = $("#pA", root).value, b = $("#pB", root).value; if (a === b) return toast("Pick two different players.", "err"); const k = key(a, b); if (!pairs.includes(k)) pairs.push(k); build(); };
    $("#pNb", root).onclick = () => { const l = seats(); l.forEach((s, i) => { const k = key(s.id, l[(i + 1) % l.length].id); if (l.length > 1 && !pairs.includes(k)) pairs.push(k); }); build(); };
    $("#pAll", root).onclick = () => { const l = seats(); for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) { const k = key(l[i].id, l[j].id); if (!pairs.includes(k)) pairs.push(k); } build(); };
    $("#pClr", root).onclick = () => { pairs = []; build(); };
    $("#cSave", root).onclick = safe(async () => { await updateDoc(gRef(), { chat: { publicMode: c.publicMode, publicSeats: c.publicSeats, pairs } }); toast("Messaging permissions saved.", "ok"); closeModal(); });
  };
  openModal(""); build();
}

/* ---------------- reference ---------------- */
function referenceModal() {
  const n = seats().length, c = teamCounts(n);
  openModal(`<h2>📜 Trouble Brewing</h2>
    ${c ? `<p class="muted">${n} players: ${TEAMS.map((t, i) => `${c[i]} ${TEAM_LABEL[t]}`).join(" · ")}</p>` : ""}
    ${TEAMS.map(t => `<div class="teamhead ${isEvil(t) ? "evil" : "good"}">${TEAM_LABEL[t]}</div><div class="refgrid">${ROLES.filter(r => r.team === t).map(r => `<div class="refrow"><div class="mini ${teamClass(r)}">${r.icon}</div><div><b>${r.name}</b><p>${esc(r.ability)}</p></div></div>`).join("")}</div>`).join("")}
    <p class="fine">Ability summaries are short paraphrases. Use the official character sheet for exact wording.</p>`);
}

/* ---------------- menu ---------------- */
function menu() {
  const m = $("#menu");
  if (!m.hidden) { m.hidden = true; return; }
  const g = S.game, items = [];
  const it = (icon, label, fn, kbd = "") => items.push({ icon, label, fn, kbd });
  if (isGM()) {
    items.push("Session");
    it("🔗", "Copy join link", copyLink);
    it("👥", "Add players", addPlayersModal);
    it("📢", "Set announcement", () => { const t = prompt("Announcement shown in the centre:", g.announcement || ""); if (t !== null) safe(updateDoc)(gRef(), { announcement: t }); });
    items.push("Grimoire");
    it("👁", S.ui.grim ? "Hide Grimoire (screen-share safe)" : "Show Grimoire", toggleGrim, "G");
    it("🎲", "Deal random characters", safe(randomise));
    it("📨", "Send characters to players", safe(sendRoles));
    it("😈", "Demon bluffs", bluffsModal);
    it("🩸", "Send evil team info", safe(sendEvilInfo));
    items.push("Game");
    it("🌙", "Night order", nightOrderModal);
    it(g.phase === "night" ? "☀" : "☾", g.phase === "night" ? "Start day" : "Start night", safe(g.phase === "night" ? startDay : startNight));
    if (g.phase === "day") it("⚖", "New nomination", () => nominateModal());
    it("💬", "Messaging controls", chatControlModal);
    it("♻", "New game, same players", safe(resetGame));
    it("🗑", "Delete session", safe(deleteGame));
  } else {
    items.push("Player");
    it("🎭", "My character & info", myCharacterModal);
    it("📝", "My notes", notesModal);
  }
  items.push("Help");
  it("📜", "Character reference", referenceModal);
  it("🚪", "Leave session", () => { if (confirm("Leave this session on this device?")) leave(); });
  it("🔒", "Sign out", async () => { leave(); await signOut(auth); location.reload(); });
  m.innerHTML = items.map((x, i) => typeof x === "string" ? `<h4>${x}</h4>` : `<button data-i="${i}"><span>${x.icon}</span>${esc(x.label)}${x.kbd ? `<span class="kbd">${x.kbd}</span>` : ""}</button>`).join("");
  $$("[data-i]", m).forEach(b => (b.onclick = () => { m.hidden = true; items[b.dataset.i].fn(); }));
  m.hidden = false;
}
$("#menuBtn").onclick = e => { e.stopPropagation(); menu(); };
document.addEventListener("click", e => { if (!e.target.closest("#menu") && !e.target.closest("#menuBtn")) $("#menu").hidden = true; });

function toggleGrim() { S.ui.grim = !S.ui.grim; toast(S.ui.grim ? "Grimoire visible" : "Grimoire hidden – safe to screen-share"); render(); }
$("#grimBtn").onclick = toggleGrim;
document.addEventListener("keydown", e => { if (e.key.toLowerCase() === "g" && isGM() && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) toggleGrim(); });

async function copyLink() {
  const url = location.origin + location.pathname + "#" + S.code;
  try { await navigator.clipboard.writeText(url); toast("Join link copied: " + url, "ok"); } catch { prompt("Copy this join link:", url); }
}

async function resetGame() {
  if (!confirm("Start a new game with the same players and seats? Characters, deaths, votes and night actions will be cleared.")) return;
  const b = writeBatch(db);
  b.update(gRef(), { phase: "setup", day: 0, night: 0, awake: null, nomination: null, announcement: "A new game is about to begin.", seats: seats().map(s => ({ ...s, dead: false, ghost: true })) });
  b.set(dref("gm", "grimoire"), { roles: {}, bluffs: [] });
  Object.values(S.claims).forEach(u => b.set(dref("private", u), { role: null, inbox: [], dealtAt: Date.now() }));
  (await getDocs(cref("votes"))).forEach(d => b.delete(d.ref));
  (await getDocs(cref("actions"))).forEach(d => b.delete(d.ref));
  await b.commit(); toast("Ready for a new game.", "ok");
}

async function deleteGame() {
  if (!confirm("Delete this session permanently?")) return;
  await deleteDoc(gRef()); leave();
}

/* ---------------- dock ---------------- */
$("#refBtn").onclick = referenceModal;
$("#nightBtn").onclick = nightOrderModal;
$("#meBtn").onclick = myCharacterModal;
$("#notesBtn").onclick = notesModal;

boot();
