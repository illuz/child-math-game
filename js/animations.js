// Animation Effects Module
export class AnimationManager {
    // Create sparkles at position
    createSparkles(x, y, count = 8) {
        const colors = ['#ff6b9d', '#c44cff', '#6eb5ff', '#ffd93d', '#a8e6cf'];

        for (let i = 0; i < count; i++) {
            const sparkle = document.createElement('div');
            sparkle.className = 'sparkle';
            sparkle.style.cssText = `
                left: ${x}px;
                top: ${y}px;
                background: radial-gradient(circle, ${colors[i % colors.length]} 0%, transparent 70%);
                transform: rotate(${Math.random() * 360}deg);
            `;

            // Random direction
            const angle = (Math.PI * 2 * i) / count;
            const distance = 50 + Math.random() * 30;
            sparkle.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
            sparkle.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);

            document.body.appendChild(sparkle);

            setTimeout(() => sparkle.remove(), 1000);
        }
    }

    // Floating hearts effect
    createFloatingHearts(x, y, count = 5) {
        const hearts = ['💖', '💝', '💗', '💕', '✨'];

        for (let i = 0; i < count; i++) {
            const heart = document.createElement('div');
            heart.className = 'floating-heart';
            heart.textContent = hearts[i % hearts.length];
            heart.style.cssText = `
                left: ${x + (Math.random() - 0.5) * 100}px;
                top: ${y}px;
                animation-delay: ${i * 0.1}s;
            `;

            document.body.appendChild(heart);

            setTimeout(() => heart.remove(), 2000);
        }
    }

    // Star burst effect
    createStarBurst(element) {
        const rect = element.getBoundingClientRect();
        const stars = ['⭐', '🌟', '✨', '💫'];

        for (let i = 0; i < 6; i++) {
            const star = document.createElement('div');
            star.className = 'star-burst';
            star.textContent = stars[i % stars.length];

            const angle = (Math.PI * 2 * i) / 6;
            const x = rect.left + rect.width / 2 + Math.cos(angle) * 30;
            const y = rect.top + rect.height / 2 + Math.sin(angle) * 30;

            star.style.cssText = `
                left: ${x}px;
                top: ${y}px;
                animation-delay: ${i * 0.05}s;
            `;

            document.body.appendChild(star);

            setTimeout(() => star.remove(), 800);
        }
    }

    // Confetti burst
    createConfetti(count = 30) {
        const colors = ['#ff6b9d', '#c44cff', '#6eb5ff', '#ffd93d', '#a8e6cf', '#ff9a9e'];
        const shapes = ['◆', '●', '■', '▲'];

        for (let i = 0; i < count; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.textContent = shapes[Math.floor(Math.random() * shapes.length)];
            confetti.style.cssText = `
                left: ${Math.random() * window.innerWidth}px;
                top: -20px;
                color: ${colors[Math.floor(Math.random() * colors.length)]};
                font-size: ${8 + Math.random() * 12}px;
                animation-duration: ${2 + Math.random() * 2}s;
                animation-delay: ${Math.random() * 0.5}s;
            `;

            document.body.appendChild(confetti);

            setTimeout(() => confetti.remove(), 4000);
        }
    }

    // Rainbow trail on touch/mouse
    createRainbowTrail(x, y) {
        const colors = ['#ff6b9d', '#ffd93d', '#a8e6cf', '#6eb5ff', '#c44cff'];
        const color = colors[Math.floor(Math.random() * colors.length)];

        const trail = document.createElement('div');
        trail.className = 'rainbow-trail';
        trail.style.cssText = `
            left: ${x - 15}px;
            top: ${y - 15}px;
            background: radial-gradient(circle, ${color} 0%, transparent 70%);
        `;

        document.body.appendChild(trail);

        setTimeout(() => trail.remove(), 500);
    }

    // Pony animation
    animatePony(element, type) {
        element.classList.remove('pony-bounce', 'pony-sad', 'pony-idle');

        if (type === 'happy') {
            element.classList.add('pony-bounce');
            setTimeout(() => {
                element.classList.remove('pony-bounce');
                element.classList.add('pony-idle');
            }, 500);
        } else if (type === 'sad') {
            element.classList.add('pony-sad');
            setTimeout(() => {
                element.classList.remove('pony-sad');
                element.classList.add('pony-idle');
            }, 500);
        } else {
            element.classList.add('pony-idle');
        }
    }

    // Show feedback emoji
    showFeedback(element, correct) {
        const content = element.querySelector('#feedback-content, .feedback-content') || element;
        content.textContent = correct ? '✨' : '💫';
        content.style.animation = 'none';
        content.offsetHeight; // Trigger reflow
        content.style.animation = 'feedbackPop 0.6s ease forwards';
    }

    // Number pop animation
    animateNumber(element) {
        element.classList.remove('number-pop');
        element.offsetHeight; // Trigger reflow
        element.classList.add('number-pop');
    }
}

export const animations = new AnimationManager();
