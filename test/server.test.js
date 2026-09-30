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
        dataFile,
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
        const migrated = JSON.parse(await fs.readFile(server.dataFile, 'utf8'));
        assert.equal(migrated.version, 2);
        assert.match(migrated.users['旧用户'].id, /^[0-9a-f-]{36}$/);
    } finally {
        await server.close();
    }
});

test('applies answer events idempotently and exposes dashboard progress', async () => {
    const server = await createTestServer();
    try {
        const created = await request(server.baseUrl, '/api/users', {
            method: 'POST',
            body: JSON.stringify({ name: '进度用户', avatar: '🐰' })
        });
        assert.equal(created.response.status, 201);
        assert.match(created.payload.data.id, /^[0-9a-f-]{36}$/);

        const event = {
            eventId: 'device-a-answer-1',
            type: 'answer',
            correct: true,
            skillId: 'counting_1_5',
            mode: 'visual',
            date: '2026-09-30'
        };
        const first = await request(server.baseUrl, '/api/users/%E8%BF%9B%E5%BA%A6%E7%94%A8%E6%88%B7/events', {
            method: 'POST',
            body: JSON.stringify(event)
        });
        assert.equal(first.response.status, 200);
        assert.equal(first.payload.duplicate, false);
        assert.equal(first.payload.data.totalPlayed, 1);
        assert.equal(first.payload.data.totalCorrect, 1);

        const pin = await request(server.baseUrl, '/api/users/%E8%BF%9B%E5%BA%A6%E7%94%A8%E6%88%B7/parent-pin', {
            method: 'POST',
            body: JSON.stringify({ action: 'set', pin: '2468' })
        });
        assert.equal(pin.response.status, 200);

        const duplicate = await request(server.baseUrl, '/api/users/%E8%BF%9B%E5%BA%A6%E7%94%A8%E6%88%B7/events', {
            method: 'POST',
            body: JSON.stringify(event)
        });
        assert.equal(duplicate.response.status, 200);
        assert.equal(duplicate.payload.duplicate, true);
        assert.equal(duplicate.payload.data.totalPlayed, 1);

        const dashboard = await request(server.baseUrl, '/api/users/%E8%BF%9B%E5%BA%A6%E7%94%A8%E6%88%B7/dashboard');
        assert.equal(dashboard.response.status, 403);

        const authorizedDashboard = await request(server.baseUrl, '/api/users/%E8%BF%9B%E5%BA%A6%E7%94%A8%E6%88%B7/dashboard', {
            headers: { 'X-Parent-Pin': '2468' }
        });
        assert.equal(authorizedDashboard.response.status, 200);
        assert.equal(authorizedDashboard.payload.dashboard.stats.accuracy, 100);
        assert.equal(authorizedDashboard.payload.dashboard.skillProgress.counting_1_5.correct, 1);
        assert.equal(authorizedDashboard.payload.dashboard.dailyProgress.answers, 1);
    } finally {
        await server.close();
    }
});

test('protects the parent dashboard with a four-digit PIN', async () => {
    const server = await createTestServer();
    try {
        const created = await request(server.baseUrl, '/api/users', {
            method: 'POST',
            body: JSON.stringify({ name: '家长 PIN 用户' })
        });
        assert.equal(created.response.status, 201);

        const set = await request(server.baseUrl, '/api/users/%E5%AE%B6%E9%95%BF%20PIN%20%E7%94%A8%E6%88%B7/parent-pin', {
            method: 'POST',
            body: JSON.stringify({ action: 'set', pin: '1234' })
        });
        assert.equal(set.response.status, 200);
        assert.equal(set.payload.configured, true);

        const wrong = await request(server.baseUrl, '/api/users/%E5%AE%B6%E9%95%BF%20PIN%20%E7%94%A8%E6%88%B7/parent-pin', {
            method: 'POST',
            body: JSON.stringify({ action: 'verify', pin: '0000' })
        });
        assert.equal(wrong.response.status, 403);

        const right = await request(server.baseUrl, '/api/users/%E5%AE%B6%E9%95%BF%20PIN%20%E7%94%A8%E6%88%B7/parent-pin', {
            method: 'POST',
            body: JSON.stringify({ action: 'verify', pin: '1234' })
        });
        assert.equal(right.response.status, 200);
        assert.equal(right.payload.verified, true);
    } finally {
        await server.close();
    }
});

test('awards daily mission stars once per day', async () => {
    const server = await createTestServer();
    try {
        await request(server.baseUrl, '/api/users', {
            method: 'POST',
            body: JSON.stringify({ name: '每日任务用户' })
        });
        const endpoint = '/api/users/%E6%AF%8F%E6%97%A5%E4%BB%BB%E5%8A%A1%E7%94%A8%E6%88%B7/events';
        for (let index = 0; index < 5; index += 1) {
            const result = await request(server.baseUrl, endpoint, {
                method: 'POST',
                body: JSON.stringify({
                    eventId: `daily-answer-${index}`,
                    type: 'answer',
                    correct: true,
                    skillId: 'counting_1_5',
                    date: '2026-09-30'
                })
            });
            assert.equal(result.response.status, 200);
        }
        const card = await request(server.baseUrl, endpoint, {
            method: 'POST',
            body: JSON.stringify({ eventId: 'daily-card-1', type: 'card', cardId: 1, date: '2026-09-30' })
        });
        assert.equal(card.response.status, 200);
        assert.equal(card.payload.data.stars, 21);
        assert.deepEqual(card.payload.data.dailyProgress.claimed.sort(), [
            'daily_answers_5',
            'daily_card_1',
            'daily_correct_3'
        ]);
    } finally {
        await server.close();
    }
});
