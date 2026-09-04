'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  Tuning – physics runs at a fixed 60 Hz step; values are per step.
// ═══════════════════════════════════════════════════════════════════════════
const P = {
  // Rope
  segments: 28,
  segmentLength: 25,
  taper: 0.6,

  // Physics
  gravity: 1.2,
  dropGravity: 0.95,
  damping: 0.96,
  constraintIters: 12,
  maxStretchRatio: 1.2,

  // Handle aim (spring towards an angle driven by mouse motion)
  baseTargetAngle: -1.12,
  handleAimByMouseX: 0.4,
  handleAimByMouseY: 0.2,
  handleAimClamp: 2.0,
  handleSpring: 0.7,
  handleAngularDamping: 0.078,
  basePoseSegments: 2,
  basePoseStiffStart: 0.9,
  basePoseStiffEnd: 0.8,

  // Bend limits (stiff handle, floppy tip)
  handleMaxBendDeg: 16,
  tipMaxBendDeg: 130,
  bendRigidityStart: 0.8,
  bendRigidityEnd: 0.12,

  // Screen-edge slap
  wallBounce: 0.42,
  wallFriction: 0.86,

  // Crack detection
  crackSpeed: 280,
  crackCooldownMs: 200,
  firstCrackGraceMs: 350,

  // Look
  widthHandle: 7,
  widthTip: 4.5,
  outline: 2.5,
  gripSegments: 2,
  gripExtraWidth: 5,
  cordHandleColor: [58, 36, 18],
  cordTipColor: [20, 20, 20],
  gripColor: '#8a5a2b',
  pommelColor: '#d4a63a',
  shadowOffset: 4,
  crackFxMs: 260,
  crackFxRadius: 70,

  // Spawn arc
  arcWidth: 260,
  arcHeight: 185,

  // Near-invisible fill so the window still receives mouse events.
  bgAlpha: 0.011,
};

