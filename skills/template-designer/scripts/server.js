import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CONTENT_DIR = process.env.TEMPLATE_DIR;
const STATE_DIR = process.env.TEMPLATE_STATE_DIR;

if (!CONTENT_DIR || !STATE_DIR) {
  console.error('Fatal: TEMPLATE_DIR and TEMPLATE_STATE_DIR environment variables must be set.');
  process.exit(1);
}

const BIND_HOST = process.env.TEMPLATE_HOST || '127.0.0.1';
const URL_HOST = process.env.TEMPLATE_URL_HOST || 'localhost';
const OWNER_PID = parseInt(process.env.TEMPLATE_OWNER_PID || '0', 10);
const TIMEOUT_MS = 30 * 60 * 1000;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

let lastRequestTime = Date.now();
let lastServedFile = null;

function getNewestHtml() {
  try {
    const files = fs.readdirSync(CONTENT_DIR)
      .filter(f => f.endsWith('.html'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(CONTENT_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? files[0] : null;
  } catch { return null; }
}

function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
}

function wrapInFrame(content) {
  const frame = readFile(path.join(SCRIPT_DIR, 'frame-template.html'));
  if (!frame) return content;
  return frame.replace('<!-- CONTENT -->', content);
}

function injectHelper(html) {
  const tag = '<script src="/helper.js"></script>';
  if (html.includes('</body>')) return html.replace('</body>', tag + '\n</body>');
  return html + '\n' + tag;
}

const server = http.createServer((req, res) => {
  lastRequestTime = Date.now();

  if (req.method === 'POST' && req.url === '/event') {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 65536) { req.destroy(); return; }
      body += chunk;
    });
    req.on('end', () => {
      try {
        JSON.parse(body);
        const eventsFile = path.join(STATE_DIR, 'events.jsonl');
        fs.appendFileSync(eventsFile, body.trim() + '\n');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end('{"ok":true}');
      } catch (e) {
        if (!res.headersSent) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      }
    });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (req.url === '/helper.js') {
    const js = readFile(path.join(SCRIPT_DIR, 'helper.js'));
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(js || '');
    return;
  }

  // Serve newest HTML
  const entry = getNewestHtml();
  if (!entry) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body style="background:#111;color:#aaa;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><p>Waiting for content...</p></body></html>');
    return;
  }

  const newest = entry.name;
  const lastModified = new Date(entry.mtime).toUTCString();

  // Clear events when served file changes
  if (newest !== lastServedFile) {
    lastServedFile = newest;
    const eventsFile = path.join(STATE_DIR, 'events.jsonl');
    try { fs.writeFileSync(eventsFile, ''); } catch {}
  }

  let html = readFile(path.join(CONTENT_DIR, newest));
  if (!html) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const isFullDoc = html.trimStart().startsWith('<!DOCTYPE') || html.trimStart().startsWith('<html');
  if (isFullDoc) {
    html = injectHelper(html);
  } else {
    html = wrapInFrame(html);
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Last-Modified': lastModified });
  res.end(req.method === 'HEAD' ? '' : html);
});

server.listen(0, BIND_HOST, () => {
  const port = server.address().port;
  const info = JSON.stringify({
    type: 'server-started',
    port,
    host: BIND_HOST,
    url_host: URL_HOST,
    url: `http://${URL_HOST}:${port}`,
    content_dir: CONTENT_DIR,
    state_dir: STATE_DIR
  });
  fs.writeFileSync(path.join(STATE_DIR, 'server-info.json'), info);
  console.log(info);
});

const checker = setInterval(() => {
  const elapsed = Date.now() - lastRequestTime;
  let ownerGone = false;
  if (OWNER_PID > 0) {
    try { process.kill(OWNER_PID, 0); } catch { ownerGone = true; }
  }
  if (elapsed > TIMEOUT_MS || ownerGone) {
    try { fs.writeFileSync(path.join(STATE_DIR, 'server-stopped'), ''); } catch {}
    clearInterval(checker);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000);
  }
}, 60000);
checker.unref();
