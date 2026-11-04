import * as THREE from './vendor/three.module.min.js';

// =================================================================
// 기본 유틸
// =================================================================
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (k, dt) => 1 - Math.exp(-k * dt);
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function segProject(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / l2, 0, 1);
  const x = a[0] + dx * t, z = a[1] + dz * t;
  return { t, d: Math.hypot(px - x, pz - z) };
}

// =================================================================
// 평면도 → 월드 좌표 (도면 px × 0.025 = m)
// =================================================================
const S = 0.025;
const m = ([x, z]) => [(x - 100) * S, (z - 100) * S];
const toPx = (x, z) => [x / S + 100, z / S + 100];

const FLOOR_PX = [[118, 118], [835, 118], [835, 885], [580, 885], [580, 1110], [290, 1110], [290, 592], [285, 568], [215, 570], [118, 535]];
const FLOOR = FLOOR_PX.map(m);
const WALL_H = 6;

const HOLD_COLORS = {
  yellow: '#f6c915', green: '#3fae5a', blue: '#2f6fd6', red: '#e3262b', purple: '#7b3fb8',
  black: '#2a2a2d', pink: '#ff7aa8', white: '#f2f2f2', orange: '#ff8a1f',
};
const COLOR_NAMES = { yellow: '노랑', green: '초록', blue: '파랑', red: '빨강', purple: '보라', black: '검정', pink: '핑크', white: '흰색', orange: '주황' };

const SECTORS = [
  { id: 's1', label: '1', name: '1번 섹터', color: '#d4a73a', H: 4.3, lean: 0.6,
    foot: [[270, 118], [605, 118], [605, 262], [525, 283], [470, 250], [440, 215], [345, 205], [335, 400], [270, 400]],
    front: [[270, 400], [335, 400], [345, 205], [440, 215], [470, 250], [525, 283], [605, 262]] },
  { id: 's2', label: '2', name: '2번 섹터', color: '#c0282d', H: 4.3, lean: 1.0,
    foot: [[605, 118], [835, 118], [835, 378], [810, 325], [800, 212], [720, 152], [655, 142], [630, 250], [605, 262]],
    front: [[605, 262], [630, 250], [655, 142], [720, 152], [800, 212], [810, 325], [835, 378]] },
  { id: 's3', label: '3', name: '3번 섹터', color: '#4caf43', H: 4.3, lean: 0.3,
    foot: [[835, 378], [835, 852], [815, 835], [820, 760], [805, 665], [812, 580], [725, 495], [790, 405]],
    front: [[835, 378], [790, 405], [725, 495], [812, 580], [805, 665], [820, 760], [815, 835], [835, 852]] },
  { id: 's4', label: '4', name: '4번 섹터', color: '#2563b8', H: 3.6, lean: 0.45, closed: true,
    foot: [[490, 568], [578, 556], [615, 585], [628, 715], [598, 740], [483, 718]] },
  { id: 'spray', label: '스프레이월', name: '스프레이월', color: '#3a3540', H: 3.8, lean: 1.3, dark: true,
    foot: [[235, 118], [270, 118], [270, 375], [235, 375]], front: [[235, 375], [235, 118]] },
  { id: 'trial', label: '체험벽', name: '체험벽', color: '#f2f2f2', H: 3.0, lean: 0,
    foot: null, front: [[118, 535], [215, 570], [285, 568]] },
];
SECTORS.forEach((s) => { s.footM = s.foot ? s.foot.map(m) : null; });
const OBSTACLES = SECTORS.filter((s) => s.footM);

// [섹터, 색, 레벨, 그레이드, 위치(0~1), 다이노]
const PROBLEM_DEFS = [
  ['s1', 'yellow', 0, 'V0', 0.08], ['s1', 'green', 1, 'V1', 0.3], ['s1', 'blue', 2, 'V2', 0.62], ['s1', 'purple', 5, 'V5', 0.88, true],
  ['s2', 'blue', 2, 'V2', 0.16], ['s2', 'red', 4, 'V4', 0.5, true], ['s2', 'black', 6, 'V6', 0.84, true],
  ['s3', 'yellow', 0, 'V0', 0.14], ['s3', 'green', 1, 'V1', 0.45], ['s3', 'red', 3, 'V3', 0.78],
  ['s4', 'yellow', 0, 'V0', 0.06], ['s4', 'blue', 2, 'V2', 0.4], ['s4', 'purple', 5, 'V5', 0.74, true],
  ['spray', 'pink', 3, 'V3', 0.28], ['spray', 'white', 5, 'V5', 0.74, true],
  ['trial', 'orange', 0, 'VB', 0.28], ['trial', 'green', 1, 'V1', 0.76],
];

const REACH = 0.85;   // 손이 닿는 거리 (m)
const CATCH = 0.34;   // 다이노 캐치 반경
const BODY_DROP = 0.98; // 손 → 발바닥 높이 (2등신)
const PLAYER_R = 0.28;

const FLAME_D = 'M50 4 C57 17 63 21 70 15 C71 27 77 30 85 24 C81 39 93 50 91 67 C89 86 72 96 50 96 C28 96 11 86 9 67 C7 50 19 39 15 24 C23 30 29 27 30 15 C37 21 43 17 50 4 Z';
const PLAYER_COLORS = [
  { name: '빨강', c: '#e3262b' }, { name: '주황', c: '#ff8a1f' }, { name: '핑크', c: '#ff5c8a' },
  { name: '노랑', c: '#ffc21a' }, { name: '파랑', c: '#3b7bff' }, { name: '초록', c: '#2fbf71' },
];
const NPCS = [
  { name: '하바네로', color: '#ff8a1f', spot: [400, 470] },
  { name: '청양이', color: '#2fbf71', spot: [690, 800] },
  { name: '떡볶이', color: '#ff5c8a', spot: [170, 300] },
];
const HUBS = [[450, 460], [690, 470], [420, 820], [690, 800], [180, 440]].map(m);
const LINES = {
  idle: ['오늘 손가락 컨디션 좋다', '이 문제 발 어디 써요?', '초크 좀 빌려줘~', '2번 섹터 빡세다', '스트레칭 먼저 해요',
    '조금만 쉬고 갈게', '매트 푹신하다', '퇴근하고 오길 잘했다', '세팅 새로 됐네?', '내일 팔 못 들 듯', '보라 다이노 한 번만 더…', '스프레이월 미쳤음'],
  cheer: ['나이스!!', '가자~!!', '미쳤다 🔥', '완등 축하해요!', '오 깔끔하다', '박수 👏'],
  comfort: ['아까비~', '거의 다 왔는데!', '괜찮아요 다시 가요', '쉬었다 한 번 더!', '펌핑 왔구나 ㅠ'],
  npcStart: ['가볼까', '한 번 붙어본다', '오늘은 된다', '집중…'],
  npcTop: ['완등!!', '됐다!!', '드디어 🔥'],
  npcFall: ['으악', '발 미끄러짐', '손 다 풀렸어', '다음엔 된다'],
  playerTop: ['완등! 🔥', '해냈다!!', '매운맛 클리어!'],
  playerFall: ['앗!!', '펌핑…', '손이 안 펴져'],
};

// =================================================================
// 사운드 / 음악
// =================================================================
const Sound = {
    on: false, ctx: null,
    ensure() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); return this.ctx; },
    tone(freq, dur = 0.08, type = 'sine', vol = 0.15, when = 0, slide = 0) {
      if (!this.on) return;
      const ctx = this.ensure();
      const t = ctx.currentTime + when;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
    },
    grab() { this.tone(180 + Math.random() * 60, 0.07, 'triangle', 0.18); },
    chalk() { this.tone(900, 0.12, 'sawtooth', 0.03, 0, -500); },
    fall() { this.tone(500, 0.45, 'sine', 0.14, 0, -380); this.tone(90, 0.18, 'square', 0.08, 0.42); },
    top() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.14, i * 0.09)); },
  };
const Music = {
    on: false, timer: null, nextT: 0, step: 0, bpm: 84,
    chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], // Fmaj7 Em7 Dm7 Cmaj7
    mtof: (m) => 440 * Math.pow(2, (m - 69) / 12),
    init() {
      const ctx = Sound.ensure();
      if (this.out) return;
      this.out = ctx.createGain(); this.out.gain.value = 0.0001;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      this.out.connect(lp).connect(ctx.destination);
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      this.noise = buf;
    },
    toggle() { if (this.on) this.stop(); else this.start(); return this.on; },
    start() {
      this.init();
      const ctx = Sound.ctx;
      if (ctx.resume) ctx.resume();
      this.on = true;
      this.out.gain.cancelScheduledValues(ctx.currentTime);
      this.out.gain.setTargetAtTime(0.55, ctx.currentTime, 0.8);
      this.nextT = ctx.currentTime + 0.1; this.step = 0;
      clearInterval(this.timer);
      this.timer = setInterval(() => this.schedule(), 50);
    },
    stop() {
      this.on = false;
      clearInterval(this.timer);
      if (Sound.ctx) this.out.gain.setTargetAtTime(0.0001, Sound.ctx.currentTime, 0.3);
    },
    schedule() {
      const ctx = Sound.ctx, sp = 60 / this.bpm / 4;
      if (this.nextT < ctx.currentTime - 0.5) this.nextT = ctx.currentTime + 0.05; // 탭 복귀 시 따라잡기 방지
      while (this.nextT < ctx.currentTime + 0.3) {
        const swing = this.step % 2 ? sp * 0.12 : 0;
        this.play(this.step, this.nextT + swing, sp);
        this.nextT += sp;
        this.step = (this.step + 1) % 64;
      }
    },
    play(s, t, sp) {
      const b = s % 16, chord = this.chords[Math.floor(s / 16)];
      if (b === 0) { chord.forEach((m, i) => this.pad(this.mtof(m), t, sp * 15, i)); this.bass(this.mtof(chord[0] - 12), t, sp * 6); }
      if (b === 8) this.bass(this.mtof(chord[0] - 12 + (Math.random() < 0.5 ? 7 : 0)), t, sp * 5);
      if (b === 0 || b === 10) this.kick(t);
      if (b === 4 || b === 12) this.snare(t);
      if (b % 2 === 0) this.hat(t, b % 4 === 2 ? 0.05 : 0.025);
      if (b % 2 === 0 && Math.random() < 0.3) {
        const sc = [0, 2, 4, 7, 9];
        this.pluck(this.mtof(72 + sc[Math.floor(Math.random() * 5)] - (Math.random() < 0.3 ? 12 : 0)), t);
      }
    },
    env(g, t, a, peak, rel) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + rel);
    },
    osc(type, f, t, dur, peak, a = 0.01) {
      const ctx = Sound.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      this.env(g, t, a, peak, dur);
      o.connect(g).connect(this.out); o.start(t); o.stop(t + a + dur + 0.05);
      return o;
    },
    pad(f, t, dur, i) { this.osc('triangle', f, t, dur, 0.03, 0.6).detune.value = i % 2 ? 7 : -7; },
    bass(f, t, dur) { this.osc('sine', f, t, dur, 0.18, 0.02); },
    pluck(f, t) { this.osc('sine', f, t, 0.6, 0.05, 0.005); this.osc('triangle', f * 2, t, 0.18, 0.012, 0.005); },
    kick(t) {
      const ctx = Sound.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      this.env(g, t, 0.004, 0.4, 0.26);
      o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.35);
    },
    noiseHit(t, dur, peak, type, freq) {
      const ctx = Sound.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.noise; f.type = type; f.frequency.value = freq;
      this.env(g, t, 0.002, peak, dur);
      src.connect(f).connect(g).connect(this.out); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    },
    snare(t) { this.noiseHit(t, 0.16, 0.1, 'bandpass', 1800); },
    hat(t, v) { this.noiseHit(t, 0.035, v, 'highpass', 7000); },
  };

// =================================================================
// 저장소
// =================================================================
const Store = {
  key: 'spicy-climbing-3d-v1',
  data: { name: '', color: '#e3262b', sends: {}, recent: [], festival: 0, helpSeen: false, manner: 36.5 },
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) Object.assign(this.data, JSON.parse(raw));
      else {
        const old = JSON.parse(localStorage.getItem('spicy-climbing-v1') || 'null');
        if (old) { this.data.name = old.name || ''; this.data.color = old.color || this.data.color; }
      }
    } catch (e) { /* 없음 */ }
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* 무시 */ } },
  addSend(p) {
    this.data.sends[p.id] = (this.data.sends[p.id] || 0) + 1;
    this.data.recent.unshift({ id: p.id, t: Date.now() });
    this.data.recent = this.data.recent.slice(0, 12);
    this.save();
  },
};