const STEP_MS = 1000 / 60;
const SEGMENT_LENGTHS = Array.from({ length: P.segments - 1 }, (_, i) => {
  const t = i / (P.segments - 1);
  return P.segmentLength * (1 - t * (1 - P.taper));
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

// ── Canvas (HiDPI aware) ────────────────────────────────────────────────────
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
let W = 0;
let H = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener('resize', resize);

// ── Audio ───────────────────────────────────────────────────────────────────
// The web demo (site/) hosts the same file from a different directory.
const SOUNDS_BASE = window.OPENWHIP_SOUNDS ?? '../sounds/';
const audioPool = ['A', 'B', 'C', 'D', 'E'].map(name => {
  const audio = new Audio(`${SOUNDS_BASE}${name}.mp3`);
  audio.preload = 'auto';
  return audio;
});

function playCrack() {
  const audio =
    audioPool.find(a => a.paused || a.ended) || audioPool[Math.floor(Math.random() * audioPool.length)];
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

// ── State ───────────────────────────────────────────────────────────────────
let whip = null;
let dropping = false;
let mouseX = 0;
let mouseY = 0;
let prevMouseX = 0;
let prevMouseY = 0;
let handleAngle = P.baseTargetAngle;
let handleAngVel = 0;
let spawnedAt = 0;
let lastCrackAt = 0;
const crackFx = [];

document.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});
document.addEventListener('mousedown', drop);

function spawn(x, y) {
  mouseX = prevMouseX = x;
  mouseY = prevMouseY = y;
  handleAngle = P.baseTargetAngle;
  handleAngVel = 0;
  dropping = false;
  lastCrackAt = 0;
  spawnedAt = performance.now();
  crackFx.length = 0;

  whip = Array.from({ length: P.segments }, (_, i) => {
    const t = i / (P.segments - 1);
    const px = x + t * P.arcWidth;
    const py = y - Math.sin(t * Math.PI * 0.75) * P.arcHeight;
    return { x: px, y: py, px, py };
  });
  startLoop();
}

function drop() {
  if (whip) dropping = true;
}

// ── Physics ─────────────────────────────────────────────────────────────────
function updateHandleAim() {
  const delta = clamp(
    (mouseX - prevMouseX) * P.handleAimByMouseX + (mouseY - prevMouseY) * P.handleAimByMouseY,
    -P.handleAimClamp,
    P.handleAimClamp,
  );
  handleAngVel += wrapPi(P.baseTargetAngle + delta - handleAngle) * P.handleSpring;
  handleAngVel *= P.handleAngularDamping;
  handleAngle = wrapPi(handleAngle + handleAngVel);
}

function applyBasePose() {
  const dx = Math.cos(handleAngle);
  const dy = Math.sin(handleAngle);
  const guided = Math.min(P.basePoseSegments, whip.length - 1);
  for (let i = 1; i <= guided; i++) {
    const stiff = lerp(P.basePoseStiffStart, P.basePoseStiffEnd, (i - 1) / Math.max(guided - 1, 1));
    const prev = whip[i - 1];
    const p = whip[i];
    p.x = lerp(p.x, prev.x + dx * SEGMENT_LENGTHS[i - 1], stiff);
    p.y = lerp(p.y, prev.y + dy * SEGMENT_LENGTHS[i - 1], stiff);
  }
}

function applyBendLimits() {
  for (let i = 1; i < whip.length - 1; i++) {
    const a = whip[i - 1];
    const b = whip[i];
    const c = whip[i + 1];
    const v1x = a.x - b.x;
    const v1y = a.y - b.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const l1 = Math.hypot(v1x, v1y) || 1e-4;
    const l2 = Math.hypot(v2x, v2y) || 1e-4;
    const n1x = v1x / l1;
    const n1y = v1y / l1;
    const n2x = v2x / l2;
    const n2y = v2y / l2;

    const t = i / (whip.length - 2);
    const maxBend = (lerp(P.handleMaxBendDeg, P.tipMaxBendDeg, t) * Math.PI) / 180;
    const bend = Math.PI - Math.acos(clamp(n1x * n2x + n1y * n2y, -1, 1));
    if (bend <= maxBend) continue;

    const sign = n1x * n2y - n1y * n2x >= 0 ? 1 : -1;
    const targetA = Math.atan2(n1y, n1x) + sign * (Math.PI - maxBend);
    const rigidity = lerp(P.bendRigidityStart, P.bendRigidityEnd, t);
    c.x = lerp(c.x, b.x + Math.cos(targetA) * l2, rigidity);
    c.y = lerp(c.y, b.y + Math.sin(targetA) * l2, rigidity);
  }
}

function capStretch() {
  for (let i = 0; i < whip.length - 1; i++) {
    const a = whip[i];
    const b = whip[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1e-4;
    const maxLen = SEGMENT_LENGTHS[i] * P.maxStretchRatio;
    if (dist <= maxLen) continue;
    const k = maxLen / dist;
    b.x = a.x + dx * k;
    b.y = a.y + dy * k;
  }
}

function applyWalls() {
  if (dropping) return;
  for (let i = 1; i < whip.length; i++) {
    const p = whip[i];
    let vx = p.x - p.px;
    let vy = p.y - p.py;
    let hit = false;

    if (p.x < 0 || p.x > W) {
      p.x = clamp(p.x, 0, W);
      vx = -vx * P.wallBounce;
      vy *= P.wallFriction;
      hit = true;
    }
    if (p.y < 0 || p.y > H) {
      p.y = clamp(p.y, 0, H);
      vy = -vy * P.wallBounce;
      vx *= P.wallFriction;
      hit = true;
    }
    if (hit) {
      p.px = p.x - vx;
      p.py = p.y - vy;
    }
  }
}

function satisfyConstraints() {
  for (let i = 0; i < whip.length - 1; i++) {
    const a = whip[i];
    const b = whip[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1e-4;
    const diff = ((dist - SEGMENT_LENGTHS[i]) / dist) * 0.5;
    const ox = dx * diff;
    const oy = dy * diff;
    if (i === 0 && !dropping) {
      b.x -= ox * 2;
      b.y -= oy * 2;
    } else {
      a.x += ox;
      a.y += oy;
      b.x -= ox;
      b.y -= oy;
    }
  }
}

function step() {
  const g = dropping ? P.dropGravity : P.gravity;
  if (!dropping) updateHandleAim();

  for (let i = dropping ? 0 : 1; i < whip.length; i++) {
    const p = whip[i];
    const vx = (p.x - p.px) * P.damping;
    const vy = (p.y - p.py) * P.damping;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy + g;
  }

  if (!dropping) {
    const h = whip[0];
    h.px = h.x;
    h.py = h.y;
    h.x = mouseX;
    h.y = mouseY;
  }

  capStretch();
  applyWalls();
  if (!dropping) applyBasePose();

  for (let iter = 0; iter < P.constraintIters; iter++) {
    satisfyConstraints();
    applyBendLimits();
    if (!dropping) applyBasePose();
    capStretch();
    applyWalls();
  }

  const tip = whip[whip.length - 1];
  const tipSpeed = Math.hypot(tip.x - tip.px, tip.y - tip.py);
  const now = performance.now();
  if (
    !dropping &&
    tipSpeed > P.crackSpeed &&
    now - spawnedAt >= P.firstCrackGraceMs &&
    now - lastCrackAt > P.crackCooldownMs
  ) {
    lastCrackAt = now;
    crackFx.push({ x: tip.x, y: tip.y, at: now });
    playCrack();
    window.bridge.crack();
  }

  if (dropping && whip.every(p => p.y > H + 60)) {
    whip = null;
    window.bridge.hidden();
  }

  prevMouseX = mouseX;
  prevMouseY = mouseY;
}

// ── Rendering ───────────────────────────────────────────────────────────────
function extrapolate(pts, i) {
  const n = pts.length;
  if (i < 0) return { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y };
  if (i >= n) return { x: 2 * pts[n - 1].x - pts[n - 2].x, y: 2 * pts[n - 1].y - pts[n - 2].y };
  return pts[i];
}

// Catmull–Rom segment i → i+1 expressed as a cubic Bézier.
function curveTo(pts, i) {
  const p0 = extrapolate(pts, i - 1);
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = extrapolate(pts, i + 2);
  ctx.bezierCurveTo(
    p1.x + (p2.x - p0.x) / 6,
    p1.y + (p2.y - p0.y) / 6,
    p2.x - (p3.x - p1.x) / 6,
    p2.y - (p3.y - p1.y) / 6,
    p2.x,
    p2.y,
  );
}

function tracePath(pts, from, to) {
  ctx.beginPath();
  ctx.moveTo(pts[from].x, pts[from].y);
  for (let i = from; i < to; i++) curveTo(pts, i);
}

function cordColor(t) {
  const c = P.cordHandleColor.map((v, k) => Math.round(lerp(v, P.cordTipColor[k], t)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function drawWhip(alpha) {
  // Interpolate between the last two physics states for silky motion on any refresh rate.
  const pts = whip.map(p => ({ x: lerp(p.px, p.x, alpha), y: lerp(p.py, p.y, alpha) }));
  const last = pts.length - 1;
  const grip = Math.min(P.gripSegments, last);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Soft shadow
  ctx.save();
  ctx.translate(P.shadowOffset * 0.6, P.shadowOffset);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = P.widthTip + P.outline * 2 + 2;
  tracePath(pts, 0, last);
  ctx.stroke();
  ctx.restore();

  // Light halo so the cord reads on any background
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = P.widthTip + P.outline * 2;
  tracePath(pts, 0, last);
  ctx.stroke();
  ctx.lineWidth = P.widthHandle + P.gripExtraWidth + P.outline * 2;
  tracePath(pts, 0, grip);
  ctx.stroke();

  // Cord, tapering in width and colour towards the tip
  for (let i = 0; i < last; i++) {
    const t = i / Math.max(1, last - 1);
    ctx.strokeStyle = cordColor(t);
    ctx.lineWidth = lerp(P.widthHandle, P.widthTip, t) + (i < grip ? P.gripExtraWidth : 0);
    tracePath(pts, i, i + 1);
    ctx.stroke();
  }

  // Leather grip and pommel
  ctx.strokeStyle = P.gripColor;
  ctx.lineWidth = P.widthHandle + P.gripExtraWidth - 2;
  tracePath(pts, 0, grip);
  ctx.stroke();

  ctx.fillStyle = P.pommelColor;
  ctx.beginPath();
  ctx.arc(pts[0].x, pts[0].y, (P.widthHandle + P.gripExtraWidth) / 2 + 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawCrackFx(now) {
  for (let i = crackFx.length - 1; i >= 0; i--) {
    const fx = crackFx[i];
    const t = (now - fx.at) / P.crackFxMs;
    if (t >= 1) {
      crackFx.splice(i, 1);
      continue;
    }
    const ease = 1 - (1 - t) ** 3;
    const r = P.crackFxRadius * ease;
    const fade = 1 - t;

    ctx.lineWidth = 3 * fade + 0.5;
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * fade})`;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(255,215,90,${0.9 * fade})`;
    ctx.lineWidth = 2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + fx.at * 0.001;
      const r0 = r * 0.55;
      const r1 = r * 0.95 + 6;
      ctx.beginPath();
      ctx.moveTo(fx.x + Math.cos(a) * r0, fx.y + Math.sin(a) * r0);
      ctx.lineTo(fx.x + Math.cos(a) * r1, fx.y + Math.sin(a) * r1);
      ctx.stroke();
    }
  }
}

function draw(alpha, now) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = `rgba(0,0,0,${P.bgAlpha})`;
  ctx.fillRect(0, 0, W, H);
  if (whip) drawWhip(alpha);
  drawCrackFx(now);
}

// ── Loop: fixed-step physics, interpolated render, sleeps when idle ─────────
let rafId = 0;
let lastTs = 0;
let accumulator = 0;

function frame(ts) {
  if (!whip) {
    rafId = 0;
    ctx.clearRect(0, 0, W, H);
    return;
  }
  accumulator += Math.min(ts - lastTs, 100);
  lastTs = ts;

  let steps = 0;
  while (accumulator >= STEP_MS && steps++ < 4 && whip) {
    step();
    accumulator -= STEP_MS;
  }
  if (accumulator >= STEP_MS) accumulator = 0;

  if (whip) draw(accumulator / STEP_MS, performance.now());
  rafId = requestAnimationFrame(frame);
}

function startLoop() {
  if (rafId) return;
  lastTs = performance.now();
  accumulator = 0;
  rafId = requestAnimationFrame(frame);
}

// ── Bridge ──────────────────────────────────────────────────────────────────
window.bridge.onSpawn(pos => {
  const ok = pos && Number.isFinite(pos.x) && Number.isFinite(pos.y);
  spawn(ok ? pos.x : W / 2, ok ? pos.y : H / 2);
});
window.bridge.onDrop(drop);
window.bridge.onDisplayChanged(resize);
