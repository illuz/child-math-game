const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT_DIR = __dirname;
const DATA_FILE = path.join(ROOT_DIR, 'data', 'users.json');
const DEFAULT_USERNAME = '小朋友';
const DEFAULT_AVATAR = '🌈';
const AVATAR_OPTIONS = ['🌈', '🦄', '🦋', '🐰', '🐼', '🐯', '🐨', '🐸', '🐱', '🐶'];
const MAX_BODY_SIZE = 64 * 1024;
const STORE_VERSION = 2;
const MAX_EVENT_IDS = 5000;
const DIFFICULTIES = ['easy', 'medium', 'hard', 'infinite', 'hell', 'hanzi_easy', 'hanzi_medium', 'hanzi_hard'];
const SETTINGS = ['avatar', 'soundEnabled', 'reducedMotion', 'voiceEnabled'];
const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav'
};

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeUsername(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 30
        || /[\\/\u0000-\u001f\u007f]/.test(value)) {
        throw new HttpError(400, 'Username must contain 1 to 30 characters without slashes or control characters');
    }
    return value.trim();
}

function normalizeAvatar(value = DEFAULT_AVATAR) {
    return AVATAR_OPTIONS.includes(value) ? value : DEFAULT_AVATAR;
}

function createId() {
    return crypto.randomUUID();
}

function hashPin(pin, userId) {
    return crypto.scryptSync(String(pin), userId, 32).toString('hex');
}

function validatePin(value) {
    if (!/^\d{4}$/.test(String(value || ''))) {
        throw new HttpError(400, 'Parent PIN must contain exactly 4 digits');
    }
    return String(value);
}

function normalizeSkillProgress(input = {}) {
    if (!isObject(input)) return {};
    return Object.fromEntries(Object.entries(input).map(([skillId, value]) => {
        if (!isObject(value)) return [skillId, { attempts: 0, correct: 0, hints: 0, mastery: 0 }];
        const attempts = Number.isSafeInteger(value.attempts) && value.attempts >= 0 ? value.attempts : 0;
        const correct = Number.isSafeInteger(value.correct) && value.correct >= 0
            ? Math.min(value.correct, attempts)
            : 0;
        const hints = Number.isSafeInteger(value.hints) && value.hints >= 0 ? value.hints : 0;
        const mastery = Number.isFinite(value.mastery)
            ? Math.max(0, Math.min(100, Number(value.mastery)))
            : (attempts ? Math.round((correct / attempts) * 100) : 0);
        return [String(skillId).slice(0, 80), {
            attempts,
            correct,
            hints,
            mastery,
            lastPlayedAt: typeof value.lastPlayedAt === 'string' ? value.lastPlayedAt : null
        }];
    }));
}

function normalizeEventIds(input = []) {
    if (!Array.isArray(input)) return [];
    return [...new Set(input.filter(value => typeof value === 'string' && value.length <= 120))].slice(-MAX_EVENT_IDS);
}

function normalizeAchievements(input = []) {
    if (!Array.isArray(input)) return [];
    return [...new Set(input.filter(value => typeof value === 'string' && value.length <= 80))];
}

function normalizeDailyProgress(input = {}) {
    if (!isObject(input)) return { date: '', answers: 0, correct: 0, sessions: 0, cards: 0, claimed: [] };
    return {
        date: typeof input.date === 'string' ? input.date.slice(0, 20) : '',
        answers: Number.isSafeInteger(input.answers) && input.answers >= 0 ? input.answers : 0,
        correct: Number.isSafeInteger(input.correct) && input.correct >= 0 ? input.correct : 0,
        sessions: Number.isSafeInteger(input.sessions) && input.sessions >= 0 ? input.sessions : 0,
        cards: Number.isSafeInteger(input.cards) && input.cards >= 0 ? input.cards : 0,
        claimed: Array.isArray(input.claimed)
            ? [...new Set(input.claimed.filter(value => typeof value === 'string' && value.length <= 80))]
            : []
    };
}

