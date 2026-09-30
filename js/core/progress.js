import { DAILY_MISSIONS } from '../mission-engine.js';

const MAX_EVENT_IDS = 5000;

function awardAchievement(profile, id) {
    if (profile.achievements.includes(id)) return;
    profile.achievements.push(id);
    profile.stars += 5;
}

// 客户端离线预览与服务端持久化使用相同规则，补传时按 eventId 去重。
export function applyLearningEvent(profile, event, now = new Date().toISOString()) {
    if (profile.eventIds.includes(event.eventId)) return { profile, duplicate: true };

    if (event.type === 'settings') Object.assign(profile, event.patch);

    if (event.type === 'answer') {
        profile.totalPlayed += 1;
        if (event.correct) profile.totalCorrect += 1;
        const skill = profile.skillProgress[event.skillId] || { attempts: 0, correct: 0, hints: 0, mastery: 0 };
        skill.attempts += 1;
        if (event.correct) skill.correct += 1;
        if (event.hintUsed) skill.hints += 1;
        skill.mastery = Math.round((skill.correct / skill.attempts) * 100);
        skill.lastPlayedAt = now;
        profile.skillProgress[event.skillId] = skill;
        awardAchievement(profile, 'first_answer');
        if (profile.totalCorrect >= 10) awardAchievement(profile, 'ten_correct');
        if (profile.totalCorrect >= 50) awardAchievement(profile, 'fifty_correct');
    }

    if (event.type === 'card') {
        if (profile.collectedCards.includes(event.cardId)) profile.stars += 1;
        else profile.collectedCards.push(event.cardId);
    }

    if (event.type === 'session' && event.completed) awardAchievement(profile, 'first_session');
    if (event.type === 'highScore' || event.type === 'session') {
        if (event.difficulty) {
            profile.highScores[event.difficulty] = Math.max(profile.highScores[event.difficulty] || 0, event.score);
        }
    }

    // 按发生日期归档，防止昨天的离线事件把今天的进度清零或重复发奖。
    if (['answer', 'card', 'session'].includes(event.type)) {
        profile.dailyHistory ||= {};
        const day = profile.dailyHistory[event.date] || {
            date: event.date, answers: 0, correct: 0, sessions: 0, cards: 0, claimed: []
        };
        if (event.type === 'answer') {
            day.answers += 1;
            if (event.correct) day.correct += 1;
        }
        if (event.type === 'card') day.cards += 1;
        if (event.type === 'session' && event.completed) day.sessions += 1;
        for (const mission of DAILY_MISSIONS) {
            if (day[mission.field] >= mission.target && !day.claimed.includes(mission.id)) {
                day.claimed.push(mission.id);
                profile.stars += mission.reward;
            }
        }
        if (day.answers >= 5) awardAchievement(profile, 'daily_five');
        profile.dailyHistory[event.date] = day;
        if (!profile.dailyProgress.date || event.date >= profile.dailyProgress.date) profile.dailyProgress = day;
    }

    profile.eventIds = [...profile.eventIds, event.eventId].slice(-MAX_EVENT_IDS);
    profile.revision += 1;
    profile.updatedAt = now;
    return { profile, duplicate: false };
}
