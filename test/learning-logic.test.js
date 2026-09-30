const assert = require('node:assert/strict');
const test = require('node:test');

test('session controller locks duplicate answers and produces a summary', async () => {
    const { SessionController } = await import('../js/core/session-controller.js');
    let now = 1000;
    const session = new SessionController({ maxQuestions: 2, now: () => now });
    session.start({ sessionId: 'session-test' });
    session.beginQuestion('q1');
    assert.equal(session.recordAnswer({ selectedAnswer: 1, correctAnswer: 1, correct: true }).correct, true);
    assert.equal(session.recordAnswer({ selectedAnswer: 1, correctAnswer: 1, correct: true }), null);
    session.unlockForNextQuestion();
    now += 500;
    session.beginQuestion('q2');
    session.recordAnswer({ selectedAnswer: 2, correctAnswer: 3, correct: false, hintUsed: true });
    assert.equal(session.status, 'finished');
    assert.deepEqual(session.getSummary(), {
        sessionId: 'session-test',
        mode: 'math',
        skillId: 'general',
        questionCount: 2,
        correctCount: 1,
        accuracy: 50,
        hintsUsed: 1,
        durationMs: 500,
        reason: 'completed'
    });
});

test('timer controller can pause, resume, and expire from a deadline', async () => {
    const { TimerController } = await import('../js/core/timer-controller.js');
    let now = 0;
    let expired = 0;
    const timer = new TimerController({ now: () => now, onExpire: () => { expired += 1; } });
    timer.start(5);
    now = 2200;
    timer.tick();
    assert.equal(timer.timeLeft, 3);
    timer.pause();
    now = 10000;
    timer.resume();
    assert.equal(timer.timeLeft, 3);
    now += 3000;
    timer.tick();
    assert.equal(timer.expired, true);
    assert.equal(expired, 1);
    timer.stop();
});

test('visual math generates unique options, records hints, and finishes after five questions', async () => {
    const { VisualMathLogic } = await import('../js/visual-math-game.js');
    const game = new VisualMathLogic();
    const first = game.startGame('counting_1_5');
    assert.equal(first.options.length, 4);
    assert.equal(new Set(first.options).size, first.options.length);
    assert.match(game.getHint(), /答案/);
    for (let index = 0; index < 5; index += 1) {
        const question = index === 0 ? first : game.currentQuestion;
        game.checkAnswer(question.answer);
        if (index < 4) game.generateQuestion();
    }
    assert.equal(game.session.status, 'finished');
    assert.equal(game.session.questions.length, 5);
    assert.equal(game.correctCount, 5);
});

test('visual math supports comparison and pattern skills', async () => {
    const { VisualMathLogic } = await import('../js/visual-math-game.js');
    const comparison = new VisualMathLogic();
    const comparisonQuestion = comparison.startGame('compare_quantities');
    assert.equal(comparisonQuestion.options.length, 3);
    assert.match(comparisonQuestion.prompt, /哪一边/);
    assert.ok(comparisonQuestion.display.includes('　　'));
    assert.equal(comparison.checkAnswer(comparisonQuestion.answer).correct, true);

    const pattern = new VisualMathLogic();
    const patternQuestion = pattern.startGame('patterns_shapes');
    assert.equal(patternQuestion.options.length, 4);
    assert.match(patternQuestion.display, /？/);
    assert.equal(pattern.checkAnswer(patternQuestion.answer).correct, true);
});

test('daily missions and achievement labels are deterministic', async () => {
    const { getDailyMissions, getAchievementLabels } = await import('../js/mission-engine.js');
    const missions = getDailyMissions({ answers: 6, correct: 2, cards: 1 });
    assert.equal(missions[0].completed, true);
    assert.equal(missions[1].completed, false);
    assert.equal(missions[2].progress, 1);
    assert.deepEqual(getAchievementLabels(['first_answer']), [{ id: 'first_answer', name: '第一次答题' }]);
});
