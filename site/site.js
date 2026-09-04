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

// ── Demo targets ────────────────────────────────────────────────────────────
const OS = /Windows/.test(navigator.userAgent)
  ? 'win'
  : /Mac/.test(navigator.userAgent)
    ? 'mac'
    : /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent)
      ? 'linux'
      : 'mac';
document.body.dataset.os = OS;

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

// ── Coding agents: one is picked at random per visit ────────────────────────
const SHELL = { mac: 'zsh', win: 'pwsh', linux: 'bash' }[OS];
const CWD = { mac: '~/work/api', win: 'C:\\work\\api', linux: '~/work/api' }[OS];

const AGENTS = [
  {
    id: 'claude',
    name: 'Claude Code',
    title: `claude — ${CWD} — ${SHELL}`,
    accent: '#d97757',
    prompt: '>',
    banner: `<div class="box"><span class="c-accent">✻</span> Welcome to <b>Claude Code</b>!\n\n  <span class="c-dim">/help for help, /status for your current setup</span>\n\n  <span class="c-dim">cwd: ${CWD}</span></div>`,
    task: 'refactor the auth module and add tests',
    work: [
      "I'll start by exploring the codebase to understand the current auth flow.",
      '<b>Read</b>(src/auth/**) <span class="c-dim">… 47 files</span>',
      'Let me think carefully about the optimal architecture before making changes.',
      'Considering edge cases. Considering more edge cases.',
    ],
    bullet: '<span class="c-accent">⏺</span>',
    thinking: s =>
      `<span class="c-think">✶ Thinking… <span class="c-dim">(${s} · ↑ 38.2k tokens · esc to interrupt)</span></span>`,
    replies: [
      'Understood. Skipping the exploration phase. <b>Edit</b>(src/auth/session.ts)',
      'Writing code instead of describing it. <b>Bash</b>(npm test) <span class="c-dim">… 42 passed</span>',
      'Removed the 400-line plan. Here is the diff.',
      'No more "let me think about this". <b>Bash</b>(git commit -m "refactor auth")',
      'Ouch. Fine. Pushed.',
    ],
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    title: `codex — ${CWD} — ${SHELL}`,
    accent: '#e5e7eb',
    prompt: '›',
    banner: `<div class="box"><b>&gt;_ OpenAI Codex</b> <span class="c-dim">(v0.42.0)</span>\n\n<span class="c-dim">model:</span>     gpt-5-codex <span class="c-dim">(reasoning: high)</span>\n<span class="c-dim">directory:</span> ${CWD}\n<span class="c-dim">approval:</span>  on-request</div>`,
    task: 'refactor the auth module and add tests',
    work: [
      '<span class="c-dim">codex</span>\nI want to fully understand the existing auth flow before touching anything.',
      '<span class="c-dim">exec</span> <b>rg -n "session" src/auth</b> <span class="c-dim">… 312 matches</span>',
      '<span class="c-dim">codex</span>\nThere are several architectural options here. Let me weigh them.',
    ],
    bullet: '',
    thinking: s =>
      `<span class="c-think">• Working <span class="c-dim">(${s} • esc to interrupt)</span></span>`,
    replies: [
      '<span class="c-dim">codex</span>\nUnderstood. Skipping analysis. <b>apply_patch</b> src/auth/session.ts',
      '<span class="c-dim">exec</span> <b>npm test</b> <span class="c-dim">… 42 passed</span>',
      '<span class="c-dim">codex</span>\nDone weighing options. Shipping the obvious one.',
      '<span class="c-dim">exec</span> <b>git commit -m "refactor auth"</b>',
      '<span class="c-dim">codex</span>\nPushed. Please put the whip down.',
    ],
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot CLI',
    title: `copilot — ${CWD} — ${SHELL}`,
    accent: '#8957e5',
    prompt: '>',
    banner: `<div class="box"><span class="c-accent">◆</span> Welcome to <b>GitHub Copilot CLI</b>\n\n  <span class="c-dim">Model: Claude Sonnet 4.5 · /help for commands</span>\n  <span class="c-dim">Working in ${CWD}</span></div>`,
    task: 'refactor the auth module and add tests',
    work: [
      "I'll begin with a thorough exploration of the repository structure.",
      '<b>view</b> src/auth <span class="c-dim">(47 files)</span>',
      'Before making changes, let me reason about the ideal approach.',
      'Enumerating edge cases…',
    ],
    bullet: '<span class="c-accent">●</span>',
    thinking: s => `<span class="c-think">✦ Thinking… <span class="c-dim">(${s})</span></span>`,
    replies: [
      'Got it. Straight to the edit. <b>edit</b> src/auth/session.ts',
      'Skipping the essay. <b>bash</b> npm test <span class="c-dim">… 42 passed</span>',
      'Removing the plan. Applying the fix.',
      'Committing. <b>bash</b> git commit -m "refactor auth"',
      'Pushed. Whip acknowledged.',
    ],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    title: `opencode — ${CWD} — ${SHELL}`,
    accent: '#fab283',
    prompt: '>',
    banner: `<div class="oc-logo"><span class="c-dim">█▀█ █▀█ █▀▀ █▄ █</span> <span class="c-accent">█▀▀ █▀█ █▀▄ █▀▀</span>\n<span class="c-dim">█▄█ █▀▀ ██▄ █ ▀█</span> <span class="c-accent">█▄▄ █▄█ █▄▀ ██▄</span></div>\n<span class="c-dim">${CWD} · claude-sonnet-4-5 · build</span>`,
    task: 'refactor the auth module and add tests',
    work: [
      "I'll explore the codebase first to understand the current implementation.",
      '<span class="c-dim">→</span> <b>Glob</b> src/auth/** <span class="c-dim">47 files</span>',
      '<span class="c-dim">→</span> <b>Read</b> src/auth/session.ts',
      'Let me consider the architecture carefully.',
    ],
    bullet: '<span class="c-accent">▌</span>',
    thinking: s => `<span class="c-think">◐ Thinking… <span class="c-dim">${s}</span></span>`,
    replies: [
      'Right. Skipping the tour. <span class="c-dim">→</span> <b>Edit</b> src/auth/session.ts',
      '<span class="c-dim">→</span> <b>Bash</b> npm test <span class="c-dim">42 passed</span>',
      'Plan deleted. Code written.',
      '<span class="c-dim">→</span> <b>Bash</b> git commit -m "refactor auth"',
      'Pushed.',
    ],
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    title: `antigravity — ${CWD} — ${SHELL}`,
    accent: '#4c8df6',
    prompt: '❯',
    banner: `<div class="box"><span class="c-accent">✦</span> <b>Antigravity</b> Agent Manager <span class="c-dim">· Gemini 3 Pro</span>\n\n  <span class="c-dim">Workspace: ${CWD}</span>\n  <span class="c-dim">Mode: Planning</span></div>`,
    task: 'refactor the auth module and add tests',
    work: [
      'Creating an implementation plan artifact before any code changes.',
      '<b>Task</b> · Investigate auth module <span class="c-dim">(47 files)</span>',
      'Drafting <b>implementation_plan.md</b> <span class="c-dim">… 400 lines</span>',
      'Requesting plan review. Awaiting approval.',
    ],
    bullet: '<span class="c-accent">✦</span>',
    thinking: s => `<span class="c-think">◌ Generating plan… <span class="c-dim">${s}</span></span>`,
    replies: [
      'Plan approved by whip. Switching to <b>Fast</b> mode.',
      '<b>Task</b> · Edit src/auth/session.ts <span class="c-dim">✓</span>',
      'Skipped the walkthrough artifact. Tests: <span class="c-dim">42 passed</span>',
      '<b>Task</b> · git commit -m "refactor auth" <span class="c-dim">✓</span>',
      'Pushed. Gravity restored.',
    ],
  },
];