// =================================================================
// 텍스처 / 스프라이트
// =================================================================
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function panelTexture(base, dot, line) {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = mulberry(base.length * 99);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 * r()})`; g.fillRect(r() * w, r() * h, 3, 3); }
    g.fillStyle = dot;
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { g.beginPath(); g.arc(21 + x * 42.6, 21 + y * 42.6, 3.2, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = line; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function textSprite(text, { h = 0.28, bg = 'rgba(20,20,22,.8)', fg = '#fff', border = null, tail = false, font = '700 44px "Noto Sans KR", sans-serif', circle = false, depthTest = false } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = font;
  const tw = g.measureText(text).width;
  const ph = 64, pad = 26;
  const W = circle ? ph + 16 : Math.ceil(tw + pad * 2), Hh = ph + (tail ? 18 : 0) + 8;
  c.width = W; c.height = Hh;
  g.font = font;
  g.fillStyle = bg;
  if (circle) { g.beginPath(); g.arc(W / 2, (ph + 8) / 2, ph / 2, 0, Math.PI * 2); g.fill(); }
  else { roundRect(g, 4, 4, W - 8, ph, ph / 2); g.fill(); }
  if (border) { g.lineWidth = 5; g.strokeStyle = border; if (circle) { g.beginPath(); g.arc(W / 2, (ph + 8) / 2, ph / 2 - 2, 0, Math.PI * 2); g.stroke(); } else { roundRect(g, 4, 4, W - 8, ph, ph / 2); g.stroke(); } }
  if (tail) { g.fillStyle = bg; g.beginPath(); g.moveTo(W / 2 - 12, ph + 2); g.lineTo(W / 2, ph + 22); g.lineTo(W / 2 + 12, ph + 2); g.fill(); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, W / 2, 4 + ph / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set((W / Hh) * h * (Hh / ph), h * (Hh / ph), 1);
  sp.center.set(0.5, tail ? 0 : 0.5);
  sp.renderOrder = 10;
  return sp;
}
function disposeSprite(sp) { sp.material.map.dispose(); sp.material.dispose(); }

// =================================================================
// three.js 기본 세팅
// =================================================================
let renderer, scene, camera;
const V3 = THREE.Vector3;
const tmpV = new V3(), tmpV2 = new V3();

function initThree() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  $('#scene').appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#141416');
  scene.fog = new THREE.Fog('#141416', 28, 60);
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 150);
  scene.add(new THREE.HemisphereLight(0xfff4e2, 0x4a4a52, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(6, 18, 14);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffe8d0, 0.6);
  fill.position.set(-8, 10, -6);
  scene.add(fill);
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
}

// =================================================================
// 벽(스트립) 구성
// =================================================================
const strips = [];
function walkable(x, z, r = PLAYER_R) {
  const pts = [[x, z], [x + r, z], [x - r, z], [x, z + r], [x, z - r]];
  for (const [px, pz] of pts) {
    if (!inPoly(px, pz, FLOOR)) return false;
    for (const o of OBSTACLES) if (inPoly(px, pz, o.footM)) return false;
  }
  return true;
}

function buildStrip(sec) {
  const pts = (sec.closed ? sec.foot : sec.front).map(m);
  const closed = !!sec.closed;
  const n = closed ? pts.length : pts.length - 1;
  const segs = [];
  let L = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let nrm = [-dir[1], dir[0]];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const ok = (nn) => {
      const x = mid[0] + nn[0] * 0.3, z = mid[1] + nn[1] * 0.3;
      return inPoly(x, z, FLOOR) && !OBSTACLES.some((o) => inPoly(x, z, o.footM));
    };
    if (!ok(nrm)) nrm = [-nrm[0], -nrm[1]];
    segs.push({ a, b, len, dir, nrm, u0: L });
    L += len;
  }
  const vn = pts.map((_, i) => {
    const list = [];
    if (closed || i < n) list.push(segs[i % n]);
    if (closed || i > 0) list.push(segs[(i - 1 + n) % n]);
    let x = 0, z = 0;
    list.forEach((s) => { x += s.nrm[0]; z += s.nrm[1]; });
    const l = Math.hypot(x, z) || 1;
    const nx = x / l, nz = z / l;
    const d = Math.max(0.5, nx * list[0].nrm[0] + nz * list[0].nrm[1]);
    return [nx / d, nz / d];
  });
  const H = sec.H, lean = sec.lean;
  segs.forEach((s, i) => {
    const j = (i + 1) % pts.length;
    s.ta = [s.a[0] + vn[i][0] * lean, s.a[1] + vn[i][1] * lean];
    s.tb = [s.b[0] + vn[j][0] * lean, s.b[1] + vn[j][1] * lean];
    s.along3 = new V3(s.dir[0], 0, s.dir[1]);
    const up = new V3((s.ta[0] + s.tb[0] - s.a[0] - s.b[0]) / 2, H, (s.ta[1] + s.tb[1] - s.a[1] - s.b[1]) / 2).normalize();
    const n3 = new V3().crossVectors(s.along3, up).normalize();
    if (n3.x * s.nrm[0] + n3.z * s.nrm[1] < 0) n3.negate();
    s.up3 = new V3().crossVectors(n3, s.along3).normalize();
    if (s.up3.y < 0) s.up3.negate();
    s.n3 = n3;
  });
  return { sec, pts, segs, L, H, closed, lean, holds: [], problems: [] };
}
function wrapU(st, u) { return st.closed ? ((u % st.L) + st.L) % st.L : clamp(u, 0.15, st.L - 0.15); }
function segAt(st, u) {
  u = st.closed ? ((u % st.L) + st.L) % st.L : clamp(u, 0, st.L);
  for (const s of st.segs) if (u <= s.u0 + s.len) return [s, u];
  const s = st.segs[st.segs.length - 1];
  return [s, u];
}
function surf(st, u, v, out = new V3()) {
  const [s, uu] = segAt(st, u);
  const t = (uu - s.u0) / s.len;
  const bx = s.a[0] + (s.b[0] - s.a[0]) * t, bz = s.a[1] + (s.b[1] - s.a[1]) * t;
  const tx = s.ta[0] + (s.tb[0] - s.ta[0]) * t, tz = s.ta[1] + (s.tb[1] - s.ta[1]) * t;
  const h = v / st.H;
  return out.set(bx + (tx - bx) * h, v, bz + (tz - bz) * h);
}
function uvDist(st, u1, v1, u2, v2) {
  let du = Math.abs(u1 - u2);
  if (st.closed) du = Math.min(du, st.L - du);
  return Math.hypot(du, v1 - v2);
}

// =================================================================
// 월드 생성
// =================================================================
const holdMeshes = [];
const allHolds = [];
const PROBLEMS = [];
const tapes = [];

function shapeFromPts(ptsM) {
  const sh = new THREE.Shape();
  ptsM.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
  sh.closePath();
  return sh;
}
function flatPoly(ptsM, y, mat) {
  const g = new THREE.ShapeGeometry(shapeFromPts(ptsM));
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const mesh = new THREE.Mesh(g, mat);
  scene.add(mesh);
  return mesh;
}
function quadsGeometry(quads) {
  // quads: [[p0,p1,p2,p3, uv0,uv1,uv2,uv3]]
  const pos = [], uv = [];
  quads.forEach(([p0, p1, p2, p3, a, b, c, d]) => {
    pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
    uv.push(...a, ...b, ...c, ...a, ...c, ...d);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function buildWorld() {
  // 바닥 (매트)
  const matTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c8ccd1'; g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, 'rgba(255,255,255,.06)'); grd.addColorStop(1, 'rgba(0,0,0,.05)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a9aeb4'; g.lineWidth = 4; g.strokeRect(0, 0, w, h);
  });
  matTex.wrapS = matTex.wrapT = THREE.RepeatWrapping;
  matTex.repeat.set(0.5, 0.5);
  flatPoly(FLOOR, 0, new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.95 }));
  // 아래쪽 복도는 마루
  const wood = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a6a4a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#93724f' : '#856545'; g.fillRect(0, i * 32, w, 30); }
  });
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(0.6, 0.6);
  flatPoly([[290, 905], [580, 905], [580, 1110], [290, 1110]].map(m), 0.01, new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8 }));

  // 외벽
  const wallMat = new THREE.MeshStandardMaterial({ color: '#2b2b30', roughness: 0.9, side: THREE.DoubleSide });
  const wq = [];
  FLOOR.forEach((a, i) => {
    const b = FLOOR[(i + 1) % FLOOR.length];
    wq.push([[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], WALL_H, b[1]], [a[0], WALL_H, a[1]], [0, 0], [1, 0], [1, 1], [0, 1]]);
  });
  scene.add(new THREE.Mesh(quadsGeometry(wq), wallMat));

  // 천장 조명
  const lightMat = new THREE.MeshBasicMaterial({ color: '#fffdf4' });
  [[200, 300, 0.3], [450, 250, -0.2], [700, 300, 0.25], [450, 500, 0.1], [700, 600, -0.3], [430, 800, 0.15], [700, 760, 0.2], [430, 1000, 0]].forEach(([x, z, r]) => {
    const [wx, wz] = m([x, z]);
    const b = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.18), lightMat);
    b.position.set(wx, 5.6, wz); b.rotation.y = r;
    scene.add(b);
  });

  // 화장실 문, 입구, 신발장
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), new THREE.MeshStandardMaterial({ color: '#6b4a32' }));
  const [dx, dz] = m([290, 782]);
  door.position.set(dx + 0.02, 1.1, dz); door.rotation.y = Math.PI / 2; scene.add(door);
  const wc = textSprite('🚻 화장실', { h: 0.34, bg: '#ffffff', fg: '#111', depthTest: true }); wc.position.set(dx + 0.3, 2.6, dz); scene.add(wc);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6), new THREE.MeshStandardMaterial({ color: '#9fc6d8', transparent: true, opacity: 0.35 }));
  const [ex, ez] = m([367, 1110]);
  glass.position.set(ex, 1.3, ez - 0.02); glass.rotation.y = Math.PI; scene.add(glass);
  const entTex = canvasTex(512, 128, (g) => {
    g.fillStyle = '#e3262b'; roundRect(g, 0, 0, 512, 128, 24); g.fill();
    g.fillStyle = '#fff'; g.font = '86px "Sedgwick Ave Display", cursive'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SPICY', 256, 70);
  });
  const ent = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: entTex }));
  ent.position.set(ex, 3.3, ez - 0.03); ent.rotation.y = Math.PI; scene.add(ent);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.9, 0.45), new THREE.MeshStandardMaterial({ color: '#b08a60' }));
  const [rx, rz] = m([370, 1090]);
  rack.position.set(rx, 0.45, rz - 0.1); scene.add(rack);
  const shoes = textSprite('👟 신발은 여기!', { h: 0.26, bg: '#ffffff', fg: '#111', depthTest: true }); shoes.position.set(rx, 1.3, rz - 0.1); scene.add(shoes);

  // 벽들
  const woodTex = panelTexture('#ecc994', 'rgba(110,80,50,.55)', 'rgba(150,110,70,.55)');
  const darkTex = panelTexture('#46414d', 'rgba(0,0,0,.6)', 'rgba(0,0,0,.4)');
  const whiteTex = panelTexture('#f1efe9', 'rgba(90,90,90,.45)', 'rgba(120,120,120,.4)');
  const rand = mulberry(20251104);

  SECTORS.forEach((sec) => {
    const st = buildStrip(sec);
    strips.push(st);
    const H = st.H;
    // 판넬
    const q = st.segs.map((s) => [
      [s.a[0], 0, s.a[1]], [s.b[0], 0, s.b[1]], [s.tb[0], H, s.tb[1]], [s.ta[0], H, s.ta[1]],
      [s.u0 / 1.2, 0], [(s.u0 + s.len) / 1.2, 0], [(s.u0 + s.len) / 1.2, H / 1.2], [s.u0 / 1.2, H / 1.2],
    ]);
    const tex = sec.dark ? darkTex : sec.id === 'trial' ? whiteTex : woodTex;
    scene.add(new THREE.Mesh(quadsGeometry(q), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide })));
    // 섹터 색 띠 (판넬 상단)
    const bandMat = new THREE.MeshStandardMaterial({ color: sec.color, roughness: 0.7, side: THREE.DoubleSide });
    const bq = st.segs.map((s) => {
      const k = (H - 0.18) / H;
      const p = (pt, tp, kk) => [pt[0] + (tp[0] - pt[0]) * kk + s.n3.x * 0.01, H * kk, pt[1] + (tp[1] - pt[1]) * kk + s.n3.z * 0.01];
      return [p(s.a, s.ta, k), p(s.b, s.tb, k), p(s.b, s.tb, 1), p(s.a, s.ta, 1), [0, 0], [1, 0], [1, 1], [0, 1]];
    });
    // 윗면 (오버행 지붕)
    st.segs.forEach((s) => bq.push([[s.a[0], H, s.a[1]], [s.b[0], H, s.b[1]], [s.tb[0], H, s.tb[1]], [s.ta[0], H, s.ta[1]], [0, 0], [1, 0], [1, 1], [0, 1]]));
    if (!st.closed && sec.footM) {
      const p0 = st.pts[0], pN = st.pts[st.pts.length - 1], s0 = st.segs[0], sN = st.segs[st.segs.length - 1];
      bq.push([[p0[0], 0, p0[1]], [p0[0], 0, p0[1]], [s0.ta[0], H, s0.ta[1]], [p0[0], H, p0[1]], [0, 0], [0, 0], [0, 0], [0, 0]]);
      bq.push([[pN[0], 0, pN[1]], [pN[0], 0, pN[1]], [sN.tb[0], H, sN.tb[1]], [pN[0], H, pN[1]], [0, 0], [0, 0], [0, 0], [0, 0]]);
    }
    scene.add(new THREE.Mesh(quadsGeometry(bq), bandMat));
    if (sec.footM) flatPoly(sec.footM, H, new THREE.MeshStandardMaterial({ color: new THREE.Color(sec.color).multiplyScalar(0.8), roughness: 0.8, side: THREE.DoubleSide }));

    // 섹터 번호 표지판
    let lp;
    if (st.closed) { const c = sec.footM.reduce((a, p) => [a[0] + p[0] / sec.footM.length, a[1] + p[1] / sec.footM.length], [0, 0]); lp = new V3(c[0], H + 0.7, c[1]); }
    else { lp = surf(st, st.L / 2, H); const [s] = segAt(st, st.L / 2); lp.addScaledVector(s.n3, 0.25).add(new V3(0, 0.55, 0)); }
    const label = sec.label.length === 1
      ? textSprite(sec.label, { h: 0.62, circle: true, bg: '#fff', fg: '#111', border: '#111', font: '900 46px "Noto Sans KR", sans-serif', depthTest: true })
      : textSprite(sec.label, { h: 0.36, bg: '#fff', fg: '#111', border: '#111', depthTest: true });
    label.position.copy(lp); scene.add(label);

    // 볼륨
    if (!sec.dark && sec.id !== 'trial') {
      const volMat = new THREE.MeshStandardMaterial({ color: '#8f969f', roughness: 0.6, flatShading: true });
      for (let k = 0; k < Math.round(st.L / 4); k++) {
        const u = rand() * st.L, v = 1.6 + rand() * (H - 2.6);
        const g = new THREE.ConeGeometry(0.45 + rand() * 0.3, 0.38, 3); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.19);
        const mesh = new THREE.Mesh(g, volMat);
        const [s] = segAt(st, u);
        mesh.matrixAutoUpdate = false;
        const mtx = new THREE.Matrix4().makeBasis(s.along3, s.up3, s.n3);
        mtx.setPosition(surf(st, u, v));
        mesh.matrix.copy(mtx);
        scene.add(mesh);
      }
    }
  });

  // 불꽃이 벽화 (1번 섹터 3번째 판넬)
  const st1 = strips[0], ms = st1.segs[2];
  const mural = canvasTex(512, 512, (g) => {
    g.save(); g.translate(96, 20); g.scale(3.2, 3.2);
    g.fillStyle = '#e3262b'; g.fill(new Path2D(FLAME_D));
    g.fillStyle = '#2a120a'; g.beginPath(); g.arc(38, 60, 4.6, 0, 7); g.arc(62, 60, 4.6, 0, 7); g.fill();
    g.strokeStyle = '#2a120a'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(42, 72); g.quadraticCurveTo(46, 68, 50, 72); g.quadraticCurveTo(54, 76, 58, 72); g.stroke();
    g.restore();
    g.fillStyle = '#e3262b'; g.font = '130px "Sedgwick Ave Display", cursive'; g.textAlign = 'center';
    g.save(); g.translate(256, 470); g.rotate(-0.1); g.fillText('SPICY', 0, 0); g.restore();
  });
  const mm = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), new THREE.MeshBasicMaterial({ map: mural, transparent: true, depthWrite: false }));
  mm.matrixAutoUpdate = false;
  const mmx = new THREE.Matrix4().makeBasis(ms.along3, ms.up3, ms.n3);
  mmx.setPosition(surf(st1, ms.u0 + ms.len / 2, 2.4).addScaledVector(ms.n3, 0.012));
  mm.matrix.copy(mmx);
  scene.add(mm);

  buildHolds(rand);
}

function makeHoldGeo(seed) {
  const r = mulberry(seed);
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  const fmap = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    if (!fmap.has(key)) fmap.set(key, 0.7 + r() * 0.5);
    const f = fmap.get(key);
    pos.setXYZ(i, x * f, y * f * 0.85, Math.max(0, z * f * 0.6 + 0.18));
  }
  g.computeVertexNormals();
  return g;
}

function buildHolds(rand) {
  // 문제 홀드
  PROBLEM_DEFS.forEach(([secId, color, level, grade, at, dyno]) => {
    const st = strips.find((s) => s.sec.id === secId);
    const H = st.H, topV = H - 0.32;
    const p = { id: `${secId}-${color}`, strip: st, sector: st.sec, color, hex: HOLD_COLORS[color], name: COLOR_NAMES[color], level, grade, dyno: !!dyno, holds: [] };
    let u = at * st.L, v = 1.3;
    const step = 0.58 + level * 0.07, lat = 0.18 + level * 0.04;
    let dynoDone = !dyno, dynoTop = false;
    p.holds.push({ u: wrapU(st, u), v, start: true });
    for (;;) {
      let s = step * (0.85 + rand() * 0.3);
      let isDyno = false;
      if (!dynoDone && topV - v >= 1.8 && topV - v <= 2.3) { dynoTop = true; break; }
      if (!dynoDone && v > H * 0.3 && v + 2.0 < topV - 0.2) { s = 2.0; dynoDone = true; isDyno = true; }
      if (v + s >= topV - 0.2) break;
      v += s;
      if (!isDyno) u += (rand() - 0.5) * 2 * lat;
      p.holds.push({ u: wrapU(st, u), v, dynoTarget: isDyno });
    }
    p.holds.push({ u: wrapU(st, dynoTop ? u : u + (rand() - 0.5) * 0.3), v: topV, top: true, dynoTarget: dynoTop });
    p.holds.forEach((h) => {
      h.strip = st; h.problem = p; h.hex = p.hex;
      h.size = h.top ? 0.13 : h.dynoTarget ? 0.12 : 0.085 + rand() * 0.04 - level * 0.004;
      st.holds.push(h); allHolds.push(h);
    });
    p.start = p.holds[0]; p.top = p.holds[p.holds.length - 1];
    st.problems.push(p);
    PROBLEMS.push(p);
  });
  // 장식 홀드 (자유 등반용)
  const palette = Object.values(HOLD_COLORS);
  strips.forEach((st) => {
    const count = Math.round(st.L * (st.sec.dark ? 7 : 1.7));
    let placed = 0, guard = 0;
    while (placed < count && guard++ < count * 40) {
      const u = rand() * st.L, v = 0.5 + rand() * (st.H - 0.8);
      if (!st.closed && (u < 0.2 || u > st.L - 0.2)) continue;
      if (st.holds.some((h) => uvDist(st, h.u, h.v, u, v) < (st.sec.dark ? 0.22 : 0.32))) continue;
      const h = { u, v, strip: st, problem: null, hex: palette[Math.floor(rand() * palette.length)], size: 0.04 + rand() * 0.06 };
      st.holds.push(h); allHolds.push(h);
      placed++;
    }
  });
  // 인스턴싱
  const geos = [makeHoldGeo(1), makeHoldGeo(2), makeHoldGeo(3)];
  const buckets = geos.map(() => []);
  allHolds.forEach((h, i) => buckets[i % 3].push(h));
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, flatShading: true });
  const mtx = new THREE.Matrix4(), col = new THREE.Color();
  buckets.forEach((list, gi) => {
    const mesh = new THREE.InstancedMesh(geos[gi], mat, list.length);
    list.forEach((h, i) => {
      const st = h.strip;
      const [s] = segAt(st, h.u);
      const th = rand() * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      const x = s.along3.clone().multiplyScalar(c).addScaledVector(s.up3, sn);
      const y = s.along3.clone().multiplyScalar(-sn).addScaledVector(s.up3, c);
      const hs = h.size * 1.6;
      mtx.makeBasis(x.multiplyScalar(hs * 1.15), y.multiplyScalar(hs), s.n3.clone().multiplyScalar(hs * 0.9));
      h.pos = surf(st, h.u, h.v);
      mtx.setPosition(h.pos);
      mesh.setMatrixAt(i, mtx);
      h.color = new THREE.Color(h.hex);
      mesh.setColorAt(i, h.color);
      h.mesh = mesh; h.idx = i;
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    holdMeshes.push(mesh);
  });
  // S / TOP 테이프
  PROBLEMS.forEach((p) => {
    [[p.start, 'S'], [p.top, 'TOP']].forEach(([h, txt]) => {
      const st = p.strip;
      const [s] = segAt(st, h.u);
      const dark = ['black', 'purple', 'blue', 'red'].includes(p.color);
      const tex = canvasTex(128, 64, (g) => {
        g.fillStyle = p.hex; g.fillRect(0, 0, 128, 64);
        g.fillStyle = dark ? '#fff' : '#111'; g.font = '900 38px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(txt, 64, 34);
      });
      const tp = new THREE.Mesh(new THREE.PlaneGeometry(txt === 'S' ? 0.16 : 0.26, 0.11), new THREE.MeshBasicMaterial({ map: tex }));
      tp.matrixAutoUpdate = false;
      const mx = new THREE.Matrix4().makeBasis(s.along3, s.up3, s.n3);
      mx.multiply(new THREE.Matrix4().makeRotationZ(-0.15));
      mx.setPosition(surf(st, h.u - 0.24, h.v - 0.1).addScaledVector(s.n3, 0.012));
      tp.matrix.copy(mx);
      scene.add(tp);
      tapes.push(tp);
    });
  });
}

let focusProblem = null;
function setFocus(p) {
  if (focusProblem === p) return;
  focusProblem = p;
  const dim = new THREE.Color();
  allHolds.forEach((h) => {
    if (!p || h.problem === p) h.mesh.setColorAt(h.idx, h.color);
    else h.mesh.setColorAt(h.idx, dim.copy(h.color).multiplyScalar(0.28));
  });
  holdMeshes.forEach((mm) => { mm.instanceColor.needsUpdate = true; });
}

// =================================================================
// 캐릭터 (불꽃이)
// =================================================================
let flameGeo = null;
function getFlameGeo() {
  if (flameGeo) return flameGeo;
  const tokens = FLAME_D.match(/[MCZ]|-?\d+(\.\d+)?/g);
  const size = 1.0;
  const X = (v) => ((v - 50) / 100) * size, Y = (v) => ((96 - v) / 100) * size;
  const sh = new THREE.Shape();
  let i = 0;
  while (i < tokens.length) {
    const c = tokens[i++];
    if (c === 'M') sh.moveTo(X(+tokens[i++]), Y(+tokens[i++]));
    else if (c === 'C') {
      const a = tokens.slice(i, i + 6).map(Number); i += 6;
      sh.bezierCurveTo(X(a[0]), Y(a[1]), X(a[2]), Y(a[3]), X(a[4]), Y(a[5]));
    }
  }
  flameGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.05, bevelSegments: 3, curveSegments: 10 });
  flameGeo.translate(0, 0.05, -0.15);
  return flameGeo;
}
const blackMat = new THREE.MeshStandardMaterial({ color: '#1a0a06', roughness: 0.4 });
const shadowTex = canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});

// 2등신 불꽃이: 큰 불꽃 머리 + 작은 몸 + 늘어나는 팔다리 (IK로 홀드를 잡음)
const LIMB = { arm: 0.3, leg: 0.28 };
const limbGeo = { arm: new THREE.CapsuleGeometry(0.048, LIMB.arm, 4, 8).translate(0, -LIMB.arm / 2, 0), leg: new THREE.CapsuleGeometry(0.06, LIMB.leg, 4, 8).translate(0, -LIMB.leg / 2, 0) };
const handGeo = new THREE.SphereGeometry(0.07, 12, 8), footGeo = new THREE.SphereGeometry(0.08, 12, 8).scale(1, 0.7, 1.4);
const DOWN = new V3(0, -1, 0);
class Avatar {
  constructor(name, color, { isPlayer = false, visitor = false } = {}) {
    this.name = name; this.color = color;
    this.group = new THREE.Group();
    this.rig = new THREE.Group();
    this.group.add(this.rig);
    const main = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.78), roughness: 0.6 });
    const skin = new THREE.MeshStandardMaterial({ color: '#ffe3cc', roughness: 0.7 });
    const shoe = new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.6 });
    // 몸통 (작은 티셔츠)
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.12, 6, 12), dark);
    torso.position.y = 0.45; this.rig.add(torso);
    const tee = textSprite('🔥', { h: 0.12, bg: 'rgba(0,0,0,0)', depthTest: true }); tee.position.set(0, 0.47, 0.16); this.rig.add(tee);
    // 머리 (큰 불꽃)
    this.head = new THREE.Group();
    this.head.position.y = 0.55;
    const hs = 0.86;
    const flame = new THREE.Mesh(getFlameGeo(), main); flame.scale.setScalar(hs); this.head.add(flame);
    [-0.12, 0.12].forEach((x) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), blackMat);
      e.position.set(x * hs, 0.41 * hs, 0.25 * hs + 0.01); e.scale.z = 0.5; this.head.add(e);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff' }));
      hl.position.set(x * hs + 0.015, 0.43 * hs, 0.25 * hs + 0.035); this.head.add(hl);
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), new THREE.MeshBasicMaterial({ color: '#ff9aa8', transparent: true, opacity: 0.7 }));
      blush.position.set(x * hs * 1.75, 0.3 * hs, 0.25 * hs + 0.012); this.head.add(blush);
    });
    const arcL = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.01, 6, 12, Math.PI), blackMat);
    arcL.position.set(-0.034, 0.28 * hs, 0.25 * hs + 0.01); this.head.add(arcL);
    const arcR = arcL.clone(); arcR.rotation.z = Math.PI; arcR.position.set(0.034, 0.28 * hs, 0.25 * hs + 0.01); this.head.add(arcR);
    this.rig.add(this.head);
    // 팔다리
    const mk = (kind, x, y, z) => {
      const pivot = new THREE.Group(); pivot.position.set(x, y, z);
      const seg = new THREE.Mesh(limbGeo[kind], kind === 'arm' ? dark : dark);
      const end = new THREE.Mesh(kind === 'arm' ? handGeo : footGeo, kind === 'arm' ? skin : shoe);
      end.position.y = -LIMB[kind];
      if (kind === 'leg') end.position.z = 0.04;
      pivot.add(seg, end);
      this.rig.add(pivot);
      return { pivot, seg, end, len: LIMB[kind], kind };
    };
    this.limbs = [mk('arm', -0.2, 0.55, 0), mk('arm', 0.2, 0.55, 0), mk('leg', -0.085, 0.3, 0), mk('leg', 0.085, 0.3, 0)];
    this.tag = textSprite(name, { h: 0.17, bg: isPlayer ? '#e3262b' : visitor ? '#f5f2ee' : 'rgba(20,20,22,.8)', fg: visitor ? '#111' : '#fff' });
    this.tag.position.y = 1.5;
    this.group.add(this.tag);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);
    scene.add(this.group);
    this.t = Math.random() * 10; this.phase = 0; this.squashT = 0; this.bubble = null; this.sitting = false;
    this.climbing = false; this.airborne = false; this.grips = null;
    this.prev = new V3(); this.speed = 0;
  }
  setClimbing(v) { this.climbing = v; if (!v) this.grips = null; }
  squash() { this.squashT = 0.45; }
  say(text, ms = 2800) {
    if (this.bubble) { this.group.remove(this.bubble); disposeSprite(this.bubble); }
    clearTimeout(this.bubbleT);
    const b = textSprite(text, { h: 0.21, bg: '#ffffff', fg: '#151515', tail: true, font: '700 40px "Noto Sans KR", sans-serif' });
    b.position.y = 1.64;
    this.group.add(b);
    this.bubble = b;
    this.bubbleT = setTimeout(() => { if (this.bubble === b) { this.group.remove(b); disposeSprite(b); this.bubble = null; } }, ms);
  }
  limbRot(l, rx, rz = 0) { l.pivot.quaternion.setFromEuler(new THREE.Euler(rx, 0, rz)); this.limbLen(l, l.len); }
  limbLen(l, d) { l.seg.scale.y = d / l.len; l.end.position.y = -d; }
  limbTo(l, world) {
    const local = l.pivot.parent.worldToLocal(world.clone()).sub(l.pivot.position);
    const d = local.length();
    if (d < 1e-4) return;
    l.pivot.quaternion.setFromUnitVectors(DOWN, local.multiplyScalar(1 / d));
    this.limbLen(l, clamp(d, l.len * 0.5, l.len * 2.6));
  }
  update(dt) {
    this.t += dt;
    const p = this.group.position;
    const mv = Math.hypot(p.x - this.prev.x, p.z - this.prev.z) / Math.max(dt, 1e-3);
    this.prev.copy(p);
    this.speed = lerp(this.speed, mv, damp(8, dt));
    // 몸 스쿼시/바운스
    let sx = 1, sy = 1;
    if (this.squashT > 0) {
      this.squashT -= dt;
      const k = this.squashT / 0.45;
      sy = 1 - 0.35 * Math.sin(k * Math.PI) * k; sx = 1 + (1 - sy) * 0.8;
    }
    const [la, ra, ll, rl] = this.limbs;
    this.rig.position.y = 0; this.head.rotation.set(0, 0, 0);
    if (this.climbing && this.grips) {
      this.group.updateMatrixWorld(true);
      this.limbTo(la, this.grips[0]); this.limbTo(ra, this.grips[1]);
      this.limbTo(ll, this.grips[2]); this.limbTo(rl, this.grips[3]);
      this.head.rotation.z = Math.sin(this.t * 2.5) * 0.05;
    } else if (this.climbing || this.airborne) {
      const f = Math.sin(this.t * (this.airborne ? 18 : 4)) * (this.airborne ? 0.35 : 0.1);
      this.limbRot(la, Math.PI * 0.92 + f, -0.25); this.limbRot(ra, Math.PI * 0.92 - f, 0.25);
      this.limbRot(ll, -0.3 - f, -0.1); this.limbRot(rl, -0.3 + f, 0.1);
    } else if (this.sitting) {
      this.rig.position.y = -0.22;
      const b = Math.sin(this.t * 1.6) * 0.06;
      this.limbRot(la, -0.5 + b, -0.5); this.limbRot(ra, -0.5 - b, 0.5);
      this.limbRot(ll, -Math.PI / 2 + 0.1, -0.15); this.limbRot(rl, -Math.PI / 2 + 0.1, 0.15);
      sy *= 1 + Math.sin(this.t * 1.6) * 0.02;
    } else {
      const sp = clamp(this.speed / 3.4, 0, 1);
      this.phase += dt * (4 + sp * 9);
      const s = Math.sin(this.phase) * sp * 0.9;
      this.limbRot(la, s, -0.12); this.limbRot(ra, -s, 0.12);
      this.limbRot(ll, -s, 0); this.limbRot(rl, s, 0);
      const bob = sp > 0.1 ? Math.abs(Math.sin(this.phase)) * 0.05 * sp : Math.sin(this.t * 2.6) * 0.012;
      this.rig.position.y = bob;
      this.head.rotation.z = Math.sin(this.phase) * 0.06 * sp;
    }
    this.rig.scale.set(sx, sy, sx);
    this.shadow.position.set(p.x, 0.015, p.z);
    const s = clamp(1 - p.y / 5, 0.3, 1);
    this.shadow.scale.setScalar(s);
    this.shadow.material.opacity = s;
  }
  dispose() {
    scene.remove(this.group); scene.remove(this.shadow);
    disposeSprite(this.tag);
    if (this.bubble) disposeSprite(this.bubble);
  }
}

// =================================================================
// 파티클
// =================================================================
const particles = [];
const flameTex = canvasTex(64, 64, (g) => { g.scale(0.64, 0.64); g.fillStyle = '#fff'; g.fill(new Path2D(FLAME_D)); });
const dotTex = canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 1, 16, 16, 15); r.addColorStop(0, '#fff'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });
function chalkPuff(pos, n = 14) {
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthWrite: false, opacity: 0.9 }));
    sp.position.copy(pos).add(new V3((Math.random() - 0.5) * 0.3, Math.random() * 0.2, (Math.random() - 0.5) * 0.3));
    sp.scale.setScalar(0.08 + Math.random() * 0.12);
    scene.add(sp);
    particles.push({ sp, vel: new V3((Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2), g: -0.4, life: 0, max: 0.8 + Math.random() * 0.6, grow: 0.25 });
  }
}
function fireConfetti(pos, n = 30) {
  const cols = ['#e3262b', '#ff8a1f', '#ffc21a', '#ff5c8a'];
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: pick(cols), transparent: true, depthWrite: false }));
    sp.position.copy(pos);
    sp.scale.setScalar(0.12 + Math.random() * 0.1);
    scene.add(sp);
    const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 2.5;
    particles.push({ sp, vel: new V3(Math.cos(a) * s * 0.6, 3 + Math.random() * 3, Math.sin(a) * s * 0.6), g: -7, life: 0, max: 1.4 + Math.random() * 0.6, grow: 0 });
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.max) { scene.remove(p.sp); p.sp.material.dispose(); particles.splice(i, 1); continue; }
    p.vel.y += p.g * dt;
    p.vel.multiplyScalar(0.985);
    p.sp.position.addScaledVector(p.vel, dt);
    if (p.grow) p.sp.scale.addScalar(p.grow * dt);
    p.sp.material.opacity = Math.min(1, (1 - p.life / p.max) * 2);
  }
}

// =================================================================
// 입력
// =================================================================
const keys = new Set();
const joy = { x: 0, y: 0, id: null };
const camCtl = { yaw: 0, pitch: 0.32, dist: 6, lastDrag: -9999, pointers: new Map(), pinch: 0 };
function input() {
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  x += joy.x; y += joy.y;
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  return [x, y];
}
function setupInput() {
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) document.body.classList.add('touch');
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.code === 'Enter') { e.preventDefault(); openChat(); return; }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') jumpPress();
    if (e.code === 'KeyE') grabToggle();
    if (e.code === 'KeyC') useChalk();
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'Space') jumpRelease();
  });
  window.addEventListener('blur', () => { keys.clear(); jumpRelease(true); });

  // 카메라 드래그 / 핀치 / 휠
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); camCtl.pointers.set(e.pointerId, [e.clientX, e.clientY]); });
  el.addEventListener('pointermove', (e) => {
    const prev = camCtl.pointers.get(e.pointerId);
    if (!prev) return;
    const cur = [e.clientX, e.clientY];
    if (camCtl.pointers.size === 1) {
      camCtl.yaw -= (cur[0] - prev[0]) * 0.006;
      camCtl.pitch = clamp(camCtl.pitch + (cur[1] - prev[1]) * 0.004, -0.15, 1.2);
      camCtl.lastDrag = performance.now();
    }
    camCtl.pointers.set(e.pointerId, cur);
    if (camCtl.pointers.size === 2) {
      const [a, b] = [...camCtl.pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (camCtl.pinch) camCtl.dist = clamp(camCtl.dist * (camCtl.pinch / d), 2.5, 14);
      camCtl.pinch = d;
    }
  });
  const end = (e) => { camCtl.pointers.delete(e.pointerId); camCtl.pinch = 0; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => { e.preventDefault(); camCtl.dist = clamp(camCtl.dist * (1 + Math.sign(e.deltaY) * 0.1), 2.5, 14); }, { passive: false });

  // 조이스틱
  const js = $('#joystick'), knob = js.querySelector('.knob');
  const jmove = (e) => {
    const r = js.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2 - 10, l = Math.hypot(dx, dy);
    if (l > max) { dx *= max / l; dy *= max / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joy.x = dx / max; joy.y = -dy / max;
  };
  js.addEventListener('pointerdown', (e) => { joy.id = e.pointerId; js.setPointerCapture(e.pointerId); jmove(e); });
  js.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) jmove(e); });
  const jend = (e) => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  js.addEventListener('pointerup', jend); js.addEventListener('pointercancel', jend);

  // 버튼
  const jb = $('#btn-jump');
  jb.addEventListener('pointerdown', (e) => { e.preventDefault(); jb.setPointerCapture(e.pointerId); jumpPress(); });
  jb.addEventListener('pointerup', () => jumpRelease());
  jb.addEventListener('pointercancel', () => jumpRelease(true));
  $('#btn-grab').addEventListener('click', grabToggle);
  $('#btn-chalk').addEventListener('click', useChalk);
  $('#btn-chat').addEventListener('click', openChat);
}
function openChat() {
  const f = $('#chat-form');
  f.classList.add('open');
  $('#chat-input').focus();
}

// =================================================================
// UI
// =================================================================
let toastT;
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms);
}
const ui = {};
function problemLabel(p) { return `${p.sector.label.length === 1 ? p.sector.label + '번 · ' : p.sector.label + ' · '}${p.name} ${p.grade}`; }

// =================================================================
// 플레이어
// =================================================================
const SPAWN = m([435, 925]);
const pl = {
  av: null, mode: 'walk', pos: new V3(SPAWN[0], 0, SPAWN[1]), vel: new V3(), vy: 0, yaw: Math.PI,
  strip: null, u: 0, v: 0, du: 0, dv: 0, t: 0, launch: null, problem: null, topped: false, topT: 0,
  pump: 0, charging: false, charge: 0, chalkReady: true, mountCand: null,
};
let me = null;
let guide = null, guideMesh = null;

function nearestGrab(st, u, v, problem, exclude) {
  let best = null, bd = Infinity;
  for (const h of st.holds) {
    if (problem && h.problem !== problem) continue;
    if (exclude && uvDist(st, h.u, h.v, exclude.u, exclude.v) < 0.55) continue;
    const d = uvDist(st, h.u, h.v, u, v);
    if (d < bd) { bd = d; best = h; }
  }
  return best ? { h: best, d: bd } : null;
}
function canHold(u, v) { const r = nearestGrab(pl.strip, u, v, pl.problem); return r && r.d <= REACH; }
function bodyPos(st, u, v, out = new V3()) {
  const drop = Math.min(BODY_DROP, v - 0.02);
  const [s] = segAt(st, u);
  surf(st, u, v - drop, out).addScaledVector(s.n3, 0.3);
  return out;
}

// 손·발이 실제로 잡을/디딜 홀드 찾기
function gripPoints(st, u, v, problem, out) {
  const [s] = segAt(st, u);
  const g = out || [new V3(), new V3(), new V3(), new V3()];
  [-1, 1].forEach((sd, i) => {
    const r = nearestGrab(st, u + sd * 0.42, v - 0.05, problem);
    if (r && r.d < 0.38) g[i].copy(r.h.pos); else surf(st, u + sd * 0.42, v - 0.05, g[i]);
    g[i].addScaledVector(s.n3, 0.07);
    const fv = Math.max(0.08, v - 0.95);
    const f = nearestGrab(st, u + sd * 0.18, fv, null);
    if (f && f.d < 0.4) g[i + 2].copy(f.h.pos); else surf(st, u + sd * 0.18, fv, g[i + 2]);
    g[i + 2].addScaledVector(s.n3, 0.06);
  });
  return g;
}

function findMount() {
  if (pl.pos.y > 0.6) return null;
  let best = null;
  for (const st of strips) {
    for (const s of st.segs) {
      const pr = segProject(pl.pos.x, pl.pos.z, s.a, s.b);
      const side = (pl.pos.x - s.a[0]) * s.nrm[0] + (pl.pos.z - s.a[1]) * s.nrm[1];
      if (side < -0.05 || pr.d > 1.0 + st.lean * 0.6) continue;
      if (!best || pr.d < best.d) best = { st, u: s.u0 + pr.t * s.len, d: pr.d };
    }
  }
  return best;
}

function mount(c) {
  const st = c.st, u = c.u, v = 1.55;
  let prob = null, bd = Infinity;
  st.problems.forEach((p) => { const d = uvDist(st, p.start.u, p.start.v, u, v); if (d <= REACH && d < bd) { bd = d; prob = p; } });
  const r = nearestGrab(st, u, v, prob);
  if (!r || r.d > REACH) { toast('손 닿는 홀드가 없어요. 조금 옆으로 가볼까요?'); return; }
  const conflicts = conflictsAt(bodyPos(st, u, v), 2.0);
  pl.mode = 'climb'; pl.strip = st; pl.u = u; pl.v = v; pl.problem = prob; pl.topped = false;
  pl.climbStart = Date.now();
  me.setClimbing(true);
  me.sitting = false;
  setFocus(prob);
  if (prob) {
    if (guide === prob) setGuide(null);
    toast(`${problemLabel(prob)} 시작! 같은 색 홀드만 잡을 수 있어요`, 2400);
  } else toast('자유 등반 — 아무 홀드나 잡아도 돼요', 1800);
  if (conflicts.length) {
    const c = conflicts[0];
    c.av.say(pick(['저 먼저 출발했어요~ 😅', '어… 저 지금 하는 중인데요?', '새치기 멈춰!']), 2600);
    setTimeout(() => Manner.add(-1, '새치기 노노! 선출발자 우선'), 900);
  } else if (ety.waitedFor && Date.now() - ety.waitedAt < 30000) {
    const w = ety.waitedFor; ety.waitedFor = null;
    w.av.say('기다려줘서 고마워요 🙏', 2400);
    setTimeout(() => Manner.add(+0.5, '기다릴 줄 아는 클라이머'), 900);
  }
  Sound.grab();
  Net.sync(true);
}
function letGo(reason) {
  const st = pl.strip;
  const [s] = segAt(st, pl.u);
  bodyPos(st, pl.u, pl.v, pl.pos);
  pl.vel.set(s.n3.x, 0, s.n3.z).multiplyScalar(reason === 'down' ? 1.2 : 1.8);
  pl.vy = reason === 'down' ? 1.2 : 0;
  pl.mode = 'fall';
  pl.fallReason = reason;
  me.setClimbing(false);
  pl.charging = false; pl.charge = 0;
  setFocus(null);
  if (reason === 'fall' || reason === 'pump' || reason === 'crash') {
    Sound.fall();
    const line = reason === 'crash' ? pick(['💥 쿵!', '으아악 부딪혔다', '앗 죄송해요!!']) : pick(LINES.playerFall);
    me.say(line, 1600);
    Net.event('fall', { text: line });
    const n = npcs.find((x) => x.state === 'idle');
    if (n && reason !== 'crash') setTimeout(() => n.av.say(pick(LINES.comfort)), 700);
  }
  Net.sync(true);
}

function grabToggle() {
  if (pl.mode === 'walk') {
    const c = findMount();
    if (c) mount(c); else toast('벽 가까이 가서 눌러주세요');
  } else if (pl.mode === 'climb') {
    const nb = ety.near;
    if (nb && nb.start < pl.climbStart && !pl.topped) {
      nb.av.say(pick(['감사합니다~ 🙏', '양보 천사다…', '다음엔 먼저 하세요!']), 2400);
      setTimeout(() => Manner.add(+0.5, '양보는 매너의 꽃'), 700);
    }
    letGo('down');
  }
}
function jumpPress() {
  if (pl.mode === 'walk') { if (pl.pos.y <= 0.001) { pl.vy = 5.2; Sound.tone(300, 0.08, 'sine', 0.06, 0, 200); } return; }
  if (pl.mode === 'climb') { pl.charging = true; pl.charge = 0; }
}
function jumpRelease(cancel) {
  if (!pl.charging) return;
  pl.charging = false;
  if (cancel || pl.mode !== 'climb') { pl.charge = 0; return; }
  const [ix, iy] = input();
  let dx = ix * climbSign(), dy = iy;
  if (Math.hypot(dx, dy) < 0.3) { dx = 0; dy = 1; }
  const l = Math.hypot(dx, dy);
  const sp = 2.4 + 3.4 * pl.charge;
  pl.du = (dx / l) * sp; pl.dv = (dy / l) * sp;
  pl.launch = { u: pl.u, v: pl.v };
  pl.mode = 'air'; pl.t = 0;
  pl.pump += 5;
  pl.charge = 0;
  Sound.tone(220, 0.25, 'triangle', 0.1, 0, 400);
  Net.sync(true);
}
function useChalk() {
  if (!pl.chalkReady) return;
  pl.chalkReady = false;
  $('#btn-chalk').disabled = true;
  Sound.chalk();
  chalkPuff(me.group.position.clone().add(new V3(0, 1, 0)), 16);
  pl.pump = Math.max(0, pl.pump - 18);
  me.say(pick(['슥슥', '초크 충전', '후~']), 1000);
  setTimeout(() => { pl.chalkReady = true; $('#btn-chalk').disabled = false; }, 3500);
}
function climbSign() {
  if (!pl.strip) return 1;
  const [s] = segAt(pl.strip, pl.u);
  const right = new V3(Math.cos(camCtl.yaw), 0, -Math.sin(camCtl.yaw));
  return right.dot(s.along3) >= 0 ? 1 : -1;
}

function sendProblem(p) {
  pl.topped = true; pl.topT = 0;
  Sound.top();
  const line = pick(LINES.playerTop);
  me.say(line, 2400);
  fireConfetti(surf(p.strip, p.top.u, p.top.v), 36);
  Store.addSend(p);
  Net.event('top', { pid: p.id, text: line });
  addFeed(Store.data.name, p, true);
  toast(`🔥 ${problemLabel(p)} 완등! (총 ${Store.data.sends[p.id]}번째)`, 3000);
  npcs.forEach((n, k) => { if (n.state === 'idle') setTimeout(() => n.av.say(pick(LINES.cheer)), 300 + k * 450); });
  checkFestival();
}

function updatePlayer(dt) {
  const [ix, iy] = input();
  if (pl.mode === 'walk') {
    const fx = -Math.sin(camCtl.yaw), fz = -Math.cos(camCtl.yaw);
    const rx = Math.cos(camCtl.yaw), rz = -Math.sin(camCtl.yaw);
    const mx = fx * iy + rx * ix, mz = fz * iy + rz * ix;
    const spd = 3.4;
    pl.vel.x = lerp(pl.vel.x, mx * spd, damp(12, dt));
    pl.vel.z = lerp(pl.vel.z, mz * spd, damp(12, dt));
    const nx = pl.pos.x + pl.vel.x * dt, nz = pl.pos.z + pl.vel.z * dt;
    if (walkable(nx, nz)) { pl.pos.x = nx; pl.pos.z = nz; }
    else if (walkable(nx, pl.pos.z)) pl.pos.x = nx;
    else if (walkable(pl.pos.x, nz)) pl.pos.z = nz;
    if (Math.hypot(mx, mz) > 0.1) pl.yaw = lerpAngle(pl.yaw, Math.atan2(mx, mz), damp(10, dt));
    pl.vy -= 16 * dt;
    pl.pos.y += pl.vy * dt;
    if (pl.pos.y <= 0) { if (pl.vy < -4) me.squash(); pl.pos.y = 0; pl.vy = 0; }
    pl.pump = Math.max(0, pl.pump - 12 * dt);
    pl.mountCand = findMount();
    me.group.position.lerp(pl.pos, damp(20, dt));
    me.group.rotation.y = lerpAngle(me.group.rotation.y, pl.yaw, damp(14, dt));
  } else if (pl.mode === 'climb') {
    const st = pl.strip, sg = climbSign();
    const spd = 1.15;
    const nu = wrapU(st, pl.u + ix * sg * spd * dt), nv = clamp(pl.v + iy * spd * dt, 0.75, st.H - 0.18);
    const moving = Math.hypot(ix, iy) > 0.1;
    if (moving) {
      if (canHold(nu, nv)) { pl.u = nu; pl.v = nv; }
      else if (canHold(nu, pl.v)) pl.u = nu;
      else if (canHold(pl.u, nv)) pl.v = nv;
    }
    if (iy < -0.5 && pl.v <= 0.8) { letGo('down'); return; }
    if (pl.charging) pl.charge = Math.min(1, pl.charge + dt / 0.7);
    const lvl = pl.problem ? pl.problem.level : 1;
    pl.pump += dt * (1.6 + lvl * 0.55 + (moving ? 1.1 : 0));
    if (pl.problem && !pl.topped && uvDist(st, pl.u, pl.v, pl.problem.top.u, pl.problem.top.v) < 0.38) sendProblem(pl.problem);
    if (pl.topped) { pl.topT += dt; if (pl.topT > 3) { letGo('down'); return; } }
    if (pl.pump >= 100) { pl.pump = 100; letGo('pump'); toast('펌핑 100%… 매트에서 쉬고 초크 바르고 다시!'); return; }
  } else if (pl.mode === 'air') {
    const st = pl.strip;
    pl.t += dt;
    pl.dv -= 9.8 * dt;
    pl.u = wrapU(st, pl.u + pl.du * dt);
    pl.v += pl.dv * dt;
    if (pl.v > st.H - 0.15) { pl.v = st.H - 0.15; pl.dv = Math.min(pl.dv, 0); }
    if (pl.t > 0.08) {
      const r = nearestGrab(st, pl.u, pl.v, pl.problem, pl.launch);
      if (r && r.d < CATCH) {
        pl.mode = 'climb'; pl.u = r.h.u; pl.v = r.h.v - 0.05;
        Sound.grab(); Sound.tone(660, 0.12, 'triangle', 0.08, 0.02);
        me.say(pick(['잡았다!', '캐치!!', '휴…']), 1200);
        if (r.h.dynoTarget) toast('🔥 다이노 성공!', 1400);
        Net.sync(true);
      }
    }
    if (pl.mode === 'air' && ((pl.dv < 0 && pl.v < pl.launch.v - 0.7) || pl.t > 1.6 || pl.v < 0.4)) { letGo('fall'); return; }
  } else if (pl.mode === 'fall') {
    pl.vy -= 16 * dt;
    pl.pos.y += pl.vy * dt;
    const nx = pl.pos.x + pl.vel.x * dt, nz = pl.pos.z + pl.vel.z * dt;
    if (walkable(nx, nz, 0.15)) { pl.pos.x = nx; pl.pos.z = nz; }
    pl.vel.multiplyScalar(0.97);
    if (pl.pos.y <= 0) {
      pl.pos.y = 0; pl.vy = 0; pl.vel.set(0, 0, 0);
      let k = 0;
      const [s] = segAt(pl.strip, pl.u);
      while (!walkable(pl.pos.x, pl.pos.z) && k++ < 30) { pl.pos.x += s.n3.x * 0.1; pl.pos.z += s.n3.z * 0.1; }
      me.squash();
      chalkPuff(pl.pos.clone().add(new V3(0, 0.1, 0)), pl.fallReason === 'down' ? 6 : 14);
      pl.mode = 'walk'; pl.problem = null; pl.strip = null;
      Net.sync(true);
    }
    me.group.position.lerp(pl.pos, damp(25, dt));
  }
  me.airborne = pl.mode === 'air' || pl.mode === 'fall';
  if (pl.mode === 'climb') me.grips = gripPoints(pl.strip, pl.u, pl.v, pl.problem, me.grips || undefined);
  else me.grips = null;
  if (pl.mode === 'climb' || pl.mode === 'air') {
    const st = pl.strip;
    const [s] = segAt(st, pl.u);
    bodyPos(st, pl.u, pl.v, pl.pos);
    me.group.position.lerp(pl.pos, damp(pl.mode === 'air' ? 30 : 16, dt));
    pl.yaw = Math.atan2(-s.n3.x, -s.n3.z);
    me.group.rotation.y = lerpAngle(me.group.rotation.y, pl.yaw, damp(12, dt));
  }
  pl.pump = clamp(pl.pump, 0, 100);
}

// =================================================================
// 카메라
// =================================================================
function camBlocked(x, y, z) {
  if (!inPoly(x, z, FLOOR)) return y < WALL_H;
  for (const o of OBSTACLES) if (inPoly(x, z, o.footM) && y < o.H + 0.2) return true;
  return false;
}
function updateCamera(dt) {
  const target = me.group.position.clone();
  const climbing = pl.mode === 'climb' || pl.mode === 'air';
  if (climbing) {
    const [s] = segAt(pl.strip, pl.u);
    target.y += 1.1;
    if (performance.now() - camCtl.lastDrag > 1500) {
      camCtl.yaw = lerpAngle(camCtl.yaw, Math.atan2(s.n3.x, s.n3.z), damp(3, dt));
      camCtl.pitch = lerp(camCtl.pitch, 0.18, damp(2, dt));
    }
  } else target.y += 1.0;
  const d = camCtl.dist;
  const dir = new V3(Math.sin(camCtl.yaw) * Math.cos(camCtl.pitch), Math.sin(camCtl.pitch), Math.cos(camCtl.yaw) * Math.cos(camCtl.pitch));
  let use = d;
  for (let k = 0.6; k <= d; k += 0.25) {
    const p = tmpV.copy(target).addScaledVector(dir, k);
    if (camBlocked(p.x, p.y, p.z)) { use = Math.max(2.2, k - 0.3); break; }
  }
  camCtl.useDist = lerp(camCtl.useDist || use, use, damp(use < (camCtl.useDist || use) ? 20 : 4, dt));
  const pos = tmpV2.copy(target).addScaledVector(dir, camCtl.useDist);
  pos.y = Math.max(0.3, pos.y);
  camera.position.copy(pos);
  camera.lookAt(target);
}

// =================================================================
// 단골 NPC
// =================================================================
const npcs = [];
function clearPath(a, b) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let k = 0.3; k < d; k += 0.3) {
    const t = k / d;
    if (!walkable(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.15)) return false;
  }
  return true;
}
function planPath(a, b) {
  if (clearPath(a, b)) return [b];
  for (const h of HUBS) if (clearPath(a, h) && clearPath(h, b)) return [h, b];
  for (const h1 of HUBS) for (const h2 of HUBS) if (h1 !== h2 && clearPath(a, h1) && clearPath(h1, h2) && clearPath(h2, b)) return [h1, h2, b];
  return [b];
}
function makeNpc(d) {
  const av = new Avatar(d.name, d.color);
  const spot = m(d.spot);
  av.group.position.set(spot[0], 0, spot[1]);
  av.group.rotation.y = Math.random() * 6;
  av.sitting = true;
  return { av, spot, state: 'idle', next: performance.now() + 6000 + Math.random() * 10000, path: [], problem: null, hold: 0 };
}
function npcUpdate(n, dt, now) {
  const g = n.av.group;
  if (n.state === 'idle') {
    if (now > n.next && !document.hidden) {
      const busy = new Set(npcs.map((x) => x.problem).filter(Boolean));
      if (pl.problem) busy.add(pl.problem);
      const opts = PROBLEMS.filter((p) => !busy.has(p) && (p.level <= 3 || Math.random() < 0.35)
        && !conflictsAt(bodyPos(p.strip, p.start.u, p.start.v), 2.5, n).length
        && !((pl.mode === 'climb' || pl.mode === 'air') && me.group.position.distanceTo(bodyPos(p.strip, p.start.u, p.start.v)) < 2.5));
      if (!opts.length) { n.next = now + 5000; return; }
      const p = pick(opts);
      n.problem = p;
      const [s] = segAt(p.strip, p.start.u);
      const foot = surf(p.strip, p.start.u, 0).addScaledVector(s.n3, 0.6);
      n.path = planPath([g.position.x, g.position.z], [foot.x, foot.z]);
      n.state = 'walk'; n.av.sitting = false;
      n.av.say(pick(LINES.npcStart), 1500);
    }
  } else if (n.state === 'walk' || n.state === 'return') {
    const tgt = n.path[0];
    const dx = tgt[0] - g.position.x, dz = tgt[1] - g.position.z, d = Math.hypot(dx, dz);
    if (d < 0.08) {
      n.path.shift();
      if (!n.path.length) {
        if (n.state === 'walk') {
          const sb = bodyPos(n.problem.strip, n.problem.start.u, n.problem.start.v);
          if (conflictsAt(sb, 2.0, n).length || ((pl.mode === 'climb' || pl.mode === 'air') && me.group.position.distanceTo(sb) < 2.0)) {
            n.waitT = (n.waitT || 0) + 1;
            if (n.waitT === 1) n.av.say(pick(['먼저 하세요~ 기다릴게요', '선출발자 우선이죠 😊', '끝나면 붙어야지']), 2200);
            n.path = [[g.position.x + 0.01, g.position.z]];
            if (n.waitT > 400) { n.waitT = 0; n.state = 'rest'; n.restT = 0.5; }
            return;
          }
          n.waitT = 0;
          n.state = 'climb'; n.hold = 0; n.holdT = 0; n.av.setClimbing(true); n.climbStart = Date.now();
        }
        else { n.state = 'idle'; n.av.sitting = true; n.problem = null; n.next = now + 10000 + Math.random() * 14000; }
      }
    } else {
      const sp = Math.min(d, 2.4 * dt);
      g.position.x += (dx / d) * sp; g.position.z += (dz / d) * sp;
      g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(dx, dz), damp(10, dt));
    }
  } else if (n.state === 'climb') {
    const p = n.problem, st = p.strip;
    n.holdT += dt;
    const h = p.holds[n.hold];
    const target = bodyPos(st, h.u, h.v - 0.05);
    g.position.lerp(target, damp(h.dynoTarget ? 9 : 6, dt));
    n.av.grips = gripPoints(st, h.u, h.v - 0.05, p, n.av.grips || undefined);
    const [s] = segAt(st, h.u);
    g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(-s.n3.x, -s.n3.z), damp(8, dt));
    if (n.holdT > 0.9 + Math.random() * 0.4) {
      n.holdT = 0;
      if (n.hold === p.holds.length - 1) {
        fireConfetti(surf(st, h.u, h.v), 16);
        n.av.say(pick(LINES.npcTop), 1800);
        npcs.forEach((o) => { if (o !== n && o.state === 'idle' && Math.random() < 0.7) setTimeout(() => o.av.say(pick(LINES.cheer)), 400 + Math.random() * 600); });
        n.state = 'drop'; n.vy = 1.2; n.dropT = 0;
      } else if (n.hold > 0 && Math.random() < 0.03 + p.level * 0.045) {
        n.av.say(pick(LINES.npcFall), 1600);
        n.state = 'drop'; n.vy = 0; n.dropT = 0;
      } else n.hold++;
    }
  } else if (n.state === 'drop') {
    n.av.setClimbing(false);
    n.av.airborne = g.position.y > 0.05;
    const [s] = segAt(n.problem.strip, n.problem.holds[n.hold].u);
    n.vy -= 16 * dt;
    g.position.y += n.vy * dt;
    g.position.x += s.n3.x * 1.3 * dt; g.position.z += s.n3.z * 1.3 * dt;
    if (g.position.y <= 0) {
      g.position.y = 0;
      n.av.squash();
      chalkPuff(g.position.clone().add(new V3(0, 0.1, 0)), 8);
      let k = 0;
      while (!walkable(g.position.x, g.position.z, 0.15) && k++ < 30) { g.position.x += s.n3.x * 0.1; g.position.z += s.n3.z * 0.1; }
      n.state = 'rest'; n.restT = 1.2; n.av.airborne = false;
    }
  } else if (n.state === 'rest') {
    n.restT -= dt;
    if (n.restT <= 0) { n.path = planPath([g.position.x, g.position.z], n.spot); n.state = 'return'; }
  }
}

// =================================================================
// 암장 매너 — 선출발자 우선, 벽 위 교통사고, 매너 온도
// =================================================================
const Manner = {
  get v() { return Store.data.manner ?? 36.5; },
  add(d, why) {
    Store.data.manner = Math.round(clamp(this.v + d, 0, 99) * 10) / 10;
    Store.save();
    toast(`🌡️ 매너 온도 ${d > 0 ? '+' : ''}${d} → ${this.v}℃ · ${why}`, 2800);
  },
  emoji() { const v = this.v; return v >= 40 ? '😇' : v >= 36.5 ? '🙂' : v >= 33 ? '😅' : '🥶'; },
};
const ety = { cooldown: 0, near: null, faultAt: 0, faultWith: null, waitedFor: null, waitedAt: 0 };
function wallClimbers(exceptNpc) {
  const list = [];
  npcs.forEach((n) => { if (n !== exceptNpc && n.state === 'climb') list.push({ kind: 'npc', n, av: n.av, pos: n.av.group.position, start: n.climbStart || 0, name: n.av.name }); });
  Net.peers.forEach((p, id) => { if (p.mode === 'c') list.push({ kind: 'peer', id, av: p.av, pos: p.av.group.position, start: p.st || 0, name: p.name }); });
  return list;
}
function conflictsAt(pos, radius, exceptNpc) { return wallClimbers(exceptNpc).filter((c) => c.pos.distanceTo(pos) < radius); }
function crash(c) {
  ety.cooldown = 3;
  Sound.tone(110, 0.35, 'square', 0.12); Sound.tone(70, 0.3, 'sawtooth', 0.08, 0.05);
  const mid = me.group.position.clone().lerp(c.pos, 0.5).add(new V3(0, 0.8, 0));
  chalkPuff(mid, 22); fireConfetti(mid, 10);
  const meLater = (pl.climbStart || 0) > c.start;
  if (meLater) {
    toast(`💥 벽 위 교통사고! ${c.name}님이 먼저 출발했어요 — 늦게 출발한 쪽이 추락`, 3000);
    letGo('crash');
    c.av.say(pick(['아이고 괜찮아요?!', '어어어 조심!!', '제가 먼저 출발했어요 😵']), 2600);
    setTimeout(() => Manner.add(-1.5, '선출발자 우선! 붙기 전에 동선 확인'), 1600);
    setTimeout(() => toast("💬 '죄송합니다' 한마디면 매너 온도가 회복돼요", 3000), 4600);
    ety.faultAt = Date.now(); ety.faultWith = c;
    if (c.kind === 'peer') Net.event('bump', { to: c.id });
  } else {
    toast(`💥 쿵! ${c.name}님이 늦게 출발해서 양보하고 내려가요`, 2600);
    me.say('조심조심~ 괜찮아요?', 2000);
    if (c.kind === 'npc') {
      c.av.say(pick(['앗 죄송해요! 먼저 하세요 🙏', '제가 동선을 못 봤어요 ㅠ', '양보할게요!']), 2600);
      c.n.state = 'drop'; c.n.vy = 0.8;
    }
  }
}
function updateEtiquette(dt) {
  if (ety.cooldown > 0) ety.cooldown -= dt;
  const climbing = pl.mode === 'climb' || pl.mode === 'air';
  ety.near = null;
  if (!climbing) return;
  let nearest = null, nd = Infinity;
  wallClimbers().forEach((c) => { const d = c.pos.distanceTo(me.group.position); if (d < nd) { nd = d; nearest = c; } });
  if (nd < 1.7) ety.near = nearest;
  if (nearest && nd < 0.75 && ety.cooldown <= 0) crash(nearest);
}
function tryApology(text) {
  if (!/죄송|미안|쏘리|sorry|ㅈㅅ/i.test(text) || !ety.faultAt || Date.now() - ety.faultAt > 25000) return;
  const w = ety.faultWith; ety.faultAt = 0;
  if (w) setTimeout(() => w.av.say(pick(['괜찮아요~ 다음엔 같이 봐요!', '저도 못 봤어요 ㅎㅎ', '다친 데 없죠? 🙌']), 2400), 700);
  setTimeout(() => Manner.add(+0.7, '사과는 클라이머의 기본'), 1300);
}

// =================================================================
// 페스티벌 / 피드 / 기록
// =================================================================
const FEST_SECTORS = SECTORS.map((s) => s.id);
const feed = [];
function addFeed(name, p, mine) {
  feed.unshift({ name, p, mine, t: Date.now() });
  if (feed.length > 30) feed.length = 30;
  if ($('#records').open) renderRecords();
}
function sectorDone(secId) { return PROBLEMS.some((p) => p.sector.id === secId && Store.data.sends[p.id]); }
function checkFestival() {
  if (Store.data.festival || !FEST_SECTORS.every(sectorDone)) return;
  Store.data.festival = Date.now(); Store.save();
  setTimeout(() => {
    toast('🏆 오픈 페스티벌 완주! 진짜 매운맛 클라이머 인정', 3800);
    for (let i = 0; i < 4; i++) setTimeout(() => fireConfetti(me.group.position.clone().add(new V3((Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3)), 30), i * 350);
    Sound.top();
    npcs.forEach((n, k) => setTimeout(() => n.av.say(pick(['완주 미쳤다!!', '전설의 탄생', '🏆🏆🏆', '사인해주세요'])), 400 + k * 400));
    Net.event('festival');
    addFeed(Store.data.name, { festival: true, hex: '#ffcf4a' }, true);
  }, 2600);
}
function setGuide(p) {
  guide = p;
  if (guideMesh) { scene.remove(guideMesh); guideMesh = null; }
  if (!p) return;
  guideMesh = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 16), new THREE.MeshBasicMaterial({ color: p.hex }));
  cone.rotation.x = Math.PI;
  guideMesh.add(cone);
  const lbl = textSprite(`${p.name} ${p.grade} 여기서 시작`, { h: 0.24, bg: '#fff', fg: '#111' });
  lbl.position.y = 0.55;
  guideMesh.add(lbl);
  const [s] = segAt(p.strip, p.start.u);
  guideMesh.userData.base = surf(p.strip, p.start.u, p.start.v + 0.7).addScaledVector(s.n3, 0.5);
  scene.add(guideMesh);
}
function renderRecords() {
  const d = Store.data;
  // 스탬프
  const st = $('#stamps');
  st.innerHTML = '';
  SECTORS.forEach((sec) => {
    const on = sectorDone(sec.id);
    const el = document.createElement('div');
    el.className = 'stamp' + (on ? ' on' : '');
    el.style.setProperty('--c', sec.id === 'spray' ? '#9a9aa2' : sec.color);
    el.textContent = sec.label.length === 1 ? `${sec.label}번` : sec.label;
    st.appendChild(el);
  });
  const n = FEST_SECTORS.filter(sectorDone).length;
  const fs = $('#fest-status');
  if (d.festival) { fs.textContent = `🏆 페스티벌 완주! (${new Date(d.festival).toLocaleDateString('ko-KR')})`; fs.className = 'fest-status done'; }
  else { fs.textContent = `스탬프 ${n} / ${SECTORS.length}` + (n ? ' — 조금만 더!' : ' — 체험벽부터 시작해봐요'); fs.className = 'fest-status'; }
  // 문제 목록
  const list = $('#problem-list');
  list.innerHTML = '';
  SECTORS.forEach((sec) => {
    const grp = document.createElement('div'); grp.className = 'sector-group';
    grp.innerHTML = `<h4><i style="background:${sec.color}"></i>${sec.name}</h4>`;
    PROBLEMS.filter((p) => p.sector === sec).sort((a, b) => a.level - b.level).forEach((p) => {
      const row = document.createElement('div'); row.className = 'prob';
      const sent = d.sends[p.id] || 0;
      row.innerHTML = `<span class="dot" style="background:${p.hex}"></span>${p.name} <span class="grade">${p.grade}</span>${p.dyno ? '<span class="tag">다이노</span>' : ''}<span class="count">${sent ? '✔ ' + sent : ''}</span>`;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = '안내';
      b.addEventListener('click', () => { setGuide(p); $('#records').close(); toast(`${problemLabel(p)} — 깃발과 미니맵 ★을 따라가세요`, 2600); });
      row.appendChild(b);
      grp.appendChild(row);
    });
    list.appendChild(grp);
  });
  // 피드
  const ul = $('#feed');
  if (feed.length) {
    ul.innerHTML = '';
    feed.forEach((f) => {
      const li = document.createElement('li'); if (f.mine) li.className = 'mine';
      const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = f.p.hex;
      const tx = document.createElement('span');
      tx.textContent = f.p.festival ? `${f.name}님 페스티벌 완주! 🏆` : `${f.name}님 — ${problemLabel(f.p)} 완등`;
      const tm = document.createElement('time'); tm.textContent = new Date(f.t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      li.append(dot, tx, tm); ul.appendChild(li);
    });
  }
  const total = Object.values(d.sends).reduce((a, b) => a + b, 0);
  const done = PROBLEMS.filter((p) => d.sends[p.id]).length;
  $('#records-summary').textContent = `${d.name || '불꽃이'}님 · 총 ${total}번 완등 · ${done}/${PROBLEMS.length} 문제 클리어 · 매너 온도 ${Manner.v}℃ ${Manner.emoji()}`;
}

// =================================================================
// 미니맵
// =================================================================
let mapCtx, mapStatic;
function drawMinimapStatic() {
  const c = document.createElement('canvas'); c.width = 300; c.height = 416;
  const g = c.getContext('2d');
  const k = 300 / 740;
  const P = ([x, z]) => [(x - 108) * k, (z - 108) * k];
  const poly = (pts, fill) => { g.beginPath(); pts.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fillStyle = fill; g.fill(); };
  poly(FLOOR_PX, '#d9dbd2');
  g.lineWidth = 6; g.strokeStyle = '#555'; g.stroke();
  SECTORS.forEach((s) => {
    if (s.foot) poly(s.foot, s.color);
    else { g.beginPath(); s.front.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke(); }
  });
  g.fillStyle = '#111'; g.font = '900 26px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  [['1', 520, 190], ['2', 785, 160], ['3', 790, 480], ['4', 553, 648]].forEach(([t, x, z]) => {
    const [px, py] = P([x, z]); g.fillStyle = '#fff'; g.beginPath(); g.arc(px, py, 17, 0, 7); g.fill(); g.fillStyle = '#111'; g.fillText(t, px, py + 1);
  });
  const [ex, ey] = P([367, 1060]); g.font = '24px sans-serif'; g.fillText('👟', ex, ey);
  mapStatic = c;
  mapCtx = $('#minimap').getContext('2d');
}
function drawMinimap() {
  const g = mapCtx;
  g.clearRect(0, 0, 300, 416);
  g.drawImage(mapStatic, 0, 0);
  const k = 300 / 740;
  const P = (x, z) => { const [px, pz] = toPx(x, z); return [(px - 108) * k, (pz - 108) * k]; };
  if (guide) {
    const [s] = segAt(guide.strip, guide.start.u);
    const gp = surf(guide.strip, guide.start.u, 0).addScaledVector(s.n3, 0.5);
    const [x, y] = P(gp.x, gp.z);
    g.fillStyle = guide.hex; g.strokeStyle = '#111'; g.lineWidth = 3; g.font = '900 34px sans-serif';
    g.strokeText('★', x, y); g.fillText('★', x, y);
  }
  npcs.forEach((n) => { const [x, y] = P(n.av.group.position.x, n.av.group.position.z); g.fillStyle = n.av.color; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); });
  Net.peers.forEach((p) => { const [x, y] = P(p.av.group.position.x, p.av.group.position.z); g.fillStyle = p.av.color; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke(); });
  const [x, y] = P(me.group.position.x, me.group.position.z);
  const a = me.group.rotation.y;
  g.save(); g.translate(x, y); g.rotate(-a + Math.PI);
  g.fillStyle = '#e3262b'; g.strokeStyle = '#fff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, -16); g.lineTo(11, 10); g.lineTo(0, 5); g.lineTo(-11, 10); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

// =================================================================
// 실시간 접속 (공개 MQTT 브로커)
// =================================================================
const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
const Net = {
  id: Math.random().toString(36).slice(2, 10),
  client: null, connected: false, peers: new Map(), base: '', lastSync: 0, pending: false, startedAt: 0, status: 'connecting',
  start(name, color) {
    this.name = name; this.color = color; this.startedAt = Date.now();
    const q = new URLSearchParams(location.search);
    const room = (q.get('room') || 'main').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'main';
    this.base = `spicy-climbing/v2/${room}`;
    if (!window.mqtt) { this.setStatus('off'); return; }
    this.connect(q.get('broker') ? [q.get('broker')] : BROKERS, 0);
    setInterval(() => this.sync(true), 2500);
    setInterval(() => this.prune(), 3000);
    window.addEventListener('pagehide', () => this.publish('p/' + this.id, { bye: 1 }));
  },
  connect(list, i) {
    if (i >= list.length) { this.setStatus('off'); setTimeout(() => this.connect(list, 0), 30000); return; }
    this.setStatus('connecting');
    let ok = false;
    const c = window.mqtt.connect(list[i], {
      clientId: 'spicy3d_' + this.id, keepalive: 30, reconnectPeriod: 4000, connectTimeout: 8000, clean: true,
      will: { topic: `${this.base}/p/${this.id}`, payload: '{"bye":1}', qos: 0, retain: false },
    });
    const fail = setTimeout(() => { if (!ok) { c.end(true); this.connect(list, i + 1); } }, 15000);
    c.on('connect', () => { ok = true; clearTimeout(fail); this.client = c; this.connected = true; this.setStatus('on'); c.subscribe(`${this.base}/#`); this.sync(true); });
    c.on('close', () => { if (ok) { this.connected = false; this.setStatus('connecting'); } });
    c.on('message', (t, msg) => this.onMessage(t, msg));
  },
  publish(sub, obj) {
    if (!this.connected || !this.client) return;
    try { this.client.publish(`${this.base}/${sub}`, JSON.stringify(obj)); } catch (e) { /* 무시 */ }
  },
  sync(force) {
    if (!me || !this.connected) return;
    const now = Date.now();
    if (!force && now - this.lastSync < 120) return;
    this.lastSync = now;
    const p = me.group.position;
    this.publish('p/' + this.id, {
      n: this.name, c: this.color, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), r: +me.group.rotation.y.toFixed(2),
      m: pl.mode === 'climb' || pl.mode === 'air' ? 'c' : 'w', pid: pl.problem ? pl.problem.id : '', st: pl.climbStart || 0,
    });
  },
  event(type, extra = {}) { this.publish('e/' + this.id, { type, ...extra }); },
  onMessage(topic, msg) {
    const [kind, id] = topic.slice(this.base.length + 1).split('/');
    if (!id || id === this.id || !/^[a-z0-9]{1,16}$/.test(id)) return;
    let d;
    try { d = JSON.parse(msg.toString()); } catch (e) { return; }
    if (!d || typeof d !== 'object') return;
    if (kind === 'p') { if (d.bye) this.remove(id); else this.upsert(id, d); }
    else if (kind === 'e') this.onEvent(this.peers.get(id), d);
  },
  upsert(id, d) {
    let p = this.peers.get(id);
    const num = (v, a, b, def) => (Number.isFinite(+v) ? clamp(+v, a, b) : def);
    const x = num(d.x, -5, 30, SPAWN[0]), y = num(d.y, 0, 8, 0), z = num(d.z, -5, 30, SPAWN[1]), r = num(d.r, -10, 10, 0);
    if (!p) {
      if (this.peers.size >= 30) return;
      const name = String(d.n || '손님').slice(0, 8);
      const color = /^#[0-9a-f]{6}$/i.test(d.c) ? d.c : '#9a9aa2';
      const av = new Avatar(name, color, { visitor: true });
      av.group.position.set(x, y, z);
      p = { av, name, target: new V3(x, y, z), r };
      this.peers.set(id, p);
      this.updateCount();
      if (Date.now() - this.startedAt > 4000) {
        toast(`${name}님이 암장에 들어왔어요 👋`, 2000);
        const idle = npcs.filter((n) => n.state === 'idle');
        if (idle.length) setTimeout(() => pick(idle).av.say(`${name}님 어서 와요~`), 700);
      }
    }
    p.last = Date.now();
    p.target.set(x, y, z); p.r = r;
    p.mode = d.m === 'c' ? 'c' : 'w';
    p.st = Number.isFinite(+d.st) ? +d.st : 0;
    p.av.setClimbing(p.mode === 'c');
  },
  onEvent(p, d) {
    if (!p) return;
    const text = typeof d.text === 'string' ? d.text.slice(0, 24) : '';
    if (d.type === 'say' && text) p.av.say(text, 3200);
    if (d.type === 'fall') { if (text) p.av.say(text, 1600); setTimeout(() => chalkPuff(p.av.group.position.clone(), 10), 500); }
    if (d.type === 'top') {
      const prob = PROBLEMS.find((x) => x.id === d.pid);
      if (!prob) return;
      if (text) p.av.say(text, 2000);
      fireConfetti(p.av.group.position.clone().add(new V3(0, 1.4, 0)), 22);
      addFeed(p.name, prob, false);
      toast(`🔥 ${p.name}님 ${problemLabel(prob)} 완등!`, 2200);
      npcs.forEach((n, k) => { if (n.state === 'idle' && Math.random() < 0.6) setTimeout(() => n.av.say(pick(LINES.cheer)), 400 + k * 400); });
    }
    if (d.type === 'bump' && d.to === this.id) { p.av.say('💥 앗 죄송해요!', 2200); toast(`${p.name}님과 부딪혔어요! 선출발자인 당신은 무사 😎`, 2400); }
    if (d.type === 'festival') { addFeed(p.name, { festival: true, hex: '#ffcf4a' }, false); toast(`🏆 ${p.name}님이 오픈 페스티벌을 완주했어요!`, 3000); }
  },
  update(dt) {
    this.peers.forEach((p) => {
      p.av.group.position.lerp(p.target, damp(10, dt));
      p.av.group.rotation.y = lerpAngle(p.av.group.rotation.y, p.r, damp(10, dt));
      p.av.update(dt);
    });
  },
  remove(id) { const p = this.peers.get(id); if (!p) return; p.av.dispose(); this.peers.delete(id); this.updateCount(); },
  prune() { const now = Date.now(); this.peers.forEach((p, id) => { if (now - p.last > 20000) this.remove(id); }); },
  setStatus(s) { this.status = s; this.updateCount(); },
  updateCount() {
    const el = $('#online');
    if (!el) return;
    el.dataset.state = this.status;
    el.textContent = this.status === 'on' ? `${this.peers.size + 1}명 접속 중` : this.status === 'off' ? '혼자 모드' : '연결 중…';
  },
};

