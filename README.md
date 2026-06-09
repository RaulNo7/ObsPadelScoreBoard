# 🎾 OBS Padel Scoreboard

A real-time **padel scoreboard overlay for OBS** with a web-based **admin control panel**.
Run one small server, open the admin panel to control the score, and add the overlay
URL as a Browser Source in OBS. Score updates appear on stream instantly.

**Zero runtime dependencies** — it only needs Node.js. No `npm install`, no internet.

---

## Features

- **Live overlay** for OBS (transparent background, broadcast-style graphics).
- **Admin control panel** in the browser: point scoring, manual corrections, undo/redo.
- **Real-time sync** over WebSocket — multiple overlays/panels stay in lock-step.
- **Three deuce rules**, switchable per match:
  - **Golden point** — sudden-death deciding point at 40-40.
  - **Advantage** — classic, win the game by two points.
  - **Star point** — advantage play for a configurable number of deuces, then the
    next deuce becomes a sudden-death golden point (default: 2 deuces, so 40-40 and
    4-4 are advantage and 5-5 is golden).
- **Fully configurable format**: sets to win (best of 1/3/5), games per set,
  tiebreak on/off + target points + win-by-two, and a final-set mode
  (normal / tiebreak / whole-set super tiebreak).
- **Team setup**: names, two players each, team colours.
- **Overlay options**: tournament title/subtitle, light/dark theme, toggles for
  player names, set history and serve indicator, plus position & scale.
- **Serve indicator** with automatic alternation (and tiebreak serve rotation).
- **Keyboard hotkeys** for fast live operation.
- **State is persisted** to `state.json`, so a server restart mid-match keeps the score.

---

## Requirements

- [Node.js](https://nodejs.org/) **18 or newer**.

Check it's installed:

```powershell
node --version
```

If that errors, install Node.js LTS from <https://nodejs.org/> (or `winget install OpenJS.NodeJS.LTS`).

---

## Running

From this folder:

```powershell
npm start
# or simply:
node server.js
```

You'll see:

```
  🎾  OBS Padel Scoreboard is running
  Admin panel : http://localhost:8080/admin
  OBS overlay : http://localhost:8080/overlay
```

- Open the **admin panel** in any browser to control the match.
- Use the **overlay URL** as the OBS Browser Source.

To run on a different port: `set PORT=9000 && node server.js` (PowerShell: `$env:PORT=9000; node server.js`).

---

## Adding the overlay to OBS

1. In OBS: **Sources → + → Browser**.
2. URL: the overlay URL from the admin panel's **"OBS overlay URL"** card
   (it includes your chosen position & scale, e.g.
   `http://localhost:8080/overlay?pos=bottom-left`).
3. Width **1920**, Height **1080**.
4. Tick **"Shutdown source when not visible"** off; leave background transparent
   (the page is transparent by default).
5. The scoreboard appears in the corner you selected and updates live.

> Running OBS on a **different PC**? Use the network URL the server prints
> (`http://<your-ip>:8080/overlay`) and make sure the port is allowed through the firewall.

---

## Keyboard hotkeys (admin panel)

| Key | Action                  |
|-----|-------------------------|
| `Q` | Left team — add a point     |
| `A` | Left team — remove a point  |
| `P` | Right team — add a point    |
| `L` | Right team — remove a point |
| `U` | Undo                    |
| `R` | Redo                    |
| `S` | Swap serve              |

Hotkeys are ignored while typing in a text field.

---

## Scoring rules in detail

A padel game runs `0 → 15 → 30 → 40 → game`. At **40-40** the configured deuce rule applies:

- **Golden point**: the next point wins the game.
- **Advantage**: a team must lead by two points (Ad → game).
- **Star point**: plays as advantage for the first *N* deuces, then the next deuce is
  a sudden-death golden point. The admin field **"deuces before golden point"** is *N*
  (default **2**). 3-3 is deuce #1, 4-4 is deuce #2, 5-5 is deuce #3, … so with the
  default *N* = 2, **40-40 and 4-4 are advantage and 5-5 is the golden point**.
  (Internally this is stored as `starDeuceLimit` = *N* + 1, the deuce number that is golden.)

A set is won at `gamesPerSet` games with a two-game lead. At games-all (e.g. 6-6)
a tiebreak is played if enabled (first to `tiebreakPoints`, win by two if set).
The deciding set can instead be played as a single **super tiebreak** (to 10 by default).

All of these are adjustable live from the **Match format** card in the admin panel.

---

## Testing

```powershell
npm test
```

Runs `test/scoring.test.js`, which exercises golden/advantage/star scoring,
set & match completion, tiebreaks and the super-tiebreak final set.

---

## How it works

```
 Admin panel  ──┐                         ┌──►  OBS overlay
 (admin.html)   │   WebSocket  (/ws)      │     (overlay.html)
                ├──►  Node server  ───────┤
 REST fallback  │   (server.js)           └──►  more overlays / panels
 (/api/command) ┘   authoritative state
```

- The **server** holds the authoritative match state and the scoring engine
  (`src/scoring.js`). Clients send **commands** (e.g. `{type:'point', team:0}`);
  the server applies them and **broadcasts** the new state to everyone.
- The WebSocket layer (`src/wsserver.js`) is a tiny RFC-6455 implementation, so
  there are **no npm dependencies**.
- A REST endpoint `POST /api/command` accepts the same commands — handy for
  Stream Deck / hotkey tools.

### Project layout

```
server.js              HTTP + WebSocket server, state, persistence
src/scoring.js         Padel scoring engine (shared by server and browser)
src/wsserver.js        Minimal dependency-free WebSocket server
public/overlay.*       OBS overlay (transparent scoreboard)
public/admin.*         Admin control panel
public/client.js       Reconnecting WebSocket client (shared)
test/scoring.test.js   Scoring engine tests
```

## License

MIT
