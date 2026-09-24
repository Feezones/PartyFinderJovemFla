// ============================================================
// Configuração do Firebase
// ============================================================
// 1. Acesse https://console.firebase.google.com
// 2. Crie um projeto (ex: "jovemfla-pt")
// 3. Vá em "Compilação" > "Firestore Database" > criar banco
//    (modo "produção", depois ajuste as regras — veja README.md)
// 4. Vá em "Configurações do projeto" > role até "Seus apps" >
//    clique no ícone Web (</>) > registre o app
// 5. Copie o objeto firebaseConfig gerado e cole abaixo, no
//    lugar dos valores "SUAS_..."
// ============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyBCM-xy_iijiTQg042L0ESygOJCBDBEN_M",
  authDomain: "jovemflapartyfinder.firebaseapp.com",
  projectId: "jovemflapartyfinder",
  storageBucket: "jovemflapartyfinder.firebasestorage.app",
  messagingSenderId: "260703816086",
  appId: "1:260703816086:web:b3ddb7013be343f092b5b7",
  measurementId: "G-KDY0HQ5G8N"
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "SUA_API_KEY" &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId !== "SEU_PROJECT_ID" &&
  firebaseConfig.appId &&
  firebaseConfig.appId !== "SUA_APP_ID"
);

if (!isFirebaseConfigured) {
  console.warn("Firebase config incompleta. Edite firebase-config.js com os valores do projeto real.");
}

// Lista de DGs da guild — edite livremente para bater com as
// dungeons que vocês realmente correm no DMO.
export const DG_LIST = [
  "EDG",
  "ZDG - Zhuqiaomon",
  "BDG - Baihumon",
  "QDG - Qinglongmon",
  "XDG - Xuanwumon",
  "Raid - Dark Masters",
  "Raid - Analogman",
  "Outra (avisar no chat)"
];
