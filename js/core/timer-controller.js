// 可暂停、可测试的倒计时控制器。
export class TimerController {
    constructor({ now = () => Date.now(), onTick = () => {}, onExpire = () => {} } = {}) {
        this.now = now;
        this.onTick = onTick;
        this.onExpire = onExpire;
        this.duration = 0;
        this.timeLeft = 0;
        this.deadline = null;
        this.intervalId = null;
        this.running = false;
        this.expired = false;
    }

    start(duration = this.duration) {
        this.stop();
        this.duration = Math.max(0, Math.floor(Number(duration) || 0));
        this.timeLeft = this.duration;
        this.expired = false;
        if (this.duration === 0) {
            this.emitTick();
            return this.getState();
        }
        this.deadline = this.now() + this.duration * 1000;
        this.running = true;
        this.intervalId = setInterval(() => this.tick(), 250);
        this.emitTick();
        return this.getState();
    }

    pause() {
        if (!this.running) return this.getState();
        this.tick();
        this.running = false;
        if (this.intervalId !== null) clearInterval(this.intervalId);
        this.intervalId = null;
        this.deadline = null;
        return this.getState();
    }

    resume() {
        if (this.running || this.expired || this.timeLeft <= 0) return this.getState();
        this.deadline = this.now() + this.timeLeft * 1000;
        this.running = true;
        this.intervalId = setInterval(() => this.tick(), 250);
        this.emitTick();
        return this.getState();
    }

    reset(duration = this.duration) {
        return this.start(duration);
    }

    stop() {
        if (this.intervalId !== null) clearInterval(this.intervalId);
        this.intervalId = null;
        this.running = false;
        this.deadline = null;
        return this.getState();
    }

    tick() {
        if (!this.running || this.deadline === null) return this.getState();
        const next = Math.max(0, Math.ceil((this.deadline - this.now()) / 1000));
        if (next !== this.timeLeft) {
            this.timeLeft = next;
            this.emitTick();
        }
        if (this.timeLeft <= 0) {
            this.expired = true;
            this.stop();
            this.onExpire();
        }
        return this.getState();
    }

    emitTick() {
        this.onTick(this.timeLeft);
    }

    getState() {
        return {
            duration: this.duration,
            timeLeft: this.timeLeft,
            running: this.running,
            expired: this.expired
        };
    }
}
