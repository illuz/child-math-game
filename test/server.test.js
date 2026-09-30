const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createServer } = require('../server');

async function createTestServer(initialStore) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'child-math-game-'));
    const dataFile = path.join(directory, 'users.json');
    if (initialStore) {
        await fs.writeFile(dataFile, JSON.stringify(initialStore));
    }

    const server = await createServer({
        dataFile,
        rootDir: path.join(__dirname, '..')
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    return {
        baseUrl,
        async close() {
            await new Promise(resolve => server.close(resolve));
            await fs.rm(directory, { recursive: true, force: true });
        }
    };
}

async function request(baseUrl, endpoint, options) {
    const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options?.headers || {})
        }
    });
    const payload = await response.json();
    return { response, payload };
}

test('creates passwordless users with avatars and sorts the leaderboard', async () => {
    const server = await createTestServer();
    try {
        const alice = await request(server.baseUrl, '/api/users', {
            method: 'POST',
            body: JSON.stringify({ name: '小明', avatar: '🦄' })
        });
        assert.equal(alice.response.status, 201);
        assert.equal(alice.payload.data.avatar, '🦄');

        const bob = await request(server.baseUrl, '/api/users', {
            method: 'POST',
            body: JSON.stringify({ name: '小红', avatar: '🐼' })
        });
        assert.equal(bob.response.status, 201);

        const saved = await request(server.baseUrl, '/api/users/%E5%B0%8F%E6%98%8E', {
            method: 'PUT',
            body: JSON.stringify({
                data: {
                    avatar: '🦄',
                    collectedCards: [1, 2],
                    highScores: { easy: 30 },
                    totalPlayed: 5,
                    totalCorrect: 4,
                    soundEnabled: true
                }
            })
        });
        assert.equal(saved.response.status, 200);

        const leaderboard = await request(server.baseUrl, '/api/leaderboard');
        assert.equal(leaderboard.response.status, 200);
        assert.equal(leaderboard.payload.leaderboard[0].name, '小明');
        assert.equal(leaderboard.payload.leaderboard[0].totalCorrect, 4);
        assert.equal(leaderboard.payload.leaderboard[0].collectedCount, 2);
        assert.equal(leaderboard.payload.leaderboard[0].avatar, '🦄');
    } finally {
        await server.close();
    }
});

test('persists avatar and cards after restarting the server', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'child-math-game-restart-'));
    const dataFile = path.join(directory, 'users.json');
    let server = await createServer({ dataFile, rootDir: path.join(__dirname, '..') });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const firstBaseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
        await request(firstBaseUrl, '/api/users', {
            method: 'POST',
            body: JSON.stringify({ name: '持久化用户', avatar: '🐯' })
        });
        await request(firstBaseUrl, '/api/users/%E6%8C%81%E4%B9%85%E5%8C%96%E7%94%A8%E6%88%B7', {
            method: 'PUT',
            body: JSON.stringify({
                data: {
                    avatar: '🐯',
                    collectedCards: [3, 8],
                    highScores: {},
                    totalPlayed: 2,
                    totalCorrect: 1,
                    soundEnabled: true
                }
            })
        });
        await new Promise(resolve => server.close(resolve));

        server = await createServer({ dataFile, rootDir: path.join(__dirname, '..') });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const restartedBaseUrl = `http://127.0.0.1:${server.address().port}`;
        const profile = await request(restartedBaseUrl, '/api/users/%E6%8C%81%E4%B9%85%E5%8C%96%E7%94%A8%E6%88%B7');
        assert.equal(profile.response.status, 200);
        assert.equal(profile.payload.data.avatar, '🐯');
        assert.deepEqual(profile.payload.data.collectedCards, [3, 8]);
    } finally {
        await new Promise(resolve => server.close(resolve));
        await fs.rm(directory, { recursive: true, force: true });
    }
});

test('rejects invalid avatars and defaults legacy profiles', async () => {
    const server = await createTestServer({
        version: 1,
        users: {
            旧用户: {
                collectedCards: [1],
                highScores: {},
                totalPlayed: 1,
                totalCorrect: 1,
                soundEnabled: true
            }
        }
    });
    try {
        const invalid = await request(server.baseUrl, '/api/users', {
            method: 'POST',
            body: JSON.stringify({ name: '无效头像', avatar: '💣' })
        });
        assert.equal(invalid.response.status, 400);

        const users = await request(server.baseUrl, '/api/users');
        const legacyUser = users.payload.users.find(user => user.name === '旧用户');
        assert.equal(legacyUser.avatar, '🌈');
    } finally {
        await server.close();
    }
});