function normalizeProfile(input = {}) {
    if (!isObject(input)) throw new HttpError(400, 'User data must be a JSON object');
    const collectedCards = input.collectedCards ?? [];
    const scores = input.highScores ?? {};
    if (!Array.isArray(collectedCards) || collectedCards.some(id => !Number.isInteger(id) || id < 1 || id > 63)) {
        throw new HttpError(400, 'Card IDs must be integers from 1 to 63');
    }
    if (!isObject(scores)) throw new HttpError(400, 'High scores must be a JSON object');
    const highScores = Object.fromEntries(DIFFICULTIES.map(difficulty => {
        const score = Object.hasOwn(scores, difficulty) ? scores[difficulty] : 0;
        if (!Number.isSafeInteger(score) || score < 0) throw new HttpError(400, 'High scores must be non-negative integers');
        return [difficulty, score];
    }));
    const totalPlayed = input.totalPlayed ?? 0;
    const totalCorrect = input.totalCorrect ?? 0;
    if (![totalPlayed, totalCorrect].every(value => Number.isSafeInteger(value) && value >= 0)
        || totalCorrect > totalPlayed) {
        throw new HttpError(400, 'Invalid answer statistics');
    }
    for (const setting of SETTINGS.slice(1)) {
        if (input[setting] !== undefined && typeof input[setting] !== 'boolean') {
            throw new HttpError(400, 'Settings must be booleans');
        }
    }
    const dailyProgress = normalizeDailyProgress(input.dailyProgress);
    const dailyHistory = isObject(input.dailyHistory)
        ? Object.fromEntries(Object.entries(input.dailyHistory)
            .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date))
            .map(([date, progress]) => [date, { ...normalizeDailyProgress(progress), date }]))
        : {};
    if (dailyProgress.date && !Object.hasOwn(dailyHistory, dailyProgress.date)) {
        dailyHistory[dailyProgress.date] = dailyProgress;
    }
    return {
        id: typeof input.id === 'string' && input.id.length > 0 ? input.id : createId(),
        avatar: normalizeAvatar(input.avatar),
        collectedCards: [...new Set(collectedCards)],
        highScores,
        totalCorrect,
        totalPlayed,
        soundEnabled: input.soundEnabled !== false,
        reducedMotion: input.reducedMotion === true,
        voiceEnabled: input.voiceEnabled !== false,
        parentPinHash: typeof input.parentPinHash === 'string' && /^[a-f0-9]{64}$/.test(input.parentPinHash)
            ? input.parentPinHash
            : '',
        stars: Number.isSafeInteger(input.stars) && input.stars >= 0 ? input.stars : 0,
        skillProgress: normalizeSkillProgress(input.skillProgress),
        achievements: normalizeAchievements(input.achievements),
        dailyProgress,
        dailyHistory,
        eventIds: normalizeEventIds(input.eventIds),
        revision: Number.isSafeInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
        updatedAt: new Date().toISOString()
    };
}

function normalizeEvent(input = {}) {
    if (!isObject(input)) throw new HttpError(400, 'Event must be a JSON object');
    const eventId = typeof input.eventId === 'string' ? input.eventId.trim() : '';
    const type = typeof input.type === 'string' ? input.type.trim() : '';
    if (!eventId || eventId.length > 120) throw new HttpError(400, 'Event ID is required');
    if (!['answer', 'card', 'highScore', 'session', 'settings'].includes(type)) {
        throw new HttpError(400, 'Unsupported event type');
    }
    if (type === 'settings') {
        if (!isObject(input.patch) || Object.keys(input.patch).some(key => !SETTINGS.includes(key))) {
            throw new HttpError(400, 'Invalid settings patch');
        }
        if (Object.hasOwn(input.patch, 'avatar') && !AVATAR_OPTIONS.includes(input.patch.avatar)) {
            throw new HttpError(400, 'Invalid avatar');
        }
        for (const key of SETTINGS.slice(1)) {
            if (Object.hasOwn(input.patch, key) && typeof input.patch[key] !== 'boolean') {
                throw new HttpError(400, 'Settings must be booleans');
            }
        }
    }
    const date = input.date ?? new Date().toISOString().slice(0, 10);
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
        || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
        throw new HttpError(400, 'Invalid event date');
    }
    const skillId = input.skillId || 'general';
    if (typeof skillId !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(skillId)) {
        throw new HttpError(400, 'Invalid skill ID');
    }
    if (type === 'answer' && typeof input.correct !== 'boolean') throw new HttpError(400, 'Answer result must be a boolean');
    if (type === 'card' && (!Number.isInteger(input.cardId) || input.cardId < 1 || input.cardId > 63)) {
        throw new HttpError(400, 'Invalid card ID');
    }
    if (type === 'highScore' || type === 'session') {
        if (!Number.isSafeInteger(input.score ?? 0) || (input.score ?? 0) < 0
            || (input.difficulty && !DIFFICULTIES.includes(input.difficulty))) {
            throw new HttpError(400, 'Invalid score or difficulty');
        }
    }
    return {
        eventId,
        type,
        correct: input.correct === true,
        skillId,
        mode: typeof input.mode === 'string' ? input.mode.slice(0, 40) : 'math',
        difficulty: typeof input.difficulty === 'string' ? input.difficulty.slice(0, 40) : '',
        score: Number.isSafeInteger(input.score) && input.score >= 0 ? input.score : 0,
        cardId: Number.isSafeInteger(input.cardId) && input.cardId >= 1 && input.cardId <= 63
            ? input.cardId
            : null,
        hintUsed: input.hintUsed === true,
        completed: input.completed !== false,
        patch: type === 'settings' ? input.patch : undefined,
        date
    };
}

