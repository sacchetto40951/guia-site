/* =========================================================
   Guia da Aventura — Lógica do RPG
   - NPC narrativo com personalidade e memória contextual
   - 4 missões progressivas + finais (incluindo secreto)
   - Áudio procedural via Web Audio API (funciona offline)
   ========================================================= */

// ---------- ESTADO DO JOGO ----------
const state = {
  step: 0,                 // 0: nome | 1: classe | 2: caminho | 3: enigma | 4: confronto | 5: fim
  hero: { name: "", class: "" },
  choices: { path: "", riddle: false, finalAction: "", virtue: "" },
  level: 1,
  ending: "",
  audioOn: true,
  riddleAttempts: 0,
  busy: false,             // bloqueio enquanto o NPC fala
};

function setBusy(b) {
  state.busy = b;
  if (!dom.sendBtn) return;
  dom.sendBtn.disabled = b;
  dom.input.disabled = b;
  dom.suggestions.style.pointerEvents = b ? "none" : "auto";
  dom.suggestions.style.opacity = b ? "0.4" : "1";
}

// ---------- MISSÕES (TÍTULOS) ----------
const QUEST_TITLES = [
  "— A Convocação —",
  "— A Escolha do Destino —",
  "— A Bifurcação Sombria —",
  "— O Enigma do Guardião —",
  "— O Confronto Final —",
];

// ---------- REFERÊNCIAS DOM ----------
const $ = (id) => document.getElementById(id);
const dom = {
  introOverlay: $("introOverlay"),
  startBtn: $("startBtn"),
  audioToggle: $("audioToggle"),
  audioState: $("audioState"),
  app: $("app"),
  chat: $("chatWindow"),
  input: $("userInput"),
  sendBtn: $("sendBtn"),
  suggestions: $("suggestions"),
  heroName: $("heroName"),
  heroClass: $("heroClass"),
  questTitle: $("questTitle"),
  levelValue: $("levelValue"),
  xpFill: $("xpFill"),
  progressStep: $("progressStep"),
  endingOverlay: $("endingOverlay"),
  endingGlyph: $("endingGlyph"),
  endingTitle: $("endingTitle"),
  endingTag: $("endingTag"),
  endingBody: $("endingBody"),
  restartBtn: $("restartBtn"),
  emberField: $("emberField"),
};

// ===========================================================
//                      ÁUDIO PROCEDURAL
// (Web Audio API gera trilha ambiente + efeitos sem CDN)
// ===========================================================
const audio = {
  ctx: null,
  master: null,
  ambientNodes: [],
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = state.audioOn ? 0.35 : 0;
    this.master.connect(this.ctx.destination);
    this._buildAmbient();
  },
  _buildAmbient() {
    // Pad ambiente: duas oscilações em frequências baixas + filtro low-pass
    const freqs = [110, 164.81, 220]; // Lá grave + Mi + Lá agudo (acorde Am)
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i === 1 ? "triangle" : "sine";
      osc.frequency.value = f;

      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.08 + i * 0.04;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 1.8;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 600;
      filter.Q.value = 4;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.07;

      osc.connect(filter).connect(gain).connect(this.master);
      osc.start(); lfo.start();
      this.ambientNodes.push(osc, lfo);
    });
  },
  setOn(on) {
    state.audioOn = on;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.15);
  },
  // Efeitos sonoros curtos
  fx(type) {
    if (!this.ctx || !state.audioOn) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.value = 0; g.connect(this.master);

    if (type === "message") {
      const o = this.ctx.createOscillator();
      o.type = "sine"; o.frequency.setValueAtTime(820, t);
      o.frequency.exponentialRampToValueAtTime(1120, t + 0.08);
      g.gain.linearRampToValueAtTime(0.25, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); o.start(t); o.stop(t + 0.2);
    }
    if (type === "user") {
      const o = this.ctx.createOscillator();
      o.type = "triangle"; o.frequency.setValueAtTime(440, t);
      o.frequency.exponentialRampToValueAtTime(660, t + 0.07);
      g.gain.linearRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g); o.start(t); o.stop(t + 0.18);
    }
    if (type === "levelup") {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const o = this.ctx.createOscillator();
        o.type = "triangle";
        const tg = this.ctx.createGain();
        tg.gain.value = 0; tg.connect(this.master);
        o.frequency.value = f;
        tg.gain.linearRampToValueAtTime(0.22, t + i * 0.08 + 0.02);
        tg.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.35);
        o.connect(tg); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.4);
      });
    }
    if (type === "ending") {
      [261.63, 329.63, 392, 523.25, 659.25].forEach((f, i) => {
        const o = this.ctx.createOscillator();
        const tg = this.ctx.createGain();
        tg.gain.value = 0; tg.connect(this.master);
        o.type = "sine"; o.frequency.value = f;
        tg.gain.linearRampToValueAtTime(0.2, t + i * 0.15 + 0.05);
        tg.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.15 + 1.2);
        o.connect(tg); o.start(t + i * 0.15); o.stop(t + i * 0.15 + 1.3);
      });
    }
  },
};

