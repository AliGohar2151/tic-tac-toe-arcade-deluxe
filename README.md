# 🎮 Tic-Tac-Toe Arcade Deluxe

An electrifying, feature-rich modern overhaul of the classic Tic-Tac-Toe game built with vanilla HTML5, CSS3, and modern JavaScript. Packed with dynamic game modes, offline Web Audio synthesis, particle celebrations, animated SVG strike lines, customizable battle marks, and an unbeatable Minimax AI.

---

## 🌟 Key Features

### 🕹️ 3 Thrilling Game Modes
1. **🎯 Classic Mode:** The timeless 3x3 grid battle.
2. **👻 Ghost / Infinity Mode (No Draws!):** Each player can maintain at most **3 marks** on the board. When you place a 4th mark, your oldest mark vanishes! Pulsing visual cues warn you before your oldest piece disappears.
3. **⏱️ Blitz Mode:** High-speed 5-second countdown timer per turn with audio ticking and automated move triggers when time runs out.

### 🤖 Smart & Unbeatable AI
* **🟢 Chill (Easy):** Casual, randomized play for beginners.
* **🟡 Smart (Medium):** Strategically takes winning moves, blocks opponent paths, and prioritizes the center and corners.
* **🔴 Unbeatable (Impossible):** Implemented with the mathematical **Minimax algorithm** — scientifically impossible to defeat in classic mode!

### 🎨 Customizable Avatars & Battle Packs
Choose your duel style:
* ✖️ vs ⭕ — Classic Neon
* 🚀 vs 👾 — Space Invaders
* 🔥 vs ❄️ — Fire vs Ice
* 🐱 vs 🐶 — Pet Rivalry
* 👑 vs 💀 — Royals vs Reaper

### 🌌 Multiple Themes & Responsive UI
* **🌌 Neon Glow (Cyberpunk default):** Deep slate background with glowing cyan and magenta accents.
* **🌸 Pastel Pop:** Clean, modern bright theme with soft indigo and pink tones.
* **🕶️ Midnight Dark:** GitHub-inspired dark mode.

### 🔊 100% Offline Web Audio & Game Juice
* Synthesized sound effects generated live using the **Web Audio API** (placement pops, vanishing whoosh, victory fanfare, draw buzz, blitz warnings) with zero external asset dependencies or audio lag.
* Mute / Unmute audio toggle with `localStorage` memory.
* Canvas-powered celebratory **Confetti cannon** physics on match wins.
* **Animated SVG strike-through line** dynamically drawn across winning cells.

---

## 🚀 How to Play

1. Clone or download this repository:
   ```bash
   git clone https://github.com/AliGohar2151/PRODIGY_WD_03.git
   ```
2. Open [`index.html`](index.html) in any modern web browser.
3. Select your desired game mode, opponent (vs AI or 2-Player Local), difficulty, and battle marks.
4. Hit **START BATTLE ⚔️** and enjoy!

---

## 🛠️ Technologies Used

* **HTML5:** Semantic markup, accessible dialogs, and SVG rendering.
* **CSS3:** Custom properties (CSS variables), Grid & Flexbox, glassmorphic backdrop filters, and keyframe animations.
* **JavaScript (ES6+):** Object-oriented game loop, Web Audio API synthesis, Canvas particle engine, and Minimax decision tree.

---

## 👤 Author

* **Ali Gohar** — [GitHub Profile](https://github.com/AliGohar2151)

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