// =================================================================
// HUD 갱신
// =================================================================
let hudT = 0;
function updateHud(dt) {
  hudT += dt;
  const jb = $('#btn-jump');
  jb.style.setProperty('--charge', pl.charging ? pl.charge.toFixed(2) : 0);
  if (hudT < 0.1) return;
  hudT = 0;
  const status = $('#status'), title = $('#status-title'), prompt = $('#prompt');
  const climbing = pl.mode === 'climb' || pl.mode === 'air';
  const touch = document.body.classList.contains('touch');
  status.classList.toggle('climbing', climbing);
  if (climbing) {
    const p = pl.problem;
    title.innerHTML = p ? `<span style="color:${p.color === 'black' ? '#fff' : p.hex}">${problemLabel(p)}</span>${p.dyno ? ' 🔥' : ''}<small>${pl.topped ? '완등! 곧 내려와요' : 'TOP 홀드까지 같은 색만!'}</small>`
      : `자유 등반<small>${pl.strip.sec.name} · 아무 홀드나 OK</small>`;
    if (ety.near) title.innerHTML += `<small style="color:#ffcf4a">⚠️ 옆에 ${ety.near.name}님! 부딪히면 교통사고 — ${ety.near.start < (pl.climbStart || 0) ? '상대가 선출발' : '내가 선출발'}</small>`;
    const v = Math.round(pl.pump);
    $('#pump-val').textContent = v + '%';
    $('#pump-fill').style.width = v + '%';
    $('#pump').classList.toggle('danger', v >= 75);
    prompt.textContent = pl.mode === 'air' ? '' : touch ? '🔥 꾹 눌렀다 떼면 다이노 · ✋ 내려오기' : '방향키로 이동 · Space 꾹→떼기 다이노 · E 내려오기';
    $('#grab-label').innerHTML = touch ? '내려오기' : '내려오기 <kbd>E</kbd>';
    $('#jump-label').innerHTML = touch ? '다이노' : '다이노 <kbd>Space</kbd>';
  } else {
    const n = FEST_SECTORS.filter(sectorDone).length;
    title.innerHTML = guide ? `★ ${problemLabel(guide)}<small>미니맵의 ★로 가서 벽을 잡으세요</small>` : `스탬프 ${n} / ${SECTORS.length} · 🌡️ ${Manner.v}℃ ${Manner.emoji()}<small>${Store.data.festival ? '🏆 페스티벌 완주자' : '섹터마다 한 문제씩 완등!'}</small>`;
    const c = pl.mountCand;
    if (c && pl.mode === 'walk') {
      const near = c.st.problems.find((p) => uvDist(c.st, p.start.u, p.start.v, c.u, 1.55) <= REACH);
      const busy = conflictsAt(bodyPos(c.st, c.u, 1.55), 2.0);
      if (busy.length) {
        prompt.textContent = `⚠️ ${busy[0].name}님 등반 중 — 선출발자 우선! 잠깐 기다려요`;
        ety.waitedFor = busy[0]; ety.waitedAt = Date.now();
      } else prompt.textContent = `${touch ? '✋' : 'E'} 벽 잡기 — ${near ? `${near.name} ${near.grade} 시작 홀드!` : c.st.sec.name + ' 자유 등반'}`;
    } else prompt.textContent = '';
    $('#btn-grab').classList.toggle('ready', !!c);
    $('#grab-label').innerHTML = touch ? '잡기' : '잡기 <kbd>E</kbd>';
    $('#jump-label').innerHTML = touch ? '점프' : '점프 <kbd>Space</kbd>';
  }
  drawMinimap();
}

