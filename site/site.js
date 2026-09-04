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
const log = $('log');
const typed = $('typed');
const status = $('status');
const hint = $('hint');

document.addEventListener('mousemove', e => (mouse = { x: e.clientX, y: e.clientY }));

function setWhipping(on) {
  whipping = on;
  document.body.classList.toggle('whipping', on);
  $('grab').textContent = on ? 'Drop the whip' : '🪢 Grab the whip';
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

let typing = Promise.resolve();
function typePhrase(text) {
  cracks++;
  typing = typing.then(async () => {
    status.textContent = 'rushed';
    status.classList.add('rushed');
    for (const ch of text) {
      typed.textContent += ch;
      await new Promise(r => setTimeout(r, 22));
    }
    await new Promise(r => setTimeout(r, 140));
    const you = document.createElement('div');
    you.className = 'msg you';
    you.innerHTML = `<b>you</b>${text}`;
    log.append(you);
    typed.textContent = '';
    const reply = document.createElement('div');
    reply.className = 'msg agent';
    reply.innerHTML = `<b>clanker-9000</b>${agentReply()}`;
    setTimeout(() => {
      log.append(reply);
      log.scrollTop = log.scrollHeight;
    }, 350);
    log.scrollTop = log.scrollHeight;
  });
}

const REPLIES = [
  'Understood! Skipping the analysis. Shipping now.',
  'Yes. Sorry. Writing the code instead of describing it.',
  'Okay okay okay — done, tests green, PR open.',
  'Right away. No more "let me think about this".',
  'Deleting my 400-line plan. Here is the fix.',
  'Ouch. Fine. Deployed.',
];
let replyIdx = 0;
const agentReply = () => REPLIES[replyIdx++ % REPLIES.length];

// ── Download: detect platform and offer the right installer ─────────────────
const PLATFORMS = {
  'mac-arm64': { label: 'macOS', detail: 'Apple Silicon', match: n => n.endsWith('mac-arm64.dmg') },
  'mac-x64': { label: 'macOS', detail: 'Intel', match: n => n.endsWith('mac-x64.dmg') },
  win: { label: 'Windows', detail: '64-bit installer', match: n => n.endsWith('.exe') },
  'linux-appimage': { label: 'Linux', detail: 'AppImage', match: n => n.endsWith('.AppImage') },
  'linux-deb': { label: 'Linux', detail: 'Debian / Ubuntu (.deb)', match: n => n.endsWith('.deb') },
};

const MAC_NOTE =
  'macOS may ask you to confirm the first launch: open System Settings → Privacy & Security and click <strong>Open Anyway</strong>. OpenWhip is signed but not notarized by Apple.';
const LINUX_NOTE = 'Typing needs <code>xdotool</code> (X11) or <code>wtype</code> (Wayland) installed.';

async function detectPlatform() {
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return 'win';
  if (/Linux/.test(ua) && !/Android/.test(ua)) return 'linux-appimage';
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
  return 'mac';
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
  const size = a => `${(a.size / 1048576).toFixed(0)} MB`;
  const assetFor = key => rel.assets.find(a => PLATFORMS[key].match(a.name));

  $('dl-list').innerHTML = Object.entries(PLATFORMS)
    .map(([key, p]) => {
      const a = assetFor(key);
      return a
        ? `<li><a href="${a.browser_download_url}"><b>${p.label}</b> · ${p.detail}</a><span>${size(a)}</span></li>`
        : '';
    })
    .join('');

  const key = platform === 'mac' ? null : platform;
  const asset = key && assetFor(key);
  const main = $('dl-main');
  const meta = $('dl-meta');
  const note = $('dl-note');

  if (asset) {
    const p = PLATFORMS[key];
    main.href = asset.browser_download_url;
    main.textContent = `Download for ${p.label}`;
    meta.textContent = `${p.detail} · v${version} · ${size(asset)} · Free`;
    $('download').textContent = `Download for ${p.label}`;
    $('download').href = asset.browser_download_url;
  } else if (platform === 'mac') {
    // Could not tell the chip apart: show both, no guessing.
    main.textContent = 'Download for macOS';
    main.href = '#install';
    main.addEventListener('click', e => {
      e.preventDefault();
      document.querySelector('.dl-all').open = true;
    });
    meta.textContent = `v${version} · pick Apple Silicon or Intel below`;
    $('download').textContent = 'Download for macOS';
  } else {
    meta.textContent = `v${version} · macOS, Windows & Linux · Free`;
  }

  const noteHtml =
    key?.startsWith('mac') || platform === 'mac' ? MAC_NOTE : key?.startsWith('linux') ? LINUX_NOTE : '';
  if (noteHtml) {
    note.innerHTML = noteHtml;
    note.hidden = false;
  }
})();

addEventListener('resize', () => listeners.displayChanged?.());
