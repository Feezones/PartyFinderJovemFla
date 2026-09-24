import { firebaseConfig, DG_LIST } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  runTransaction,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---------- Firebase ----------
let app, db, partiesRef, chatsRef;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  partiesRef = collection(db, "parties");
  chatsRef = collection(db, "chats");
  window.jovemFlaFirebase = { app, db, config: firebaseConfig };
  console.info("Firebase inicializado com sucesso para o projeto:", firebaseConfig.projectId);
} catch (err) {
  console.error("Erro ao inicializar o Firebase:", err);
  showToast("Firebase não inicializou — confira firebase-config.js");
}

if (!db || !partiesRef) {
  console.warn("Firestore não foi inicializado. A aplicação continuará sem sincronização.");
}

// ---------- Slot / role definitions ----------
const SLOT_DEFS = [
  { key: "tank",         label: "Tank",           css: "tank"    },
  { key: "hitter1",     label: "Hitter",          css: "hitter"  },
  { key: "hitter2",     label: "Hitter",          css: "hitter"  },
  { key: "hitterSuporte", label: "Hitter / Suporte", css: "support" }
];

// ---------- DOM ----------
const nickInput  = document.getElementById("nick");
const dgSelect   = document.getElementById("dg-select");
const createBtn  = document.getElementById("create-btn");
const grid       = document.getElementById("pt-grid");
const emptyState = document.getElementById("empty-state");
const countEl    = document.getElementById("pt-count");
const toast      = document.getElementById("toast");
const partySwitchModal = document.getElementById("party-switch-modal");
const partySwitchMessage = document.getElementById("party-switch-message");
const partySwitchCancel = document.getElementById("party-switch-cancel");
const partySwitchConfirm = document.getElementById("party-switch-confirm");
const activeParties = new Map();
let resolvePartySwitch = null;

// ---------- Flatpickr ----------
let selectedDateTime = null;

flatpickr("#pt-time", {
  enableTime: true,
  dateFormat: "d/m/Y H:i",
  time_24hr: true,
  minDate: "today",
  locale: {
    firstDayOfWeek: 0,
    weekdays: {
      shorthand: ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"],
      longhand:  ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"]
    },
    months: {
      shorthand: ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"],
      longhand:  ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"]
    }
  },
  onChange: (dates) => {
    selectedDateTime = dates[0] ?? null;
    syncCreateBtn();
  }
});

// ---------- Nickname persistence ----------
nickInput.value = localStorage.getItem("jovemfla_nick") || "";
nickInput.addEventListener("input", () => {
  localStorage.setItem("jovemfla_nick", nickInput.value.trim());
  syncCreateBtn();
  syncChatSend();
});

function getNick() {
  return nickInput.value.trim();
}

function syncCreateBtn() {
  const nick = getNick();
  const currentParty = findBlockingPartyForNew(nick);
  createBtn.disabled = nick.length === 0 || Boolean(currentParty);
  createBtn.title = currentParty
    ? "Escolha um horário com pelo menos 1 hora de diferença da sua PT atual."
    : "";
}
syncCreateBtn();

// ---------- Populate DG select ----------
DG_LIST.forEach((dg) => {
  const opt = document.createElement("option");
  opt.value = dg;
  opt.textContent = dg;
  dgSelect.appendChild(opt);
});

// ---------- Toast ----------
let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

// ---------- Create party ----------
createBtn.addEventListener("click", async () => {
  const nick = getNick();
  if (!nick) return;
  const currentParty = findBlockingPartyForNew(nick);
  if (currentParty) {
    showToast("Escolha um horário com pelo menos 1 hora de diferença.");
    return;
  }
  createBtn.disabled = true;
  try {
    await addDoc(partiesRef, {
      dg: dgSelect.value,
      createdBy: nick,
      createdAt: serverTimestamp(),
      scheduledTime: selectedDateTime ? selectedDateTime.toISOString() : null,
      tank: null,
      hitter1: null,
      hitter2: null,
      hitterSuporte: null
    });
    showToast("PT criada!");
  } catch (err) {
    console.error(err);
    showToast("Erro ao criar PT — veja o console.");
  } finally {
    syncCreateBtn();
  }
});