// =================================================================
// 메인 루프
// =================================================================
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  const now = performance.now();
  updatePlayer(dt);
  me.update(dt);
  npcs.forEach((n) => { npcUpdate(n, dt, now); n.av.update(dt); });
  Net.update(dt);
  updateEtiquette(dt);
  if (now > chatNext) {
    const idle = npcs.filter((n) => n.state === 'idle');
    if (idle.length) pick(idle).av.say(pick(LINES.idle));
    chatNext = now + 7000 + Math.random() * 7000;
  }
  if (guideMesh) { guideMesh.position.copy(guideMesh.userData.base); guideMesh.position.y += Math.sin(now / 250) * 0.12; }
  updateParticles(dt);
  updateCamera(dt);
  updateHud(dt);
  Net.sync(false);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
let chatNext = performance.now() + 5000;

// =================================================================
// 입장
// =================================================================
function setupIntro() {
  Store.load();
  const sw = $('#swatches');
  let chosen = Store.data.color || PLAYER_COLORS[0].c;
  PLAYER_COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', c.name); b.setAttribute('aria-checked', c.c === chosen ? 'true' : 'false');
    b.innerHTML = `<svg viewBox="0 0 100 100"><path d="${FLAME_D}" fill="${c.c}"/><circle cx="38" cy="60" r="5" fill="#1a0a06"/><circle cx="62" cy="60" r="5" fill="#1a0a06"/></svg>`;
    b.addEventListener('click', () => {
      chosen = c.c;
      sw.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-checked', 'false'));
      b.setAttribute('aria-checked', 'true');
    });
    sw.appendChild(b);
  });
  const nick = $('#nickname');
  if (Store.data.name) nick.value = Store.data.name;
  $('#enter-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nick.value.trim().slice(0, 8) || '불꽃이';
    Store.data.name = name; Store.data.color = chosen; Store.save();
    enterGym(name, chosen);
  });
}

