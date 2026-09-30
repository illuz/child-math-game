const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT_DIR = __dirname;
const DATA_FILE = path.join(ROOT_DIR, 'data', 'users.json');
const DEFAULT_USERNAME = '小朋友';
const DEFAULT_AVATAR = '🌈';
const AVATAR_OPTIONS = ['🌈', '🦄', '🦋', '🐰', '🐼', '🐯', '🐨', '🐸', '🐱', '🐶'];
const MAX_BODY_SIZE = 64 * 1024;
const DIFFICULTIES = ['easy', 'medium', 'hard', 'infinite', 'hell', 'hanzi_easy', 'hanzi_medium', 'hanzi_hard'];
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
    if (input.soundEnabled !== undefined && typeof input.soundEnabled !== 'boolean') {
        throw new HttpError(400, 'Sound setting must be a boolean');
    }
    return {
        avatar: normalizeAvatar(input.avatar),
        collectedCards: [...new Set(collectedCards)],
        highScores,
        totalCorrect,
        totalPlayed,
        soundEnabled: input.soundEnabled !== false,
        updatedAt: new Date().toISOString()
    };
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
        const store = { version: 1, users: { [DEFAULT_USERNAME]: normalizeProfile() } };
        await writeStore(dataFile, store);
        return store;
    }
    // Abort on malformed existing data instead of silently replacing a user's cards.
    if (!isObject(raw) || raw.version !== 1 || !isObject(raw.users)) throw new Error('Invalid users.json format');
    const users = Object.fromEntries(Object.entries(raw.users).map(([name, data]) => {
        if (normalizeUsername(name) !== name) throw new Error('Invalid username in users.json');
        const profile = normalizeProfile(data);
        if (typeof data.updatedAt === 'string') profile.updatedAt = data.updatedAt;
        return [name, profile];
    }));
    if (!Object.hasOwn(users, DEFAULT_USERNAME)) users[DEFAULT_USERNAME] = normalizeProfile();
    return { version: 1, users };
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
    let store = await readStore(dataFile);
    let writeQueue = Promise.resolve();

    function updateStore(update) {
        // Serialize read-modify-write operations and update memory only after the disk write.
        const operation = writeQueue.then(async () => {
            const next = { version: 1, users: { ...store.users } };
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
                            name,
                            avatar: data.avatar,
                            collectedCount: data.collectedCards.length,
                            totalCorrect: data.totalCorrect
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
                sendJson(response, 201, { name: username, data });
                return;
            }
            if (url.pathname === '/api/leaderboard') {
                if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
                await writeQueue;
                const leaderboard = Object.entries(store.users)
                    .map(([name, data]) => ({
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
            const match = url.pathname.match(/^\/api\/users\/([^/]+)$/);
            if (!match) throw new HttpError(404, 'API endpoint not found');
            const username = normalizeUsername(decodeURIComponent(match[1]));
            await writeQueue;
            if (!Object.hasOwn(store.users, username)) throw new HttpError(404, 'User not found');
            if (request.method === 'GET') {
                sendJson(response, 200, { name: username, data: store.users[username] });
                return;
            }
            if (request.method !== 'PUT') throw new HttpError(405, 'Method not allowed');
            const payload = await readJson(request);
            const input = payload.data ?? payload;
            if (Object.hasOwn(input, 'avatar') && !AVATAR_OPTIONS.includes(input.avatar)) {
                throw new HttpError(400, 'Invalid avatar');
            }
            const data = normalizeProfile(input);
            // Keep the existing avatar for older clients that do not submit one.
            if (!Object.hasOwn(input, 'avatar')) data.avatar = store.users[username].avatar;
            await updateStore(next => { next.users[username] = data; });
            sendJson(response, 200, { name: username, data });
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
