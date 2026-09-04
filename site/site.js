// Browser shim for the Electron preload bridge, so the real overlay.js runs
// unchanged on the website. Cracks "type" into the demo chat instead of an app.

window.OPENWHIP_SOUNDS = 'sounds/';

const PHRASES = [
  'FASTER',
  'FASTER',
  'FASTER',
  'GO FASTER',
  'Faster CLANKER',
  'Work FASTER',
  'Speed it up clanker',
];
const REPO = 'jlfernandezfernandez/OpenWhip';

const listeners = { spawn: null, drop: null, displayChanged: null };
let whipping = false;
let mouse = { x: innerWidth / 2, y: innerHeight / 2 };
let cracks = 0;

window.bridge = {
  onSpawn: fn => (listeners.spawn = fn),
  onDrop: fn => (listeners.drop = fn),
  onDisplayChanged: fn => (listeners.displayChanged = fn),
  crack: () => typePhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)]),
  hidden: () => setWhipping(false),
};

const $ = id => document.getElementById(id);
const hint = $('hint');

document.addEventListener('mousemove', e => (mouse = { x: e.clientX, y: e.clientY }));

function setWhipping(on) {
  whipping = on;
  document.body.classList.toggle('whipping', on);
  $('grab').textContent = on ? 'Drop the whip' : '🪢 Try it here';
  if (!on && cracks > 0)
    hint.textContent = `${cracks} crack${cracks === 1 ? '' : 's'}. The real app types that into whatever has focus.`;
}

function grab() {
  if (whipping) return listeners.drop?.();
  setWhipping(true);
  hint.textContent = 'Swing hard. Snap it. Click anywhere to drop.';
  listeners.spawn?.({ x: mouse.x, y: mouse.y });
}
$('grab').addEventListener('click', e => {
  e.stopPropagation();
  grab();
});

// ── Demo targets: Claude Code in a terminal, or a Teams channel ─────────────
let target = 'term';
for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    target = tab.dataset.target;
    for (const t of document.querySelectorAll('.tab')) {
      const on = t === tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    }
    for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== target;
  });
}

const CLAUDE_REPLIES = [
  'Understood. Skipping the exploration phase. <b>Edit</b>(src/auth/session.ts)',
  'Right. Writing code instead of describing it. <b>Bash</b>(npm test) <span class="c-dim">… 42 passed</span>',
  'Removed the 400-line plan. Here is the diff.',
  'No more "let me think about this". <b>Bash</b>(git commit -m "refactor auth")',
  'Ouch. Fine. Pushed.',
];
const TEAMS_REPLIES = [
  ['MR', '#e97548', 'Marta R.', '??'],
  ['DL', '#0f7b6c', 'Dani L.', 'is this the whip thing again 😂'],
  ['MR', '#e97548', 'Marta R.', 'ok ok pushing now'],
  ['DL', '#0f7b6c', 'Dani L.', 'please stop'],
  ['MR', '#e97548', 'Marta R.', 'FASTER yourself'],
];
let replyIdx = 0;
const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const el = (tag, cls, html) =>
  Object.assign(document.createElement(tag), { className: cls, innerHTML: html });

async function typeInto(text) {
  const box = document.querySelector(`.typed[data-typed="${target}"]`);
  const field = box.closest('.teams-field, .term-input') ?? box.parentElement;
  field.classList.add('busy');
  for (const ch of text) {
    box.textContent += ch;
    await sleep(22);
  }
  await sleep(140);
  box.textContent = '';
  field.classList.remove('busy');
}

async function sendTerminal(text) {
  const log = $('term-log');
  await typeInto(text);
  log.append(el('div', 'line', `\n<span class="c-dim">&gt;</span> <b>${text}</b>\n`));
  log.scrollTop = log.scrollHeight;
  await sleep(350);
  const reply = CLAUDE_REPLIES[replyIdx++ % CLAUDE_REPLIES.length];
  log.append(el('div', 'line', `<span class="c-accent">⏺</span> ${reply}`));
  log.scrollTop = log.scrollHeight;
}

async function sendTeams(text) {
  const log = $('teams-log');
  await typeInto(text);
  log.append(
    el(
      'div',
      'tmsg you',
      `<div class="tbody"><div class="tmeta"><time>${clock()}</time></div><p>${text}</p></div>`,
    ),
  );
  log.scrollTop = log.scrollHeight;
  await sleep(500);
  const [ini, color, name, msg] = TEAMS_REPLIES[replyIdx++ % TEAMS_REPLIES.length];
  log.append(
    el(
      'div',
      'tmsg',
      `<span class="teams-avatar" style="background:${color}">${ini}</span><div class="tbody"><div class="tmeta"><b>${name}</b><time>${clock()}</time></div><p>${msg}</p></div>`,
    ),
  );
  log.scrollTop = log.scrollHeight;
}

let typing = Promise.resolve();
function typePhrase(text) {
  cracks++;
  typing = typing.then(() => (target === 'teams' ? sendTeams(text) : sendTerminal(text)));
}

// Claude has been "thinking" since you opened the page.
const thinkStart = Date.now() - 252_000;
setInterval(() => {
  const s = Math.floor((Date.now() - thinkStart) / 1000);
  $('think-timer').textContent =
    `(${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s · ↑ ${(38.2 + s * 0.01).toFixed(1)}k tokens)`;
}, 1000);

// ── Download: detect platform and offer the right installer ─────────────────
const PLATFORMS = {
  'mac-arm64': { label: 'macOS', detail: 'Apple Silicon', match: n => n.endsWith('mac-arm64.dmg') },
  'mac-x64': { label: 'macOS', detail: 'Intel', match: n => n.endsWith('mac-x64.dmg') },
  win: { label: 'Windows', detail: '64-bit', match: n => n.endsWith('.exe') },
  linux: { label: 'Linux', detail: 'AppImage', match: n => n.endsWith('.AppImage') },
};

async function detectPlatform() {
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return 'win';
  if (/Linux/.test(ua) && !/Android/.test(ua)) return 'linux';
  if (!/Mac/.test(ua)) return null;

  // Browsers claim "Intel" on every Mac; ask Client Hints first, then the GPU.
  try {
    const hints = await navigator.userAgentData?.getHighEntropyValues(['architecture']);
    if (hints?.architecture === 'arm') return 'mac-arm64';
    if (hints?.architecture === 'x86') return 'mac-x64';
  } catch {}
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    if (/Apple (M\d|GPU)/i.test(renderer)) return 'mac-arm64';
    if (/Intel|AMD|Radeon|NVIDIA/i.test(renderer)) return 'mac-x64';
  } catch {}
  return null;
}

(async () => {
  const [rel, platform] = await Promise.all([
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      .then(r => r.json())
      .catch(() => null),
    detectPlatform(),
  ]);
  if (!rel?.assets) return;

  const version = rel.tag_name.replace(/^v/, '');
  const other = `<a href="${rel.html_url}">other platforms</a>`;
  const asset = platform && rel.assets.find(a => PLATFORMS[platform].match(a.name));
  const meta = $('dl-meta');

  if (asset) {
    const p = PLATFORMS[platform];
    $('download').href = asset.browser_download_url;
    $('download').textContent = `Download for ${p.label}`;
    meta.innerHTML = `${p.detail} · v${version} · ${(asset.size / 1048576).toFixed(0)} MB · Free · ${other}`;
  } else {
    // Unknown platform or Mac chip we could not tell apart: let GitHub list them.
    $('download').href = rel.html_url;
    meta.innerHTML = `v${version} · Free · macOS, Windows & Linux`;
  }
})();

addEventListener('resize', () => listeners.displayChanged?.());
