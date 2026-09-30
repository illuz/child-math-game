import { applyLearningEvent } from './core/progress.js';
import { getLocalDate, getTodayProgress } from './mission-engine.js';

const ACTIVE_USER_KEY = 'pony_math_active_user';
const LEGACY_STORAGE_KEY = 'pony_math_game';
const PROFILE_CACHE_PREFIX = 'pony_math_profile_';
const PENDING_EVENTS_KEY = 'pony_math_pending_events';
const DEVICE_ID_KEY = 'pony_math_device_id';
const API_PREFIX = '/api';
export const AVATAR_OPTIONS = ['🌈', '🦄', '🦋', '🐰', '🐼', '🐯', '🐨', '🐸', '🐱', '🐶'];
const SETTINGS = ['avatar', 'soundEnabled', 'reducedMotion', 'voiceEnabled'];

function createId(prefix) {
    return `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

function normalizeUsername(username) {
    const name = String(username ?? '').trim();
    if (!name || name.length > 30 || /[\\/\u0000-\u001f\u007f]/.test(name)) {
        throw new Error('Username must contain 1 to 30 characters without slashes or control characters');
    }
    return name;
}

export class StorageManager {
    constructor({ fetchImpl, cache = globalThis.localStorage } = {}) {
        // Window.fetch is an instance method and must keep the Window receiver.
        this.fetch = fetchImpl || globalThis.fetch?.bind(globalThis);
        this.cache = cache;
        this.pendingEvents = [];
        this.userName = this.readCache(ACTIVE_USER_KEY) || '小朋友';
        this.deviceId = this.readCache(DEVICE_ID_KEY) || createId('device');
        this.writeCache(DEVICE_ID_KEY, this.deviceId);
        this.data = this.loadCachedProfile();
        this.userId = this.data.id;
        this.persistenceAvailable = false;
        this.lastSaveError = null;
        this.writeQueue = Promise.resolve();
        this.syncPromise = null;
        this.ready = this.initialize();
    }

    readCache(key) {
        try { return this.cache?.getItem(key) || null; } catch { return null; }
    }

    writeCache(key, value) {
        try { this.cache?.setItem(key, value); } catch {
            // 禁用 localStorage 或达到配额时，仍保留内存队列。
        }
    }

    getDefaultData() {
        return {
            id: null,
            avatar: AVATAR_OPTIONS[0],
            collectedCards: [],
            highScores: { easy: 0, medium: 0, hard: 0, infinite: 0, hell: 0, hanzi_easy: 0, hanzi_medium: 0, hanzi_hard: 0 },
            totalPlayed: 0,
            totalCorrect: 0,
            soundEnabled: true,
            reducedMotion: false,
            voiceEnabled: true,
            parentPinConfigured: false,
            stars: 0,
            skillProgress: {},
            achievements: [],
            dailyProgress: { date: '', answers: 0, correct: 0, sessions: 0, cards: 0, claimed: [] },
            dailyHistory: {},
            eventIds: [],
            revision: 0,
            updatedAt: new Date().toISOString()
        };
    }

    normalizeData(input = {}) {
        const data = JSON.parse(JSON.stringify(input));
        const defaults = this.getDefaultData();
        return {
            ...defaults,
            ...data,
            avatar: AVATAR_OPTIONS.includes(data.avatar) ? data.avatar : defaults.avatar,
            highScores: { ...defaults.highScores, ...data.highScores },
            dailyProgress: { ...defaults.dailyProgress, ...data.dailyProgress },
            dailyHistory: data.dailyHistory || {},
            collectedCards: [...new Set((data.collectedCards || []).filter(id => Number.isInteger(id) && id >= 1 && id <= 63))],
            eventIds: [...new Set(data.eventIds || [])],
            parentPinConfigured: data.parentPinConfigured === true
        };
    }

    loadCachedProfile() {
        try {
            const cached = this.readCache(PROFILE_CACHE_PREFIX + this.userName)
                || (this.userName === '小朋友' ? this.readCache(LEGACY_STORAGE_KEY) : null);
            return cached ? this.normalizeData(JSON.parse(cached)) : this.getDefaultData();
        } catch { return this.getDefaultData(); }
    }

    cacheProfile() {
        this.writeCache(PROFILE_CACHE_PREFIX + this.userName, JSON.stringify(this.data));
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('learning-progress-changed'));
    }

    getPendingEvents() {
        try {
            const raw = this.readCache(PENDING_EVENTS_KEY);
            if (raw) {
                const stored = JSON.parse(raw);
                if (Array.isArray(stored)) this.pendingEvents = stored.filter(event =>
                    typeof event?.userName === 'string' && typeof event.payload?.eventId === 'string');
            }
        } catch {
            // 损坏的缓存不影响当前内存队列。
        }
        return [...this.pendingEvents];
    }

    setPendingEvents(events) {
        this.pendingEvents = events;
        this.writeCache(PENDING_EVENTS_KEY, JSON.stringify(events));
    }

    acceptServerData(data, username = this.userName) {
        if (username !== this.userName) return;
        this.data = this.normalizeData(data);
        // 请求发出后仍可能有新答题事件，重新应用未确认事件而不是用旧响应覆盖。
        for (const event of this.getPendingEvents().filter(item => item.userName === username)) {
            applyLearningEvent(this.data, event.payload);
        }
        this.userId = this.data.id;
        this.cacheProfile();
    }

    async request(url, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            const response = await this.fetch(url, {
                ...options,
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json', ...options.headers }
            });
            let payload;
            try { payload = await response.json(); } catch { throw new Error('Invalid data service response'); }
            if (!response.ok) {
                const error = new Error(payload.error || `Request failed (${response.status})`);
                error.status = response.status;
                throw error;
            }
            return payload;
        } finally { clearTimeout(timeout); }
    }

    async loadProfile() {
        const username = this.userName;
        let payload;
        try { payload = await this.request(`${API_PREFIX}/users/${encodeURIComponent(username)}`); } catch (error) {
            if (error.status !== 404) throw error;
            try {
                payload = await this.request(`${API_PREFIX}/users`, {
                    method: 'POST', body: JSON.stringify({ name: username })
                });
            } catch (createError) {
                if (createError.status !== 409) throw createError;
                payload = await this.request(`${API_PREFIX}/users/${encodeURIComponent(username)}`);
            }
        }
        this.persistenceAvailable = true;
        this.acceptServerData(payload.data, username);
        this.writeCache(ACTIVE_USER_KEY, username);
    }

    async initialize() {
        await this.synchronize();
        return this.data;
    }

    async waitUntilReady() { await this.ready; }

    async flushPendingEvents() {
        if (this.syncPromise) return this.syncPromise;
        this.syncPromise = this.sendPendingEvents();
        try { return await this.syncPromise; } finally { this.syncPromise = null; }
    }

    async sendPendingEvents() {
        const username = this.userName;
        try {
            if (!this.persistenceAvailable) await this.loadProfile();
            let event = this.getPendingEvents().find(item => item.userName === username);
            while (event) {
                const payload = await this.request(`${API_PREFIX}/users/${encodeURIComponent(username)}/events`, {
                    method: 'POST', body: JSON.stringify(event.payload)
                });
                // 只删除已确认的 eventId，不覆盖请求期间追加的事件。
                this.setPendingEvents(this.getPendingEvents().filter(item =>
                    item.userName !== username || item.payload.eventId !== event.payload.eventId));
                this.acceptServerData(payload.data, username);
                event = this.getPendingEvents().find(item => item.userName === username);
            }
            this.lastSaveError = null;
            return true;
        } catch (error) {
            this.lastSaveError = error;
            this.persistenceAvailable = false;
            this.cacheProfile();
            return false;
        }
    }

    async synchronize() {
        if (!await this.flushPendingEvents()) return false;
        try {
            await this.loadProfile();
            this.lastSaveError = null;
            return true;
        } catch (error) {
            this.lastSaveError = error;
            this.persistenceAvailable = false;
            this.cacheProfile();
            return false;
        }
    }

    queueEvent(payload) {
        const event = {
            userName: this.userName,
            payload: {
                completed: true,
                ...payload,
                date: payload.date || getLocalDate(),
                eventId: payload.eventId || createId('event'),
                deviceId: this.deviceId
            }
        };
        this.setPendingEvents([...this.getPendingEvents(), event]);
        applyLearningEvent(this.data, event.payload);
        this.cacheProfile();
        this.writeQueue = this.writeQueue.catch(() => {}).then(() => this.ready).then(() => this.flushPendingEvents());
        return event.payload.eventId;
    }

    async flush() {
        await this.writeQueue;
        return this.flushPendingEvents();
    }

    getUserName() { return this.userName; }
    getAvatar() { return this.data.avatar; }
    load() { return this.data; }

    async getUsers() {
        await this.waitUntilReady();
        if (!await this.flush()) {
            return [{ name: this.userName, avatar: this.getAvatar(), collectedCount: this.getCollectedCount(), totalCorrect: this.data.totalCorrect }];
        }
        try {
            const payload = await this.request(`${API_PREFIX}/users`);
            return payload.users;
        } catch {
            return [{ name: this.userName, avatar: this.getAvatar(), collectedCount: this.getCollectedCount(), totalCorrect: this.data.totalCorrect }];
        }
    }

    async createUser(username, avatar = AVATAR_OPTIONS[0]) {
        await this.waitUntilReady();
        const name = normalizeUsername(username);
        if (!AVATAR_OPTIONS.includes(avatar)) throw new Error('Invalid avatar');
        await this.flush();
        const payload = await this.request(`${API_PREFIX}/users`, {
            method: 'POST', body: JSON.stringify({ name, avatar })
        });
        this.userName = payload.name;
        this.acceptServerData(payload.data);
        this.persistenceAvailable = true;
        this.writeCache(ACTIVE_USER_KEY, this.userName);
        return this.data;
    }

    async switchUser(username) {
        await this.waitUntilReady();
        const name = normalizeUsername(username);
        await this.flush();
        const payload = await this.request(`${API_PREFIX}/users/${encodeURIComponent(name)}`);
        this.userName = payload.name;
        this.acceptServerData(payload.data);
        this.persistenceAvailable = true;
        this.writeCache(ACTIVE_USER_KEY, this.userName);
        await this.flushPendingEvents();
        return this.data;
    }

    async savePatch(patch) {
        await this.waitUntilReady();
        if (Object.keys(patch).some(key => !SETTINGS.includes(key))) throw new Error('Only settings can be saved as a patch');
        if (patch.avatar !== undefined && !AVATAR_OPTIONS.includes(patch.avatar)) throw new Error('Invalid avatar');
        if (SETTINGS.slice(1).some(key => patch[key] !== undefined && typeof patch[key] !== 'boolean')) {
            throw new Error('Settings must be booleans');
        }
        this.queueEvent({ type: 'settings', patch });
        await this.flush();
        return this.data;
    }

    async setAvatar(avatar) {
        if (avatar === this.getAvatar()) return false;
        await this.savePatch({ avatar });
        return true;
    }

    save() { return this.savePatch(Object.fromEntries(SETTINGS.map(key => [key, this.data[key]]))); }

    async getLeaderboard() {
        await this.waitUntilReady();
        if (!await this.flush()) return [{
            id: this.data.id,
            name: this.userName,
            avatar: this.getAvatar(),
            totalCorrect: this.data.totalCorrect,
            totalPlayed: this.data.totalPlayed,
            accuracy: this.getStats().accuracy,
            collectedCount: this.getCollectedCount()
        }];
        try {
            return (await this.request(`${API_PREFIX}/leaderboard`)).leaderboard;
        } catch {
            return [{
                id: this.data.id,
                name: this.userName,
                avatar: this.getAvatar(),
                totalCorrect: this.data.totalCorrect,
                totalPlayed: this.data.totalPlayed,
                accuracy: this.getStats().accuracy,
                collectedCount: this.getCollectedCount()
            }];
        }
    }

    addCard(cardId) {
        if (!Number.isInteger(cardId) || cardId < 1 || cardId > 63) throw new Error('Invalid card ID');
        const isNew = !this.hasCard(cardId);
        this.queueEvent({ type: 'card', cardId });
        return isNew;
    }

    hasCard(cardId) { return this.data.collectedCards.includes(cardId); }
    getCollectedCards() { return [...this.data.collectedCards]; }
    getCollectedCount() { return this.data.collectedCards.length; }
    getHighScore(difficulty) { return this.data.highScores[difficulty] || 0; }

    updateHighScore(difficulty, score) {
        if (!(difficulty in this.data.highScores) || !Number.isSafeInteger(score) || score < 0) throw new Error('Invalid high score');
        if (score <= this.getHighScore(difficulty)) return false;
        this.queueEvent({ type: 'highScore', difficulty, score });
        return true;
    }

    recordGame(correct, metadata = {}) {
        this.queueEvent({
            type: 'answer', correct: correct === true,
            skillId: metadata.skillId || 'general',
            mode: metadata.mode || 'math', hintUsed: metadata.hintUsed === true
        });
    }

    recordSession(summary = {}) {
        this.queueEvent({
            type: 'session', mode: summary.mode || 'math',
            skillId: summary.skillId || 'general',
            difficulty: summary.difficulty || '', score: summary.score || 0,
            completed: summary.completed !== false,
            eventId: summary.sessionId
        });
    }

    getLocalDate() { return getLocalDate(); }

    isParentPinConfigured() { return this.data.parentPinConfigured; }

    async verifyParentPin(pin) {
        const payload = await this.request(`${API_PREFIX}/users/${encodeURIComponent(this.userName)}/parent-pin`, {
            method: 'POST', body: JSON.stringify({ action: 'verify', pin })
        });
        if (!payload.verified) throw new Error('Parent PIN is incorrect');
        return true;
    }

    async setParentPin(pin, currentPin = '') {
        const payload = await this.request(`${API_PREFIX}/users/${encodeURIComponent(this.userName)}/parent-pin`, {
            method: 'POST', body: JSON.stringify({ action: 'set', pin, currentPin })
        });
        this.data.parentPinConfigured = payload.configured === true;
        this.cacheProfile();
        return payload.verified === true;
    }

    async getDashboard(parentPin) {
        if (!await this.flush() || !this.persistenceAvailable) return this.buildLocalDashboard();
        try {
            return (await this.request(`${API_PREFIX}/users/${encodeURIComponent(this.userName)}/dashboard`, {
                headers: { 'X-Parent-Pin': parentPin }
            })).dashboard;
        } catch (error) {
            if (!error.status) return this.buildLocalDashboard();
            throw error;
        }
    }

    buildLocalDashboard() {
        return {
            stats: this.getStats(), skillProgress: this.data.skillProgress,
            dailyProgress: getTodayProgress(this.data.dailyProgress),
            achievements: this.data.achievements, stars: this.data.stars,
            collectedCount: this.getCollectedCount(), updatedAt: this.data.updatedAt
        };
    }

    getStats() {
        return {
            totalPlayed: this.data.totalPlayed, totalCorrect: this.data.totalCorrect,
            accuracy: this.data.totalPlayed ? Math.round(this.data.totalCorrect / this.data.totalPlayed * 100) : 0
        };
    }

    setSoundEnabled(enabled) { return this.savePatch({ soundEnabled: enabled }); }
    setReducedMotion(enabled) { return this.savePatch({ reducedMotion: enabled }); }
    setVoiceEnabled(enabled) { return this.savePatch({ voiceEnabled: enabled }); }
    isSoundEnabled() { return this.data.soundEnabled !== false; }
}

export const storage = typeof window !== 'undefined' ? new StorageManager() : null;
