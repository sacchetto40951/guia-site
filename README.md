# Guia da Aventura — Chatbot RPG

Site funcional single-page em **HTML, CSS e JavaScript puro** (sem frameworks de build).
Roda apenas abrindo o `index.html` no navegador.

## Como rodar
Basta dar **duplo clique em `index.html`** (ou abrir com seu navegador favorito).
Não precisa de servidor, build tools, npm, nada.

## Estrutura
```
rpg-chatbot/
├── index.html   # Estrutura + intro/ending modals
├── style.css    # Tema dark fantasy + animações + responsivo
└── script.js    # Lógica do RPG + áudio procedural
```

## Recursos
- 🎭 NPC "Eldwin, o Guia" com personalidade narrativa
- ⚔️ Sistema de 4 missões com barra de progresso e níveis
- 🎶 Música ambiente + efeitos sonoros (gerados via Web Audio API, 100% offline)
- 🌒 Tema dark fantasy com glassmorphism, fontes épicas e brasas animadas
- 📱 Design responsivo (funciona em celular)
- 🔮 5 finais diferentes — incluindo **um final secreto** baseado em combinação de escolhas

### Dica para encontrar o final secreto
Tente: classe **Bardo** + caminho **Floresta dos Sussurros** + enigma respondido corretamente + escolher **Conversar** ou **Oferecer** no confronto final. 🎵

## Customização rápida
- Cores: ajuste as variáveis CSS em `:root` (style.css)
- Narrativa: edite os textos nas funções `askName`, `askClass`, `askPath`, `askRiddle`, `finalConfrontation` (script.js)
- Volume da música: ajuste `this.master.gain.value` em `audio.init()` (script.js)

## Bibliotecas externas (via CDN)
- Google Fonts: Cinzel Decorative, Cormorant Garamond, Space Mono
- Font Awesome 6 (ícones)

Tudo o resto é puramente vanilla. ✨
