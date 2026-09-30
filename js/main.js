// Main Application Entry Point
import { CONFIG } from './config.js';
import { GameLogic } from './game.js';
import { HanziGameLogic } from './hanzi-game.js';
import { HANZI_DIFFICULTY } from './hanzi-data.js';
import { VisualMathLogic } from './visual-math-game.js';
import { getDailyMissions, getAchievementLabels } from './mission-engine.js';
import { TimerController } from './core/timer-controller.js';
import { soundManager } from './sound.js';
import { AVATAR_OPTIONS, storage } from './storage.js';
import { ponyRenderer } from './pony.js';
import { animations } from './animations.js';

class PonyMathGame {
    constructor() {
        this.game = new GameLogic();
        this.hanziGame = new HanziGameLogic();
        this.visualGame = new VisualMathLogic();
        this.currentScreen = 'menu';
        this.timerInterval = null;
        this.timerController = new TimerController({
            onTick: timeLeft => {
                this.game.timeLeft = timeLeft;
                this.updateTimerDisplay();
                if (timeLeft <= 3 && timeLeft > 0 && this.timerDisplay?.parentElement) {
                    this.timerDisplay.parentElement.classList.add('timer-warning');
                }
            },
            onExpire: () => this.handleTimeUp()
        });
        this.currentDifficulty = null;
        this.currentGameMode = 'math'; // 'math' or 'hanzi'
        this.selectedAvatar = storage.getAvatar();
        this.parentUnlocked = false;
        this.answerLocked = false;
        this.gameToken = 0;

        this.ready = this.init();
    }

    async init() {
        this.cacheElements();
        this.bindEvents();
        this.renderMenuPony();
        this.updateUserIdentity();
        await storage.waitUntilReady();
        soundManager.enabled = storage.isSoundEnabled();
        this.updateUserIdentity();
        this.updateCollectionCount();
    }

    cacheElements() {
        // Screens
        this.screens = {
            menu: document.getElementById('menu-screen'),
            game: document.getElementById('game-screen'),
            collection: document.getElementById('collection-screen'),
            leaderboard: document.getElementById('leaderboard-screen'),
            hanziDifficulty: document.getElementById('hanzi-difficulty-screen'),
            hanziGame: document.getElementById('hanzi-game-screen'),
            visualMath: document.getElementById('visual-math-screen'),
            parentDashboard: document.getElementById('parent-dashboard-screen')
        };

        // Menu elements
        this.difficultyButtons = document.querySelectorAll('.difficulty-btn[data-difficulty]');
        this.viewCollectionBtn = document.getElementById('view-collection');
        this.menuPony = document.getElementById('menu-pony');
        this.hanziGameBtn = document.getElementById('hanzi-game');
        this.visualMathBtn = document.getElementById('visual-math-game');
        this.visualCountTenBtn = document.getElementById('visual-count-10-game');
        this.visualCompareBtn = document.getElementById('visual-compare-game');
        this.visualPatternBtn = document.getElementById('visual-pattern-game');
        this.parentBtn = document.getElementById('view-parent-dashboard');
        this.currentUsername = document.getElementById('current-username');
        this.currentAvatar = document.getElementById('current-avatar');
        this.switchUserBtn = document.getElementById('switch-user');
        this.leaderboardBtn = document.getElementById('view-leaderboard');

        // Game elements
        this.backToMenuBtn = document.getElementById('back-to-menu');
        this.scoreDisplay = document.getElementById('score');
        this.timerDisplay = document.getElementById('timer');
        this.timerContainer = document.getElementById('timer-container');
        this.streakDisplay = document.getElementById('streak');
        this.gamePony = document.getElementById('game-pony');
        this.num1Display = document.getElementById('num1');
        this.operatorDisplay = document.getElementById('operator');
        this.num2Display = document.getElementById('num2');
        this.answerDisplay = document.getElementById('answer-display');
        this.answerButtonsContainer = document.getElementById('answer-buttons');
        this.progressFill = document.getElementById('progress-fill');
        this.cardsProgress = document.getElementById('cards-progress');
        this.cardsNeeded = document.getElementById('cards-needed');
        this.feedbackOverlay = document.getElementById('feedback-overlay');

        // Collection elements
        this.backFromCollectionBtn = document.getElementById('back-from-collection');
        this.collectionGrid = document.getElementById('collection-grid');
        this.collectedCount = document.getElementById('collected-count');
        this.totalCards = document.getElementById('total-cards');

        // Leaderboard elements
        this.backFromLeaderboardBtn = document.getElementById('back-from-leaderboard');
        this.leaderboardList = document.getElementById('leaderboard-list');

        // Visual math elements
        this.backFromVisualMathBtn = document.getElementById('back-from-visual-math');
        this.visualScoreDisplay = document.getElementById('visual-score');
        this.visualStreakDisplay = document.getElementById('visual-streak');
        this.visualGamePony = document.getElementById('visual-game-pony');
        this.visualPrompt = document.getElementById('visual-prompt');
        this.visualObjects = document.getElementById('visual-objects');
        this.visualHintBtn = document.getElementById('visual-hint');
        this.visualHintMessage = document.getElementById('visual-hint-message');
        this.visualAnswerButtons = document.getElementById('visual-answer-buttons');
        this.visualProgressFill = document.getElementById('visual-progress-fill');
        this.visualProgress = document.getElementById('visual-progress');
        this.visualNeeded = document.getElementById('visual-needed');
        this.visualFeedbackOverlay = document.getElementById('visual-feedback-overlay');

        // Parent dashboard elements
        this.backFromParentDashboardBtn = document.getElementById('back-from-parent-dashboard');
        this.parentDashboardContent = document.getElementById('parent-dashboard-content');
        this.parentPinForm = document.getElementById('parent-pin-form');
        this.parentPinTitle = document.getElementById('parent-pin-title');
        this.parentPinHelp = document.getElementById('parent-pin-help');
        this.parentPinInput = document.getElementById('parent-pin-input');
        this.parentCurrentPinInput = document.getElementById('parent-current-pin-input');
        this.parentPinError = document.getElementById('parent-pin-error');
        this.parentDashboardData = document.getElementById('parent-dashboard-data');
        this.parentSyncStatus = document.getElementById('parent-sync-status');

        // Popup elements
        this.cardPopup = document.getElementById('card-popup');
        this.newCardShowcase = document.getElementById('new-card-showcase');
        this.cardRewardTitle = document.getElementById('card-reward-title');
        this.cardRewardMessage = document.getElementById('card-reward-message');
        this.closeCardPopupBtn = document.getElementById('close-card-popup');

        // Wrong answer popup elements
        this.wrongPopup = document.getElementById('wrong-popup');
        this.sadPonyShowcase = document.getElementById('sad-pony-showcase');
        this.correctAnswerDisplay = document.getElementById('correct-answer-display');
        this.correctAnswerBox = document.getElementById('correct-answer-box');
        this.wrongTitle = document.getElementById('wrong-title');
        this.revealAnswerBtn = document.getElementById('reveal-answer-btn');
        this.closeWrongPopupBtn = document.getElementById('close-wrong-popup');

        // User switch popup elements
        this.userPopup = document.getElementById('user-popup');
        this.userList = document.getElementById('user-list');
        this.userSwitchStatus = document.getElementById('user-switch-status');
        this.avatarOptions = document.getElementById('avatar-options');
        this.saveAvatarBtn = document.getElementById('save-avatar');
        this.newUserForm = document.getElementById('new-user-form');
        this.newUsernameInput = document.getElementById('new-username');
        this.closeUserPopupBtn = document.getElementById('close-user-popup');

        // Hanzi game elements
        this.hanziDifficultyButtons = document.querySelectorAll('.difficulty-btn[data-hanzi-difficulty]');
        this.backFromHanziDifficultyBtn = document.getElementById('back-from-hanzi-difficulty');
        this.backFromHanziGameBtn = document.getElementById('back-from-hanzi-game');
        this.hanziMenuPony = document.getElementById('hanzi-menu-pony');
        this.hanziScoreDisplay = document.getElementById('hanzi-score');
        this.hanziTimerDisplay = document.getElementById('hanzi-timer');
        this.hanziTimerContainer = document.getElementById('hanzi-timer-container');
        this.hanziStreakDisplay = document.getElementById('hanzi-streak');
        this.hanziGamePony = document.getElementById('hanzi-game-pony');
        this.emojiDisplay = document.getElementById('emoji-display');
        this.hanziAnswerButtonsContainer = document.getElementById('hanzi-answer-buttons');
        this.hanziProgressFill = document.getElementById('hanzi-progress-fill');
        this.hanziCardsProgress = document.getElementById('hanzi-cards-progress');
        this.hanziCardsNeeded = document.getElementById('hanzi-cards-needed');
        this.hanziFeedbackOverlay = document.getElementById('hanzi-feedback-overlay');
    }

