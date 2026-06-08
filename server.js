'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { createWsHub } = require('./src/wsserver');
const scoring = require('./src/scoring');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const STATE_FILE = path.join(__dirname, 'state.json');
const MAX_HISTORY = 100;

// ---------------------------------------------------------------------------
// State + history
// ---------------------------------------------------------------------------

let state = loadState();
const undoStack = [];
const redoStack = [];

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      // Merge over defaults so new fields are always present after upgrades.
      const base = scoring.createDefaultState();
      return {
        ...base,
        ...saved,
        config: { ...base.config, ...(saved.config || {}) },
        display: { ...base.display, ...(saved.display || {}) },
        teams: saved.teams && saved.teams.length === 2 ? saved.teams : base.teams,
      };
    }
  } catch (err) {
    console.error('Could not load saved state, starting fresh:', err.message);
  }
  return scoring.createDefaultState();
}

let saveTimer = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.writeFile(STATE_FILE, JSON.stringify(state), (err) => {
      if (err) console.error('Failed to persist state:', err.message);
    });
  }, 200);
}

function pushHistory() {
  undoStack.push(scoring.clone(state));
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
}

// ---------------------------------------------------------------------------
// WebSocket hub
// ---------------------------------------------------------------------------

const hub = createWsHub();

function stateMessage() {
  return JSON.stringify({ type: 'state', state, clients: hub.size });
}

function broadcastState() {
  hub.broadcast(stateMessage());
}

hub.onConnect((socket) => {
  hub.sendText(socket, stateMessage());
});

hub.onMessage((socket, text) => {
  let msg;
  try {
    msg = JSON.parse(text);
  } catch (_) {
    return;
  }
  handleCommand(msg);
});

function handleCommand(cmd) {
  if (!cmd || typeof cmd.type !== 'string') return;

  if (cmd.type === 'undo') {
    if (undoStack.length) {
      redoStack.push(scoring.clone(state));
      state = undoStack.pop();
      persist();
      broadcastState();
    }
    return;
  }

  if (cmd.type === 'redo') {
    if (redoStack.length) {
      undoStack.push(scoring.clone(state));
      state = redoStack.pop();
      persist();
      broadcastState();
    }
    return;
  }

  if (cmd.type === 'ping') {
    return; // handled by ws layer; ignore app-level pings
  }

  if (scoring.isMutating(cmd.type)) {
    const next = scoring.applyCommand(state, cmd);
    if (next !== state) {
      pushHistory();
      state = next;
      persist();
      broadcastState();
    }
  }
}

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function safeJoin(base, target) {
  const resolved = path.normalize(path.join(base, target));
  if (!resolved.startsWith(base)) return null; // path traversal guard
  return resolved;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);

  // REST fallback for posting commands (useful for stream decks / hotkey apps).
  if (req.method === 'POST' && pathname === '/api/command') {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        handleCommand(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false }));
      }
    });
    return;
  }

  if (pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
    return;
  }

  // Shared scoring module (single source of truth for score labels).
  if (pathname === '/scoring.js') {
    serveFile(res, path.join(__dirname, 'src', 'scoring.js'));
    return;
  }

  // Friendly routes.
  if (pathname === '/') pathname = '/admin.html';
  if (pathname === '/overlay') pathname = '/overlay.html';
  if (pathname === '/admin') pathname = '/admin.html';

  const filePath = safeJoin(PUBLIC_DIR, pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  serveFile(res, filePath);
});

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/ws') {
    hub.handleUpgrade(req, socket);
  } else {
    socket.destroy();
  }
});

server.listen(PORT, HOST, () => {
  const lan = firstLanAddress();
  console.log('');
  console.log('  🎾  OBS Padel Scoreboard is running');
  console.log('  ----------------------------------------');
  console.log(`  Admin panel : http://localhost:${PORT}/admin`);
  console.log(`  OBS overlay : http://localhost:${PORT}/overlay`);
  if (lan) {
    console.log('');
    console.log(`  On your network (other devices / OBS on another PC):`);
    console.log(`  Admin       : http://${lan}:${PORT}/admin`);
    console.log(`  Overlay     : http://${lan}:${PORT}/overlay`);
  }
  console.log('');
  console.log('  Add the overlay URL as a Browser Source in OBS.');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});

function firstLanAddress() {
  try {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const ni of ifaces[name]) {
        if (ni.family === 'IPv4' && !ni.internal) return ni.address;
      }
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}
