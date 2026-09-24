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
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---------- Firebase ----------
let app;
let db;
let partiesRef;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  partiesRef = collection(db, "parties");
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
  { key: "tank", label: "Tank", css: "tank" },
  { key: "hitter1", label: "Hitter", css: "hitter" },
  { key: "hitter2", label: "Hitter", css: "hitter" },
  { key: "hitterSuporte", label: "Hitter / Suporte", css: "support" }
];

// ---------- DOM ----------
const nickInput = document.getElementById("nick");
const dgSelect = document.getElementById("dg-select");
const createBtn = document.getElementById("create-btn");
const grid = document.getElementById("pt-grid");
const emptyState = document.getElementById("empty-state");
const countEl = document.getElementById("pt-count");
const toast = document.getElementById("toast");
// adiciona com os outros DOM refs
// substitui a linha: const timeInput = document.getElementById("pt-time");
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
      longhand: ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"]
    },
    months: {
      shorthand: ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"],
      longhand: ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"]
    }
  },
  onChange: (dates) => {
    selectedDateTime = dates[0] ?? null;
  }
});

// ---------- Nickname persistence ----------
nickInput.value = localStorage.getItem("jovemfla_nick") || "";
nickInput.addEventListener("input", () => {
  localStorage.setItem("jovemfla_nick", nickInput.value.trim());
  syncCreateBtn();
});

function getNick() {
  return nickInput.value.trim();
}

function syncCreateBtn() {
  createBtn.disabled = getNick().length === 0;
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

// ---------- Join / leave (transaction — avoids two people grabbing the same slot) ----------
async function joinSlot(partyId, slotKey) {
  const nick = getNick();
  if (!nick) {
    showToast("Digite seu nick antes de entrar em uma PT.");
    return;
  }
  const ref = doc(db, "parties", partyId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("PT não existe mais.");
      const data = snap.data();

      // already in this party? move them instead of duplicating
      const alreadyKey = SLOT_DEFS.find((s) => data[s.key] === nick)?.key;
      if (alreadyKey && alreadyKey !== slotKey) {
        tx.update(ref, { [alreadyKey]: null });
      }

      if (data[slotKey]) throw new Error("Essa vaga acabou de ser preenchida.");
      tx.update(ref, { [slotKey]: nick });
    });
  } catch (err) {
    showToast(err.message || "Não foi possível entrar na vaga.");
  }
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

// ---------- Rendering ----------
function timeAgo(timestamp) {
  if (!timestamp) return "agora";
  const seconds = Math.floor((Date.now() - timestamp.toDate().getTime()) / 1000);
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h atrás`;
}

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
  ${data.scheduledTime ? `· ⏰ ${data.scheduledTime}` : ""}
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
      btn.addEventListener("click", () => joinSlot(id, def.key));
      row.appendChild(btn);
    }

    slotsWrap.appendChild(row);
  });

  card.appendChild(slotsWrap);
  return card;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- Realtime listener ----------
const q = query(partiesRef, orderBy("createdAt", "desc"));
onSnapshot(
  q,
  (snapshot) => {
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

// re-render periodically so "X min atrás" stays fresh
setInterval(() => {
  const active = document.querySelectorAll(".pt-meta");
  // cheap refresh: only re-triggers on next snapshot in practice;
  // full timestamp refresh happens automatically on any write.
}, 60000);
