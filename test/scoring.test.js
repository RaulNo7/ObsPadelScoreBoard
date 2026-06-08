'use strict';

/* Minimal zero-dependency test runner for the padel scoring engine. */

const scoring = require('../src/scoring');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('  ✗ FAIL: ' + msg);
  }
}

function eq(a, b, msg) {
  assert(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}

/** Apply a sequence of point winners (array of 0/1) to a state. */
function play(state, points) {
  let s = state;
  for (const t of points) s = scoring.applyCommand(s, { type: 'point', team: t });
  return s;
}

function withConfig(overrides) {
  const s = scoring.createDefaultState();
  Object.assign(s.config, overrides);
  return s;
}

console.log('\nRunning padel scoring tests…\n');

// --- Golden point ---------------------------------------------------------
(function goldenPoint() {
  let s = withConfig({ deuceMode: 'golden' });
  // 40-40 then team 0 wins the golden point -> wins the game.
  s = play(s, [0, 1, 0, 1, 0, 1]); // 3-3 (40-40)
  eq(scoring.pointLabel(s.points, 0, s.config), 'DEUCE', 'golden: 3-3 shows DEUCE');
  s = play(s, [0]); // golden point team 0
  eq(s.games, [1, 0], 'golden: team0 wins game on sudden death');
  eq(s.points, [0, 0], 'golden: points reset after game');
})();

// --- Advantage ------------------------------------------------------------
(function advantage() {
  let s = withConfig({ deuceMode: 'advantage' });
  s = play(s, [0, 1, 0, 1, 0, 1]); // 3-3 deuce
  s = play(s, [0]); // Ad team0
  eq(scoring.pointLabel(s.points, 0, s.config), 'AD', 'advantage: shows AD');
  eq(s.games, [0, 0], 'advantage: no game yet at Ad');
  s = play(s, [1]); // back to deuce
  eq(scoring.pointLabel(s.points, 0, s.config), 'DEUCE', 'advantage: back to DEUCE');
  s = play(s, [0, 0]); // Ad then game
  eq(s.games, [1, 0], 'advantage: team0 wins by two');
})();

// --- Star point (deuce limit 2) ------------------------------------------
(function starPoint() {
  let s = withConfig({ deuceMode: 'star', starDeuceLimit: 2 });
  s = play(s, [0, 1, 0, 1, 0, 1]); // 3-3 (deuce #1)
  s = play(s, [0]); // Ad team0 (still advantage, deuce#1 < limit 2)
  eq(s.games, [0, 0], 'star: Ad does not win during deuce #1');
  s = play(s, [1]); // 4-4 (deuce #2 == limit) -> next point is sudden death
  eq(s.points, [4, 4], 'star: reached 4-4');
  s = play(s, [1]); // sudden death, team1 wins by one
  eq(s.games, [0, 1], 'star: sudden death awards game on single point at limit');
})();

// --- Normal set win (6-4) -------------------------------------------------
(function setWin() {
  let s = withConfig({ deuceMode: 'golden', tiebreakEnabled: true });
  // Team 0 wins 6 games to 4 -> wins the set.
  const seq = [];
  // win 4 games each first to make it 4-4? simpler: just give team0 6 quick games, team1 4
  // Each game: 4 straight points.
  function game(winner) {
    return [winner, winner, winner, winner];
  }
  let pts = [];
  for (let i = 0; i < 4; i++) pts = pts.concat(game(0));
  for (let i = 0; i < 4; i++) pts = pts.concat(game(1));
  // 4-4 now, team0 wins next two games -> 6-4
  pts = pts.concat(game(0), game(0));
  s = play(s, pts);
  eq(s.setsWon, [1, 0], 'set: team0 wins set 6-4');
  eq(s.sets.length, 1, 'set: one completed set recorded');
  eq([s.sets[0].a, s.sets[0].b], [6, 4], 'set: recorded 6-4');
})();

// --- Tiebreak at 6-6 ------------------------------------------------------
(function tiebreak() {
  let s = withConfig({ deuceMode: 'golden', gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7 });
  function game(w) { return [w, w, w, w]; }
  let pts = [];
  for (let i = 0; i < 6; i++) pts = pts.concat(game(0)); // would be 6-0; need 6-6
  // Do 6-6 instead:
  s = withConfig({ deuceMode: 'golden', gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7 });
  pts = [];
  for (let i = 0; i < 6; i++) pts = pts.concat(game(0), game(1)); // 6-6
  s = play(s, pts);
  eq(s.inTiebreak, true, 'tiebreak: entered at 6-6');
  // Team0 wins tiebreak 7-0
  s = play(s, [0, 0, 0, 0, 0, 0, 0]);
  eq(s.setsWon, [1, 0], 'tiebreak: team0 wins the set via tiebreak');
  eq([s.sets[0].a, s.sets[0].b], [7, 6], 'tiebreak: set recorded 7-6');
  assert(s.sets[0].tb && s.sets[0].tb.a === 7, 'tiebreak: tb score recorded');
})();

// --- Match win (best of 3) -----------------------------------------------
(function matchWin() {
  let s = withConfig({ deuceMode: 'golden', setsToWin: 2, gamesPerSet: 6 });
  function game(w) { return [w, w, w, w]; }
  function set0() { let p = []; for (let i = 0; i < 6; i++) p = p.concat(game(0)); return p; }
  s = play(s, set0()); // set 1: 6-0 team0
  s = play(s, set0()); // set 2: 6-0 team0 -> match
  eq(s.status, 'finished', 'match: finished after 2 sets');
  eq(s.winner, 0, 'match: team0 wins match');
})();

// --- Super tiebreak final set --------------------------------------------
(function superTiebreak() {
  let s = withConfig({ deuceMode: 'golden', setsToWin: 2, gamesPerSet: 6, finalSetMode: 'superTiebreak', superTiebreakPoints: 10 });
  function game(w) { return [w, w, w, w]; }
  function set6(w) { let p = []; for (let i = 0; i < 6; i++) p = p.concat(game(w)); return p; }
  s = play(s, set6(0)); // 1-0 team0
  s = play(s, set6(1)); // 1-1 -> deciding set should be super tiebreak
  eq(s.inTiebreak, true, 'superTb: deciding set starts as tiebreak');
  eq(s.inSuperTiebreak, true, 'superTb: flagged super tiebreak');
  s = play(s, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // team0 to 10
  eq(s.status, 'finished', 'superTb: match finished');
  eq(s.winner, 0, 'superTb: team0 wins via super tiebreak');
  assert(s.sets[2].superTb === true, 'superTb: final set marked super');
})();

// --- Server alternation ---------------------------------------------------
(function serverToggle() {
  let s = withConfig({ deuceMode: 'golden' });
  const startServer = s.server;
  s = play(s, [0, 0, 0, 0]); // team0 wins a game
  eq(s.server, 1 - startServer, 'serve: server alternates after a game');
})();

console.log(`\n${passed} passed, ${failed} failed.\n`);
process.exit(failed ? 1 : 0);
