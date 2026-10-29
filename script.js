/**
 * TIC-TAC-TOE ARCADE DELUXE
 * Modes: Classic 3x3, Ghost / Infinity Mode, Blitz Speed Mode
 * AI: Easy (Chill), Medium (Smart), Impossible (Minimax)
 * Features: Web Audio API sound generator, Confetti physics, SVG Strike Line, Themes
 */

// ============================================================================
// 1. SOUND GENERATOR (Web Audio API - 100% Offline, Zero external assets)
// ============================================================================
class SoundEffects {
    constructor() {
        this.ctx = null;
        this.muted = localStorage.getItem('ttt_sound_muted') === 'true';
    }

    init() {
        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                this.ctx = new AudioContextClass();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        localStorage.setItem('ttt_sound_muted', this.muted);
        return this.muted;
    }

    playClick() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.05);

        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
    }

    playPlace(isPlayer1) {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';

        const freq = isPlayer1 ? 520 : 380;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.3, this.ctx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.12);
    }

    playVanish() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(450, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.18);

        gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.18);
    }

    playWarning() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(750, this.ctx.currentTime);

        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.06);
    }

    playWin() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        // Fanfare notes: C5, E5, G5, C6
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, index) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const startTime = this.ctx.currentTime + (index * 0.1);

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, startTime);

            gain.gain.setValueAtTime(0.22, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.28);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + 0.3);
        });
    }

    playDraw() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        // Descending chords: G4, E4, C4
        const notes = [392.00, 329.63, 261.63];
        notes.forEach((freq, index) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const startTime = this.ctx.currentTime + (index * 0.12);

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, startTime);

            gain.gain.setValueAtTime(0.12, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + 0.28);
        });
    }
}

// ============================================================================
// 2. CONFETTI CELEBRATION ENGINE
// ============================================================================
class ConfettiCannon {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.animationId = null;
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    fire() {
        this.resize();
        const colors = ['#00f2fe', '#ff007f', '#ffbe0b', '#10b981', '#ffffff', '#7c4dff'];
        this.particles = [];
        const count = 120;

        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: this.canvas.width / 2 + (Math.random() - 0.5) * 100,
                y: this.canvas.height * 0.45 + (Math.random() - 0.5) * 50,
                vx: (Math.random() - 0.5) * 18,
                vy: (Math.random() - 1.2) * 16,
                size: Math.random() * 8 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * 360,
                rotSpeed: (Math.random() - 0.5) * 12,
                opacity: 1,
                decay: Math.random() * 0.015 + 0.008
            });
        }

        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.animate();
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        let active = false;

        for (let p of this.particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.35; // Gravity
            p.vx *= 0.98; // Friction
            p.rotation += p.rotSpeed;
            p.opacity -= p.decay;

            if (p.opacity > 0) {
                active = true;
                this.ctx.save();
                this.ctx.translate(p.x, p.y);
                this.ctx.rotate((p.rotation * Math.PI) / 180);
                this.ctx.globalAlpha = Math.max(0, p.opacity);
                this.ctx.fillStyle = p.color;
                this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.2);
                this.ctx.restore();
            }
        }

        if (active) {
            this.animationId = requestAnimationFrame(() => this.animate());
        } else {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
}

// ============================================================================
// 3. MAIN GAME CONTROLLER
// ============================================================================
const WINNING_COMBINATIONS = [
    [0, 1, 2], // row 1
    [3, 4, 5], // row 2
    [6, 7, 8], // row 3
    [0, 3, 6], // col 1
    [1, 4, 7], // col 2
    [2, 5, 8], // col 3
    [0, 4, 8], // diag 1
    [2, 4, 6]  // diag 2
];