function publicProfile(profile) {
    const { parentPinHash, ...data } = profile;
    return { ...data, parentPinConfigured: Boolean(parentPinHash) };
}

async function writeStore(dataFile, store) {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    // Replace the file atomically so an interrupted write cannot corrupt the JSON.
    await fs.writeFile(`${dataFile}.tmp`, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 });
    await fs.rename(`${dataFile}.tmp`, dataFile);
}

async function readStore(dataFile) {
    let raw;
    try {
        raw = JSON.parse(await fs.readFile(dataFile, 'utf8'));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        const store = { version: STORE_VERSION, users: { [DEFAULT_USERNAME]: normalizeProfile() } };
        await writeStore(dataFile, store);
        return store;
    }
    // Abort on malformed existing data instead of silently replacing a user's cards.
    if (!isObject(raw) || ![1, STORE_VERSION].includes(raw.version) || !isObject(raw.users)) {
        throw new Error('Invalid users.json format');
    }
    const users = Object.fromEntries(Object.entries(raw.users).map(([name, data]) => {
        if (normalizeUsername(name) !== name) throw new Error('Invalid username in users.json');
        const profile = normalizeProfile(data);
        if (typeof data.updatedAt === 'string') profile.updatedAt = data.updatedAt;
        return [name, profile];
    }));
    if (!Object.hasOwn(users, DEFAULT_USERNAME)) users[DEFAULT_USERNAME] = normalizeProfile();
    const store = { version: STORE_VERSION, users };
    if (raw.version !== STORE_VERSION) await writeStore(dataFile, store);
    return store;
}

function sendJson(response, status, payload) {
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    response.end(JSON.stringify(payload));
}

async function readJson(request) {
    if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) {
        throw new HttpError(415, 'Content-Type must be application/json');
    }
    const body = await new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        request.on('data', chunk => {
            size += chunk.length;
            if (size <= MAX_BODY_SIZE) chunks.push(chunk);
        });
        request.on('end', () => size > MAX_BODY_SIZE
            ? reject(new HttpError(413, 'Request body is too large'))
            : resolve(Buffer.concat(chunks).toString('utf8')));
        request.on('error', reject);
    });
    let payload;
    try {
        payload = JSON.parse(body);
    } catch {
        throw new HttpError(400, 'Invalid JSON body');
    }
    if (!isObject(payload)) throw new HttpError(400, 'Request body must be a JSON object');
    return payload;
}

async function serveStatic(request, response, pathname, rootDir) {
    const decoded = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const filePath = path.resolve(rootDir, `.${decoded}`);
    const relativePath = path.relative(rootDir, filePath).split(path.sep).join('/');
    // Serve only game assets; do not expose data, configuration, or .git files.
    if ((relativePath !== 'index.html' && !/^(css|js|images|assets)\//.test(relativePath))
        || relativePath.split('/').some(segment => segment.startsWith('.'))) {
        throw new HttpError(404, 'File not found');
    }
    let file;
    try {
        const realPath = await fs.realpath(filePath);
        if (path.relative(rootDir, realPath).startsWith('..')) throw new HttpError(404, 'File not found');
        file = await fs.readFile(realPath);
    } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EISDIR') {
            throw new HttpError(404, 'File not found');
        }
        throw error;
    }
    response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Content-Length': file.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
    });
    response.end(request.method === 'HEAD' ? undefined : file);
}

