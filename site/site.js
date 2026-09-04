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

// Detect OS for the download button and show the latest version.
(async () => {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    const rel = await res.json();
    const ua = navigator.userAgent;
    const os = /Mac/.test(ua) ? 'mac' : /Win/.test(ua) ? 'win' : /Linux/.test(ua) ? 'linux' : null;
    // Browsers report "Intel" on Apple Silicon too, so macOS keeps the release page (both .dmg listed).
    const pick = a =>
      (os === 'win' && a.name.endsWith('.exe')) || (os === 'linux' && a.name.endsWith('.AppImage'));
    const asset = rel.assets.find(pick);
    if (asset) $('download').href = asset.browser_download_url;
    if (os)
      $('download').textContent = `Download for ${{ mac: 'macOS', win: 'Windows', linux: 'Linux' }[os]}`;
    $('ver').textContent = `Latest: ${rel.tag_name}.`;
  } catch {}
})();

$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('cmd').textContent);
  $('copy').textContent = 'Copied';
  setTimeout(() => ($('copy').textContent = 'Copy'), 1200);
});

addEventListener('resize', () => listeners.displayChanged?.());
