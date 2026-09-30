// Storage Manager Module - Node API backed persistence.
// Cards and game statistics are stored in data/users.json; the browser remembers only the active user.
const ACTIVE_USER_KEY = 'pony_math_active_user';
const LEGACY_STORAGE_KEY = 'pony_math_game';
const API_PREFIX = '/api';
export const AVATAR_OPTIONS = ['🌈', '🦄', '🦋', '🐰', '🐼', '🐯', '🐨', '🐸', '🐱', '🐶'];
const DEFAULT_AVATAR = AVATAR_OPTIONS[0];

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeUsername(username) {
    const value = String(username ?? '').trim();
    if (!value || value.length > 30 || /[\\/\u0000-\u001f\u007f]/.test(value)) {
        throw new Error('Username must contain 1 to 30 characters without slashes or control characters');
    }
    return value;
}

class StorageManager {
    constructor() {
        this.userName = this.getRememberedUserName();
        this.data = this.getDefaultData();
        this.persistenceAvailable = true;
        this.writeQueue = Promise.resolve();
        this.lastSaveError = null;
        this.ready = this.initialize();
    }

    getRememberedUserName() {
        try {
            return localStorage.getItem(ACTIVE_USER_KEY) || '小朋友';
        } catch {
            return '小朋友';
        }
    }

    rememberUserName(username) {
        try {
            localStorage.setItem(ACTIVE_USER_KEY, username);
        } catch {
            // Private browsing or disabled localStorage should not stop the game.
        }
    }

    getDefaultData() {
        return {
            avatar: DEFAULT_AVATAR,
            collectedCards: [],
            highScores: {
                easy: 0,
                medium: 0,
                hard: 0,
                infinite: 0,
                hell: 0,
                hanzi_easy: 0,
                hanzi_medium: 0,
                hanzi_hard: 0
            },
            totalCorrect: 0,
            totalPlayed: 0,
            soundEnabled: true,
            updatedAt: new Date().toISOString()
        };
    }

    // Keep the legacy read entry point for callers that use the current user cache.
    load() {
        return this.data;
    }

    normalizeData(data = {}) {
        const defaults = this.getDefaultData();
        const collectedCards = Array.isArray(data.collectedCards) ? data.collectedCards : [];
        const highScores = data.highScores && typeof data.highScores === 'object'
            ? data.highScores
            : {};

        return {
            ...defaults,
            avatar: AVATAR_OPTIONS.includes(data.avatar) ? data.avatar : DEFAULT_AVATAR,
            collectedCards: [...new Set(collectedCards
                .map(cardId => Number(cardId))
                .filter(cardId => Number.isInteger(cardId) && cardId > 0))],
            highScores: {
                ...defaults.highScores,
                ...Object.fromEntries(Object.entries(highScores)
                    .filter(([, score]) => Number.isFinite(Number(score)) && Number(score) >= 0)
                    .map(([difficulty, score]) => [difficulty, Number(score)]))
            },
            totalCorrect: this.toNonNegativeInteger(data.totalCorrect),
            totalPlayed: this.toNonNegativeInteger(data.totalPlayed),
            soundEnabled: data.soundEnabled !== false,
            updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : defaults.updatedAt
        };
    }

    toNonNegativeInteger(value) {
        const number = Number(value);
        return Number.isInteger(number) && number >= 0 ? number : 0;
    }

    getLegacyData() {
        try {
            const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
            return stored ? this.normalizeData(JSON.parse(stored)) : null;
        } catch {
            return null;
        }
    }

    async initialize() {
        try {
            const response = await fetch(`${API_PREFIX}/users/${encodeURIComponent(this.userName)}`);
            if (response.ok) {
                const payload = await response.json();
                this.data = this.normalizeData(payload.data);
                return this.data;
            }

            if (response.status === 404) {
                const payload = await this.request(`${API_PREFIX}/users`, {
                    method: 'POST',
                    body: JSON.stringify({ name: this.userName })
                });
                this.userName = payload.name || this.userName;
                this.data = this.normalizeData(payload.data);
                this.rememberUserName(this.userName);
                return this.data;
            }

            throw new Error(`Failed to load user (${response.status})`);
        } catch (error) {
            // Allow the page to run from a static server and retain legacy browser data.
            this.persistenceAvailable = false;
            this.data = this.getLegacyData() || this.getDefaultData();
            console.warn('Node data service is unavailable; using browser storage temporarily:', error);
            return this.data;
        }
    }

    async waitUntilReady() {
        await this.ready;
    }

    async request(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        let payload = {};
        try {
            payload = await response.json();
        } catch {
            // An empty response is handled by the status code below.
        }
        if (!response.ok) {
            throw new Error(payload.error || `Request failed (${response.status})`);
        }
        return payload;
    }

    async getUsers() {
        await this.waitUntilReady();
        if (!this.persistenceAvailable) {
            return [{
                name: this.userName,
                avatar: this.getAvatar(),
                collectedCount: this.getCollectedCount(),
                totalCorrect: this.data.totalCorrect
            }];
        }

        await this.flush();
        const payload = await this.request(`${API_PREFIX}/users`);
        return Array.isArray(payload.users) ? payload.users : [];
    }