async function createServer({ dataFile = DATA_FILE, rootDir = ROOT_DIR } = {}) {
    const { applyLearningEvent } = await import('./js/core/progress.js');
    let store = await readStore(dataFile);
    let writeQueue = Promise.resolve();

    function updateStore(update) {
        // Serialize read-modify-write operations and update memory only after the disk write.
        const operation = writeQueue.then(async () => {
            const next = {
                version: STORE_VERSION,
                users: Object.fromEntries(Object.entries(store.users).map(([name, data]) => [
                    name,
                    JSON.parse(JSON.stringify(data))
                ]))
            };
            const result = update(next);
            await writeStore(dataFile, next);
            store = next;
            return result;
        });
        writeQueue = operation.catch(() => {});
        return operation;
    }

    return http.createServer(async (request, response) => {
        try {
            const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
            if (!url.pathname.startsWith('/api/')) {
                if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, 'Method not allowed');
                await serveStatic(request, response, url.pathname, rootDir);
                return;
            }
            if (request.headers.origin && request.headers.origin !== url.origin) {
                throw new HttpError(403, 'Cross-origin API requests are not allowed');
            }
            if (url.pathname === '/api/users') {
                if (request.method === 'GET') {
                    await writeQueue;
                    sendJson(response, 200, { users: Object.entries(store.users)
                        .map(([name, data]) => ({
                            id: data.id,
                            name,
                            avatar: data.avatar,
                            collectedCount: data.collectedCards.length,
                            totalCorrect: data.totalCorrect,
                            stars: data.stars
                        }))
                        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')) });
                    return;
                }
                if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
                const { name, avatar } = await readJson(request);
                const username = normalizeUsername(name);
                if (avatar !== undefined && !AVATAR_OPTIONS.includes(avatar)) {
                    throw new HttpError(400, 'Invalid avatar');
                }
                const data = await updateStore(next => {
                    if (Object.hasOwn(next.users, username)) throw new HttpError(409, 'Username already exists');
                    next.users = { ...next.users, [username]: normalizeProfile({ avatar }) };
                    return next.users[username];
                });
                sendJson(response, 201, { id: data.id, name: username, data: publicProfile(data) });
                return;
            }
            if (url.pathname === '/api/leaderboard') {
                if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
                await writeQueue;
                const leaderboard = Object.entries(store.users)
                    .map(([name, data]) => ({
                        id: data.id,
                        name,
                        avatar: data.avatar,
                        totalCorrect: data.totalCorrect,
                        totalPlayed: data.totalPlayed,
                        accuracy: data.totalPlayed > 0
                            ? Math.round((data.totalCorrect / data.totalPlayed) * 100)
                            : 0,
                        collectedCount: data.collectedCards.length
                    }))
                    .sort((a, b) => b.totalCorrect - a.totalCorrect
                        || b.collectedCount - a.collectedCount
                        || b.accuracy - a.accuracy
                        || a.name.localeCompare(b.name, 'zh-CN'));
                sendJson(response, 200, { leaderboard });
                return;
            }
            const eventMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/events$/);
            if (eventMatch) {
                if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
                const username = normalizeUsername(decodeURIComponent(eventMatch[1]));
                const event = normalizeEvent(await readJson(request));
                const result = await updateStore(next => {
                    if (!Object.hasOwn(next.users, username)) throw new HttpError(404, 'User not found');
                    return applyLearningEvent(next.users[username], event);
                });
                sendJson(response, 200, {
                    name: username,
                    duplicate: result.duplicate,
                    data: publicProfile(result.profile)
                });
                return;
            }

            const pinMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/parent-pin$/);
            if (pinMatch) {
                if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
                const username = normalizeUsername(decodeURIComponent(pinMatch[1]));
                const payload = await readJson(request);
                const action = payload.action || 'verify';
                if (!['set', 'verify'].includes(action)) throw new HttpError(400, 'Invalid PIN action');
                const pin = validatePin(payload.pin);
                const result = await updateStore(next => {
                    if (!Object.hasOwn(next.users, username)) throw new HttpError(404, 'User not found');
                    const profile = next.users[username];
                    if (action === 'set') {
                        if (profile.parentPinHash && profile.parentPinHash !== hashPin(payload.currentPin, profile.id)) {
                            throw new HttpError(403, 'Current parent PIN is incorrect');
                        }
                        profile.parentPinHash = hashPin(pin, profile.id);
                        profile.revision += 1;
                        profile.updatedAt = new Date().toISOString();
                        return { configured: true, verified: true };
                    }
                    if (!profile.parentPinHash) throw new HttpError(409, 'Parent PIN is not configured');
                    return { configured: true, verified: profile.parentPinHash === hashPin(pin, profile.id) };
                });
                if (!result.verified) throw new HttpError(403, 'Parent PIN is incorrect');
                sendJson(response, 200, result);
                return;
            }

            const dashboardMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/dashboard$/);
            if (dashboardMatch) {
                if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
                const username = normalizeUsername(decodeURIComponent(dashboardMatch[1]));
                await writeQueue;
                if (!Object.hasOwn(store.users, username)) throw new HttpError(404, 'User not found');
                const data = store.users[username];
                const parentPin = request.headers['x-parent-pin'];
                if (!data.parentPinHash || data.parentPinHash !== hashPin(parentPin, data.id)) {
                    throw new HttpError(403, 'Parent PIN is required');
                }
                sendJson(response, 200, {
                    name: username,
                    dashboard: {
                        stats: {
                            totalPlayed: data.totalPlayed,
                            totalCorrect: data.totalCorrect,
                            accuracy: data.totalPlayed > 0
                                ? Math.round((data.totalCorrect / data.totalPlayed) * 100)
                                : 0
                        },
                        skillProgress: data.skillProgress,
                        dailyProgress: data.dailyProgress,
                        dailyHistory: data.dailyHistory,
                        achievements: data.achievements,
                        stars: data.stars,
                        collectedCount: data.collectedCards.length,
                        updatedAt: data.updatedAt
                    }
                });
                return;
            }

            const match = url.pathname.match(/^\/api\/users\/([^/]+)$/);
            if (!match) throw new HttpError(404, 'API endpoint not found');
            const username = normalizeUsername(decodeURIComponent(match[1]));
            await writeQueue;
            if (!Object.hasOwn(store.users, username)) throw new HttpError(404, 'User not found');
            if (request.method === 'GET') {
                sendJson(response, 200, { id: store.users[username].id, name: username, data: publicProfile(store.users[username]) });
                return;
            }
            if (request.method !== 'PUT') throw new HttpError(405, 'Method not allowed');
            const payload = await readJson(request);
            const isPatch = Object.hasOwn(payload, 'patch');
            const input = isPatch ? payload.patch : (payload.data ?? payload);
            if (!isObject(input)) throw new HttpError(400, 'User data must be a JSON object');
            if (isPatch && Object.keys(input).some(key => !SETTINGS.includes(key))) {
                throw new HttpError(400, 'Only user settings can be patched');
            }
            if (Object.hasOwn(input, 'avatar') && !AVATAR_OPTIONS.includes(input.avatar)) {
                throw new HttpError(400, 'Invalid avatar');
            }
            const data = await updateStore(next => {
                const existing = next.users[username];
                const settings = Object.fromEntries(SETTINGS.filter(key => Object.hasOwn(input, key))
                    .map(key => [key, input[key]]));
                const merged = normalizeProfile({ ...existing, ...settings });
                // 兼容旧客户端，但陈旧快照不能清除其他设备刚写入的进度。
                if (!isPatch) {
                    const legacy = normalizeProfile(input);
                    merged.collectedCards = [...new Set([...existing.collectedCards, ...legacy.collectedCards])];
                    merged.totalPlayed = Math.max(existing.totalPlayed, legacy.totalPlayed);
                    merged.totalCorrect = Math.max(existing.totalCorrect, legacy.totalCorrect);
                    for (const difficulty of DIFFICULTIES) {
                        merged.highScores[difficulty] = Math.max(existing.highScores[difficulty], legacy.highScores[difficulty]);
                    }
                }
                merged.revision = existing.revision + 1;
                next.users[username] = merged;
                return merged;
            });
            sendJson(response, 200, { name: username, data: publicProfile(data) });
        } catch (error) {
            const status = error.status || (error instanceof URIError ? 400 : 500);
            if (status === 500) console.error('Request failed:', error.message);
            sendJson(response, status, { error: status === 500 ? 'Internal server error' : error.message });
        }
    });
}

if (require.main === module) {
    createServer().then(server => {
        const port = Number(process.env.PORT || 8080);
        const host = process.env.HOST || '127.0.0.1';
        server.on('error', error => {
            console.error('Server failed:', error.message);
            process.exitCode = 1;
        });
        server.listen(port, host, () => {
            console.log(`Game ready at http://${host}:${server.address().port}`);
        });
    }).catch(error => {
        console.error('Server startup failed:', error.message);
        process.exitCode = 1;
    });
}

module.exports = { createServer };