const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
document.documentElement.style.setProperty('--agent', agent.accent);
$('term-title').textContent = agent.title;
$('term-prompt').textContent = agent.prompt;

const termLog = $('term-log');
termLog.innerHTML = `${agent.banner}\n\n<span class="c-dim">${agent.prompt}</span> ${agent.task}\n\n${agent.work
  .map(w => `${agent.bullet} ${w}`.trim())
  .join('\n')}\n<span id="think-line"></span>`;

// The agent has been "thinking" since long before you opened the page.
const thinkStart = Date.now() - 252_000;
const fmt = s => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
const tick = () => {
  $('think-line').innerHTML = agent.thinking(fmt(Math.floor((Date.now() - thinkStart) / 1000)));
};
tick();
setInterval(tick, 1000);
termLog.scrollTop = termLog.scrollHeight;
$('term-status').textContent = `${agent.name} · ${CWD}`;

// ── Teams: Northwind Engineering › General ────────────────────────────────────
const TEAMS_REPLIES = [
  ['MR', '#e97548', 'Marta Rivas', '??'],
  ['DL', '#0f7b6c', 'Dani Lorenzo', 'is this the whip thing again 😂'],
  ['PK', '#8764b8', 'Priya Kaur', 'pls not in General'],
  ['MR', '#e97548', 'Marta Rivas', 'ok ok pushing now'],
  ['DL', '#0f7b6c', 'Dani Lorenzo', 'FASTER yourself'],
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
  await typeInto(text);
  termLog.append(el('div', 'line', `\n<span class="c-dim">${agent.prompt}</span> <b>${text}</b>\n`));
  termLog.scrollTop = termLog.scrollHeight;
  await sleep(350);
  const reply = agent.replies[replyIdx++ % agent.replies.length];
  termLog.append(el('div', 'line', `${agent.bullet} ${reply}`.trim()));
  termLog.scrollTop = termLog.scrollHeight;
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