async function enterGym(name, color) {
  $('#intro').hidden = true;
  $('#game').hidden = false;
  try { await document.fonts.ready; } catch (e) { /* 무시 */ }
  initThree();
  buildWorld();
  NPCS.forEach((d) => npcs.push(makeNpc(d)));
  me = new Avatar(name, color, { isPlayer: true });
  me.group.position.copy(pl.pos);
  me.group.rotation.y = pl.yaw;
  setupInput();
  drawMinimapStatic();
  $('#loading').hidden = true;

  Net.start(name, color);
  setTimeout(() => me.say(`안녕하세요! ${name}예요`, 2400), 600);
  setTimeout(() => npcs[0].av.say('어서 와요~ 신발 벗고 들어와요', 2600), 1700);
  toast('어서 오세요, 스파이시 클라이밍입니다 🔥', 2600);

  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#chat-input');
    const v = inp.value.trim();
    inp.blur(); $('#chat-form').classList.remove('open');
    if (!v) return;
    me.say(v, 3200);
    Net.event('say', { text: v });
    inp.value = '';
    tryApology(v);
    if (/나이스|가자|화이팅|파이팅|안녕/.test(v)) {
      const idle = npcs.filter((x) => x.state === 'idle');
      if (idle.length) setTimeout(() => pick(idle).av.say(pick(['가자~!', '반가워요!', '화이팅 🔥', '나이스~'])), 800);
    }
  });
  $('#chat-input').addEventListener('blur', () => setTimeout(() => $('#chat-form').classList.remove('open'), 150));
  $('#btn-music').addEventListener('click', (e) => {
    const on = Music.toggle();
    e.currentTarget.setAttribute('aria-pressed', on ? 'true' : 'false');
    toast(on ? '🎵 암장 BGM 재생 중' : '음악을 껐어요', 1400);
  });
  $('#btn-sound').addEventListener('click', (e) => {
    Sound.on = !Sound.on;
    if (Sound.on) Sound.ensure().resume?.();
    e.currentTarget.textContent = Sound.on ? '🔊' : '🔈';
    toast(Sound.on ? '효과음을 켰어요' : '효과음을 껐어요', 1200);
  });
  $('#btn-records').addEventListener('click', () => { renderRecords(); $('#records').showModal(); });
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('완등 기록을 모두 지울까요?')) return;
    Store.data.sends = {}; Store.data.recent = []; Store.data.festival = 0; Store.save();
    renderRecords();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) Net.sync(true); });

  // 디버그/테스트용 훅
  window.__spicy = { pl, strips, PROBLEMS, npcs, ety, Manner, crash, wallClimbers, mount, findMount, setGuide, camCtl, Net, surf, segAt, bodyPos };
  clock.getDelta();
  loop();
}

setupIntro();