    async createUser(username, avatar = DEFAULT_AVATAR) {
        await this.waitUntilReady();
        const normalizedName = normalizeUsername(username);
        if (!AVATAR_OPTIONS.includes(avatar)) throw new Error('Invalid avatar');
        await this.flush();

        if (!this.persistenceAvailable) {
            throw new Error('Node data service is unavailable. Start the game with npm start.');
        }

        const payload = await this.request(`${API_PREFIX}/users`, {
            method: 'POST',
            body: JSON.stringify({ name: normalizedName, avatar })
        });
        this.userName = payload.name || normalizedName;
        this.data = this.normalizeData(payload.data);
        this.rememberUserName(this.userName);
        return this.data;
    }

    async switchUser(username) {
        await this.waitUntilReady();
        const normalizedName = normalizeUsername(username);

        // Finish pending writes before switching so the previous user's data is not lost.
        await this.flush();

        if (!this.persistenceAvailable) {
            throw new Error('Node data service is unavailable. Start the game with npm start.');
        }

        const payload = await this.request(`${API_PREFIX}/users/${encodeURIComponent(normalizedName)}`);
        this.userName = payload.name || normalizedName;
        this.data = this.normalizeData(payload.data);
        this.rememberUserName(this.userName);
        return this.data;
    }

    getUserName() {
        return this.userName;
    }

    getAvatar() {
        return this.data.avatar || DEFAULT_AVATAR;
    }

    async setAvatar(avatar) {
        await this.waitUntilReady();
        if (!AVATAR_OPTIONS.includes(avatar)) throw new Error('Invalid avatar');
        if (!this.persistenceAvailable) {
            throw new Error('Node data service is unavailable. Start the game with npm start.');
        }
        if (this.data.avatar === avatar) {
            return false;
        }
        await this.flush();
        const previousAvatar = this.data.avatar;
        this.data.avatar = avatar;
        try {
            await this.save();
        } catch (error) {
            this.data.avatar = previousAvatar;
            throw error;
        }
        return true;
    }

    async getLeaderboard() {
        await this.waitUntilReady();
        if (!this.persistenceAvailable) {
            throw new Error('Node data service is unavailable. Start the game with npm start.');
        }

        await this.flush();
        const payload = await this.request(`${API_PREFIX}/leaderboard`);
        return Array.isArray(payload.leaderboard) ? payload.leaderboard : [];
    }

    save() {
        const dataSnapshot = clone(this.data);
        const username = this.userName;

        if (!this.persistenceAvailable) {
            try {
                localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(dataSnapshot));
            } catch {
                // Ignore browser storage quota errors; the game can continue in memory.
            }
            return this.writeQueue;
        }

        const operation = this.writeQueue
            .catch(() => {})
            .then(async () => {
                const payload = await this.request(`${API_PREFIX}/users/${encodeURIComponent(username)}`, {
                    method: 'PUT',
                    body: JSON.stringify({ data: dataSnapshot })
                });
                if (username === this.userName && payload.data) {
                    this.data.updatedAt = payload.data.updatedAt || this.data.updatedAt;
                }
                this.lastSaveError = null;
            });
        // Game actions continue synchronously; callers that await save() receive failures.
        this.writeQueue = operation.catch(error => {
            this.lastSaveError = error;
            console.warn('Failed to save user data:', error);
        });
        return operation;
    }

    async flush() {
        await this.writeQueue;
        if (this.lastSaveError) await this.save();
    }

    // Card collection
    addCard(cardId) {
        if (!this.data.collectedCards.includes(cardId)) {
            this.data.collectedCards.push(cardId);
            this.save().catch(() => {});
            return true; // New card
        }
        return false; // Already had
    }

    hasCard(cardId) {
        return this.data.collectedCards.includes(cardId);
    }

    getCollectedCards() {
        return [...this.data.collectedCards];
    }

    getCollectedCount() {
        return this.data.collectedCards.length;
    }

    // High scores
    updateHighScore(difficulty, score) {
        if (score > (this.data.highScores[difficulty] || 0)) {
            this.data.highScores[difficulty] = score;
            this.save().catch(() => {});
            return true; // New high score
        }
        return false;
    }

    getHighScore(difficulty) {
        return this.data.highScores[difficulty] || 0;
    }

    // Statistics
    recordGame(correct) {
        this.data.totalPlayed++;
        if (correct) {
            this.data.totalCorrect++;
        }
        this.save().catch(() => {});
    }

    getStats() {
        return {
            totalPlayed: this.data.totalPlayed,
            totalCorrect: this.data.totalCorrect,
            accuracy: this.data.totalPlayed > 0
                ? Math.round((this.data.totalCorrect / this.data.totalPlayed) * 100)
                : 0
        };
    }

    // Sound setting
    setSoundEnabled(enabled) {
        this.data.soundEnabled = enabled;
        this.save().catch(() => {});
    }

    isSoundEnabled() {
        return this.data.soundEnabled !== false;
    }

    // Reset
    reset() {
        this.data = this.getDefaultData();
        this.save().catch(() => {});
    }
}

export const storage = new StorageManager();
