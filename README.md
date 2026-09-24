# JovemFla — Terminal de PT (Digimon Masters Online)

Sistema simples de montagem de PT para a guild, com **múltiplas PTs
simultâneas**, sincronizado em tempo real via Firebase Firestore.
Qualquer pessoa que abrir a página vê e mexe nas mesmas PTs.

## Arquivos

- `index.html` — a página
- `style.css` — visual
- `app.js` — lógica (criar/entrar/sair/fechar PT), tempo real via Firestore
- `firebase-config.js` — **você precisa editar este arquivo** com as
  credenciais do seu projeto Firebase e a lista de DGs da guild

## Passo a passo (uns 10 minutos)

### 1. Criar o projeto Firebase
1. Acesse https://console.firebase.google.com e crie um projeto (ex: `jovemfla-pt`).
2. No menu lateral, vá em **Compilação > Firestore Database** e clique em
   "Criar banco de dados". Escolha uma região próxima (ex: `southamerica-east1`)
   e comece em modo produção.
3. Ainda no console, vá em **Configurações do projeto** (ícone de engrenagem) >
   role até "Seus apps" > clique no ícone **Web `</>`** > registre um app
   (não precisa do Firebase Hosting nesse passo, pode desmarcar).
4. O console mostra um objeto `firebaseConfig`. Copie os valores para dentro
   de `firebase-config.js`, substituindo os campos `SUA_...`.

### 2. Ajustar as regras do Firestore
Por padrão, o modo produção bloqueia tudo. Como não há login de usuário aqui
(é só um nick digitado), a forma mais simples é liberar leitura/escrita só na
coleção `parties`. Em **Firestore Database > Regras**, use algo como:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /parties/{partyId} {
      allow read, write: if true;
    }
  }
}
```

Isso é adequado para um sistema interno de guild sem dados sensíveis. Se
quiser mais segurança (ex: só quem tem o link acessa), dá para adicionar
Firebase Authentication anônima depois — me avise se quiser essa versão.

### 3. Editar a lista de DGs
Abra `firebase-config.js` e edite o array `DG_LIST` com os nomes reais das
dungeons que vocês usam (os que coloquei são só exemplos/genéricos).

### 4. Testar localmente
Como o app usa `import`/`type="module"`, não dá pra abrir o `index.html`
direto com duplo clique (o navegador bloqueia `file://` para módulos). Rode
um servidor local simples, por exemplo:

```
cd pasta-do-projeto
python3 -m http.server 8080
```

Depois abra `http://localhost:8080`.

### 5. Publicar para a guild usar
Opções fáceis e gratuitas:
- **Firebase Hosting** (mais integrado, já que vocês já têm o projeto):
  `npm install -g firebase-tools`, depois `firebase login`,
  `firebase init hosting` (aponte para esta pasta) e `firebase deploy`.
- **GitHub Pages**: suba os 4 arquivos num repositório e ative Pages nas
  configurações do repo.
- **Netlify/Vercel**: arraste a pasta no painel deles.

Qualquer uma dessas gera um link único que você compartilha no chat da
guild.

## Como funciona

- Cada PT tem 4 vagas fixas: **Tank**, **Hitter**, **Hitter**,
  **Hitter / Suporte**.
- Qualquer pessoa digita um nick (fica salvo no navegador dela) e pode criar
  quantas PTs quiser, para DGs diferentes, ao mesmo tempo.
- Entrar numa vaga move automaticamente a pessoa se ela já estava em outra
  vaga da mesma PT (evita duplicar em duas vagas).
- O criador da PT tem um botão "Fechar PT" que remove a sala para todo
  mundo.
- Tudo é sincronizado via `onSnapshot` do Firestore — não precisa dar
  refresh na página.

## Possíveis melhorias futuras
- Login (Firebase Auth) para não deixar qualquer nick tomar a vaga de outra pessoa.
- Fechar PT automaticamente quando fica vazia por X minutos.
- Notificação sonora quando uma PT que te interessa abre uma DG específica.
