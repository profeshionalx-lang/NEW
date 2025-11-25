// js/shared.js
// Общие функции для загрузки и рендеринга данных.
// Использует window.initPlatform() и window.APP_CONFIG.
// Простая абстракция: App.fetchTournaments(), App.renderTournaments() и т.д.

window.App = (function () {
  // Визуальный шаблон элемента списка
  function tournamentCard(t) {
    return `
      <article class="card">
        <h3>${escapeHtml(t.title)}</h3>
        <p class="meta">${escapeHtml(t.date || '')} · ${escapeHtml(t.location || '')}</p>
        <p>${escapeHtml(t.short || '')}</p>
        <a href="tournament.html?id=${encodeURIComponent(t.id)}" class="btn">Подробнее</a>
      </article>
    `;
  }

  function playerRow(p, rank) {
    return `
      <div class="player-row">
        <span class="rank">${rank}</span>
        <span class="name">${escapeHtml(p.name)}</span>
        <span class="score">${escapeHtml(String(p.score || 0))}</span>
      </div>
    `;
  }

  // escape для простоты
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Фейковые данные fallback — пригодится, если нет подключенного БД
  const FALLBACK = {
    tournaments: [
      { id: 't1', title: 'Турнир A', date: '2025-12-01', location: 'Москва', short: 'Открытый турнир' },
      { id: 't2', title: 'Турнир B', date: '2026-01-15', location: 'Санкт-Петербург', short: 'Кубок новичков' }
    ],
    trainings: [
      { id: 'tr1', title: 'Тренировка 1', date: '2025-11-28', coach: 'Иван' }
    ],
    players: [
      { id: 'p1', name: 'Игрок 1', score: 1500 },
      { id: 'p2', name: 'Игрок 2', score: 1450 }
    ]
  };

  async function init() {
    // вызываем глобальную инициализацию (например, Firebase)
    if (typeof window.initPlatform === 'function') {
      await window.initPlatform();
    }
    // Здесь можно инициализировать SDK авторизации, баз данных и т.д.
    return;
  }

  // Загрузка данных (замените реализацией работы с вашей БД)
  async function fetchTournaments() {
    // TODO: заменить на реальный запрос (fetch / firebase)
    return FALLBACK.tournaments;
  }
  async function fetchTrainings() {
    return FALLBACK.trainings;
  }
  async function fetchPlayers() {
    return FALLBACK.players;
  }
  async function fetchTournamentById(id) {
    return (FALLBACK.tournaments.find(t=>t.id===id) || null);
  }

  // Рендереры
  async function renderTournaments(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const data = await fetchTournaments();
    container.innerHTML = data.map(t => tournamentCard(t)).join('\n');
  }

  async function renderTrainings(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const data = await fetchTrainings();
    container.innerHTML = data.map(tr => `
      <article class="card">
        <h3>${escapeHtml(tr.title)}</h3>
        <p class="meta">${escapeHtml(tr.date || '')} · ${escapeHtml(tr.coach || '')}</p>
      </article>
    `).join('\n');
  }

  async function renderPlayers(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const data = await fetchPlayers();
    container.innerHTML = data
      .sort((a,b)=> (b.score||0) - (a.score||0))
      .map((p,i) => playerRow(p, i+1)).join('\n');
  }

  async function renderTournamentDetail(id, titleSelector, infoSelector) {
    const titleEl = document.querySelector(titleSelector);
    const infoEl = document.querySelector(infoSelector);
    if (!titleEl || !infoEl) return;
    const data = await fetchTournamentById(id);
    if (!data) {
      titleEl.textContent = 'Турнир не найден';
      infoEl.innerHTML = '';
      return;
    }
    titleEl.textContent = data.title;
    infoEl.innerHTML = `
      <p><strong>Дата:</strong> ${escapeHtml(data.date || '')}</p>
      <p><strong>Место:</strong> ${escapeHtml(data.location || '')}</p>
      <p>${escapeHtml(data.short || '')}</p>
    `;
  }

  return {
    init,
    fetchTournaments,
    fetchTrainings,
    fetchPlayers,
    fetchTournamentById,
    renderTournaments,
    renderTrainings,
    renderPlayers,
    renderTournamentDetail
  };
})();