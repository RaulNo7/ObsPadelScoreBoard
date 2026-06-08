/* Admin control panel logic. */
(function () {
  'use strict';

  const S = window.PadelScoring;
  let state = null;
  let client = null;

  // Track which inputs the user is editing so live state updates don't clobber typing.
  const editing = new Set();

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Label for a team: its name, or the players joined, or empty.
  const teamLabel = (t) =>
    (t && t.name) || ((t && t.players) || []).filter(Boolean).join(' / ') || '';

  // ---- connection ----
  client = PadelClient.connect({
    onState: (s, msg) => {
      state = s;
      render(s, msg);
    },
    onStatus: (status) => {
      const dot = $('#connDot');
      const text = $('#connText');
      dot.classList.toggle('connected', status === 'connected');
      text.textContent = status === 'connected' ? 'connected' : 'reconnecting…';
    },
  });

  function send(obj) {
    client.send(obj);
  }

  // ---- scoring buttons ----
  $$('[data-point]').forEach((b) =>
    b.addEventListener('click', () => send({ type: 'point', team: +b.dataset.point }))
  );
  $$('[data-unpoint]').forEach((b) =>
    b.addEventListener('click', () => send({ type: 'adjustPoints', team: +b.dataset.unpoint, delta: -1 }))
  );

  $('#undoBtn').addEventListener('click', () => send({ type: 'undo' }));
  $('#redoBtn').addEventListener('click', () => send({ type: 'redo' }));
  $('#swapServeBtn').addEventListener('click', () => send({ type: 'swapServer' }));
  $('#startBtn').addEventListener('click', () => send({ type: 'startMatch' }));

  // ---- manual adjust ----
  $$('[data-games-inc]').forEach((b) => b.addEventListener('click', () => send({ type: 'adjustGames', team: +b.dataset.gamesInc, delta: 1 })));
  $$('[data-games-dec]').forEach((b) => b.addEventListener('click', () => send({ type: 'adjustGames', team: +b.dataset.gamesDec, delta: -1 })));
  $$('[data-sets-inc]').forEach((b) => b.addEventListener('click', () => send({ type: 'adjustSets', team: +b.dataset.setsInc, delta: 1 })));
  $$('[data-sets-dec]').forEach((b) => b.addEventListener('click', () => send({ type: 'adjustSets', team: +b.dataset.setsDec, delta: -1 })));
  $$('[data-serve-pick]').forEach((b) => b.addEventListener('click', () => send({ type: 'setServer', team: +b.dataset.servePick })));
  $('#saveSetBtn').addEventListener('click', () => send({ type: 'saveSet' }));
  $('#undoSetBtn').addEventListener('click', () => send({ type: 'removeLastSet' }));

  // ---- reset ----
  $('#resetMatchBtn').addEventListener('click', () => {
    if (confirm('Reset the score? Teams and settings are kept.')) send({ type: 'resetMatch' });
  });
  $('#resetAllBtn').addEventListener('click', () => {
    if (confirm('Reset EVERYTHING to defaults? Teams, settings and score will be cleared.')) send({ type: 'resetAll' });
  });

  // ---- teams form ----
  function sendTeams() {
    send({
      type: 'setTeams',
      teams: [0, 1].map((i) => ({
        name: '',
        players: [$(`[data-team-p1="${i}"]`).value, $(`[data-team-p2="${i}"]`).value],
        color: $(`[data-team-color="${i}"]`).value,
      })),
    });
  }
  bindEditable('[data-team-p1], [data-team-p2]', sendTeams);
  $$('[data-team-color]').forEach((el) => el.addEventListener('input', sendTeams));

  // ---- config form ----
  function sendConfig() {
    send({
      type: 'setConfig',
      config: {
        deuceMode: $('#cfgDeuceMode').value,
        starDeuceLimit: clampNum($('#cfgStarLimit').value, 1, 9, 2),
        setsToWin: clampNum($('#cfgSetsToWin').value, 1, 3, 2),
        gamesPerSet: clampNum($('#cfgGamesPerSet').value, 1, 9, 6),
        tiebreakEnabled: $('#cfgTiebreakEnabled').checked,
        tiebreakPoints: clampNum($('#cfgTiebreakPoints').value, 1, 21, 7),
        tiebreakWinByTwo: $('#cfgTiebreakWinByTwo').checked,
        finalSetMode: $('#cfgFinalSetMode').value,
        superTiebreakPoints: clampNum($('#cfgSuperTbPoints').value, 1, 21, 10),
      },
    });
    updateStarVisibility();
  }
  ['#cfgDeuceMode', '#cfgSetsToWin', '#cfgTiebreakEnabled', '#cfgTiebreakWinByTwo', '#cfgFinalSetMode'].forEach((sel) =>
    $(sel).addEventListener('change', sendConfig)
  );
  bindEditable('#cfgStarLimit, #cfgGamesPerSet, #cfgTiebreakPoints, #cfgSuperTbPoints', sendConfig);

  function updateStarVisibility() {
    $('#starLimitWrap').style.display = $('#cfgDeuceMode').value === 'star' ? '' : 'none';
  }

  // ---- display form ----
  function sendDisplay() {
    send({
      type: 'setDisplay',
      display: {
        title: $('#dspTitle').value,
        subtitle: $('#dspSubtitle').value,
        theme: $('#dspTheme').value,
        showTitle: $('#dspShowTitle').checked,
        showPlayers: $('#dspShowPlayers').checked,
        showSets: $('#dspShowSets').checked,
        showServe: $('#dspShowServe').checked,
      },
    });
  }
  ['#dspTheme', '#dspShowTitle', '#dspShowPlayers', '#dspShowSets', '#dspShowServe'].forEach((sel) =>
    $(sel).addEventListener('change', sendDisplay)
  );
  bindEditable('#dspTitle, #dspSubtitle', sendDisplay);

  // ---- overlay URL ----
  function updateOverlayUrl() {
    const pos = $('#ovPos').value;
    const scale = $('#ovScale').value;
    const url = new URL('/overlay', location.origin);
    url.searchParams.set('pos', pos);
    if (scale && scale !== '1') url.searchParams.set('scale', scale);
    $('#overlayUrl').value = url.toString();
  }
  $('#ovPos').addEventListener('change', updateOverlayUrl);
  $('#ovScale').addEventListener('input', updateOverlayUrl);
  $('#copyUrlBtn').addEventListener('click', () => {
    $('#overlayUrl').select();
    navigator.clipboard?.writeText($('#overlayUrl').value);
    flash($('#copyUrlBtn'), 'Copied!');
  });
  $('#openOverlayBtn').addEventListener('click', () => window.open($('#overlayUrl').value, '_blank'));
  updateOverlayUrl();

  // ---- keyboard shortcuts ----
  document.addEventListener('keydown', (e) => {
    if (isTyping(e.target)) return;
    const k = e.key.toLowerCase();
    const map = {
      q: { type: 'point', team: 0 },
      p: { type: 'point', team: 1 },
      a: { type: 'adjustPoints', team: 0, delta: -1 },
      l: { type: 'adjustPoints', team: 1, delta: -1 },
      u: { type: 'undo' },
      r: { type: 'redo' },
      s: { type: 'swapServer' },
    };
    if (map[k]) {
      e.preventDefault();
      send(map[k]);
    }
  });

  // ---- render ----
  function render(s) {
    // Status badge
    const badge = $('#statusBadge');
    badge.textContent = s.status;
    badge.className = 'badge ' + (s.status === 'live' ? 'live' : s.status === 'finished' ? 'finished' : '');

    // Scorer names + colors
    for (let i = 0; i < 2; i++) {
      $(`[data-sname="${i}"]`).textContent = teamLabel(s.teams[i]);
      $(`[data-cdot="${i}"]`).style.background = s.teams[i].color || '#1e88e5';
      $(`[data-acol="${i}"]`).textContent = teamLabel(s.teams[i]);
      $(`[data-games-val="${i}"]`).textContent = s.games[i];
      $(`[data-sets-val="${i}"]`).textContent = s.setsWon[i];
      $(`[data-serve-pick="${i}"]`).classList.toggle('active', s.server === i);
    }

    renderPreview(s);
    syncForms(s);
  }

  function renderPreview(s) {
    const pv = $('#preview');
    pv.innerHTML = '';
    for (let i = 0; i < 2; i++) {
      const row = document.createElement('div');
      row.className = 'pv-row';

      const accent = document.createElement('span');
      accent.className = 'pv-accent';
      accent.style.background = s.teams[i].color || '#1e88e5';

      const serve = document.createElement('span');
      serve.className = 'pv-serve' + (s.server === i && s.status !== 'finished' ? ' active' : '');
      serve.textContent = '●';

      const name = document.createElement('span');
      name.className = 'pv-name';
      name.textContent = teamLabel(s.teams[i]);

      const sets = document.createElement('span');
      sets.className = 'pv-sets';
      s.sets.forEach((set) => {
        const sb = document.createElement('span');
        sb.className = 'pv-set';
        sb.textContent = i === 0 ? set.a : set.b;
        sets.appendChild(sb);
      });

      const games = document.createElement('span');
      games.className = 'pv-games';
      games.textContent = s.games[i];

      const points = document.createElement('span');
      points.className = 'pv-points';
      points.textContent = s.inTiebreak ? s.points[i] : S.pointLabel(s.points, i, s.config);

      row.append(accent, serve, name, sets, games, points);
      pv.appendChild(row);
    }
  }

  // Push server state into form fields, but never overwrite a field being edited.
  function syncForms(s) {
    setVal('[data-team-p1="0"]', s.teams[0].players[0] || '');
    setVal('[data-team-p2="0"]', s.teams[0].players[1] || '');
    setVal('[data-team-p1="1"]', s.teams[1].players[0] || '');
    setVal('[data-team-p2="1"]', s.teams[1].players[1] || '');
    setVal('[data-team-color="0"]', s.teams[0].color);
    setVal('[data-team-color="1"]', s.teams[1].color);

    const c = s.config;
    setVal('#cfgDeuceMode', c.deuceMode);
    setVal('#cfgStarLimit', c.starDeuceLimit);
    setVal('#cfgSetsToWin', String(c.setsToWin));
    setVal('#cfgGamesPerSet', c.gamesPerSet);
    setChk('#cfgTiebreakEnabled', c.tiebreakEnabled);
    setVal('#cfgTiebreakPoints', c.tiebreakPoints);
    setChk('#cfgTiebreakWinByTwo', c.tiebreakWinByTwo);
    setVal('#cfgFinalSetMode', c.finalSetMode);
    setVal('#cfgSuperTbPoints', c.superTiebreakPoints);
    updateStarVisibility();

    const d = s.display;
    setVal('#dspTitle', d.title || '');
    setVal('#dspSubtitle', d.subtitle || '');
    setVal('#dspTheme', d.theme || 'dark');
    setChk('#dspShowTitle', d.showTitle !== false);
    setChk('#dspShowPlayers', d.showPlayers !== false);
    setChk('#dspShowSets', d.showSets !== false);
    setChk('#dspShowServe', d.showServe !== false);
  }

  // ---- helpers ----
  function bindEditable(selector, handler) {
    $$(selector).forEach((el) => {
      el.addEventListener('focus', () => editing.add(el));
      el.addEventListener('blur', () => editing.delete(el));
      el.addEventListener('input', handler);
    });
  }

  function setVal(sel, val) {
    const el = $(sel);
    if (!el || editing.has(el)) return;
    if (document.activeElement === el) return;
    if (el.value !== String(val)) el.value = val;
  }

  function setChk(sel, val) {
    const el = $(sel);
    if (!el || document.activeElement === el) return;
    el.checked = !!val;
  }

  function clampNum(v, min, max, def) {
    let n = parseInt(v, 10);
    if (isNaN(n)) return def;
    return Math.max(min, Math.min(max, n));
  }

  function isTyping(target) {
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target.isContentEditable;
  }

  function flash(btn, text) {
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(() => (btn.textContent = old), 1200);
  }
})();
