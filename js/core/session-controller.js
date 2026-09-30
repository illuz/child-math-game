// 统一数学、认字和视觉数学的练习 Session。
export class SessionController {
    constructor({ mode = 'math', skillId = 'general', maxQuestions = 5, now = () => Date.now() } = {}) {
        this.mode = mode;
        this.skillId = skillId;
        this.maxQuestions = Math.max(1, Math.floor(maxQuestions));
        this.now = now;
        this.reset();
    }

    reset() {
        this.sessionId = null;
        this.startedAt = null;
        this.endedAt = null;
        this.questions = [];
        this.currentQuestionId = null;
        this.locked = false;
        this.status = 'idle';
    }

    start({ sessionId = `session_${this.now()}_${Math.random().toString(16).slice(2)}` } = {}) {
        this.reset();
        this.sessionId = sessionId;
        this.startedAt = this.now();
        this.status = 'active';
        return this.getState();
    }

    beginQuestion(questionId) {
        if (this.status !== 'active') throw new Error('Session is not active');
        this.currentQuestionId = questionId || `question_${this.questions.length + 1}`;
        this.locked = false;
        return this.currentQuestionId;
    }

    recordAnswer({ selectedAnswer, correctAnswer, correct, hintUsed = false, responseMs = null } = {}) {
        if (this.status !== 'active') throw new Error('Session is not active');
        if (this.locked) return null;
        this.locked = true;
        const record = {
            id: this.currentQuestionId || `question_${this.questions.length + 1}`,
            selectedAnswer,
            correctAnswer,
            correct: correct === true,
            hintUsed: hintUsed === true,
            responseMs: Number.isFinite(responseMs) && responseMs >= 0 ? Math.round(responseMs) : null,
            answeredAt: this.now()
        };
        this.questions.push(record);
        if (this.questions.length >= this.maxQuestions) this.finish('completed');
        return record;
    }

    unlockForNextQuestion() {
        if (this.status === 'active') this.locked = false;
    }

    finish(reason = 'completed') {
        if (this.status === 'finished') return this.getSummary();
        this.status = 'finished';
        this.endedAt = this.now();
        this.locked = true;
        this.finishReason = reason;
        return this.getSummary();
    }

    getSummary() {
        const correctCount = this.questions.filter(question => question.correct).length;
        return {
            sessionId: this.sessionId,
            mode: this.mode,
            skillId: this.skillId,
            questionCount: this.questions.length,
            correctCount,
            accuracy: this.questions.length ? Math.round((correctCount / this.questions.length) * 100) : 0,
            hintsUsed: this.questions.filter(question => question.hintUsed).length,
            durationMs: this.startedAt === null ? 0 : (this.endedAt ?? this.now()) - this.startedAt,
            reason: this.finishReason || null
        };
    }

    getState() {
        return {
            status: this.status,
            sessionId: this.sessionId,
            questionCount: this.questions.length,
            locked: this.locked,
            currentQuestionId: this.currentQuestionId
        };
    }
}