// ---------- Join / leave ----------
function getPartiesForNick(nick) {
  if (!nick) return [];
  return [...activeParties].reduce((parties, [id, data]) => {
    if (SLOT_DEFS.some((slot) => data[slot.key] === nick)) {
      parties.push({ id, data });
    }
    return parties;
  }, []);
}

function getPartyTime(data) {
  if (!data?.scheduledTime) return null;
  const time = new Date(data.scheduledTime).getTime();
  return Number.isNaN(time) ? null : time;
}

function canOverlapParties(firstParty, secondParty) {
  const firstTime = getPartyTime(firstParty);
  const secondTime = getPartyTime(secondParty);
  return firstTime !== null && secondTime !== null &&
    Math.abs(firstTime - secondTime) >= 60 * 60 * 1000;
}

function findBlockingPartyForNew(nick) {
  const newParty = { scheduledTime: selectedDateTime?.toISOString() ?? null };
  return getPartiesForNick(nick).find(({ data }) => !canOverlapParties(data, newParty)) || null;
}

function findPartyForNick(nick) {
  if (!nick) return null;
  return getPartiesForNick(nick)[0] || null;
}

function confirmPartySwitch(currentParty, targetParty) {
  return new Promise((resolve) => {
    resolvePartySwitch = resolve;
    partySwitchMessage.textContent = `Você já está em "${currentParty.data.dg}". Deseja sair e entrar em "${targetParty}"?`;
    partySwitchModal.hidden = false;
    partySwitchConfirm.focus();
  });
}

function finishPartySwitch(confirmed) {
  partySwitchModal.hidden = true;
  const resolve = resolvePartySwitch;
  resolvePartySwitch = null;
  if (resolve) resolve(confirmed);
}

partySwitchModal.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button === partySwitchCancel) finishPartySwitch(false);
  if (button === partySwitchConfirm) finishPartySwitch(true);
  if (event.target === partySwitchModal) finishPartySwitch(false);
});
partySwitchModal.addEventListener("keydown", (event) => {
  if (event.key === "Escape") finishPartySwitch(false);
});

async function joinSlot(partyId, slotKey, conflictingParties = []) {
  const nick = getNick();
  if (!nick) {
    showToast("Digite seu nick antes de entrar em uma PT.");
    return;
  }
  const targetRef = doc(db, "parties", partyId);
  const currentRefs = conflictingParties.map((party) => doc(db, "parties", party.id));
  try {
    await runTransaction(db, async (tx) => {
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists()) throw new Error("PT não existe mais.");
      const targetData = targetSnap.data();

      if (targetData[slotKey] === nick) return;
      if (targetData[slotKey]) throw new Error("Essa vaga acabou de ser preenchida.");

      const currentSlotInSamePt = SLOT_DEFS.find((slot) => targetData[slot.key] === nick)?.key;
      if (currentSlotInSamePt && currentSlotInSamePt !== slotKey) {
        tx.update(targetRef, { [currentSlotInSamePt]: null });
      }

      for (let index = 0; index < currentRefs.length; index += 1) {
        const currentSnap = await tx.get(currentRefs[index]);
        if (currentSnap.exists()) {
          const updates = {};
          SLOT_DEFS.forEach((slot) => {
            if (currentSnap.data()[slot.key] === nick) updates[slot.key] = null;
          });
          if (Object.keys(updates).length) tx.update(currentRefs[index], updates);
        }
      }
      tx.update(targetRef, { [slotKey]: nick });
    });
    syncCreateBtn();
  } catch (err) {
    showToast(err.message || "Não foi possível entrar na vaga.");
  }
}

