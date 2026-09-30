export const DAILY_MISSIONS = [
    { id: 'daily_answers_5', name: '完成 5 道题', target: 5, field: 'answers', reward: 3 },
    { id: 'daily_correct_3', name: '答对 3 道题', target: 3, field: 'correct', reward: 3 },
    { id: 'daily_card_1', name: '获得 1 张卡片', target: 1, field: 'cards', reward: 5 }
];

export function getLocalDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getTodayProgress(dailyProgress = {}, date = getLocalDate()) {
    return dailyProgress.date === date ? dailyProgress : { date, answers: 0, correct: 0, sessions: 0, cards: 0, claimed: [] };
}

export function getDailyMissions(dailyProgress = {}) {
    return DAILY_MISSIONS.map(mission => ({
        ...mission,
        progress: Math.max(0, Math.min(mission.target, Number(dailyProgress[mission.field]) || 0)),
        completed: (Number(dailyProgress[mission.field]) || 0) >= mission.target
    }));
}

export function getAchievementLabels(ids = []) {
    const labels = {
        first_answer: '第一次答题',
        first_session: '完成第一次练习',
        ten_correct: '答对 10 题',
        fifty_correct: '答对 50 题',
        daily_five: '一天完成 5 题'
    };
    return ids.map(id => ({ id, name: labels[id] || id }));
}
