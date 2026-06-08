/* Overlay renderer. Reads state pushed over WebSocket and paints the board. */
(function () {
  'use strict';

  const S = window.PadelScoring;
  const root = document.getElementById('scoreboard');
  const titleBar = document.getElementById('titleBar');
  const titleEl = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');
  const winnerBanner = document.getElementById('winnerBanner');

  const el = {
    accent: [q('[data-accent="0"]'), q('[data-accent="1"]')],
    serve: [q('[data-serve="0"]'), q('[data-serve="1"]')],
    name: [q('[data-name="0"]'), q('[data-name="1"]')],
    players: [q('[data-players="0"]'), q('[data-players="1"]')],
    sets: [q('[data-sets="0"]'), q('[data-sets="1"]')],
    games: [q('[data-games="0"]'), q('[data-games="1"]')],
    points: [q('[data-points="0"]'), q('[data-points="1"]')],
  };

  function q(sel) {
    return document.querySelector(sel);
  }

  // Optional position override via query string, e.g. ?pos=bottom-right
  applyPositionFromQuery();

  let lastSeq = -1;

  PadelClient.connect({
    onState: render,
  });

  function render(state) {
    const d = state.display || {};
    root.dataset.theme = d.theme === 'light' ? 'light' : 'dark';

    // Title bar
    const hasTitle = d.showTitle !== false && (d.title || d.subtitle);
    titleBar.classList.toggle('empty', !hasTitle);
    titleEl.textContent = d.title || '';
    subtitleEl.textContent = d.subtitle || '';

    for (let i = 0; i < 2; i++) {
      const team = state.teams[i];
      el.accent[i].style.setProperty('--team-color', team.color || '#1e88e5');
      el.name[i].textContent = team.name || '';

      const players = (team.players || []).filter(Boolean).join('  /  ');
      el.players[i].textContent = players;
      el.players[i].classList.toggle('hidden', d.showPlayers === false || !players);

      // Serve indicator
      const showServe = d.showServe !== false && state.status !== 'finished';
      el.serve[i].classList.toggle('active', showServe && state.server === i);

      // Completed set scores
      el.sets[i].classList.toggle('hidden', d.showSets === false);
      renderSets(el.sets[i], state, i);

      // Current games
      el.games[i].textContent = state.games[i];

      // Current points / tiebreak points
      const label = pointDisplay(state, i);
      el.points[i].textContent = label;
      el.points[i].classList.toggle('deuce', label === 'DEUCE');
      el.points[i].classList.toggle('ad', label === 'AD');
    }

    // Winner banner
    if (state.status === 'finished' && state.winner != null) {
      winnerBanner.classList.remove('hidden');
      winnerBanner.textContent = `${state.teams[state.winner].name || 'Winner'} win!`;
    } else {
      winnerBanner.classList.add('hidden');
    }

    // Bump animation on the scoring side when a point changes.
    if (state.seq !== lastSeq) {
      if (state.lastScorer != null && lastSeq !== -1) {
        const cell = el.points[state.lastScorer];
        cell.classList.remove('bump');
        void cell.offsetWidth; // reflow to restart animation
        cell.classList.add('bump');
      }
      lastSeq = state.seq;
    }

    root.classList.remove('hidden');
  }

  function renderSets(container, state, teamIdx) {
    container.innerHTML = '';
    state.sets.forEach((set) => {
      const box = document.createElement('span');
      box.className = 'set-box';
      const v = teamIdx === 0 ? set.a : set.b;
      box.textContent = v;
      if (set.tb && !set.superTb) {
        const tb = document.createElement('span');
        tb.className = 'tb';
        tb.textContent = teamIdx === 0 ? set.tb.a : set.tb.b;
        box.appendChild(tb);
      }
      container.appendChild(box);
    });
  }

  function pointDisplay(state, idx) {
    if (state.inTiebreak) {
      return String(state.points[idx]);
    }
    return S.pointLabel(state.points, idx, state.config);
  }

  function applyPositionFromQuery() {
    const params = new URLSearchParams(location.search);
    const pos = params.get('pos');
    if (!pos) return;
    const map = {
      'bottom-left': { left: '40px', bottom: '40px', right: 'auto', top: 'auto' },
      'bottom-right': { right: '40px', bottom: '40px', left: 'auto', top: 'auto' },
      'top-left': { left: '40px', top: '40px', right: 'auto', bottom: 'auto' },
      'top-right': { right: '40px', top: '40px', left: 'auto', bottom: 'auto' },
      'bottom-center': { left: '50%', bottom: '40px', transform: 'translateX(-50%)', right: 'auto', top: 'auto' },
      'top-center': { left: '50%', top: '40px', transform: 'translateX(-50%)', right: 'auto', bottom: 'auto' },
    };
    const style = map[pos];
    if (style) Object.assign(root.style, style);

    const scale = params.get('scale');
    if (scale) {
      root.style.transformOrigin = pos.includes('right') ? 'bottom right' : 'bottom left';
      root.style.transform = `${style && style.transform ? style.transform + ' ' : ''}scale(${scale})`;
    }
  }
})();
