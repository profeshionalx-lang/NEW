// js/tournament-logic.js
// Логика генерации турниров, групп и матчей

/**
 * Генерирует группы из пар и кортов
 * @param {Array} pairs - Массив пар участников
 * @param {Number|Array} courts - Количество кортов или массив объектов кортов
 * @returns {Array} Массив групп с парами и матчами
 */
window.generateGroups = function(pairs, courts) {
    const groups = [];
    const pairsPerGroup = 4;
    const numGroups = Math.ceil(pairs.length / pairsPerGroup);
    
    let courtsArray = [];
    let totalCourtsCount = 0;
    
    // Обработка кортов - может быть числом или массивом
    if (Array.isArray(courts)) {
        courtsArray = courts;
        totalCourtsCount = courts.length;
    } else if (typeof courts === 'number') {
        totalCourtsCount = courts;
        for (let i = 0; i < courts; i++) {
            courtsArray.push({ id: i + 1, name: `Корт ${i + 1}` });
        }
    }
    
    const courtsPerGroup = Math.floor(totalCourtsCount / numGroups);

    for (let i = 0; i < numGroups; i++) {
        const groupPairs = pairs.slice(i * pairsPerGroup, (i + 1) * pairsPerGroup);
        const startCourtIdx = i * courtsPerGroup;
        const groupCourts = courtsArray.slice(startCourtIdx, startCourtIdx + Math.max(courtsPerGroup, 1));
        const matches = window.generateMatches(groupPairs, groupCourts);
        
        groups.push({
            id: i,
            name: String.fromCharCode(65 + i),
            pairs: groupPairs.map(p => ({
                ...p,
                played: 0,
                won: 0,
                lost: 0,
                points: 0,
                gamesWon: 0,
                gamesLost: 0,
                gamesDiff: 0
            })),
            matches: matches
        });
    }

    return groups;
};

/**
 * Генерирует матчи для группы из 4 пар
 * @param {Array} pairs - Массив из 4 пар
 * @param {Array} groupCourts - Массив кортов для группы
 * @returns {Array} Массив матчей
 */
window.generateMatches = function(pairs, groupCourts) {
    if (pairs.length !== 4) return [];
    
    const courtsForGroup = groupCourts.length >= 2 ? 2 : 1;
    const court1 = groupCourts[0] || { id: 1, name: 'Корт 1' };
    const court2 = courtsForGroup === 2 ? (groupCourts[1] || { id: 2, name: 'Корт 2' }) : court1;
    
    return [
        { round: 1, pair1: pairs[0], pair2: pairs[1], court: court1, set1p1: '', set1p2: '' },
        { round: 1, pair1: pairs[2], pair2: pairs[3], court: court2, set1p1: '', set1p2: '' },
        { round: 2, pair1: pairs[0], pair2: pairs[2], court: court1, set1p1: '', set1p2: '' },
        { round: 2, pair1: pairs[1], pair2: pairs[3], court: court2, set1p1: '', set1p2: '' },
        { round: 3, pair1: pairs[0], pair2: pairs[3], court: court1, set1p1: '', set1p2: '' },
        { round: 3, pair1: pairs[1], pair2: pairs[2], court: court2, set1p1: '', set1p2: '' },
    ];
};

/**
 * Обновляет результаты матча и пересчитывает очки в группе
 * @param {Object} tournament - Объект турнира
 * @param {Number} groupId - ID группы
 * @param {Number} matchIndex - Индекс матча
 * @param {Object} result - Результат матча { set1p1, set1p2 }
 * @param {Number} stage - Этап (1 или 2)
 * @returns {Object} Обновленные группы
 */
window.updateMatchResult = function(tournament, groupId, matchIndex, result, stage) {
    const groupsKey = stage === 1 ? 'stage1Groups' : 'stage2Groups';
    const updatedGroups = [...tournament[groupsKey]];
    const group = updatedGroups[groupId];
    
    // Обновляем результат матча
    group.matches[matchIndex] = { ...group.matches[matchIndex], ...result };
    
    // Сбрасываем статистику всех пар
    group.pairs = group.pairs.map(pair => ({
        ...pair,
        played: 0,
        won: 0,
        lost: 0,
        points: 0,
        gamesWon: 0,
        gamesLost: 0,
        gamesDiff: 0
    }));

    // Пересчитываем статистику по всем матчам
    group.matches.forEach(match => {
        if (match.set1p1 !== '' && match.set1p2 !== '') {
            const p1Games = parseInt(match.set1p1) || 0;
            const p2Games = parseInt(match.set1p2) || 0;
            
            const p1Idx = group.pairs.findIndex(p => p.id === match.pair1.id);
            const p2Idx = group.pairs.findIndex(p => p.id === match.pair2.id);

            if (p1Idx !== -1 && p2Idx !== -1) {
                // Подсчет сыгранных матчей
                group.pairs[p1Idx].played++;
                group.pairs[p2Idx].played++;
                
                // Подсчет выигранных и проигранных геймов
                group.pairs[p1Idx].gamesWon += p1Games;
                group.pairs[p1Idx].gamesLost += p2Games;
                group.pairs[p2Idx].gamesWon += p2Games;
                group.pairs[p2Idx].gamesLost += p1Games;

                // Определение победителя и начисление очков
                if (p1Games > p2Games) {
                    group.pairs[p1Idx].won++;
                    group.pairs[p1Idx].points += 3;
                    group.pairs[p2Idx].lost++;
                } else if (p2Games > p1Games) {
                    group.pairs[p2Idx].won++;
                    group.pairs[p2Idx].points += 3;
                    group.pairs[p1Idx].lost++;
                }

                // Подсчет разницы геймов
                group.pairs[p1Idx].gamesDiff = group.pairs[p1Idx].gamesWon - group.pairs[p1Idx].gamesLost;
                group.pairs[p2Idx].gamesDiff = group.pairs[p2Idx].gamesWon - group.pairs[p2Idx].gamesLost;
            }
        }
    });

    // Сортировка пар по очкам, разнице геймов и выигранным геймам
    group.pairs.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.gamesDiff !== a.gamesDiff) return b.gamesDiff - a.gamesDiff;
        return b.gamesWon - a.gamesWon;
    });

    updatedGroups[groupId] = group;
    return updatedGroups;
};

/**
 * Генерирует второй этап турнира на основе результатов первого
 * @param {Object} tournament - Объект турнира
 * @returns {Array} Группы для второго этапа
 */
window.generateStage2 = function(tournament) {
    const allPairs = [];
    
    // Собираем все пары из всех групп первого этапа
    tournament.stage1Groups.forEach(group => {
        group.pairs.forEach(pair => {
            allPairs.push({ ...pair });
        });
    });

    // Сортируем по очкам, разнице геймов и выигранным геймам
    allPairs.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.gamesDiff !== a.gamesDiff) return b.gamesDiff - a.gamesDiff;
        return b.gamesWon - a.gamesWon;
    });

    // Создаем пары для второго этапа (без статистики первого этапа)
    const pairsForStage2 = allPairs.map(p => ({
        id: p.id,
        number: p.number,
        player1: p.player1,
        player2: p.player2
    }));

    // Генерируем группы для второго этапа
    return window.generateGroups(pairsForStage2, tournament.courts);
};