// ===========================================================
//                  BRASAS FLUTUANTES (fundo)
// ===========================================================
function spawnEmbers() {
  const N = 26;
  for (let i = 0; i < N; i++) {
    const e = document.createElement("div");
    e.className = "ember";
    const size = 2 + Math.random() * 4;
    e.style.width = e.style.height = `${size}px`;
    e.style.left = `${Math.random() * 100}%`;
    e.style.animationDuration = `${10 + Math.random() * 14}s`;
    e.style.animationDelay = `${Math.random() * 10}s`;
    e.style.setProperty("--drift", `${(Math.random() * 80 - 40).toFixed(1)}px`);
    dom.emberField.appendChild(e);
  }
}

// ===========================================================
//                       MENSAGENS DO CHAT
// ===========================================================
function pushMessage({ who = "npc", text = "", typed = true }) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${who}`;
  wrap.setAttribute("data-testid", `msg-${who}`);

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.innerHTML = who === "npc"
    ? '<i class="fa-solid fa-hat-wizard"></i>'
    : who === "user"
      ? '<i class="fa-solid fa-user-shield"></i>'
      : '<i class="fa-solid fa-scroll"></i>';

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (who !== "sys") {
    const who_lbl = document.createElement("span");
    who_lbl.className = "who";
    who_lbl.textContent = who === "npc" ? "Eldwin, o Guia" : (state.hero.name || "Aventureiro");
    bubble.appendChild(who_lbl);
  }

  const body = document.createElement("div");
  body.className = "body";
  bubble.appendChild(body);
  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  dom.chat.appendChild(wrap);
  dom.chat.scrollTop = dom.chat.scrollHeight;

  audio.fx(who === "user" ? "user" : "message");

  if (typed && who === "npc") {
    return typeInto(body, text);
  } else {
    body.textContent = text;
    dom.chat.scrollTop = dom.chat.scrollHeight;
    return Promise.resolve();
  }
}

function pushTyping() {
  const wrap = document.createElement("div");
  wrap.className = "msg npc typing-msg";
  wrap.innerHTML = `
    <div class="avatar"><i class="fa-solid fa-hat-wizard"></i></div>
    <div class="bubble"><span class="who">Eldwin, o Guia</span>
      <div class="typing-dots"><span></span><span></span><span></span></div>
    </div>`;
  dom.chat.appendChild(wrap);
  dom.chat.scrollTop = dom.chat.scrollHeight;
  return wrap;
}

function typeInto(el, text) {
  return new Promise((resolve) => {
    let i = 0;
    el.textContent = "";
    const speed = 14;
    const id = setInterval(() => {
      el.textContent += text.charAt(i);
      i++;
      dom.chat.scrollTop = dom.chat.scrollHeight;
      if (i >= text.length) { clearInterval(id); resolve(); }
    }, speed);
  });
}

async function npcSay(text, delay = 500) {
  setBusy(true);
  const t = pushTyping();
  await wait(delay + Math.min(text.length * 6, 900));
  t.remove();
  await pushMessage({ who: "npc", text });
  setBusy(false);
  dom.input.focus();
}

function sysSay(text) {
  return pushMessage({ who: "sys", text, typed: false });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ===========================================================
//                       SUGESTÕES (CHIPS)
// ===========================================================
function showSuggestions(list) {
  dom.suggestions.innerHTML = "";
  list.forEach((label) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = label;
    b.setAttribute("data-testid", `chip-${label.toLowerCase().replace(/\s+/g, "-")}`);
    b.addEventListener("click", () => {
      dom.input.value = label;
      submit();
    });
    dom.suggestions.appendChild(b);
  });
  dom.suggestions.setAttribute("aria-hidden", "false");
}
function hideSuggestions() {
  dom.suggestions.innerHTML = "";
  dom.suggestions.setAttribute("aria-hidden", "true");
}

// ===========================================================
//                  ATUALIZAÇÃO DE HUD / PROGRESSO
// ===========================================================
function updateHUD() {
  dom.heroName.textContent = state.hero.name || "Aventureiro";
  dom.heroClass.textContent = state.hero.class || "Sem classe";
  dom.levelValue.textContent = state.level;
  dom.progressStep.textContent = Math.min(state.step, 4);
  dom.questTitle.textContent = QUEST_TITLES[Math.min(state.step, 4)];
  const pct = (Math.min(state.step, 4) / 4) * 100;
  dom.xpFill.style.width = `${pct}%`;
}

function levelUp() {
  state.level += 1;
  updateHUD();
  audio.fx("levelup");
  const f = document.createElement("div");
  f.className = "flash";
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 720);
}

// ===========================================================
//                  NPC: VARIAÇÃO E PERSONALIDADE
// (gerador de respostas com memória contextual)
// ===========================================================
const flavor = {
  greet: [
    "Aproxime-se, alma corajosa.",
    "As estrelas confirmam: tua chegada era esperada.",
    "Aceita meu cumprimento, viajante das brumas.",
  ],
  encourage: [
    "Excelente. O destino se curva diante de espíritos como o teu.",
    "Ah! Sinto a coragem pulsar em tuas palavras.",
    "Por Aetherion! Tua resposta ecoa nas runas antigas.",
  ],
  curious: [
    "Hmm... interessante. Conta-me mais.",
    "Tuas palavras carregam mais peso do que imaginas.",
    "O vento sussurra que há verdade em ti.",
  ],
  confused: [
    "Perdoa-me, aventureiro, minhas runas não traduziram bem isso.",
    "Tua mente vagueia por terras que minha sabedoria ainda não alcança.",
    "Hmm... mortais e seus enigmas. Tenta de outra forma?",
  ],
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ===========================================================
//                  PALAVRAS-CHAVE (parser leve)
// ===========================================================
function detect(text, words) {
  const t = " " + text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") + " ";
  return words.some((w) => t.includes(" " + w + " ") || t.includes(w));
}

// ===========================================================
//                  FLUXO PRINCIPAL DA NARRATIVA
// ===========================================================
async function startJourney() {
  dom.introOverlay.style.display = "none";
  dom.app.setAttribute("aria-hidden", "false");
  audio.init();
  state.step = 0;
  updateHUD();

  await npcSay(`${pick(flavor.greet)} Eu sou Eldwin, o Errante, último dos guias da Era Velada. As lendas te trouxeram até esta clareira por uma razão.`, 250);
  await wait(400);
  await npcSay("Antes de tudo... como devo te chamar, viajante? Diga teu nome.", 250);
}

async function handleStep(text) {
  switch (state.step) {
    case 0: return askName(text);
    case 1: return askClass(text);
    case 2: return askPath(text);
    case 3: return askRiddle(text);
    case 4: return finalConfrontation(text);
    case 5: return await npcSay("Tua jornada já se cumpriu. Recomeça-a, se assim desejares.");
  }
}

// ----- MISSÃO 1.A: NOME -----
async function askName(text) {
  const clean = text.trim().replace(/[^\p{L}\p{N}\s'-]/gu, "").slice(0, 24);
  if (!clean || clean.length < 2) {
    await npcSay("Curioso... um nome muito breve. Tenta novamente, com mais alma.");
    return;
  }
  state.hero.name = clean;
  updateHUD();
  state.step = 1;
  updateHUD();
  await npcSay(`${clean}! Que nome com peso de lenda. Há séculos não ouvia um som assim.`);
  await wait(300);
  await npcSay("Agora, escolhe tua essência — toda alma carrega um caminho ancestral. O que pulsa em ti?");
  showSuggestions(["Guerreiro", "Mago", "Ladino", "Bardo"]);
}

// ----- MISSÃO 1.B: CLASSE -----
async function askClass(text) {
  const t = text.toLowerCase();
  let cls = "";
  if (detect(t, ["guerreiro", "espada", "espadachim", "lutador", "guerra"])) cls = "Guerreiro";
  else if (detect(t, ["mago", "magia", "feiticeiro", "feitico", "magico", "bruxo"])) cls = "Mago";
  else if (detect(t, ["ladino", "ladrao", "furtivo", "assassino", "espia", "punhal"])) cls = "Ladino";
  else if (detect(t, ["bardo", "bardo", "musico", "cancao", "musica", "poeta"])) cls = "Bardo";

  if (!cls) {
    await npcSay(`${pick(flavor.confused)} Escolhe entre Guerreiro, Mago, Ladino ou Bardo, ${state.hero.name}.`);
    showSuggestions(["Guerreiro", "Mago", "Ladino", "Bardo"]);
    return;
  }

  state.hero.class = cls;
  updateHUD();
  state.step = 2;
  hideSuggestions();
  levelUp();

  const intros = {
    "Guerreiro": "Tua lâmina ainda não foi forjada, mas teu coração já é de aço.",
    "Mago": "Há fagulhas arcanas dançando ao redor de teus dedos. Sinto-as.",
    "Ladino": "Andas como sombra sobre folhas secas. Útil, em tempos como estes.",
    "Bardo": "Ah! Uma alma que carrega canções antigas. O mundo precisa de mais como tu."
  };
  await npcSay(`${cls}, então. ${intros[cls]}`);
  await wait(350);
  updateHUD();
  await sysSay("Missão concluída: A Escolha do Destino");
  await wait(250);
  await npcSay("Adiante, três caminhos se abrem sob a Lua Partida. Cada um esconde verdades — e perigos. Onde tua alma deseja pisar?");
  showSuggestions(["Floresta dos Sussurros", "Ruínas Esquecidas", "Pico Congelado"]);
}

// ----- MISSÃO 2: BIFURCAÇÃO -----
async function askPath(text) {
  const t = text.toLowerCase();
  let p = "";
  if (detect(t, ["floresta", "sussurro", "arvore", "mata", "bosque"])) p = "Floresta dos Sussurros";
  else if (detect(t, ["ruina", "ruinas", "esquecida", "templo", "antigo", "ruina"])) p = "Ruínas Esquecidas";
  else if (detect(t, ["pico", "montanha", "congelado", "neve", "gelo", "frio"])) p = "Pico Congelado";

  if (!p) {
    await npcSay(`${pick(flavor.confused)} Os três caminhos aguardam: Floresta dos Sussurros, Ruínas Esquecidas ou Pico Congelado.`);
    showSuggestions(["Floresta dos Sussurros", "Ruínas Esquecidas", "Pico Congelado"]);
    return;
  }

  state.choices.path = p;
  state.step = 3;
  hideSuggestions();
  levelUp();

  const narr = {
    "Floresta dos Sussurros": "As árvores se inclinam ao teu passo, como se reconhecessem teu nome. Folhas douradas caem sem vento.",
    "Ruínas Esquecidas": "Pedras gravadas com runas extintas pulsam fracamente. Algo vive — ou viveu — entre estes muros.",
    "Pico Congelado": "O ar corta como vidro. Cada respiração ecoa como uma promessa proibida.",
  };
  await npcSay(`${pick(flavor.encourage)} Escolheste ${p}. ${narr[p]}`);
  await wait(450);
  updateHUD();
  await sysSay("Missão concluída: A Bifurcação Sombria");
  await wait(250);
  await npcSay("Mas algo bloqueia teu caminho: um guardião de pedra com olhos de safira desperta. Ele apenas te deixará passar... se decifrares seu enigma:");
  await wait(500);
  await npcSay("\"Quanto mais dela tu tens, menos dela tu vês. Tem voz, mas não fala. Caminha contigo, mas não te toca. O que sou eu?\"");
  showSuggestions(["A escuridão", "O silêncio", "O tempo", "Não sei..."]);
}

// ----- MISSÃO 3: ENIGMA -----
async function askRiddle(text) {
  const t = text.toLowerCase();
  state.riddleAttempts += 1;
  const correct = detect(t, ["escuridao", "trevas", "noite", "sombra", "escuridão"]);

  if (correct) {
    state.choices.riddle = true;
    state.step = 4;
    hideSuggestions();
    levelUp();
    await npcSay("A escuridão... sim! Quanto mais dela há, menos enxergas, mas ela ainda caminha contigo. As safiras do guardião se apagam. A passagem se abre.");
    await wait(400);
    await sysSay("Missão concluída: O Enigma do Guardião");
    return promptFinal();
  }

  if (state.riddleAttempts >= 3) {
    state.choices.riddle = false;
    state.step = 4;
    hideSuggestions();
    levelUp();
    await npcSay("Não importa, aventureiro. O guardião sente teu esforço — mais sincero que muitos sábios — e te deixa passar. \"A escuridão\" era a resposta, mas a coragem também é uma chave.");
    await wait(400);
    await sysSay("Missão concluída: O Enigma do Guardião (com lições)");
    return promptFinal();
  }

  await npcSay(`${pick(flavor.curious)} Mas não é essa a resposta. Pensa: invisível e sempre presente.`);
}

async function promptFinal() {
  await wait(350);
  await npcSay("Adiante, no centro da câmara, um dragão de obsidiana e ouro te aguarda. Os olhos dele... não são os de uma fera. São cansados. Antigos. O que farás?");
  showSuggestions(["Lutar", "Conversar", "Fugir", "Oferecer algo"]);
}

// ----- MISSÃO 4: CONFRONTO FINAL -----
async function finalConfrontation(text) {
  const t = text.toLowerCase();
  let action = "";
  if (detect(t, ["lutar", "atacar", "luta", "guerra", "espada", "matar"])) action = "lutar";
  else if (detect(t, ["conversar", "falar", "conversa", "dialogar", "negociar", "perguntar"])) action = "conversar";
  else if (detect(t, ["fugir", "correr", "escapar", "ir embora", "desistir"])) action = "fugir";
  else if (detect(t, ["oferecer", "dar", "presente", "entregar", "ofertar"])) action = "oferecer";
  // Heurísticas extras: virtude
  if (detect(t, ["amizade", "amor", "compaixao", "compaixão", "ajudar", "perdao", "perdão", "paz"])) {
    state.choices.virtue = "compassion";
    action = action || "conversar";
  }

  if (!action) {
    await npcSay(`${pick(flavor.confused)} Lutar, conversar, fugir ou oferecer algo?`);
    showSuggestions(["Lutar", "Conversar", "Fugir", "Oferecer algo"]);
    return;
  }

  state.choices.finalAction = action;
  state.step = 5;
  hideSuggestions();
  levelUp();

  // Determina o final
  await wait(350);
  const ending = decideEnding();
  state.ending = ending.key;
  await npcSay(ending.preface);
  await wait(800);
  showEnding(ending);
}

// ===========================================================
//                       LÓGICA DOS FINAIS
// ===========================================================
function decideEnding() {
  const { class: cls } = state.hero;
  const { path, riddle, finalAction, virtue } = state.choices;

  // SECRETO: Bardo + Floresta + virtude (compaixão) + conversar/oferecer + enigma correto
  if (
    cls === "Bardo" &&
    path === "Floresta dos Sussurros" &&
    (virtue === "compassion" || ["conversar", "oferecer"].includes(finalAction)) &&
    riddle
  ) {
    return {
      key: "secret",
      tag: "Final Secreto",
      icon: "fa-solid fa-music",
      title: "A Canção que Curou o Dragão",
      preface: "Tua voz se ergue... e o dragão chora lágrimas de ouro.",
      body: `Em vez de armas, ${state.hero.name} ofereceu uma canção. O dragão de obsidiana — outrora um rei amaldiçoado — desperta como humano novamente. Diz-se que, nas noites de Lua Partida, ainda se ouve teu nome ecoando pelos sussurros da floresta. Tu não derrotaste o mal; tu o lembraste de quem era.`
    };
  }

  if (finalAction === "lutar") {
    return {
      key: "warrior",
      tag: "Final do Bravo",
      icon: "fa-solid fa-khanda",
      title: "A Lâmina que Selou o Trono",
      preface: "Aço encontra escama. Faíscas dançam como estrelas caídas.",
      body: `${state.hero.name}, o(a) ${cls}, enfrentou o dragão com bravura indomável. A vitória custou um preço — mas o reino respira em paz. Bardos cantarão teu nome enquanto houver vento para carregá-lo.`
    };
  }
  if (finalAction === "conversar") {
    return {
      key: "diplomat",
      tag: "Final do Sábio",
      icon: "fa-solid fa-feather",
      title: "O Pacto sob a Lua Partida",
      preface: "Palavras, quando verdadeiras, cortam mais fundo que lâminas.",
      body: `${state.hero.name} ouviu o dragão. Descobriu que ele guardava o caminho não por crueldade, mas por luto. Um pacto foi selado — e o reino ganhou um aliado milenar. Há sabedoria, aventureiro(a), em escutar antes de ferir.`
    };
  }
  if (finalAction === "oferecer") {
    return {
      key: "giver",
      tag: "Final da Dádiva",
      icon: "fa-solid fa-gift",
      title: "A Oferenda do Coração",
      preface: "Generosidade é uma magia que poucos compreendem.",
      body: `${state.hero.name} ofereceu algo precioso — não ouro, mas uma parte de si. O dragão aceitou em silêncio, e desapareceu nas brumas. Diz-se que ele te observa, agora, do outro lado dos sonhos. Tens um guardião eterno.`
    };
  }
  // fugir
  return {
    key: "escape",
    tag: "Final do Estrategista",
    icon: "fa-solid fa-wind",
    title: "O Vento que Sopra Outro Dia",
    preface: "Recuar não é covardia — é saber que a história continua.",
    body: `${state.hero.name} escolheu viver para lutar em outra hora. Voltarás mais forte, mais sábio(a), com novas escolhas no horizonte. Esta crônica é apenas um capítulo.`
  };
}

function showEnding(e) {
  audio.fx("ending");
  dom.endingGlyph.innerHTML = `<i class="${e.icon}"></i>`;
  dom.endingTag.textContent = e.tag;
  dom.endingTitle.textContent = e.title;
  dom.endingBody.textContent = e.body;
  dom.endingOverlay.classList.remove("hidden");
}

// ===========================================================
//                       ENVIO DE MENSAGEM
// ===========================================================
async function submit() {
  if (state.busy) return;
  const text = dom.input.value.trim();
  if (!text) return;
  dom.input.value = "";
  hideSuggestions();
  await pushMessage({ who: "user", text, typed: false });
  await wait(200);
  await handleStep(text);
}

// ===========================================================
//                       EVENTOS
// ===========================================================
dom.startBtn.addEventListener("click", startJourney);
dom.sendBtn.addEventListener("click", submit);
dom.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); submit(); }
});
dom.audioToggle.addEventListener("click", () => {
  audio.setOn(!state.audioOn);
  dom.audioState.textContent = state.audioOn ? "Ligado" : "Mudo";
  audio.init();
});
dom.restartBtn.addEventListener("click", () => location.reload());

// Inicialização
spawnEmbers();
updateHUD();
