// 学前数学技能目录。
export const SKILLS = {
    counting_1_5: {
        id: 'counting_1_5',
        name: '数一数（1-5）',
        description: '认识 1 到 5 的数量',
        max: 5,
        mode: 'visual'
    },
    counting_1_10: {
        id: 'counting_1_10',
        name: '数一数（1-10）',
        description: '认识 1 到 10 的数量',
        max: 10,
        mode: 'visual'
    },
    compare_quantities: {
        id: 'compare_quantities',
        name: '比一比',
        description: '比较哪一组更多',
        max: 10,
        mode: 'compare'
    },
    patterns_shapes: {
        id: 'patterns_shapes',
        name: '图形和规律',
        description: '认识图形和简单规律',
        max: 4,
        mode: 'pattern'
    }
};

export function getSkill(skillId) {
    return SKILLS[skillId] || SKILLS.counting_1_5;
}