    bindEvents() {
        // Math difficulty selection
        this.difficultyButtons.forEach(btn => {
            btn.addEventListener('click', async () => {
                await storage.waitUntilReady();
                this.currentDifficulty = btn.dataset.difficulty;
                this.currentGameMode = 'math';
                this.startGame(this.currentDifficulty);
            });
        });

        // Hanzi game entry
        this.hanziGameBtn.addEventListener('click', () => {
            this.showScreen('hanziDifficulty');
            this.renderHanziMenuPony();
        });

        this.visualMathBtn.addEventListener('click', async () => {
            await storage.waitUntilReady();
            this.startVisualMathGame('counting_1_5');
        });

        this.visualCountTenBtn.addEventListener('click', async () => {
            await storage.waitUntilReady();
            this.startVisualMathGame('counting_1_10');
        });

        this.visualCompareBtn.addEventListener('click', async () => {
            await storage.waitUntilReady();
            this.startVisualMathGame('compare_quantities');
        });

        this.visualPatternBtn.addEventListener('click', async () => {
            await storage.waitUntilReady();
            this.startVisualMathGame('patterns_shapes');
        });

        this.parentBtn.addEventListener('click', async () => {
            await storage.waitUntilReady();
            this.openParentDashboard();
        });

        // Hanzi difficulty selection
        this.hanziDifficultyButtons.forEach(btn => {
            btn.addEventListener('click', async () => {
                await storage.waitUntilReady();
                this.currentDifficulty = btn.dataset.hanziDifficulty;
                this.currentGameMode = 'hanzi';
                this.startHanziGame(this.currentDifficulty);
            });
        });

        // Collection view
        this.viewCollectionBtn.addEventListener('click', async () => {
            await storage.waitUntilReady();
            this.showScreen('collection');
            this.renderCollection();
        });

        // Leaderboard view
        this.leaderboardBtn.addEventListener('click', async () => {
            await storage.waitUntilReady();
            this.showScreen('leaderboard');
            this.renderLeaderboard();
        });

        // Back buttons
        this.backToMenuBtn.addEventListener('click', () => {
            this.endGame();
            this.showScreen('menu');
        });

        this.backFromCollectionBtn.addEventListener('click', () => {
            this.showScreen('menu');
        });

        this.backFromLeaderboardBtn.addEventListener('click', () => {
            this.showScreen('menu');
        });

        this.backFromHanziDifficultyBtn.addEventListener('click', () => {
            this.showScreen('menu');
        });

        this.backFromHanziGameBtn.addEventListener('click', () => {
            this.endHanziGame();
            this.showScreen('menu');
        });

        this.backFromVisualMathBtn.addEventListener('click', () => {
            this.endVisualMathGame();
            this.showScreen('menu');
        });

        this.backFromParentDashboardBtn.addEventListener('click', () => {
            this.parentUnlocked = false;
            this.showScreen('menu');
        });

        this.visualHintBtn.addEventListener('click', () => {
            this.visualHintMessage.textContent = this.visualGame.getHint();
            this.visualHintBtn.disabled = true;
        });

        this.parentPinForm.addEventListener('submit', event => {
            event.preventDefault();
            this.unlockParentDashboard();
        });

        // Card popup
        this.closeCardPopupBtn.addEventListener('click', () => {
            this.hideCardPopup();
        });

        // Wrong answer popup
        this.closeWrongPopupBtn.addEventListener('click', () => {
            this.hideWrongPopup();
        });

        // Reveal answer button
        this.revealAnswerBtn.addEventListener('click', () => {
            this.revealAnswer();
        });

        // User switching
        this.switchUserBtn.addEventListener('click', () => {
            this.openUserSwitcher();
        });

        this.closeUserPopupBtn.addEventListener('click', () => {
            this.closeUserSwitcher();
        });

        this.saveAvatarBtn.addEventListener('click', () => {
            this.saveSelectedAvatar();
        });

        this.newUserForm.addEventListener('submit', event => {
            event.preventDefault();
            this.createUserFromForm();
        });

        // Touch/mouse effects
        document.addEventListener('touchstart', this.handleTouch.bind(this), { passive: true });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.timerWasRunning = this.timerController.running || Boolean(this.timerInterval);
                this.stopTimer();
            } else if (this.timerWasRunning && !this.isPopupVisible()) {
                this.resumeActiveTimer();
            }
        });
    }

    updateUserIdentity() {
        if (this.currentUsername) {
            this.currentUsername.textContent = storage.getUserName();
        }
        if (this.currentAvatar) {
            this.currentAvatar.textContent = storage.getAvatar();
        }
    }

    async openUserSwitcher() {
        this.selectedAvatar = storage.getAvatar();
        this.userPopup.classList.remove('hidden');
        this.userSwitchStatus.textContent = '正在加载用户…';
        this.renderAvatarOptions();

        try {
            const users = await storage.getUsers();
            this.renderUserList(users);
            this.userSwitchStatus.textContent = '无需密码，每位用户都有独立的卡片册和成绩。';
            this.newUsernameInput.focus();
        } catch (error) {
            this.userSwitchStatus.textContent = error.message || '加载用户失败，请稍后再试。';
        }
    }

    renderUserList(users) {
        this.userList.innerHTML = '';
        users.forEach(user => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `user-option ${user.name === storage.getUserName() ? 'active' : ''}`;

            const name = document.createElement('span');
            name.textContent = `${user.avatar || '🌈'} ${user.name}`;
            const count = document.createElement('span');
            count.className = 'user-card-count';
            count.textContent = `🎴 ${user.collectedCount || 0} 张 · ✅ ${user.totalCorrect || 0}`;
            button.append(name, count);

            button.addEventListener('click', () => {
                this.selectUser(user.name);
            });
            this.userList.appendChild(button);
        });
    }

    renderAvatarOptions() {
        this.avatarOptions.innerHTML = '';
        AVATAR_OPTIONS.forEach(avatar => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `avatar-option ${avatar === this.selectedAvatar ? 'active' : ''}`;
            button.textContent = avatar;
            button.setAttribute('aria-label', `选择头像 ${avatar}`);
            button.addEventListener('click', () => {
                this.selectedAvatar = avatar;
                this.renderAvatarOptions();
            });
            this.avatarOptions.appendChild(button);
        });
    }

    async saveSelectedAvatar() {
        if (this.selectedAvatar === storage.getAvatar()) {
            this.userSwitchStatus.textContent = '这就是当前头像。';
            return;
        }

        this.userSwitchStatus.textContent = '正在保存头像…';
        try {
            await storage.setAvatar(this.selectedAvatar);
            this.updateUserIdentity();
            this.renderUserList(await storage.getUsers());
            this.userSwitchStatus.textContent = '头像已保存。';
        } catch (error) {
            this.selectedAvatar = storage.getAvatar();
            this.renderAvatarOptions();
            this.userSwitchStatus.textContent = error.message || '头像保存失败，请稍后再试。';
        }
    }

    async selectUser(username) {
        if (username === storage.getUserName()) {
            this.closeUserSwitcher();
            return;
        }

        this.userSwitchStatus.textContent = '正在切换用户…';
        try {
            await storage.switchUser(username);
            this.updateUserIdentity();
            this.updateCollectionCount();
            this.closeUserSwitcher();
        } catch (error) {
            this.userSwitchStatus.textContent = error.message || '切换用户失败，请稍后再试。';
        }
    }

    async createUserFromForm() {
        const username = this.newUsernameInput.value.trim();
        if (!username) {
            this.userSwitchStatus.textContent = '请输入用户名。';
            this.newUsernameInput.focus();
            return;
        }

        this.userSwitchStatus.textContent = '正在创建用户…';
        try {
            await storage.createUser(username, this.selectedAvatar);
            this.updateUserIdentity();
            this.updateCollectionCount();
            this.newUsernameInput.value = '';
            this.closeUserSwitcher();
        } catch (error) {
            this.userSwitchStatus.textContent = error.message || '创建用户失败，请换一个名字。';
        }
    }

    closeUserSwitcher() {
        this.userPopup.classList.add('hidden');
    }

    handleTouch(e) {
        if (e.touches && e.touches[0]) {
            animations.createRainbowTrail(e.touches[0].clientX, e.touches[0].clientY);
        }
    }

    // Screen management
    showScreen(screenName) {
        Object.keys(this.screens).forEach(name => {
            this.screens[name].classList.remove('active');
        });
        this.screens[screenName].classList.add('active');
        this.currentScreen = screenName;

        soundManager.play('click');
    }

    // Menu pony rendering
    renderMenuPony() {
        const canvas = ponyRenderer.createPonyCanvas(0, 180);
        this.menuPony.innerHTML = '';
        this.menuPony.appendChild(canvas);
        animations.animatePony(this.menuPony, 'idle');
    }

    // Start game
    startGame(difficulty) {
        this.stopTimer();
        this.gameToken += 1;
        this.answerLocked = false;
        const question = this.game.startGame(difficulty);
        const config = CONFIG.difficulties[difficulty];

        // Update UI
        this.showScreen('game');
        this.updateGamePony(config.ponyIndex);
        this.updateQuestion(question);
        this.updateScore();
        this.updateStreak();
        this.updateProgress();

        // Apply background class
        this.screens.game.className = `screen active ${config.bgClass}`;

        // Setup timer
        if (config.hasTimer) {
            this.timerContainer.style.display = 'flex';
            this.startTimer();
        } else {
            this.timerContainer.style.display = 'none';
        }

        // Set cards needed
        this.cardsNeeded.textContent = config.cardsPerReward;
    }

    // Update game pony
    updateGamePony(ponyIndex, mood = 'happy') {
        const canvas = ponyRenderer.createPonyCanvas(ponyIndex, 100, mood);
        this.gamePony.innerHTML = '';
        this.gamePony.appendChild(canvas);
        animations.animatePony(this.gamePony, 'idle');
    }

    // Update question display
    updateQuestion(question) {
        this.num1Display.textContent = question.num1;
        this.operatorDisplay.textContent = question.operator;
        this.num2Display.textContent = question.num2;
        this.answerDisplay.textContent = '?';

        animations.animateNumber(this.num1Display);
        animations.animateNumber(this.num2Display);

        // Generate answer buttons
        this.renderAnswerButtons(question.options);
    }

    // Render answer buttons
    renderAnswerButtons(options) {
        this.answerButtonsContainer.innerHTML = '';

        options.forEach(option => {
            const btn = document.createElement('button');
            btn.className = 'answer-btn';
            btn.textContent = option;
            btn.addEventListener('click', () => this.handleAnswer(option, btn));
            this.answerButtonsContainer.appendChild(btn);
        });
    }

    // Handle answer selection
    handleAnswer(selectedAnswer, button) {
        if (this.answerLocked) return;
        const gameToken = this.gameToken;
        this.answerLocked = true;
        this.stopTimer();
        // Disable all buttons temporarily
        const allButtons = this.answerButtonsContainer.querySelectorAll('.answer-btn');
        allButtons.forEach(btn => btn.disabled = true);

        const result = this.game.checkAnswer(selectedAnswer);

        // Show answer in display
        this.answerDisplay.textContent = selectedAnswer;

        // Visual feedback
        if (result.correct) {
            button.classList.add('correct');
            soundManager.play('correct');
            animations.animatePony(this.gamePony, 'happy');
            animations.showFeedback(this.feedbackOverlay, true);
            animations.createFloatingHearts(
                button.getBoundingClientRect().left + button.offsetWidth / 2,
                button.getBoundingClientRect().top
            );

            storage.recordGame(true, {
                mode: 'math',
                skillId: `math_${this.currentDifficulty}`
            });

            // Check for card reward
            if (this.game.shouldAwardCard()) {
                setTimeout(() => {
                    if (gameToken === this.gameToken && this.currentScreen === 'game') this.awardCard();
                }, 600);
            }
        } else {
            button.classList.add('wrong');
            soundManager.play('wrong');

            // Show sad pony with tears
            const config = CONFIG.difficulties[this.currentDifficulty];
            this.updateGamePony(config.ponyIndex, 'sad');
            animations.animatePony(this.gamePony, 'sad');

            // Highlight correct button
            allButtons.forEach(btn => {
                if (parseInt(btn.textContent) === result.correctAnswer) {
                    btn.style.boxShadow = '0 0 20px rgba(39, 174, 96, 0.8)';
                    btn.style.border = '3px solid #27ae60';
                    btn.style.transform = 'scale(1.1)';
                }
            });

            // Show wrong answer popup
            this.showWrongPopup(result.correctAnswer);

            storage.recordGame(false, {
                mode: 'math',
                skillId: `math_${this.currentDifficulty}`
            });
        }

        // Update displays
        this.updateScore();
        this.updateStreak();
        this.updateProgress();

        // Next question after delay (only for correct answers, wrong answers wait for popup close)
        if (result.correct) {
            setTimeout(() => {
                if (gameToken !== this.gameToken || this.currentScreen !== 'game') return;
                const nextQuestion = this.game.generateQuestion();
                this.updateQuestion(nextQuestion);
                this.answerLocked = false;

                // Reset timer for timed modes
                if (this.game.currentDifficulty.hasTimer) {
                    this.resetTimer();
                    if (!this.isPopupVisible()) this.startTimer();
                }
            }, 800);
        }
    }

    // Timer management
    startTimer() {
        this.stopTimer();
        const duration = this.game.currentDifficulty?.timerSeconds || 0;
        this.timerController.start(duration);
        this.timerInterval = true;
        if (this.game.timeLeft <= 3 && duration > 0) {
            this.timerDisplay.parentElement.classList.add('timer-warning');
        }
    }

    resetTimer() {
        this.timerDisplay.parentElement.classList.remove('timer-warning');
        if (this.game.currentDifficulty?.hasTimer) {
            // Prepare a fresh question timer without starting it while a popup is open.
            this.timerController.start(this.game.currentDifficulty.timerSeconds);
            this.timerController.stop();
        }
        this.updateTimerDisplay();
    }

    stopTimer() {
        this.timerController.stop();
        if (this.timerInterval && this.timerInterval !== true) {
            clearInterval(this.timerInterval);
        }
        this.timerInterval = null;
    }

    updateTimerDisplay() {
        this.timerDisplay.textContent = this.game.timeLeft;
    }

    handleTimeUp() {
        if (this.answerLocked) return;
        this.answerLocked = true;
        this.stopTimer();
        // Treat as wrong answer
        const result = this.game.checkAnswer(-1);
        soundManager.play('wrong');

        // Show sad pony
        const config = CONFIG.difficulties[this.currentDifficulty];
        this.updateGamePony(config.ponyIndex, 'sad');
        animations.animatePony(this.gamePony, 'sad');

        this.timerDisplay.parentElement.classList.add('shake');
        setTimeout(() => {
            this.timerDisplay.parentElement.classList.remove('shake');
        }, 300);

        // Show correct answer
        const correctAnswer = this.game.currentQuestion.answer;
        this.answerDisplay.textContent = correctAnswer;
        this.answerDisplay.style.color = '#27ae60';

        // Check if medium difficulty - hide answer initially
        const hideAnswer = this.currentDifficulty === 'medium';
        this.showWrongPopup(correctAnswer, hideAnswer);

        this.updateScore();
        this.updateStreak();
        this.updateProgress();
        storage.recordGame(false, {
            mode: 'math',
            skillId: `math_${this.currentDifficulty}`
        });
    }

    // Show wrong answer popup
    showWrongPopup(correctAnswer, hideAnswer = false) {
        // Store correct answer for later reveal
        this.pendingCorrectAnswer = correctAnswer;

        // Draw sad pony in popup (handle both math and hanzi modes)
        let ponyIndex = 0;
        if (this.currentGameMode === 'math') {
            const config = CONFIG.difficulties[this.currentDifficulty];
            ponyIndex = config ? config.ponyIndex : 0;
        }

        const canvas = ponyRenderer.createPonyCanvas(ponyIndex, 100, 'sad');
        this.sadPonyShowcase.innerHTML = '';
        this.sadPonyShowcase.appendChild(canvas);

        if (hideAnswer) {
            // Hide answer initially, show reveal button
            this.wrongTitle.textContent = '⏰ 时间到~';
            this.correctAnswerBox.style.display = 'none';
            this.revealAnswerBtn.style.display = 'block';
            this.closeWrongPopupBtn.style.display = 'none';
        } else {
            // Show answer directly
            this.wrongTitle.textContent = '😢 答错啦~';
            this.correctAnswerDisplay.textContent = correctAnswer;
            this.correctAnswerBox.style.display = 'block';
            this.revealAnswerBtn.style.display = 'none';
            this.closeWrongPopupBtn.style.display = 'block';
        }

        // Show popup
        this.wrongPopup.classList.remove('hidden');

        // Pause timer during popup
        this.stopTimer();
    }

    // Reveal the hidden answer
    revealAnswer() {
        this.correctAnswerDisplay.textContent = this.pendingCorrectAnswer;
        this.correctAnswerBox.style.display = 'block';
        this.revealAnswerBtn.style.display = 'none';
        this.closeWrongPopupBtn.style.display = 'block';
    }

    hideWrongPopup() {
        this.wrongPopup.classList.add('hidden');
        this.answerLocked = false;

        if (this.currentGameMode === 'hanzi') {
            // Reset pony to happy
            this.updateHanziGamePony(0, 'happy');

            // Generate next question
            const nextQuestion = this.hanziGame.generateQuestion();
            this.updateHanziQuestion(nextQuestion);

            // Resume timer if needed
            if (this.hanziGame.currentDifficultyConfig && this.hanziGame.currentDifficultyConfig.hasTimer) {
                this.resetHanziTimer();
                this.startHanziTimer();
            }
        } else {
            // Reset pony to happy
            const config = CONFIG.difficulties[this.currentDifficulty];
            this.updateGamePony(config.ponyIndex, 'happy');
            this.answerDisplay.style.color = '';
            this.answerDisplay.style.animation = '';

            // Generate next question
            const nextQuestion = this.game.generateQuestion();
            this.updateQuestion(nextQuestion);

            // Resume timer if needed
            if (this.game.currentDifficulty && this.game.currentDifficulty.hasTimer) {
                this.resetTimer();
                this.startTimer();
            }
        }
    }

    // Update displays
    updateScore() {
        this.scoreDisplay.textContent = this.game.score;
    }

    updateStreak() {
        this.streakDisplay.textContent = this.game.streak;
    }

    updateProgress() {
        const progress = this.game.getCardsProgress();
        this.progressFill.style.width = `${progress.progress}%`;
        this.cardsProgress.textContent = progress.current;
    }

    // Card reward
    awardCard() {
        const collectedCards = storage.getCollectedCards();
        const cardId = this.game.getRandomCard(collectedCards);
        const isNew = storage.addCard(cardId);

        soundManager.play('collect');
        animations.createConfetti(40);

        this.showCardPopup(cardId, isNew);
        this.updateCollectionCount();
    }

    showCardPopup(cardId, isNew) {
        this.newCardShowcase.innerHTML = '';
        this.cardRewardTitle.textContent = isNew ? '🎉 恭喜获得新卡片！' : '✨ 卡片变成星星啦！';
        this.cardRewardMessage.textContent = isNew ? '新的小马伙伴加入卡片册！' : '重复卡片转换成了 1 颗星星。';

        const ponyCard = ponyRenderer.createImageCard(cardId - 1, 150);
        ponyCard.classList.add('card-collect');
        this.newCardShowcase.appendChild(ponyCard);

        const popup = this.cardPopup;
        popup.classList.remove('hidden');

        // Pause timer during popup
        this.stopTimer();
    }

    hideCardPopup() {
        this.cardPopup.classList.add('hidden');
        if (this.currentGameMode === 'visual' && this.visualSummaryReady) {
            this.endVisualMathGame();
            this.showScreen('menu');
            return;
        }
        this.resumeActiveTimer();
    }

    // Collection
    renderCollection() {
        this.collectionGrid.innerHTML = '';
        const collectedCards = storage.getCollectedCards();

        CONFIG.cards.forEach((card, index) => {
            const cardId = index + 1;
            const isCollected = collectedCards.includes(cardId);

            const cardElement = document.createElement('div');
            cardElement.className = `collection-card ${isCollected ? 'collected' : 'locked'}`;

            // Always show the card image
            const ponyCard = ponyRenderer.createImageCard(index, 100);

            // Add lock overlay inside pony-card for uncollected cards
            if (!isCollected) {
                const lockOverlay = document.createElement('div');
                lockOverlay.className = 'lock-overlay';
                lockOverlay.innerHTML = '🔒';
                ponyCard.appendChild(lockOverlay);
            }

            cardElement.appendChild(ponyCard);
            this.collectionGrid.appendChild(cardElement);
        });
    }

    updateCollectionCount() {
        this.collectedCount.textContent = storage.getCollectedCount();
        this.totalCards.textContent = CONFIG.cards.length;
    }

    async renderLeaderboard() {
        this.leaderboardList.innerHTML = '<div class="leaderboard-loading">正在加载排行榜…</div>';

        try {
            const leaderboard = await storage.getLeaderboard();
            this.leaderboardList.innerHTML = '';

            if (leaderboard.length === 0) {
                this.leaderboardList.innerHTML = '<div class="leaderboard-empty">还没有排行数据，快来答题吧！</div>';
                return;
            }

            leaderboard.forEach((user, index) => {
                const item = document.createElement('div');
                item.className = `leaderboard-item ${user.name === storage.getUserName() ? 'current-user' : ''}`;

                const rank = document.createElement('span');
                rank.className = `leaderboard-rank rank-${index + 1}`;
                rank.textContent = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}`;

                const avatar = document.createElement('span');
                avatar.className = 'leaderboard-avatar';
                avatar.textContent = user.avatar || '🌈';

                const identity = document.createElement('div');
                identity.className = 'leaderboard-identity';
                const name = document.createElement('strong');
                name.textContent = user.name;
                const details = document.createElement('span');
                details.textContent = `答对 ${user.totalCorrect || 0} 题 · 卡片 ${user.collectedCount || 0} 张 · 正确率 ${user.accuracy || 0}%`;
                identity.append(name, details);

                const score = document.createElement('span');
                score.className = 'leaderboard-score';
                score.textContent = `${user.totalCorrect || 0}`;

                item.append(rank, avatar, identity, score);
                this.leaderboardList.appendChild(item);
            });
        } catch (error) {
            this.leaderboardList.innerHTML = '<div class="leaderboard-empty">排行榜暂时不可用，请稍后再试。</div>';
            console.warn('Failed to load leaderboard:', error);
        }
    }

    // ===== Visual Math =====

    startVisualMathGame(skillId = 'counting_1_5') {
        this.stopTimer();
        this.gameToken += 1;
        this.currentGameMode = 'visual';
        this.currentDifficulty = skillId;
        this.visualSessionRecorded = false;
        this.visualSummaryReady = false;
        const question = this.visualGame.startGame(skillId);
        this.showScreen('visualMath');
        this.screens.visualMath.className = 'screen active bg-visual-math';
        this.updateVisualGamePony();
        this.updateVisualQuestion(question);
        this.updateVisualScore();
        this.updateVisualProgress();
        this.visualNeeded.textContent = this.visualGame.session.maxQuestions;
    }

    updateVisualGamePony(mood = 'happy') {
        const canvas = ponyRenderer.createPonyCanvas(0, 100, mood);
        this.visualGamePony.innerHTML = '';
        this.visualGamePony.appendChild(canvas);
        animations.animatePony(this.visualGamePony, 'idle');
    }

    updateVisualQuestion(question) {
        if (!question) return;
        this.visualPrompt.textContent = question.prompt;
        this.visualObjects.textContent = question.display || question.object.repeat(question.count);
        this.visualHintMessage.textContent = '';
        this.visualHintBtn.disabled = false;
        this.renderVisualAnswerButtons(question.options);
    }

    renderVisualAnswerButtons(options) {
        this.visualAnswerButtons.innerHTML = '';
        options.forEach(option => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'visual-answer-btn';
            button.textContent = option;
            button.setAttribute('aria-label', `选择 ${option}`);
            button.addEventListener('click', () => this.handleVisualAnswer(option, button));
            this.visualAnswerButtons.appendChild(button);
        });
    }

    handleVisualAnswer(selectedAnswer, button) {
        if (this.answerLocked) return;
        const gameToken = this.gameToken;
        this.answerLocked = true;
        const allButtons = this.visualAnswerButtons.querySelectorAll('.visual-answer-btn');
        allButtons.forEach(item => { item.disabled = true; });
        const result = this.visualGame.checkAnswer(selectedAnswer);
        button.classList.add(result.correct ? 'correct' : 'wrong');
        storage.recordGame(result.correct, {
            mode: 'visual',
            skillId: this.visualGame.skill.id,
            hintUsed: result.hintUsed
        });

        if (result.correct) {
            soundManager.play('correct');
            animations.animatePony(this.visualGamePony, 'happy');
            animations.showFeedback(this.visualFeedbackOverlay, true);
        } else {
            soundManager.play('wrong');
            this.updateVisualGamePony('sad');
            animations.showFeedback(this.visualFeedbackOverlay, false);
            allButtons.forEach(item => {
                if (item.textContent === String(result.correctAnswer)) item.classList.add('correct');
            });
        }

        this.updateVisualScore();
        this.updateVisualProgress();
        if (result.sessionFinished) {
            setTimeout(() => {
                if (gameToken === this.gameToken && this.currentScreen === 'visualMath') this.finishVisualMathGame();
            }, 850);
            return;
        }
        setTimeout(() => {
            if (gameToken !== this.gameToken || this.currentScreen !== 'visualMath') return;
            this.updateVisualQuestion(this.visualGame.generateQuestion());
            this.answerLocked = false;
        }, 700);
    }

    updateVisualScore() {
        this.visualScoreDisplay.textContent = this.visualGame.score;
        this.visualStreakDisplay.textContent = this.visualGame.streak;
    }

    updateVisualProgress() {
        const progress = this.visualGame.getProgress();
        this.visualProgress.textContent = progress.current;
        this.visualProgressFill.style.width = `${progress.progress}%`;
    }

    awardVisualCard() {
        if (this.visualSummaryReady === false && this.currentGameMode === 'visual' && !this.visualSessionRecorded) {
            return;
        }
        const collectedCards = storage.getCollectedCards();
        const cardId = this.game.getRandomCard(collectedCards);
        const isNew = storage.addCard(cardId);
        soundManager.play('collect');
        animations.createConfetti(20);
        this.showCardPopup(cardId, isNew);
        this.updateCollectionCount();
    }

    finishVisualMathGame() {
        if (this.visualSessionRecorded) return;
        this.visualSessionRecorded = true;
        storage.recordSession({
            mode: 'visual',
            skillId: this.visualGame.skill.id,
            score: this.visualGame.score
        });
        this.visualSummaryReady = true;
        this.visualPrompt.textContent = '练习完成！你真棒！';
        this.visualObjects.textContent = `答对 ${this.visualGame.correctCount} / ${this.visualGame.session.questions.length} 题`;
        this.visualHintMessage.textContent = '回到首页继续探索新的数学游戏吧！';
        if (this.visualGame.correctCount === this.visualGame.session.maxQuestions) {
            this.awardVisualCard();
            return;
        }
        setTimeout(() => {
            if (this.currentScreen === 'visualMath' && this.visualSummaryReady) {
                this.endVisualMathGame();
                this.showScreen('menu');
            }
        }, 1800);
    }

    endVisualMathGame() {
        this.gameToken += 1;
        this.stopTimer();
        this.answerLocked = false;
        this.visualSummaryReady = false;
        this.screens.visualMath.className = 'screen';
    }

    // ===== Parent Dashboard =====

    openParentDashboard() {
        this.showScreen('parentDashboard');
        this.parentPinForm.classList.remove('hidden');
        this.parentDashboardData.classList.add('hidden');
        this.parentPinInput.value = '';
        this.parentCurrentPinInput.value = '';
        this.parentPinError.textContent = '';
        if (storage.isParentPinConfigured()) {
            this.parentPinTitle.textContent = '输入家长 PIN';
            this.parentPinHelp.textContent = '请输入 4 位数字 PIN 查看学习进度。';
            this.parentCurrentPinInput.style.display = 'none';
        } else {
            this.parentPinTitle.textContent = '设置家长 PIN';
            this.parentPinHelp.textContent = '首次使用请设置 4 位数字 PIN。';
            this.parentCurrentPinInput.style.display = 'block';
        }
        this.parentPinInput.focus();
    }

    async unlockParentDashboard() {
        const pin = this.parentPinInput.value.trim();
        if (!/^\d{4}$/.test(pin)) {
            this.parentPinError.textContent = '请输入 4 位数字。';
            return;
        }
        this.parentPinError.textContent = '正在验证…';
        try {
            if (storage.isParentPinConfigured()) {
                await storage.verifyParentPin(pin);
            } else {
                await storage.setParentPin(pin, this.parentCurrentPinInput.value.trim());
            }
            this.parentUnlocked = true;
            await this.renderParentDashboard(pin);
        } catch (error) {
            this.parentPinError.textContent = error.message || '验证失败，请重试。';
        }
    }

    async renderParentDashboard(parentPin) {
        const dashboard = await storage.getDashboard(parentPin);
        this.parentPinForm.classList.add('hidden');
        this.parentDashboardData.classList.remove('hidden');
        this.parentSyncStatus.textContent = '已同步';
        this.parentDashboardData.innerHTML = '';

        const title = document.createElement('h3');
        title.textContent = `${storage.getAvatar()} ${storage.getUserName()} 的学习报告`;
        const stats = document.createElement('div');
        stats.className = 'parent-stats-grid';
        [
            ['答题总数', dashboard.stats.totalPlayed],
            ['答对题数', dashboard.stats.totalCorrect],
            ['正确率', `${dashboard.stats.accuracy}%`],
            ['星星', dashboard.stars || 0]
        ].forEach(([label, value]) => {
            const card = document.createElement('div');
            card.className = 'parent-stat-card';
            card.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
            stats.appendChild(card);
        });

        const missions = document.createElement('div');
        missions.className = 'parent-section';
        missions.innerHTML = '<h4>今日任务</h4>';
        getDailyMissions(dashboard.dailyProgress).forEach(mission => {
            const item = document.createElement('div');
            item.className = 'parent-progress-row';
            item.textContent = `${mission.completed ? '✅' : '⭐'} ${mission.name}：${mission.progress}/${mission.target}（奖励 ${mission.reward} 星星）`;
            missions.appendChild(item);
        });

        const achievements = document.createElement('div');
        achievements.className = 'parent-section';
        achievements.innerHTML = '<h4>已获得成就</h4>';
        const labels = getAchievementLabels(dashboard.achievements);
        achievements.appendChild(document.createTextNode(labels.length ? labels.map(item => `🏅 ${item.name}`).join('　') : '还没有成就，继续加油！'));

        this.parentDashboardData.append(title, stats, missions, achievements);
    }

    isPopupVisible() {
        return !this.cardPopup.classList.contains('hidden') || !this.wrongPopup.classList.contains('hidden')
            || !this.userPopup.classList.contains('hidden');
    }

    resumeActiveTimer() {
        if (this.answerLocked || this.isPopupVisible()) return;
        if (this.currentGameMode === 'math' && this.currentScreen === 'game'
            && this.game.currentDifficulty?.hasTimer) {
            if (!this.timerController.running && !this.timerController.expired && this.timerController.timeLeft > 0) {
                this.timerController.resume();
                this.timerInterval = true;
            }
        }
        if (this.currentGameMode === 'hanzi' && this.currentScreen === 'hanziGame'
            && this.hanziGame.currentDifficultyConfig?.hasTimer) {
            this.startHanziTimer();
        }
    }

    // End game
    endGame() {
        this.gameToken += 1;
        this.stopTimer();

        // Save high score
        if (this.currentDifficulty) {
            storage.updateHighScore(this.currentDifficulty, this.game.score);
            storage.recordSession({
                mode: 'math',
                skillId: `math_${this.currentDifficulty}`,
                difficulty: this.currentDifficulty,
                score: this.game.score
            });
        }

        // Reset game screen
        this.screens.game.className = 'screen';
        this.answerLocked = false;
    }

    // ===== Hanzi Game Methods =====

    renderHanziMenuPony() {
        if (this.hanziMenuPony) {
            const canvas = ponyRenderer.createPonyCanvas(1, 180);
            this.hanziMenuPony.innerHTML = '';
            this.hanziMenuPony.appendChild(canvas);
            animations.animatePony(this.hanziMenuPony, 'idle');
        }
    }

    startHanziGame(difficulty) {
        this.stopTimer();
        this.gameToken += 1;
        this.answerLocked = false;
        const question = this.hanziGame.startGame(difficulty);
        const config = HANZI_DIFFICULTY[difficulty];

        // Update UI
        this.showScreen('hanziGame');
        this.updateHanziGamePony(0);
        this.updateHanziQuestion(question);
        this.updateHanziScore();
        this.updateHanziStreak();
        this.updateHanziProgress();

        // Apply background class
        this.screens.hanziGame.className = `screen active ${config.bgClass}`;

        // Setup timer
        if (config.hasTimer) {
            this.hanziTimerContainer.style.display = 'flex';
            this.startHanziTimer();
        } else {
            this.hanziTimerContainer.style.display = 'none';
        }

        // Set cards needed
        this.hanziCardsNeeded.textContent = config.cardsPerReward;
    }

    updateHanziGamePony(ponyIndex, mood = 'happy') {
        if (this.hanziGamePony) {
            const canvas = ponyRenderer.createPonyCanvas(ponyIndex, 100, mood);
            this.hanziGamePony.innerHTML = '';
            this.hanziGamePony.appendChild(canvas);
            animations.animatePony(this.hanziGamePony, 'idle');
        }
    }

    updateHanziQuestion(question) {
        if (!question) return;

        this.emojiDisplay.textContent = question.emoji;
        animations.animateNumber(this.emojiDisplay);

        // Generate answer buttons
        this.renderHanziAnswerButtons(question.options);
    }

    renderHanziAnswerButtons(options) {
        this.hanziAnswerButtonsContainer.innerHTML = '';

        options.forEach(option => {
            const btn = document.createElement('button');
            btn.className = 'hanzi-answer-btn';
            btn.textContent = option;
            btn.addEventListener('click', () => this.handleHanziAnswer(option, btn));
            this.hanziAnswerButtonsContainer.appendChild(btn);
        });
    }

    handleHanziAnswer(selectedAnswer, button) {
        if (this.answerLocked) return;
        const gameToken = this.gameToken;
        this.answerLocked = true;
        this.stopTimer();
        // Disable all buttons temporarily
        const allButtons = this.hanziAnswerButtonsContainer.querySelectorAll('.hanzi-answer-btn');
        allButtons.forEach(btn => btn.disabled = true);

        const result = this.hanziGame.checkAnswer(selectedAnswer);

        // Visual feedback
        if (result.correct) {
            button.classList.add('correct');
            soundManager.play('correct');
            animations.animatePony(this.hanziGamePony, 'happy');
            this.showHanziFeedback(true);
            animations.createFloatingHearts(
                button.getBoundingClientRect().left + button.offsetWidth / 2,
                button.getBoundingClientRect().top
            );

            storage.recordGame(true, {
                mode: 'hanzi',
                skillId: `hanzi_${this.currentDifficulty}`
            });

            // Check for card reward
            if (this.hanziGame.shouldAwardCard()) {
                setTimeout(() => {
                    if (gameToken === this.gameToken && this.currentScreen === 'hanziGame') this.awardHanziCard();
                }, 600);
            }
        } else {
            button.classList.add('wrong');
            soundManager.play('wrong');

            // Show sad pony
            this.updateHanziGamePony(0, 'sad');
            animations.animatePony(this.hanziGamePony, 'sad');

            // Highlight correct button
            allButtons.forEach(btn => {
                if (btn.textContent === result.correctAnswer) {
                    btn.style.boxShadow = '0 0 20px rgba(39, 174, 96, 0.8)';
                    btn.style.border = '3px solid #27ae60';
                    btn.style.transform = 'scale(1.1)';
                }
            });

            // Show wrong answer popup with correct hanzi
            this.showWrongPopup(result.correctAnswer);

            storage.recordGame(false, {
                mode: 'hanzi',
                skillId: `hanzi_${this.currentDifficulty}`
            });
        }

        // Update displays
        this.updateHanziScore();
        this.updateHanziStreak();
        this.updateHanziProgress();

        // Next question after delay (only for correct answers)
        if (result.correct) {
            setTimeout(() => {
                if (gameToken !== this.gameToken || this.currentScreen !== 'hanziGame') return;
                const nextQuestion = this.hanziGame.generateQuestion();
                this.updateHanziQuestion(nextQuestion);
                this.answerLocked = false;

                // Reset timer for timed modes
                if (this.hanziGame.currentDifficultyConfig && this.hanziGame.currentDifficultyConfig.hasTimer) {
                    this.resetHanziTimer();
                    if (!this.isPopupVisible()) this.startHanziTimer();
                }
            }, 800);
        }
    }

    showHanziFeedback(correct) {
        const content = this.hanziFeedbackOverlay.querySelector('.feedback-content') ||
            document.getElementById('hanzi-feedback-content');
        if (content) {
            content.textContent = correct ? '🎉' : '😢';
            content.style.animation = 'none';
            void content.offsetWidth; // Trigger reflow
            content.style.animation = 'feedbackPop 0.6s ease forwards';
        }
    }

    // Hanzi Timer
    startHanziTimer() {
        this.stopTimer();
        this.updateHanziTimerDisplay();
        this.timerInterval = setInterval(() => {
            const result = this.hanziGame.tick();
            this.updateHanziTimerDisplay();

            if (result.expired) {
                this.handleHanziTimeUp();
            } else if (result.timeLeft <= 3) {
                this.hanziTimerDisplay.parentElement.classList.add('timer-warning');
            }
        }, 1000);
    }

    resetHanziTimer() {
        this.hanziTimerDisplay.parentElement.classList.remove('timer-warning');
        this.updateHanziTimerDisplay();
    }

    updateHanziTimerDisplay() {
        this.hanziTimerDisplay.textContent = this.hanziGame.timeLeft;
    }

    handleHanziTimeUp() {
        if (this.answerLocked) return;
        this.answerLocked = true;
        this.stopTimer();
        const result = this.hanziGame.checkAnswer('');
        soundManager.play('wrong');

        this.updateHanziGamePony(0, 'sad');
        animations.animatePony(this.hanziGamePony, 'sad');

        this.hanziTimerDisplay.parentElement.classList.add('shake');
        setTimeout(() => {
            this.hanziTimerDisplay.parentElement.classList.remove('shake');
        }, 300);

        // Show correct answer
        const correctAnswer = this.hanziGame.currentQuestion.correctAnswer;
        this.showWrongPopup(correctAnswer);

        this.updateHanziScore();
        this.updateHanziStreak();
        storage.recordGame(false, {
            mode: 'hanzi',
            skillId: `hanzi_${this.currentDifficulty}`
        });
    }

    // Hanzi displays
    updateHanziScore() {
        this.hanziScoreDisplay.textContent = this.hanziGame.score;
    }

    updateHanziStreak() {
        this.hanziStreakDisplay.textContent = this.hanziGame.streak;
    }

    updateHanziProgress() {
        const progress = this.hanziGame.getCardsProgress();
        this.hanziProgressFill.style.width = `${progress.progress}%`;
        this.hanziCardsProgress.textContent = progress.current;
    }

    // Hanzi card reward
    awardHanziCard() {
        const collectedCards = storage.getCollectedCards();
        const cardId = this.hanziGame.getRandomCard(collectedCards);
        const isNew = storage.addCard(cardId);

        soundManager.play('collect');
        animations.createConfetti(40);

        this.showCardPopup(cardId, isNew);
        this.updateCollectionCount();
    }

    endHanziGame() {
        this.gameToken += 1;
        this.stopTimer();

        // Save high score
        if (this.currentDifficulty) {
            storage.updateHighScore('hanzi_' + this.currentDifficulty, this.hanziGame.score);
            storage.recordSession({
                mode: 'hanzi',
                skillId: `hanzi_${this.currentDifficulty}`,
                difficulty: this.currentDifficulty,
                score: this.hanziGame.score
            });
        }

        // Reset game screen
        this.screens.hanziGame.className = 'screen';
        this.answerLocked = false;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new PonyMathGame();
});