class TicTacToeGame {
    constructor() {
        this.sound = new SoundEffects();
        this.confetti = new ConfettiCannon('confettiCanvas');

        // State settings
        this.mode = 'classic';          // 'classic' | 'ghost' | 'blitz'
        this.opponent = 'ai';           // 'ai' | 'pvp'
        this.aiDifficulty = 'medium';   // 'easy' | 'medium' | 'impossible'
        this.theme = localStorage.getItem('ttt_theme') || 'neon';

        // Marks & Names
        this.p1Mark = '✖️';
        this.p2Mark = '⭕';
        this.p1Name = 'Player 1';
        this.p2Name = 'AI Bot';

        // Match Scores
        this.p1Score = 0;
        this.p2Score = 0;
        this.draws = 0;

        // Board & Round State
        this.board = Array(9).fill(null); // 'p1' | 'p2' | null
        this.isP2Turn = false;
        this.isGameOver = false;
        this.isAiThinking = false;

        // Ghost Mode queues: indices of moves made by each player
        this.p1Moves = [];
        this.p2Moves = [];

        // Blitz Mode Timer
        this.blitzTimeLeft = 5.0;
        this.blitzInterval = null;

        // Cache DOM Elements
        this.dom = {
            // Theme & Sound
            themeSelect: document.getElementById('themeSelect'),
            soundToggle: document.getElementById('soundToggle'),
            soundIcon: document.getElementById('soundIcon'),
            helpButton: document.getElementById('helpButton'),

            // Screens
            setupScreen: document.getElementById('setupScreen'),
            gameScreen: document.getElementById('gameScreen'),

            // Setup Controls
            modeCards: document.querySelectorAll('.mode-card'),
            tabAi: document.getElementById('tabAi'),
            tabPvp: document.getElementById('tabPvp'),
            aiDifficultyGroup: document.getElementById('aiDifficultyGroup'),
            aiDiffRadios: document.querySelectorAll('input[name="aiDifficulty"]'),
            markPackBtns: document.querySelectorAll('.mark-pack-btn'),
            p1Input: document.getElementById('player1Input'),
            p2Input: document.getElementById('player2Input'),
            p2Label: document.getElementById('player2Label'),
            startBtn: document.getElementById('startGameBtn'),

            // Game Controls
            turnBanner: document.getElementById('turnBanner'),
            turnMark: document.getElementById('currentTurnMark'),
            turnText: document.getElementById('turnStatusText'),
            blitzContainer: document.getElementById('blitzTimerContainer'),
            blitzBar: document.getElementById('blitzTimerBar'),
            blitzText: document.getElementById('blitzTimerText'),
            ghostIndicator: document.getElementById('ghostModeIndicator'),

            // Scoreboard
            p1ScoreCard: document.getElementById('p1ScoreCard'),
            p2ScoreCard: document.getElementById('p2ScoreCard'),
            p1ScoreMark: document.getElementById('p1ScoreMark'),
            p2ScoreMark: document.getElementById('p2ScoreMark'),
            p1DisplayName: document.getElementById('p1DisplayName'),
            p2DisplayName: document.getElementById('p2DisplayName'),
            p1ScoreNum: document.getElementById('player1Score') || document.getElementById('p1ScoreNumber'),
            p2ScoreNum: document.getElementById('player2Score') || document.getElementById('p2ScoreNumber'),
            drawsScoreNum: document.getElementById('drawsScoreNumber'),

            // Board & Cells
            board: document.getElementById('board'),
            cells: document.querySelectorAll('.cell'),
            strikeSvg: document.getElementById('winningStrikeSvg'),
            strikeLine: document.getElementById('strikeLine'),

            // Game Buttons
            restartRoundBtn: document.getElementById('restartRoundBtn'),
            backToSetupBtn: document.getElementById('backToSetupBtn'),

            // Modals
            winnerModal: document.getElementById('winnerModal'),
            modalTrophy: document.getElementById('modalTrophy'),
            modalWinnerTitle: document.getElementById('modalWinnerTitle'),
            modalWinnerMsg: document.getElementById('modalWinnerMessage'),
            modalP1Wins: document.getElementById('modalP1Wins'),
            modalDraws: document.getElementById('modalDraws'),
            modalP2Wins: document.getElementById('modalP2Wins'),
            modalPlayAgainBtn: document.getElementById('modalPlayAgainBtn'),
            modalChangeModeBtn: document.getElementById('modalChangeModeBtn'),

            rulesModal: document.getElementById('rulesModal'),
            closeRulesBtn: document.getElementById('closeRulesBtn'),
            gotItRulesBtn: document.getElementById('gotItRulesBtn')
        };

        this.applyTheme(this.theme);
        this.initEventListeners();
        this.updateSoundButton();
    }

