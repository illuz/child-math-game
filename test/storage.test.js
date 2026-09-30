const assert = require('node:assert/strict');
const test = require('node:test');

test('storage manager queues learning events and reconciles server responses', async () => {
    const { StorageManager } = await import('../js/storage.js');
    const values = new Map();
    const cache = {
        getItem: key => values.get(key) || null,
        setItem: (key, value) => values.set(key, value)
    };
    const calls = [];
    let profile = {
        id: 'user-1',
        avatar: '🌈',
        collectedCards: [],
        highScores: { easy: 0, medium: 0, hard: 0, infinite: 0, hell: 0, hanzi_easy: 0, hanzi_medium: 0, hanzi_hard: 0 },
        totalPlayed: 0,
        totalCorrect: 0,
        soundEnabled: true,
        parentPinConfigured: false,
        skillProgress: {},
        achievements: [],
        dailyProgress: { date: '', answers: 0, correct: 0, sessions: 0, cards: 0, claimed: [] },
        dailyHistory: {},
        eventIds: [],
        revision: 0
    };
    const fetchImpl = async (url, options = {}) => {
        calls.push({ url, options });
        if (options.method === 'POST' && url.endsWith('/events')) {
            const event = JSON.parse(options.body);
            profile = { ...profile, totalPlayed: profile.totalPlayed + 1, totalCorrect: profile.totalCorrect + (event.correct ? 1 : 0) };
            return new Response(JSON.stringify({ data: profile, duplicate: false }), { status: 200 });
        }
        return new Response(JSON.stringify({ name: '小朋友', data: profile }), { status: 200 });
    };

    const storage = new StorageManager({ fetchImpl, cache });
    await storage.waitUntilReady();
    storage.recordGame(true, { mode: 'visual', skillId: 'counting_1_5' });
    await storage.flush();

    assert.equal(storage.data.totalCorrect, 1);
    assert.equal(storage.data.totalPlayed, 1);
    assert.equal(values.has('pony_math_pending_events'), true);
    assert.ok(calls.some(call => call.url.endsWith('/events')));
    assert.equal(JSON.parse(values.get('pony_math_pending_events')).length, 0);
});
