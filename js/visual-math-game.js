import { getSkill } from './content/skills.js';
import { SessionController } from './core/session-controller.js';

const OBJECTS = ['🍎', '⭐', '🦄', '🦋', '🌸', '🍭', '🎈', '🐰'];
const PATTERN_SYMBOLS = ['🔴', '🔵', '🟡', '🟢', '⭐', '🔺'];

export class VisualMathLogic {
    constructor() {
        this.session = null;
        this.skill = null;
        this.score = 0;
        this.streak = 0;
        this.correctCount = 0;
        this.currentQuestion = null;
        this.hintUsed = false;
    }

    startGame(skillId = 'counting_1_5') {
        this.skill = getSkill(skillId);
        this.session = new SessionController({ mode: 'visual', skillId: this.skill.id, maxQuestions: 5 });
        this.session.start();
        this.score = 0;
        this.streak = 0;
        this.correctCount = 0;
        return this.generateQuestion();
    }

    generateQuestion() {
        if (!this.skill) throw new Error('Visual math game has not started');
        if (this.skill.mode === 'compare') return this.generateCompareQuestion();
        if (this.skill.mode === 'pattern') return this.generatePatternQuestion();

        const answer = this.randomInt(1, this.skill.max);
        const object = OBJECTS[this.randomInt(0, OBJECTS.length - 1)];
        const options = this.generateOptions(answer, this.skill.max);
        this.hintUsed = false;
        this.currentQuestion = {
            id: `visual_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            object,
            count: answer,
            answer,
            options,
            prompt: '有几个？'
        };
        this.session.beginQuestion(this.currentQuestion.id);
        return this.currentQuestion;
    }

    generateCompareQuestion() {
        const leftCount = this.randomInt(1, this.skill.max);
        const rightCount = this.randomInt(1, this.skill.max);
        const leftObject = OBJECTS[this.randomInt(0, OBJECTS.length - 1)];
        let rightObject = OBJECTS[this.randomInt(0, OBJECTS.length - 1)];
        if (rightObject === leftObject) rightObject = OBJECTS[(OBJECTS.indexOf(rightObject) + 1) % OBJECTS.length];
        const answer = leftCount === rightCount
            ? '一样多'
            : (leftCount > rightCount ? '左边' : '右边');
        this.hintUsed = false;
        this.currentQuestion = {
            id: `visual_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            answer,
            options: this.shuffle(['左边', '右边', '一样多']),
            prompt: '哪一边更多？',
            display: `${leftObject.repeat(leftCount)}　　${rightObject.repeat(rightCount)}`,
            hint: leftCount === rightCount ? '数一数两边的数量，它们一样多。' : '分别数一数两边，再比较谁更多。'
        };
        this.session.beginQuestion(this.currentQuestion.id);
        return this.currentQuestion;
    }

    generatePatternQuestion() {
        const first = PATTERN_SYMBOLS[this.randomInt(0, PATTERN_SYMBOLS.length - 1)];
        let second = PATTERN_SYMBOLS[this.randomInt(0, PATTERN_SYMBOLS.length - 1)];
        if (second === first) second = PATTERN_SYMBOLS[(PATTERN_SYMBOLS.indexOf(first) + 1) % PATTERN_SYMBOLS.length];
        const answer = first;
        const distractors = PATTERN_SYMBOLS.filter(symbol => symbol !== answer)
            .slice(0, 3);
        this.hintUsed = false;
        this.currentQuestion = {
            id: `visual_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            answer,
            options: this.shuffle([answer, ...distractors]),
            prompt: '下一个图形是什么？',
            display: `${first}　${second}　${first}　${second}　？`,
            hint: '看看前面两个图形的顺序，它们会交替出现。'
        };
        this.session.beginQuestion(this.currentQuestion.id);
        return this.currentQuestion;
    }

    generateOptions(answer, max) {
        const options = new Set([answer]);
        const candidates = [];
        for (let value = 1; value <= max; value += 1) candidates.push(value);
        while (options.size < Math.min(4, candidates.length)) {
            options.add(candidates[this.randomInt(0, candidates.length - 1)]);
        }
        return this.shuffle([...options]);
    }

    getHint() {
        this.hintUsed = true;
        if (this.currentQuestion?.hint) return this.currentQuestion.hint;
        const answer = this.currentQuestion?.answer || 0;
        return `可以一个一个数，答案在 ${Math.max(1, answer - 1)} 和 ${answer + 1} 附近。`;
    }

    checkAnswer(selectedAnswer) {
        if (!this.currentQuestion) throw new Error('No visual math question');
        const correct = String(selectedAnswer) === String(this.currentQuestion.answer);
        const record = this.session.recordAnswer({
            selectedAnswer,
            correctAnswer: this.currentQuestion.answer,
            correct,
            hintUsed: this.hintUsed
        });
        if (!record) return { correct: false, locked: true, correctAnswer: this.currentQuestion.answer };
        if (correct) {
            this.correctCount += 1;
            this.streak += 1;
            this.score += 10 + (this.streak > 1 ? 5 : 0);
        } else {
            this.streak = 0;
        }
        return {
            correct,
            correctAnswer: this.currentQuestion.answer,
            score: this.score,
            streak: this.streak,
            hintUsed: this.hintUsed,
            sessionFinished: this.session.status === 'finished'
        };
    }

    getProgress() {
        const needed = this.session?.maxQuestions || 5;
        return {
            current: this.session?.questions.length || 0,
            needed,
            progress: ((this.session?.questions.length || 0) / needed) * 100
        };
    }

    getSummary() {
        return {
            ...this.session.getSummary(),
            score: this.score,
            streak: this.streak
        };
    }

    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    shuffle(array) {
        const result = [...array];
        for (let index = result.length - 1; index > 0; index -= 1) {
            const target = this.randomInt(0, index);
            [result[index], result[target]] = [result[target], result[index]];
        }
        return result;
    }
}