    // ============================================================================
    // THEMES & SOUND SETUP
    // ============================================================================
    applyTheme(themeName) {
        this.theme = themeName;
        document.documentElement.setAttribute('data-theme', themeName);
        if (this.dom.themeSelect) this.dom.themeSelect.value = themeName;
        localStorage.setItem('ttt_theme', themeName);
    }

    updateSoundButton() {
        if (!this.dom.soundIcon) return;
        this.dom.soundIcon.textContent = this.sound.muted ? '🔇' : '🔊';
        this.dom.soundToggle.title = this.sound.muted ? 'Sound: Muted' : 'Sound: Enabled';
    }

    // ============================================================================
    // EVENT LISTENERS
    // ============================================================================
    initEventListeners() {
        // Theme selector
        this.dom.themeSelect.addEventListener('change', (e) => {
            this.applyTheme(e.target.value);
            this.sound.playClick();
        });

        // Sound toggle
        this.dom.soundToggle.addEventListener('click', () => {
            this.sound.toggleMute();
            this.updateSoundButton();
            if (!this.sound.muted) this.sound.playClick();
        });

        // Rules modal
        this.dom.helpButton.addEventListener('click', () => {
            this.sound.playClick();
            this.dom.rulesModal.style.display = 'flex';
        });
        this.dom.closeRulesBtn.addEventListener('click', () => {
            this.sound.playClick();
            this.dom.rulesModal.style.display = 'none';
        });
        this.dom.gotItRulesBtn.addEventListener('click', () => {
            this.sound.playClick();
            this.dom.rulesModal.style.display = 'none';
        });

        // Mode cards
        this.dom.modeCards.forEach(card => {
            card.addEventListener('click', () => {
                this.sound.playClick();
                this.dom.modeCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                this.mode = card.dataset.mode;
            });
        });

        // Opponent tabs
        this.dom.tabAi.addEventListener('click', () => {
            this.sound.playClick();
            this.opponent = 'ai';
            this.dom.tabAi.classList.add('active');
            this.dom.tabPvp.classList.remove('active');
            this.dom.aiDifficultyGroup.style.display = 'block';
            this.dom.p2Label.textContent = 'Player 2 (AI)';
            this.dom.p2Input.value = 'AI Bot';
        });

        this.dom.tabPvp.addEventListener('click', () => {
            this.sound.playClick();
            this.opponent = 'pvp';
            this.dom.tabPvp.classList.add('active');
            this.dom.tabAi.classList.remove('active');
            this.dom.aiDifficultyGroup.style.display = 'none';
            this.dom.p2Label.textContent = 'Player 2 (Human)';
            this.dom.p2Input.value = 'Player 2';
        });

        // AI Difficulty radio buttons
        this.dom.aiDiffRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.sound.playClick();
                this.aiDifficulty = e.target.value;
            });
        });

        // Mark packs
        this.dom.markPackBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.sound.playClick();
                this.dom.markPackBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.p1Mark = btn.dataset.p1;
                this.p2Mark = btn.dataset.p2;

                // Update default names if user hasn't typed custom ones
                if (!this.dom.p1Input.dataset.custom) {
                    this.dom.p1Input.placeholder = btn.dataset.p1name;
                }
                if (!this.dom.p2Input.dataset.custom && this.opponent === 'ai') {
                    this.dom.p2Input.placeholder = `${btn.dataset.p2name} Bot`;
                }
            });
        });

        this.dom.p1Input.addEventListener('input', () => {
            this.dom.p1Input.dataset.custom = 'true';
        });
        this.dom.p2Input.addEventListener('input', () => {
            this.dom.p2Input.dataset.custom = 'true';
        });

        // Start Battle button
        this.dom.startBtn.addEventListener('click', () => {
            this.sound.playClick();
            this.p1Name = this.dom.p1Input.value.trim() || this.dom.p1Input.placeholder || 'Player 1';
            this.p2Name = this.dom.p2Input.value.trim() || this.dom.p2Input.placeholder || (this.opponent === 'ai' ? 'AI Bot' : 'Player 2');

            // Reset scores on fresh setup
            this.p1Score = 0;
            this.p2Score = 0;
            this.draws = 0;
            this.updateScoreboardDisplay();

            // Switch to game screen
            this.dom.setupScreen.style.display = 'none';
            this.dom.gameScreen.style.display = 'block';

            this.startRound();
        });

        // Cells click handler
        this.dom.cells.forEach(cell => {
            cell.addEventListener('click', (e) => this.handleCellClick(e));
        });

        // In-game buttons
        this.dom.restartRoundBtn.addEventListener('click', () => {
            this.sound.playClick();
            this.startRound();
        });

        this.dom.backToSetupBtn.addEventListener('click', () => {
            this.sound.playClick();
            this.stopBlitzTimer();
            this.dom.gameScreen.style.display = 'none';
            this.dom.setupScreen.style.display = 'block';
        });

        // Modal buttons
        this.dom.modalPlayAgainBtn.addEventListener('click', () => {
            this.sound.playClick();
            this.dom.winnerModal.style.display = 'none';
            this.startRound();
        });

        this.dom.modalChangeModeBtn.addEventListener('click', () => {
            this.sound.playClick();
            this.dom.winnerModal.style.display = 'none';
            this.dom.gameScreen.style.display = 'none';
            this.dom.setupScreen.style.display = 'block';
        });
    }

    // ============================================================================
    // ROUND LIFECYCLE
    // ============================================================================
    startRound() {
        this.stopBlitzTimer();
        this.board = Array(9).fill(null);
        this.isP2Turn = false;
        this.isGameOver = false;
        this.isAiThinking = false;
        this.p1Moves = [];
        this.p2Moves = [];

        // Hide Strike Line
        this.dom.strikeSvg.style.display = 'none';

        // Clear cells UI
        this.dom.cells.forEach(cell => {
            cell.textContent = '';
            cell.className = 'cell';
            cell.disabled = false;
        });

        // Update mark badges on scoreboard
        this.dom.p1ScoreMark.textContent = this.p1Mark;
        this.dom.p2ScoreMark.textContent = this.p2Mark;
        this.dom.p1DisplayName.textContent = this.p1Name;
        this.dom.p2DisplayName.textContent = this.p2Name;

        // Configure mode specific banners
        if (this.mode === 'ghost') {
            this.dom.ghostIndicator.style.display = 'block';
        } else {
            this.dom.ghostIndicator.style.display = 'none';
        }

        if (this.mode === 'blitz') {
            this.dom.blitzContainer.style.display = 'block';
        } else {
            this.dom.blitzContainer.style.display = 'none';
        }

        this.updateTurnDisplay();

        if (this.mode === 'blitz') {
            this.resetBlitzTimer();
        }
    }

    updateTurnDisplay() {
        const isP1 = !this.isP2Turn;
        const currentMark = isP1 ? this.p1Mark : this.p2Mark;
        const currentName = isP1 ? this.p1Name : this.p2Name;

        this.dom.turnMark.textContent = currentMark;
        this.dom.turnText.textContent = `${currentName}'s Turn`;

        this.dom.turnBanner.className = `turn-banner ${isP1 ? 'p1-turn' : 'p2-turn'}`;

        this.dom.p1ScoreCard.classList.toggle('active-player', isP1);
        this.dom.p2ScoreCard.classList.toggle('active-player', !isP1);

        // Update Ghost mode oldest mark warnings
        this.updateGhostVisuals();
    }

    updateGhostVisuals() {
        if (this.mode !== 'ghost') return;

        // Remove all previous oldest markings
        this.dom.cells.forEach(cell => cell.classList.remove('oldest-mark'));

        // If player has 3 moves, their 1st move is the oldest and will vanish on their next move
        const currentQueue = this.isP2Turn ? this.p2Moves : this.p1Moves;
        if (currentQueue.length >= 3) {
            const oldestIndex = currentQueue[0];
            const oldestCell = this.dom.cells[oldestIndex];
            if (oldestCell) {
                oldestCell.classList.add('oldest-mark');
                oldestCell.title = "⚠️ Oldest mark! This will vanish on your move!";
            }
        }
    }

    updateScoreboardDisplay() {
        this.dom.p1ScoreNum.textContent = this.p1Score;
        this.dom.p2ScoreNum.textContent = this.p2Score;
        this.dom.drawsScoreNum.textContent = this.draws;
    }

    // ============================================================================
    // CELL CLICK & MOVE LOGIC
    // ============================================================================
    handleCellClick(e) {
        if (this.isGameOver || this.isAiThinking) return;

        const cell = e.currentTarget;
        const index = parseInt(cell.dataset.index, 10);

        if (this.board[index] !== null) {
            // Already taken
            return;
        }

        // If it's AI turn in vs AI mode, reject human click
        if (this.opponent === 'ai' && this.isP2Turn) {
            return;
        }

        this.executeMove(index);
    }

    executeMove(index) {
        if (this.isGameOver) return;

        const isP1 = !this.isP2Turn;
        const playerKey = isP1 ? 'p1' : 'p2';
        const mark = isP1 ? this.p1Mark : this.p2Mark;
        const movesQueue = isP1 ? this.p1Moves : this.p2Moves;

        // Sound effect
        this.sound.playPlace(isP1);

        // In Ghost Mode: if player already has 3 marks, remove the oldest one first!
        if (this.mode === 'ghost' && movesQueue.length >= 3) {
            const vanishingIndex = movesQueue.shift();
            this.board[vanishingIndex] = null;
            const vanishingCell = this.dom.cells[vanishingIndex];
            vanishingCell.textContent = '';
            vanishingCell.className = 'cell';
            vanishingCell.title = '';
            this.sound.playVanish();
        }

        // Place the mark
        this.board[index] = playerKey;
        movesQueue.push(index);

        const cell = this.dom.cells[index];
        cell.textContent = mark;
        cell.classList.add('marked', isP1 ? 'p1-mark' : 'p2-mark');

        // Check Win
        const winCombo = this.checkWin(playerKey);
        if (winCombo) {
            this.handleWin(winCombo, playerKey);
            return;
        }

        // Check Draw (Only in Classic mode or when full)
        if (this.checkDraw()) {
            this.handleDraw();
            return;
        }

        // Swap turns
        this.isP2Turn = !this.isP2Turn;
        this.updateTurnDisplay();

        if (this.mode === 'blitz') {
            this.resetBlitzTimer();
        }

        // Trigger AI if it's AI's turn
        if (this.opponent === 'ai' && this.isP2Turn && !this.isGameOver) {
            this.triggerAiMove();
        }
    }

    // ============================================================================
    // WIN & DRAW CHECKING
    // ============================================================================
    checkWin(playerKey) {
        for (const combo of WINNING_COMBINATIONS) {
            if (combo.every(idx => this.board[idx] === playerKey)) {
                return combo;
            }
        }
        return null;
    }

    checkDraw() {
        // Ghost mode never draws unless all 9 cells are full (which is impossible since 3+3=6 marks max)
        return this.board.every(cell => cell !== null);
    }

    handleWin(combo, winnerKey) {
        this.isGameOver = true;
        this.stopBlitzTimer();
        this.sound.playWin();
        this.confetti.fire();

        // Highlight winning cells
        combo.forEach(idx => {
            this.dom.cells[idx].classList.add('winning-cell');
        });

        // Draw animated strike line
        this.drawWinningLine(combo);

        const isP1 = winnerKey === 'p1';
        if (isP1) {
            this.p1Score++;
        } else {
            this.p2Score++;
        }
        this.updateScoreboardDisplay();

        const winnerName = isP1 ? this.p1Name : this.p2Name;
        const winnerMark = isP1 ? this.p1Mark : this.p2Mark;

        setTimeout(() => {
            this.dom.modalTrophy.textContent = '🏆';
            this.dom.modalWinnerTitle.textContent = `${winnerName} Wins!`;
            this.dom.modalWinnerMsg.textContent = `${winnerMark} proved superior this round!`;
            this.showWinnerModal();
        }, 800);
    }

    handleDraw() {
        this.isGameOver = true;
        this.stopBlitzTimer();
        this.sound.playDraw();
        this.draws++;
        this.updateScoreboardDisplay();

        setTimeout(() => {
            this.dom.modalTrophy.textContent = '🤝';
            this.dom.modalWinnerTitle.textContent = "It's a Stalemate!";
            this.dom.modalWinnerMsg.textContent = "An evenly matched clash of titans!";
            this.showWinnerModal();
        }, 500);
    }

    showWinnerModal() {
        this.dom.modalP1Wins.textContent = this.p1Score;
        this.dom.modalDraws.textContent = this.draws;
        this.dom.modalP2Wins.textContent = this.p2Score;
        this.dom.winnerModal.style.display = 'flex';
    }

    // ============================================================================
    // STRIKE LINE DRAWING (SVG Coordinates)
    // ============================================================================
    drawWinningLine(combo) {
        const boardRect = this.dom.board.getBoundingClientRect();
        const startCellRect = this.dom.cells[combo[0]].getBoundingClientRect();
        const endCellRect = this.dom.cells[combo[2]].getBoundingClientRect();

        const x1 = (startCellRect.left + startCellRect.width / 2) - boardRect.left;
        const y1 = (startCellRect.top + startCellRect.height / 2) - boardRect.top;
        const x2 = (endCellRect.left + endCellRect.width / 2) - boardRect.left;
        const y2 = (endCellRect.top + endCellRect.height / 2) - boardRect.top;

        this.dom.strikeLine.setAttribute('x1', x1);
        this.dom.strikeLine.setAttribute('y1', y1);
        this.dom.strikeLine.setAttribute('x2', x2);
        this.dom.strikeLine.setAttribute('y2', y2);

        this.dom.strikeSvg.style.display = 'block';
    }

    // ============================================================================
    // BLITZ TIMER (5 Seconds Countdown)
    // ============================================================================
    resetBlitzTimer() {
        this.stopBlitzTimer();
        this.blitzTimeLeft = 5.0;
        this.updateBlitzUi();

        const stepMs = 100;
        this.blitzInterval = setInterval(() => {
            this.blitzTimeLeft -= stepMs / 1000;
            if (this.blitzTimeLeft <= 0) {
                this.blitzTimeLeft = 0;
                this.updateBlitzUi();
                this.stopBlitzTimer();
                this.handleBlitzTimeout();
            } else {
                this.updateBlitzUi();
                if (this.blitzTimeLeft <= 1.5 && Math.round(this.blitzTimeLeft * 10) % 5 === 0) {
                    this.sound.playWarning();
                }
            }
        }, stepMs);
    }

    stopBlitzTimer() {
        if (this.blitzInterval) {
            clearInterval(this.blitzInterval);
            this.blitzInterval = null;
        }
    }

    updateBlitzUi() {
        const percent = Math.max(0, (this.blitzTimeLeft / 5.0) * 100);
        this.dom.blitzBar.style.width = `${percent}%`;
        this.dom.blitzText.textContent = `${this.blitzTimeLeft.toFixed(1)}s`;
    }

    handleBlitzTimeout() {
        if (this.isGameOver) return;

        // Auto move on timeout: choose a random empty cell
        const available = this.getAvailableIndices();
        if (available.length > 0) {
            const randomIndex = available[Math.floor(Math.random() * available.length)];
            this.executeMove(randomIndex);
        }
    }

    getAvailableIndices() {
        const indices = [];
        this.board.forEach((val, idx) => {
            if (val === null) indices.push(idx);
        });
        return indices;
    }

    // ============================================================================
    // AI LOGIC (Easy, Medium, and Unbeatable Minimax)
    // ============================================================================
    triggerAiMove() {
        this.isAiThinking = true;
        this.dom.turnText.textContent = `${this.p2Name} is thinking...`;

        const delay = Math.floor(Math.random() * 250) + 350; // 350 - 600ms natural delay

        setTimeout(() => {
            if (this.isGameOver) {
                this.isAiThinking = false;
                return;
            }

            let bestIndex;
            if (this.aiDifficulty === 'easy') {
                bestIndex = this.getEasyAiMove();
            } else if (this.aiDifficulty === 'medium') {
                bestIndex = this.getMediumAiMove();
            } else {
                bestIndex = this.getImpossibleAiMove();
            }

            this.isAiThinking = false;
            if (bestIndex !== undefined && bestIndex !== null) {
                this.executeMove(bestIndex);
            }
        }, delay);
    }

    getEasyAiMove() {
        const available = this.getAvailableIndices();
        if (available.length === 0) return null;
        return available[Math.floor(Math.random() * available.length)];
    }

    getMediumAiMove() {
        const available = this.getAvailableIndices();
        if (available.length === 0) return null;

        // 1. Check if AI can win in 1 move
        for (const idx of available) {
            this.board[idx] = 'p2';
            if (this.checkWin('p2')) {
                this.board[idx] = null;
                return idx;
            }
            this.board[idx] = null;
        }

        // 2. Check if Human can win in 1 move, and block them
        for (const idx of available) {
            this.board[idx] = 'p1';
            if (this.checkWin('p1')) {
                this.board[idx] = null;
                return idx;
            }
            this.board[idx] = null;
        }

        // 3. Take Center if available
        if (this.board[4] === null) return 4;

        // 4. Take random corner
        const corners = [0, 2, 6, 8].filter(i => this.board[i] === null);
        if (corners.length > 0 && Math.random() < 0.7) {
            return corners[Math.floor(Math.random() * corners.length)];
        }

        // 5. Pick random
        return available[Math.floor(Math.random() * available.length)];
    }

    getImpossibleAiMove() {
        // In Ghost mode, simulate tactical choice since full minimax is infinite state
        if (this.mode === 'ghost') {
            return this.getMediumAiMove();
        }

        // Classic Minimax (Mathematically Unbeatable)
        let bestScore = -Infinity;
        let bestMove = null;
        const available = this.getAvailableIndices();

        // Center opening optimization
        if (this.board[4] === null && available.length >= 8) {
            return 4;
        }

        for (const idx of available) {
            this.board[idx] = 'p2';
            const score = this.minimax(this.board, 0, false);
            this.board[idx] = null;

            if (score > bestScore) {
                bestScore = score;
                bestMove = idx;
            }
        }

        return bestMove !== null ? bestMove : this.getEasyAiMove();
    }

    minimax(currentBoard, depth, isMaximizing) {
        // Evaluate terminal states
        if (this.checkWin('p2')) return 10 - depth;
        if (this.checkWin('p1')) return depth - 10;
        if (currentBoard.every(cell => cell !== null)) return 0;
        if (depth >= 6) return 0; // Depth limiter for speed

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (let i = 0; i < 9; i++) {
                if (currentBoard[i] === null) {
                    currentBoard[i] = 'p2';
                    const evaluation = this.minimax(currentBoard, depth + 1, false);
                    currentBoard[i] = null;
                    maxEval = Math.max(maxEval, evaluation);
                }
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (let i = 0; i < 9; i++) {
                if (currentBoard[i] === null) {
                    currentBoard[i] = 'p1';
                    const evaluation = this.minimax(currentBoard, depth + 1, true);
                    currentBoard[i] = null;
                    minEval = Math.min(minEval, evaluation);
                }
            }
            return minEval;
        }
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    window.game = new TicTacToeGame();
});