async function requestJoinSlot(partyId, slotKey, targetParty) {
  const currentParties = getPartiesForNick(getNick()).filter((party) => party.id !== partyId);
  const targetData = activeParties.get(partyId);
  const conflictingParties = currentParties.filter(
    (party) => !targetData || !canOverlapParties(party.data, targetData)
  );

  if (conflictingParties.length) {
    const confirmed = await confirmPartySwitch(conflictingParties[0], targetParty);
    if (!confirmed) return;
  }
  await joinSlot(partyId, slotKey, conflictingParties);
}

async function leaveSlot(partyId, slotKey) {
  const ref = doc(db, "parties", partyId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      tx.update(ref, { [slotKey]: null });
    });
  } catch (err) {
    showToast("Não foi possível sair da vaga.");
  }
}

async function closeParty(partyId) {
  if (!confirm("Fechar esta PT para todo mundo?")) return;
  try {
    await deleteDoc(doc(db, "parties", partyId));
  } catch (err) {
    showToast("Não foi possível fechar a PT.");
  }
}

// ---------- Helpers ----------
function timeAgo(timestamp) {
  if (!timestamp) return "agora";
  const seconds = Math.floor((Date.now() - timestamp.toDate().getTime()) / 1000);
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h atrás`;
}

function formatScheduled(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- Render party card ----------
function renderParty(id, data) {
  const nick = getNick();
  const card = document.createElement("div");
  card.className = "pt-card";

  const head = document.createElement("div");
  head.className = "pt-head";
  head.innerHTML = `
    <div>
      <div class="dg-name">${escapeHtml(data.dg)}</div>
      <div class="pt-meta">
        host: ${escapeHtml(data.createdBy)}
        ${data.scheduledTime ? `· ⏰ ${formatScheduled(data.scheduledTime)}` : ""}
        · ${timeAgo(data.createdAt)}
      </div>
    </div>
  `;

  if (nick === data.createdBy) {
    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.textContent = "Fechar PT";
    closeBtn.addEventListener("click", () => closeParty(id));
    head.appendChild(closeBtn);
  }

  card.appendChild(head);

  const slotsWrap = document.createElement("div");
  slotsWrap.className = "slots";

  SLOT_DEFS.forEach((def) => {
    const row = document.createElement("div");
    row.className = "slot-row";

    const tag = document.createElement("span");
    tag.className = `role-tag ${def.css}`;
    tag.textContent = def.label;
    row.appendChild(tag);

    const occupant = data[def.key];
    const nameEl = document.createElement("span");
    nameEl.className = "slot-name" + (occupant ? "" : " vago");
    nameEl.textContent = occupant || "Vago";
    row.appendChild(nameEl);

    if (occupant === nick) {
      const btn = document.createElement("button");
      btn.className = "slot-btn leave";
      btn.textContent = "Sair";
      btn.addEventListener("click", () => leaveSlot(id, def.key));
      row.appendChild(btn);
    } else if (!occupant) {
      const btn = document.createElement("button");
      btn.className = "slot-btn";
      btn.textContent = "Entrar";
      btn.addEventListener("click", () => requestJoinSlot(id, def.key, data.dg));
      row.appendChild(btn);
    }

    slotsWrap.appendChild(row);
  });

  card.appendChild(slotsWrap);
  return card;
}

// ---------- Realtime listener — parties ----------
if (partiesRef) {
  const q = query(partiesRef, orderBy("createdAt", "desc"));
  onSnapshot(
    q,
    (snapshot) => {
      activeParties.clear();
      snapshot.forEach((docSnap) => activeParties.set(docSnap.id, docSnap.data()));
      syncCreateBtn();
      grid.innerHTML = "";
      countEl.textContent = snapshot.size;
      if (snapshot.empty) {
        emptyState.style.display = "block";
        return;
      }
      emptyState.style.display = "none";
      snapshot.forEach((docSnap) => {
        grid.appendChild(renderParty(docSnap.id, docSnap.data()));
      });
    },
    (err) => {
      console.error("Firestore connection error:", err);
      showToast("Erro ao conectar no Firestore — verifique o projeto, as regras e a config do Firebase.");
    }
  );
}

setInterval(() => {}, 60000);

// ── Chat ─────────────────────────────────────────────────────────

const chatInput    = document.getElementById("chat-input");
const chatSend     = document.getElementById("chat-send");
const chatMessages = document.getElementById("chat-messages");
const chatEmpty    = document.getElementById("chat-empty");
const msgCount     = document.getElementById("msg-count");
const chatToggle   = document.getElementById("chat-toggle");
const chatWrap     = document.querySelector(".chat-wrap");

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function renderChat(msgs) {
  const atBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 60;

  chatMessages.innerHTML = "";
  chatMessages.appendChild(chatEmpty);
  chatEmpty.style.display = msgs.length ? "none" : "flex";
  msgCount.textContent = `${msgs.length} msgs`;

  let lastNick = null;
  let lastTs   = null;

  msgs.forEach((m) => {
    if (lastTs && m.ts - lastTs > 10 * 60 * 1000) {
      const sep = document.createElement("div");
      sep.className = "msg-system";
      sep.textContent = formatTime(m.ts);
      chatMessages.appendChild(sep);
      lastNick = null;
    }

    const grouped = m.nick === lastNick;
    const isSelf  = m.nick === getNick();
    const div = document.createElement("div");
    div.className = "msg" + (grouped ? " grouped" : "");
    div.innerHTML = `
      <div class="msg-meta">
        <span class="msg-nick${isSelf ? " self" : ""}">${escapeHtml(m.nick)}</span>
        <span class="msg-time">${formatTime(m.ts)}</span>
      </div>
      <div class="msg-text">${escapeHtml(m.text)}</div>
    `;
    chatMessages.appendChild(div);
    lastNick = m.nick;
    lastTs   = m.ts;
  });

  if (atBottom) chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Realtime listener — chat
if (chatsRef) {
  const qChat = query(chatsRef, orderBy("createdAt", "asc"), limit(100));
  onSnapshot(
    qChat,
    (snap) => {
      const msgs = snap.docs.map((d) => ({
        nick: d.data().nick,
        text: d.data().text,
        ts:   d.data().createdAt?.toDate().getTime() ?? Date.now()
      }));
      renderChat(msgs);
    },
    (err) => {
      console.error("Chat Firestore connection error:", err);
      showToast("Não foi possível carregar o chat — verifique as regras do Firebase.");
    }
  );
} else {
  renderChat([]);
}

// Envio
async function sendChatMessage() {
  const text = chatInput.value.trim();
  const nick = getNick();
  if (!text || !nick) return;
  chatSend.disabled = true;
  try {
    await addDoc(chatsRef, { nick, text, createdAt: serverTimestamp() });
    chatInput.value = "";
    chatInput.style.height = "auto";
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err);
    if (err.code === "permission-denied") {
      showToast("Chat bloqueado pelas regras do Firestore.");
    } else if (!chatsRef) {
      showToast("Chat indisponível: Firebase não inicializou.");
    } else {
      showToast("Erro ao enviar mensagem — veja o console.");
    }
  } finally {
    syncChatSend();
  }
}

function syncChatSend() {
  chatSend.disabled = chatInput.value.trim().length === 0 || getNick().length === 0;
}

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + "px";
  syncChatSend();
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!chatSend.disabled) sendChatMessage();
  }
});

chatSend.addEventListener("click", sendChatMessage);

chatToggle.addEventListener("click", () => {
  const isCollapsed = chatWrap.classList.toggle("collapsed");
  chatToggle.textContent = isCollapsed ? "chat" : "−";
  chatToggle.setAttribute("aria-label", isCollapsed ? "Expandir chat" : "Minimizar chat");
  chatToggle.title = isCollapsed ? "Expandir chat" : "Minimizar chat";
  if (!isCollapsed) chatMessages.scrollTop = chatMessages.scrollHeight;
});