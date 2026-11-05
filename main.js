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
const S = 0.044; // 처음보다 1.75배 넓게 (캐릭터 크기는 그대로)
const m = ([x, z]) => [(x - 100) * S, (z - 100) * S];
const toPx = (x, z) => [x / S + 100, z / S + 100];

const FLOOR_PX = [[118, 118], [835, 118], [835, 885], [580, 885], [580, 1110], [290, 1110], [290, 592], [285, 568], [215, 570], [118, 535]];
const FLOOR = FLOOR_PX.map(m);
const WALL_H = 7.2;

const HOLD_COLORS = {
  yellow: '#f6c915', green: '#3fae5a', blue: '#2f6fd6', red: '#e3262b', purple: '#7b3fb8',
  black: '#2a2a2d', pink: '#ff7aa8', white: '#f2f2f2', orange: '#ff8a1f',
  navy: '#1f2f78', sky: '#6cc6f2', brown: '#7a4a24', lime: '#a6e23f',
};
// 스파이시 난이도: 핑 < 초 < 노 < 빨 < 남 < 흰 < 하 < 주 < 갈 < 연두 < 검
const GRADES = ['pink', 'green', 'yellow', 'red', 'navy', 'white', 'sky', 'orange', 'brown', 'lime', 'black'];
const DARK_TAPE = ['black', 'purple', 'blue', 'red', 'navy', 'brown'];
const COLOR_NAMES = { yellow: '노랑', green: '초록', blue: '파랑', red: '빨강', purple: '보라', black: '검정', pink: '핑크', white: '흰색', orange: '주황', navy: '남색', sky: '하늘', brown: '갈색', lime: '연두' };

const SECTORS = [
  { id: 's1', label: '1', name: '1번 섹터', color: '#d4a73a', H: 5.0, lean: 0.6, angle: 20,
    foot: [[270, 118], [605, 118], [605, 262], [525, 283], [470, 250], [440, 215], [345, 205], [335, 400], [270, 400]],
    front: [[270, 400], [335, 400], [345, 205], [440, 215], [470, 250], [525, 283], [605, 262]] },
  { id: 's2', label: '2', name: '2번 섹터', color: '#c0282d', H: 5.0, lean: 1.0, angle: 35,
    foot: [[605, 118], [835, 118], [835, 378], [810, 325], [800, 212], [720, 152], [655, 142], [630, 250], [605, 262]],
    front: [[605, 262], [630, 250], [655, 142], [720, 152], [800, 212], [810, 325], [835, 378]] },
  { id: 's3', label: '3', name: '3번 섹터', color: '#4caf43', H: 5.0, lean: 0.3, angle: 8,
    foot: [[835, 378], [835, 852], [815, 835], [820, 760], [805, 665], [812, 580], [725, 495], [790, 405]],
    front: [[835, 378], [790, 405], [725, 495], [812, 580], [805, 665], [820, 760], [815, 835], [835, 852]] },
  { id: 's4', label: '4', name: '4번 섹터', color: '#2563b8', H: 4.2, lean: 0.45, angle: 25, closed: true,
    foot: [[490, 568], [578, 556], [615, 585], [628, 715], [598, 740], [483, 718]] },
  { id: 'spray', label: '스프레이월', name: '스프레이월', color: '#3a3540', H: 4.4, lean: 1.3, angle: 40, dark: true,
    foot: [[235, 118], [270, 118], [270, 375], [235, 375]], front: [[235, 375], [235, 118]] },
  { id: 'trial', label: '체험벽', name: '체험벽', color: '#f2f2f2', H: 3.4, lean: 0, angle: -6,
    foot: null, front: [[118, 535], [215, 570], [285, 568]] },
];
SECTORS.forEach((s) => { s.footM = s.foot ? s.foot.map(m) : null; });
const OBSTACLES = SECTORS.filter((s) => s.footM);

// [섹터, 색, 레벨, 그레이드, 위치(0~1), 다이노]
// 섹터별 문제: [색, 다이노('dyno' 위로 | 'side' 옆으로 | 'double'), 크럭스 잠금]
const SECTOR_PROBLEMS = {
  s1: [['pink'], ['green'], ['yellow'], ['red'], ['navy'], ['white', 'side'], ['sky'], ['orange', 'dyno'], ['brown', null, 'edge'], ['lime']],
  s2: [['green'], ['red'], ['navy', 'dyno'], ['sky'], ['orange', 'side'], ['lime', null, 'over'], ['black', 'double'], ['white']],
  s3: [['pink'], ['yellow'], ['green'], ['red'], ['white', null, 'pants'], ['sky'], ['navy', 'side'], ['brown'], ['orange', 'dyno'], ['black', null, 'him']],
  s4: [['pink'], ['green'], ['yellow'], ['red'], ['navy'], ['white'], ['sky', 'dyno'], ['orange'], ['brown', 'side']],
  spray: [['yellow'], ['red'], ['navy', 'side'], ['lime', 'dyno', 'over']],
  trial: [['pink'], ['green'], ['yellow']],
};
const PROBLEM_DEFS = [];
Object.entries(SECTOR_PROBLEMS).forEach(([sec, list]) => list.forEach(([color, dyno, lock], i) => PROBLEM_DEFS.push([sec, color, (i + 0.5) / list.length, dyno || null, lock || null, list.length])));
// 아이템 없이는 못 푸는 크럭스
const LOCKS = {
  edge: { n: '엣지 좋은 암벽화 (엣지 85↑: 인싸팅트 VRS·힘 에디션)', short: '엣지 신발', test: () => gear().e >= 0.85 },
  over: { n: '오버행 암벽화 (오버행 80↑: 솔루숀 콤프·드라군·힘 에디션)', short: '오버행 신발', test: () => gear().h >= 0.8 },
  pants: { n: '바이트 클라이밍 팬츠 (하이스텝)', short: '바이트 팬츠', test: () => Store.data.equip.pants === 'bite' },
  him: { n: '힘 에디션', short: '힘 에디션', test: () => Store.data.equip.shoe === 'him' },
};

const REACH = 0.85;   // 손이 닿는 거리 (m)
// 홀드 종류: 나쁠수록(q↓) 펌핑이 빨리 차고, 다이노 게이지 초록 칸이 좁아짐
const HOLD_TYPES = [
  { k: 'jug', n: '저그', q: 1.0, sc: [1, 1, 1.15] },
  { k: 'edge', n: '엣지', q: 0.7, sc: [1.3, 0.55, 0.75] },
  { k: 'pinch', n: '핀치', q: 0.55, sc: [0.6, 1.3, 1.05] },
  { k: 'crimp', n: '크림프', q: 0.4, sc: [1.15, 0.4, 0.55] },
  { k: 'sloper', n: '슬로퍼', q: 0.3, sc: [1.4, 1.15, 0.45] },
];
const HT = Object.fromEntries(HOLD_TYPES.map((t) => [t.k, t]));
function pickHoldType(level, rand) {
  const w = [Math.max(0.08, 1 - level * 0.16), 0.3 + level * 0.04, 0.15 + level * 0.05, 0.05 + level * 0.09, 0.05 + level * 0.08];
  let r = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return HOLD_TYPES[i]; }
  return HOLD_TYPES[0];
}
// =================================================================
// 💰 경제 / 장비 — 완등하면 벌고, 암벽화·팬츠를 사면 등반이 쉬워짐
// =================================================================
const SHOES = [
  { id: 'him', n: '힘 에디션', price: 151000, f: 1, e: 1, h: 1, c: '#1b1b1d', c2: '#8a8a8a', d: '블랙 호피 패턴 + ‘힘’ 자수. 이 암장 최강 암벽화, 모든 능력치 MAX 🔥', ad: true, url: 'https://thegearshop.co.kr/products/view/687687', photo: 'img/him-edition.jpg' },
  { id: 'dragoon', n: '드라군', price: 99000, f: 0.9, e: 0.75, h: 0.85, c: '#c8f03c', c2: '#1d1d1d', d: '말랑말랑 스미어 끝판왕' },
  { id: 'vrs', n: '인싸팅트 VRS', price: 95000, f: 0.8, e: 0.85, h: 0.7, c: '#ff7a00', c2: '#2a2a2e', d: '엣지가 미친 정밀함. 인싸들의 신발' },
  { id: 'solution', n: '솔루숀 콤프', price: 89000, f: 0.75, e: 0.65, h: 0.8, c: '#e9c400', c2: '#1d1d1d', d: '오버행 장인. 힐훅이 착 붙어요' },
  { id: 'unpar', n: '언페럴 플립', price: 79000, f: 0.65, e: 0.6, h: 0.55, c: '#2a2a2e', c2: '#6fd0ff', d: '고무가 쫀득쫀득한 중급자 픽' },
  { id: 'lemona', n: '레몬아', price: 69000, f: 0.55, e: 0.5, h: 0.4, c: '#f6c915', c2: '#3b3b3b', d: '상큼한 노랑. 발볼 넓은 분께 추천' },
  { id: 'madrock', n: '매드롹 드론', price: 59000, f: 0.5, e: 0.4, h: 0.35, c: '#2f6fd6', c2: '#e9e9e9', d: '입문 국민 암벽화. 하루 종일 신어도 편해요' },
  { id: 'rental', n: '대여화', price: 0, f: 0.3, e: 0.2, h: 0.1, c: '#7a7f87', c2: '#b9b9b9', d: '카운터에서 빌려주는 그 신발. 냄새는 묻지 마세요' },
];
const PANTS = [
  { id: 'bite', n: '바이트 클라이밍 팬츠', price: 89000, c: '#5b6b4c', d: '다리가 쭉쭉 — 발 닿는 거리 +8cm, 펌핑 −5%', ad: true, url: 'https://m.smartstore.naver.com/biteclimbing/products/12881990606' },
];
const CHALKS = [
  { id: 'powder', n: '가루 초크', price: 3000, uses: 10, c: '#f4f1ea', d: '기본 중의 기본. 10회분 (펌핑 −18)' },
  { id: 'ball', n: '초크볼', price: 5000, uses: 20, c: '#e9e4d8', d: '덜 날리는 망사 초크볼. 20회분 (펌핑 −18)' },
  { id: 'liquid', n: '리퀴드 초크', price: 8000, uses: 10, c: '#d8f0ff', d: '손에 착 붙어서 오래가요. 10회분 (펌핑 −28, 먼저 사용)' },
];
function chalkLeft() { return (Store.data.chalk || 0) + (Store.data.liquid || 0); }
function updateChalkBadge() {
  const b = $('#chalk-count'); if (!b) return;
  const n = chalkLeft(); b.textContent = n; b.classList.toggle('empty', n <= 0);
}
const ADS = [
  { title: '🔥 힘 에디션 151,000원', copy: '스파이시 최강 암벽화. 마찰·엣지·오버행 전부 MAX — 이거 신으면 V6도 V3 느낌', url: SHOES.find((x) => x.id === 'him').url, item: 'him' },
  { title: '👖 바이트 클라이밍 팬츠', copy: '하이스텝 할 때 안 끼는 팬츠. 다리가 쭉쭉 올라가요', url: PANTS[0].url, item: 'bite' },
];
const GYM_MAP = 'https://naver.me/xllIiJrK';
const GYM_ADDR = '경기 군포시 엘에스로 153-8 111호';
// 짭 암벽화 그림 (옆모습)
const shoeArtCache = new Map();
function shoeArt(sh) {
  if (shoeArtCache.has(sh.id)) return shoeArtCache.get(sh.id);
  const c = document.createElement('canvas'); c.width = 240; c.height = 150;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 240, 150);
  g.translate(10, 12);
  // 고무 밑창 + 토 랜드
  g.fillStyle = '#1b1b1d';
  g.beginPath(); g.moveTo(14, 104); g.quadraticCurveTo(10, 120, 40, 122); g.lineTo(170, 122); g.quadraticCurveTo(214, 120, 216, 98); g.quadraticCurveTo(214, 84, 196, 80); g.lineTo(150, 98); g.lineTo(20, 96); g.closePath(); g.fill();
  // 갑피 (다운턴 모양)
  g.fillStyle = sh.c;
  g.beginPath(); g.moveTo(20, 98); g.quadraticCurveTo(10, 60, 34, 30); g.quadraticCurveTo(46, 16, 66, 20); g.lineTo(98, 34); g.quadraticCurveTo(150, 44, 194, 80); g.quadraticCurveTo(170, 98, 150, 100); g.closePath(); g.fill();
  // 힐컵 고무
  g.fillStyle = '#1b1b1d'; g.beginPath(); g.moveTo(20, 98); g.quadraticCurveTo(8, 64, 28, 38); g.quadraticCurveTo(26, 70, 40, 96); g.closePath(); g.fill();
  // 벨크로 스트랩 / 포인트 색
  g.fillStyle = sh.c2;
  g.save(); g.translate(92, 52); g.rotate(-0.35); g.fillRect(-10, -26, 26, 64); g.restore();
  g.fillStyle = sh.c2; g.beginPath(); g.moveTo(150, 60); g.quadraticCurveTo(186, 72, 196, 82); g.quadraticCurveTo(178, 92, 152, 96); g.quadraticCurveTo(160, 78, 150, 60); g.fill();
  // 풀탭 + 하이라이트
  g.fillStyle = '#e3262b'; g.fillRect(38, 14, 12, 18);
  g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 4; g.beginPath(); g.moveTo(40, 40); g.quadraticCurveTo(60, 30, 84, 38); g.stroke();
  // 로고 글자
  g.fillStyle = '#fff'; g.font = '900 15px "Noto Sans KR", sans-serif'; g.fillText(sh.n.length > 5 ? sh.n.slice(0, 5) : sh.n, 112, 82);
  const url = c.toDataURL('image/png');
  shoeArtCache.set(sh.id, url);
  return url;
}

const REWARD = [2000, 3000, 4000, 6000, 8000, 11000, 15000, 20000, 26000, 33000, 40000]; // 난이도(핑~검)별
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
function gear() {
  const sh = SHOES.find((x) => x.id === Store.data.equip.shoe) || SHOES[0];
  const pa = PANTS.find((x) => x.id === Store.data.equip.pants);
  return { shoe: sh, pants: pa, f: sh.f, e: sh.e, h: sh.h, leg: pa ? 0.08 : 0, pumpMul: (pa ? 0.95 : 1) };
}
function addMoney(n, why) {
  Store.data.wallet = (Store.data.wallet || 0) + n; Store.save();
  updateWallet();
  if (why) toast(`💰 ${n > 0 ? '+' : ''}${won(n)} · ${why}`, 2400);
}
function updateWallet() { const el = $('#wallet'); if (el) { el.textContent = won(Store.data.wallet || 0); el.classList.toggle('neg', (Store.data.wallet || 0) < 0); } }

const TECHS = { flag: { n: '플래깅', icon: '🦵' }, inside: { n: '인사이드 스텝', icon: '↩️' }, outside: { n: '아웃사이드 스텝', icon: '↪️' } };
const CATCH = 0.34;   // 다이노 캐치 반경
const BODY_DROP = 1.15; // 손(매달린 홀드) → 발바닥 높이
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
  data: { name: '', color: '#e3262b', sends: {}, recent: [], festival: 0, helpSeen: false, manner: 36.5, wallet: 100000, owned: { rental: true }, equip: { shoe: 'rental', pants: '' }, chalk: 5, liquid: 0 },
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

// =================================================================
// 매트 — 벽을 따라 두껍게 (높이 30cm)
// =================================================================
const MAT_H = 0.3;
function matWidth(st) { return st.sec.id === 'trial' ? 1.6 : 2.0 + st.lean * 0.6; }
function isMat(x, z) {
  if (!inPoly(x, z, FLOOR)) return false;
  for (const o of OBSTACLES) if (inPoly(x, z, o.footM)) return false;
  for (const st of strips) {
    const W = st.matW;
    for (const sg of st.segs) if (segProject(x, z, sg.a, sg.b).d < W) return true;
  }
  return false;
}
function groundY(x, z) { return isMat(x, z) ? MAT_H : 0; }
function buildMats() {
  strips.forEach((st) => { st.matW = matWidth(st); });
  const cell = 0.2;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  FLOOR.forEach(([x, z]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); });
  minX -= cell; minZ -= cell;
  const nx = Math.ceil((maxX - minX) / cell) + 2, nz = Math.ceil((maxZ - minZ) / cell) + 2;
  const grid = [];
  for (let i = 0; i <= nx; i++) { grid[i] = []; for (let j = 0; j <= nz; j++) grid[i][j] = isMat(minX + i * cell, minZ + j * cell); }
  const top = [], topUv = [], side = [];
  const H = MAT_H;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const cs = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => ({ x: minX + a * cell, z: minZ + b * cell, in: grid[a][b] }));
    if (!cs.some((c) => c.in)) continue;
    const pts = [];
    for (let k = 0; k < 4; k++) {
      const c = cs[k], n = cs[(k + 1) % 4];
      if (c.in) pts.push({ x: c.x, z: c.z, mid: false });
      if (c.in !== n.in) pts.push({ x: (c.x + n.x) / 2, z: (c.z + n.z) / 2, mid: true });
    }
    if (pts.length < 3) continue;
    for (let k = 1; k < pts.length - 1; k++) {
      [pts[0], pts[k + 1], pts[k]].forEach((q) => { top.push(q.x, H, q.z); topUv.push(q.x / 2, q.z / 1.4); });
    }
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length];
      if (!(a.mid && b.mid)) continue;
      side.push(a.x, H, a.z, b.x, H, b.z, b.x, 0, b.z, a.x, H, a.z, b.x, 0, b.z, a.x, 0, a.z);
    }
  }
  const matTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c3c8ce'; g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, 'rgba(255,255,255,.08)'); grd.addColorStop(0.5, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(0,0,0,.06)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#9ea4ab'; g.lineWidth = 5; g.strokeRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,.05)'; g.lineWidth = 2;
    for (let y = 32; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
  matTex.wrapS = matTex.wrapT = THREE.RepeatWrapping;
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
  tg.setAttribute('uv', new THREE.Float32BufferAttribute(topUv, 2));
  tg.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(top.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  scene.add(new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.95, side: THREE.DoubleSide })));
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(side, 3));
  sg.computeVertexNormals();
  scene.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: '#7e858d', roughness: 0.9, side: THREE.DoubleSide })));
}

function buildWorld() {
  // 바닥 (콘크리트)
  const conc = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6c6e73'; g.fillRect(0, 0, w, h);
    const r = mulberry(42);
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 * r()})`; g.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3); }
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
  });
  conc.wrapS = conc.wrapT = THREE.RepeatWrapping;
  conc.repeat.set(0.25, 0.25);
  flatPoly(FLOOR, 0, new THREE.MeshStandardMaterial({ map: conc, roughness: 0.75, metalness: 0.05 }));
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
    b.position.set(wx, 6.7, wz); b.rotation.y = r;
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

  buildMats();

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
  buildBillboards();
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
  PROBLEM_DEFS.forEach(([secId, color, at, dyno, lockKey, count]) => {
    const st = strips.find((s) => s.sec.id === secId);
    const H = st.H, topV = H - 0.32;
    const rank = GRADES.indexOf(color), level = Math.min(6, Math.round(rank * 0.62));
    const p = { id: `${secId}-${color}`, strip: st, sector: st.sec, color, hex: HOLD_COLORS[color], name: COLOR_NAMES[color], rank, level, grade: `Lv.${rank + 1}`, dyno: !!dyno, side: dyno === 'side', double: dyno === 'double', lock: lockKey ? LOCKS[lockKey] : null, holds: [] };
    const c = at * st.L, half = Math.min(1.05, st.L / count / 2 - 0.3);
    if (dyno === 'double') {
      // 더블다이노: 시작 → (터치 홀드, 못 잡음) → TOP. 한 번에는 절대 못 닿는 거리
      const uu = wrapU(st, c);
      p.holds.push({ u: uu, v: 1.0, start: true, type: HT.jug });
      p.holds.push({ u: wrapU(st, c + 0.05), v: topV - 1.6, tap: true, type: HT.sloper });
      p.holds.push({ u: wrapU(st, c + 0.1), v: topV, top: true, dynoTarget: true, type: HT.jug });
      p.holds.forEach((h) => { h.strip = st; h.problem = p; h.hex = p.hex; h.q = h.type.q; h.size = h.top ? 0.13 : h.tap ? 0.12 : 0.1; st.holds.push(h); allHolds.push(h); });
      p.start = p.holds[0]; p.top = p.holds[p.holds.length - 1];
      st.problems.push(p); PROBLEMS.push(p);
      return;
    }
    // IFSC 스타일: 홀드 8~13개, 위·대각·트래버스 섞기
    const v0 = 1.1, total = topV - v0;
    let n = 8 + Math.round(rank * 0.5) + (dyno ? -1 : 0);
    let moves, unit;
    for (let tries = 0; tries < 20; tries++) {
      moves = [];
      for (let i = 0; i < n - 1; i++) {
        const last = i === n - 2, prevT = moves[i - 1] === 'trav';
        const r = rand();
        moves.push(last ? (r < 0.6 ? 'up' : 'diag') : r < 0.4 ? 'up' : r < 0.75 || prevT ? 'diag' : 'trav');
      }
      if (dyno) { const k = 2 + Math.floor(rand() * Math.max(1, n - 4)); moves[Math.min(k, n - 3)] = dyno === 'side' ? 'sdyno' : 'udyno'; }
      const W = { up: 1, diag: 0.65, trav: 0, sdyno: 0, udyno: 0 }, F = { trav: 0.03, sdyno: 0.15, udyno: 1.55 };
      const fixed = moves.reduce((a, m) => a + (F[m] || 0), 0), wsum = moves.reduce((a, m) => a + W[m], 0);
      unit = (total - fixed) / Math.max(0.5, wsum);
      if (unit <= 0.6) break;
      n++;
    }
    unit = Math.max(0.2, unit);
    let dir = rand() < 0.5 ? -1 : 1, u = c - dir * half * 0.6, v = v0;
    p.holds.push({ u: wrapU(st, u), v, start: true });
    moves.forEach((mv, i) => {
      const last = i === moves.length - 1;
      let du = 0, dv = 0;
      if (mv === 'up') { du = (rand() - 0.5) * 0.24; dv = unit * (0.9 + rand() * 0.2); }
      if (mv === 'diag') { du = dir * (0.32 + rand() * 0.1); dv = unit * 0.65 * (0.9 + rand() * 0.2); }
      if (mv === 'trav') { du = dir * (0.46 + rand() * 0.08); dv = (rand() - 0.3) * 0.08; }
      if (mv === 'udyno') { du = (rand() - 0.5) * 0.3; dv = 1.55; }
      if (mv === 'sdyno') { du = dir * 1.5; dv = 0.15; }
      if (mv === 'sdyno') du = (u < c ? 1 : -1) * Math.min(1.5, half * 1.9);
      else if (Math.abs(u + du - c) > half) { dir = -dir; du = -du; }
      u = clamp(u + du, c - half, c + half); v = last ? topV : Math.min(topV - 0.35, v + dv);
      p.holds.push({ u: wrapU(st, u), v, top: last, dynoTarget: mv === 'udyno' || mv === 'sdyno' });
      if (Math.abs(u - c) > half * 0.8) dir = -Math.sign(u - c) || dir;
    });
    p.holds.forEach((h) => {
      h.strip = st; h.problem = p; h.hex = p.hex;
      h.type = h.start ? HT.jug : h.top ? (rank >= 8 ? HT.edge : HT.jug) : pickHoldType(Math.round(rank * 0.78), rand); // 검정은 크림프·슬로퍼 투성이
      h.q = h.type.q;
      h.size = h.top ? 0.13 : h.dynoTarget ? 0.12 : 0.085 + rand() * 0.04 - level * 0.004;
      st.holds.push(h); allHolds.push(h);
    });
    p.start = p.holds[0]; p.top = p.holds[p.holds.length - 1];
    const mids = p.holds.filter((h) => !h.start && !h.top && !h.tap);
    p.zone = mids[Math.floor(mids.length * 0.5)];
    if (p.zone) { p.zone.zone = true; p.zone.size = Math.max(p.zone.size, 0.11); }
    if (p.lock) {
      // 크럭스: 위쪽 70% 지점 홀드를 나쁜 홀드로 + 잠금
      const mid = mids.filter((h) => h !== p.zone);
      const cx = mid[Math.floor(mid.length * 0.7)] || mid[mid.length - 1];
      if (cx) { cx.lock = p.lock; cx.type = lockKey === 'edge' ? HT.crimp : lockKey === 'over' ? HT.sloper : cx.type; cx.q = cx.type.q; p.crux = cx; }
    }
    st.problems.push(p);
    PROBLEMS.push(p);
  });
  // 장식 홀드 없음 — 벽에는 문제(루트) 홀드만
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
      const hs = h.size * 1.6, sc = h.type.sc;
      mtx.makeBasis(x.multiplyScalar(hs * 1.15 * sc[0]), y.multiplyScalar(hs * sc[1]), s.n3.clone().multiplyScalar(hs * 0.9 * sc[2]));
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
    [[p.start, 'S'], [p.top, 'TOP'], ...p.holds.filter((h) => h.tap).map((h) => [h, 'TAP']), ...(p.zone ? [[p.zone, 'Z']] : []), ...(p.crux ? [[p.crux, '🥁']] : [])].forEach(([h, txt]) => {
      const st = p.strip;
      const [s] = segAt(st, h.u);
      const dark = DARK_TAPE.includes(p.color);
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
// =================================================================
// 🎨 캐릭터 꾸미기
// =================================================================
const HEAD_SHAPES = {
  flame: { n: '불꽃', d: FLAME_D },
  drop: { n: '물방울', d: 'M50 4 C60 24 90 44 90 66 C90 86 72 96 50 96 C28 96 10 86 10 66 C10 44 40 24 50 4 Z' },
  star: { n: '별', d: 'M50 4 L62 34 L94 36 L69 57 L78 90 L50 72 L22 90 L31 57 L6 36 L38 34 Z' },
  cat: { n: '고양이', d: 'M16 32 L22 4 L42 22 C47 21 53 21 58 22 L78 4 L84 32 C94 44 94 58 92 68 C88 86 72 96 50 96 C28 96 12 86 8 68 C6 58 6 44 16 32 Z' },
};
const EYES = { dot: '동글', smile: '웃음', sparkle: '반짝', sleepy: '졸림', angry: '화남 😈' };
const SKINS = ['#ffe3cc', '#f3c9a3', '#d9a27a', '#9c6a48'];
const CLOTH = ['#ffffff', '#1d1d20', '#e3262b', '#2f6fd6', '#2fbf71', '#ffc21a', '#7b3fb8', '#ff7aa8'];
const ACCS = { none: '없음', band: '헤드밴드', beanie: '비니', glasses: '안경', ribbon: '리본', earbuds: '이어폰', headset: '헤드셋', horns: '악마 뿔 😈', mask: '빌런 마스크 😈' };
const VILLAINS = { none: '착한 클라이머', beta: '베타 스프레이어', mat: '매트 점령자', chalk: '초크 폭격기', shirtless: '상탈 빌런' };
const DEFAULT_LOOK = { head: 'flame', eyes: 'dot', blush: 1, skin: SKINS[0], shirt: '', pants: '', acc: 'none', vil: 'none' };
function lookToStr(l) { return [l.head, l.eyes, l.blush ? 1 : 0, l.skin, l.shirt, l.pants, l.acc, l.vil].join(','); }
function lookFromStr(str) {
  const a = String(str || '').split(',');
  const hex = (v, def) => (/^#[0-9a-f]{6}$/i.test(v) ? v : def);
  return {
    head: HEAD_SHAPES[a[0]] ? a[0] : 'flame', eyes: EYES[a[1]] ? a[1] : 'dot', blush: a[2] !== '0',
    skin: hex(a[3], SKINS[0]), shirt: hex(a[4], ''), pants: hex(a[5], ''), acc: ACCS[a[6]] ? a[6] : 'none', vil: VILLAINS[a[7]] ? a[7] : 'none',
  };
}
const headGeoCache = new Map();
function getHeadGeo(key) {
  if (headGeoCache.has(key)) return headGeoCache.get(key);
  const tokens = HEAD_SHAPES[key].d.match(/[MCLZ]|-?\d+(\.\d+)?/g);
  const X = (v) => (v - 50) / 100, Y = (v) => (96 - v) / 100;
  const sh = new THREE.Shape();
  let i = 0;
  while (i < tokens.length) {
    const c = tokens[i++];
    if (c === 'M') sh.moveTo(X(+tokens[i++]), Y(+tokens[i++]));
    else if (c === 'L') sh.lineTo(X(+tokens[i++]), Y(+tokens[i++]));
    else if (c === 'C') { const a = tokens.slice(i, i + 6).map(Number); i += 6; sh.bezierCurveTo(X(a[0]), Y(a[1]), X(a[2]), Y(a[3]), X(a[4]), Y(a[5])); }
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: key === 'star' ? 0.04 : 0.05, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0.05, -0.15);
  headGeoCache.set(key, g);
  return g;
}
function buildFace(head, look, hs) {
  const z = 0.25 * hs + 0.01;
  const white = new THREE.MeshBasicMaterial({ color: '#fff' });
  [-0.12, 0.12].forEach((x) => {
    const ex = x * hs, ey = 0.41 * hs;
    if (look.eyes === 'smile') {
      const e = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.012, 6, 12, Math.PI), blackMat); e.position.set(ex, ey - 0.01, z); head.add(e);
    } else if (look.eyes === 'sleepy') {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.016, 0.02), blackMat); e.position.set(ex, ey - 0.01, z); e.rotation.z = x < 0 ? 0.12 : -0.12; head.add(e);
    } else {
      if (look.eyes === 'angry') { const br = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.02), blackMat); br.position.set(ex, ey + 0.075, z + 0.01); br.rotation.z = x < 0 ? -0.45 : 0.45; head.add(br); }
      const big = look.eyes === 'sparkle';
      const e = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.068 : 0.05, 14, 10), blackMat); e.position.set(ex, ey, z); e.scale.z = 0.5; head.add(e);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.022 : 0.016, 8, 6), white); hl.position.set(ex + (big ? 0.02 : 0.015), ey + (big ? 0.025 : 0.02), z + 0.025); head.add(hl);
      if (big) { const h2 = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), white); h2.position.set(ex - 0.02, ey - 0.022, z + 0.025); head.add(h2); }
    }
    if (look.blush) {
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), new THREE.MeshBasicMaterial({ color: '#ff9aa8', transparent: true, opacity: 0.7 }));
      blush.position.set(x * hs * 1.75, 0.3 * hs, z + 0.002); head.add(blush);
    }
  });
  const arcL = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.01, 6, 12, Math.PI), blackMat);
  arcL.position.set(-0.034, 0.28 * hs, z); head.add(arcL);
  const arcR = arcL.clone(); arcR.rotation.z = Math.PI; arcR.position.set(0.034, 0.28 * hs, z); head.add(arcR);
  // 액세서리
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
  if (look.acc === 'band') {
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.36 * hs, 0.035, 8, 32), mat('#e3262b'));
    b.rotation.x = Math.PI / 2; b.scale.set(1, 0.62, 1); b.position.y = 0.6 * hs; head.add(b);
  } else if (look.acc === 'beanie') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.38 * hs, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#2f6fd6'));
    b.scale.set(1.05, 0.95, 0.7); b.position.y = 0.6 * hs; head.add(b);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.39 * hs, 0.05, 8, 28), mat('#1d3f86')); rim.rotation.x = Math.PI / 2; rim.scale.set(1.05, 0.7, 1); rim.position.y = 0.6 * hs; head.add(rim);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), mat('#ffffff')); pom.position.y = 0.97 * hs; head.add(pom);
  } else if (look.acc === 'glasses') {
    const m = mat('#16161a');
    [-0.12, 0.12].forEach((x) => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.012, 8, 20), m); r.position.set(x * hs, 0.41 * hs, z + 0.03); head.add(r); });
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.012), m); br.position.set(0, 0.42 * hs, z + 0.03); head.add(br);
  } else if (look.acc === 'earbuds') {
    const m = mat('#ffffff');
    [-1, 1].forEach((sd) => {
      const bud = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), m); bud.position.set(sd * 0.38 * hs, 0.36 * hs, 0.14); head.add(bud);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), m); stem.position.set(sd * 0.38 * hs, 0.36 * hs - 0.09, 0.15); head.add(stem);
    });
  } else if (look.acc === 'headset') {
    const m = mat('#1d1d20'), acc = mat('#e3262b');
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.47 * hs, 0.028, 8, 28, Math.PI), m); band.position.y = 0.36 * hs; head.add(band);
    [-1, 1].forEach((sd) => {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 18), m); cup.rotation.z = Math.PI / 2; cup.position.set(sd * 0.45 * hs, 0.36 * hs, 0); head.add(cup);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.075, 14), acc); pad.rotation.z = Math.PI / 2; pad.position.set(sd * (0.45 * hs + 0.005), 0.36 * hs, 0); head.add(pad);
    });
    const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.24, 6), m); mic.rotation.z = 1.2; mic.position.set(-0.32 * hs, 0.24 * hs, 0.14); head.add(mic);
  } else if (look.acc === 'horns') {
    const m = mat('#2b0f3d');
    [-1, 1].forEach((sd) => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.32, 14), m); c.position.set(sd * 0.3 * hs, 0.9 * hs, 0.1); c.rotation.z = -sd * 0.55; head.add(c); });
  } else if (look.acc === 'mask') {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.66 * hs, 0.12, 0.012), mat('#3b1f5c')); band.position.set(0, 0.42 * hs, z); head.add(band);
    [-1, 1].forEach((sd) => { const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.01), mat('#3b1f5c')); t.position.set(sd * 0.36 * hs, 0.4 * hs, z - 0.05); t.rotation.z = sd * -0.5; head.add(t); });
  } else if (look.acc === 'ribbon') {
    const m = mat('#ff5c8a');
    [-1, 1].forEach((sd) => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 12), m); c.rotation.z = sd * Math.PI / 2; c.position.set(0.24 * hs + sd * 0.075, 0.8 * hs, 0.08); head.add(c); });
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), m); k.position.set(0.24 * hs, 0.8 * hs, 0.09); head.add(k);
  }
}

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

// 무호K의 호랑이 얼굴
let tigerTexCache = null;
function tigerTex() {
  if (tigerTexCache) return tigerTexCache;
  tigerTexCache = canvasTex(512, 256, (g) => {
    g.fillStyle = '#f39a2b'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#fff1df'; g.beginPath(); g.ellipse(128, 200, 95, 60, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1d1410';
    const stripe = (x, y, w, h, rot) => { g.save(); g.translate(x, y); g.rotate(rot); g.beginPath(); g.moveTo(-w / 2, 0); g.quadraticCurveTo(0, h * 0.2, 0, h); g.quadraticCurveTo(0, h * 0.2, w / 2, 0); g.closePath(); g.fill(); g.restore(); };
    [[128, 14, 16, 58, 0], [104, 22, 12, 42, -0.15], [152, 22, 12, 42, 0.15]].forEach((a) => stripe(...a));
    [-1, 1].forEach((sd) => {
      [[40, 100], [60, 130], [52, 160]].forEach(([dx, y], i) => stripe(128 + sd * (130 + i * 6), y, 14, 40 - i * 4, sd * 1.4));
      [[95, 70], [110, 92]].forEach(([dx, y]) => stripe(128 + sd * dx, y, 10, 30, sd * 0.9));
    });
    for (let x = 300; x < 512; x += 36) stripe(x, 10, 20, 70 + (x % 3) * 10, 0);
  });
  return tigerTexCache;
}
function buildTigerHead(head) {
  const fur = new THREE.MeshStandardMaterial({ map: tigerTex(), roughness: 0.7 });
  const plain = new THREE.MeshStandardMaterial({ color: '#f39a2b', roughness: 0.7 });
  const white = new THREE.MeshStandardMaterial({ color: '#fff1df', roughness: 0.7 });
  const pink = new THREE.MeshStandardMaterial({ color: '#ff9aa8', roughness: 0.7 });
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 20), fur);
  skull.scale.set(1.08, 0.92, 0.95); skull.position.y = 0.38; head.add(skull);
  [-1, 1].forEach((sd) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), plain); ear.scale.set(1, 1, 0.5); ear.position.set(sd * 0.29, 0.7, 0); head.add(ear);
    const inn = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), pink); inn.scale.set(1, 1, 0.4); inn.position.set(sd * 0.29, 0.69, 0.045); head.add(inn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 8), blackMat); eye.scale.z = 0.5; eye.position.set(sd * 0.14, 0.44, 0.35); head.add(eye);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff' })); hl.position.set(sd * 0.14 + 0.015, 0.46, 0.375); head.add(hl);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.022, 0.02), blackMat); brow.position.set(sd * 0.14, 0.53, 0.35); brow.rotation.z = -sd * 0.38; head.add(brow);
  });
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12), white); muzzle.scale.set(1.25, 0.78, 0.7); muzzle.position.set(0, 0.27, 0.3); head.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshStandardMaterial({ color: '#3a2020' })); nose.scale.set(1.4, 0.9, 0.8); nose.position.set(0, 0.33, 0.42); head.add(nose);
  const mL = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.009, 6, 12, Math.PI), blackMat); mL.rotation.z = Math.PI; mL.position.set(-0.032, 0.27, 0.415); head.add(mL);
  const mR = mL.clone(); mR.position.x = 0.032; head.add(mR);
}

// 웨스트의 카우보이 얼굴
function buildCowboyHead(head) {
  const skin = new THREE.MeshStandardMaterial({ color: '#ffd9b3', roughness: 0.65 });
  const hat = new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.75 });
  const band = new THREE.MeshStandardMaterial({ color: '#e3262b', roughness: 0.6 });
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.39, 30, 20), skin);
  face.scale.set(1.05, 0.95, 0.95); face.position.y = 0.37; head.add(face);
  [-1, 1].forEach((sd) => {
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12, Math.PI), blackMat); // 웃는 눈 ∩
    eye.position.set(sd * 0.13, 0.42, 0.35); head.add(eye);
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), new THREE.MeshBasicMaterial({ color: '#ff9aa8', transparent: true, opacity: 0.75 }));
    blush.position.set(sd * 0.22, 0.31, 0.33); blush.rotation.y = sd * 0.5; head.add(blush);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), skin); ear.scale.set(0.6, 1, 0.8); ear.position.set(sd * 0.4, 0.37, 0); head.add(ear);
  });
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 8, 16, Math.PI), new THREE.MeshStandardMaterial({ color: '#7a2a2a' }));
  smile.rotation.z = Math.PI; smile.position.set(0, 0.27, 0.36); head.add(smile);
  const tooth = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#fff' }));
  tooth.rotation.z = Math.PI; tooth.position.set(0, 0.272, 0.362); head.add(tooth);
  // 카우보이 모자
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.035, 32), hat);
  brim.position.y = 0.66; brim.scale.set(1, 1, 0.85); head.add(brim);
  [-1, 1].forEach((sd) => { const curl = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 12, Math.PI), hat); curl.rotation.set(Math.PI / 2, 0, sd > 0 ? 0 : Math.PI); curl.rotation.z = Math.PI / 2; curl.position.set(sd * 0.56, 0.7, 0); head.add(curl); });
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.31, 0.34, 24), hat);
  crown.position.y = 0.84; head.add(crown);
  const dent = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hat);
  dent.scale.set(1.2, 0.35, 1); dent.position.y = 1.0; head.add(dent);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.315, 0.06, 24, 1, true), band);
  b.position.y = 0.71; head.add(b);
}

// 불꽃이: 큰 불꽃 머리 + 사람 같은 두 마디 팔다리 (팔꿈치·무릎이 굽는 IK)
const BODY = { hipY: 0.48, shY: 0.8, shW: 0.16, hipW: 0.08, armA: 0.23, armB: 0.23, legA: 0.245, legB: 0.235 }; // 작고 귀엽게 (머리는 그대로)
const handGeo = new THREE.SphereGeometry(0.055, 12, 8), footGeo = new THREE.SphereGeometry(0.066, 12, 8).scale(1, 0.62, 1.55).translate(0, -0.02, 0.045);
const UPV = new V3(0, 1, 0), DOWN = new V3(0, -1, 0);
const segGeoCache = new Map();
function segGeo(r, len) { const k = r + ':' + len; if (!segGeoCache.has(k)) segGeoCache.set(k, new THREE.CapsuleGeometry(r, len, 4, 10)); return segGeoCache.get(k); }
function placeSeg(mesh, a, b) {
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  const d = tmpV.copy(b).sub(a);
  if (d.lengthSq() > 1e-8) mesh.quaternion.setFromUnitVectors(UPV, d.normalize());
}
class Avatar {
  constructor(name, color, { isPlayer = false, visitor = false, tiger = false, cowboy = false, look = null } = {}) {
    const L = { ...DEFAULT_LOOK, ...(look || {}) };
    this.name = name; this.color = color;
    this.group = new THREE.Group();
    this.rig = new THREE.Group();
    this.group.add(this.rig);
    const main = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.78), roughness: 0.6 });
    const skin = new THREE.MeshStandardMaterial({ color: '#ffe3cc', roughness: 0.7 });
    const shoe = new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.6 });
    const shirt = L.vil === 'shirtless' && !tiger && !cowboy ? new THREE.MeshStandardMaterial({ color: L.skin, roughness: 0.7 }) : L.shirt && !tiger && !cowboy ? new THREE.MeshStandardMaterial({ color: L.shirt, roughness: 0.65 }) : dark;
    this.villain = !tiger && !cowboy && L.vil !== 'none' ? L.vil : null;
    this.shoeMat = shoe; this.legMat = dark.clone();
    if (L.pants && !tiger && !cowboy) this.legMat.color.set(L.pants);
    this.legBase = this.legMat.color.clone();
    if (tiger) skin.color.set('#f39a2b');
    this.skinBase = tiger ? '#f39a2b' : cowboy ? '#ffd9b3' : L.skin;
    skin.color.set(this.skinBase);
    this.skin = skin;
    const B = BODY;
    // 몸통 (티셔츠) + 골반 (바지)
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, Math.max(0.04, B.shY - B.hipY - 0.12), 6, 14), shirt);
    torso.position.y = (B.hipY + B.shY) / 2 + 0.02; torso.scale.set(1, 1, 0.82); this.rig.add(torso);
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 10), this.legMat);
    pelvis.position.y = B.hipY + 0.03; pelvis.scale.set(1.08, 0.62, 0.85); this.rig.add(pelvis);
    const tee = cowboy ? textSprite('⭐', { h: 0.12, bg: 'rgba(0,0,0,0)', depthTest: true }) : tiger ? textSprite('STAFF', { h: 0.07, bg: '#f39a2b', fg: '#111', depthTest: true, font: '900 40px "Noto Sans KR", sans-serif' }) : textSprite('🔥', { h: 0.12, bg: 'rgba(0,0,0,0)', depthTest: true });
    tee.position.set(0, B.hipY + 0.24, 0.15); this.rig.add(tee);
    if (L.vil === 'shirtless' && !tiger && !cowboy) tee.visible = false;
    // 초크백 (허리 뒤)
    const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.14, 14), new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.9 }));
    bag.position.set(0, B.hipY + 0.06, -0.19); this.rig.add(bag);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.073, 0.014, 6, 16), new THREE.MeshStandardMaterial({ color: '#e3262b' }));
    rim.rotation.x = Math.PI / 2; rim.position.set(0, B.hipY + 0.13, -0.19); this.rig.add(rim);
    // 머리 (큰 불꽃 / 호랑이 / 카우보이)
    this.head = new THREE.Group();
    this.head.position.y = B.shY - 0.06;
    const hs = 0.86;
    if (tiger) { buildTigerHead(this.head); bag.visible = false; rim.visible = false; }
    else if (cowboy) {
      buildCowboyHead(this.head); bag.visible = false; rim.visible = false;
      this.phone = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.025), new THREE.MeshStandardMaterial({ color: '#16161a', roughness: 0.3 }));
      this.phone.position.set(0, B.shY + 0.32, 0.46); this.phone.visible = false; this.rig.add(this.phone);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.025, 12), new THREE.MeshBasicMaterial({ color: '#7fb6ff' }));
      lens.position.set(0.04, 0.08, 0.014); this.phone.add(lens);
    } else {
      const flame = new THREE.Mesh(getHeadGeo(L.head), main); flame.scale.setScalar(hs); this.head.add(flame);
      this.headMat = main;
      buildFace(this.head, L, hs);
    }
    this.rig.add(this.head);
    // 팔다리: 어깨/엉덩이 → 팔꿈치/무릎 → 손/발
    const mk = (kind, side) => {
      const arm = kind === 'arm';
      const a = arm ? B.armA : B.legA, b = arm ? B.armB : B.legB, r = arm ? 0.046 : 0.06;
      const root = arm ? new V3(side * B.shW, B.shY - 0.04, 0) : new V3(side * B.hipW, B.hipY, 0);
      const upper = new THREE.Mesh(segGeo(r, a), arm ? shirt : this.legMat);
      const lower = new THREE.Mesh(segGeo(r * 0.88, b), arm ? skin : this.legMat);
      const joint = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 10, 8), arm ? skin : this.legMat);
      const end = new THREE.Mesh(arm ? handGeo : footGeo, arm ? skin : shoe);
      this.rig.add(upper, lower, joint, end);
      return { kind, side, root, a, b, len: a + b, upper, lower, joint, end, dir: new V3(0, -1, 0) };
    };
    this.limbs = [mk('arm', -1), mk('arm', 1), mk('leg', -1), mk('leg', 1)];
    const tagY = tiger ? 1.68 : cowboy ? 1.84 : 1.62;
    const vil = this.villain;
    this.tag = textSprite(tiger ? `🐯 ${name}` : cowboy ? `🤠 ${name}` : vil ? `😈 ${name}` : name, { h: 0.17, bg: vil ? '#6a2c91' : isPlayer ? '#e3262b' : tiger ? '#f39a2b' : cowboy ? '#ffd166' : visitor ? '#f5f2ee' : 'rgba(20,20,22,.8)', fg: !vil && (visitor || tiger || cowboy) ? '#111' : '#fff', border: vil && isPlayer ? '#e3262b' : null });
    this.tag.position.y = tagY; this.bubbleY = tagY + 0.14;
    this.group.add(this.tag);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);
    scene.add(this.group);
    this.t = Math.random() * 10; this.phase = 0; this.squashT = 0; this.bubble = null; this.sitting = false;
    this.climbing = false; this.airborne = false; this.grips = null;
    this.hanging = false; this.campus = false; this.chalkT = 0; this.chalkyT = 0; this.puffed = true;
    this.prev = new V3(); this.speed = 0;
  }
  setClimbing(v) { this.climbing = v; if (!v) this.grips = null; }
  setHeadAlpha(a) { if (!this.headMat) return; this.headMat.transparent = a < 1; this.headMat.opacity = a; this.headMat.depthWrite = a >= 1; this.headMat.needsUpdate = true; }
  setOutfit(shoeId, pantsId) {
    const sh = SHOES.find((x) => x.id === shoeId), pa = PANTS.find((x) => x.id === pantsId);
    this.shoeMat.color.set(sh && sh.id !== 'rental' ? sh.c : '#2a2a2e');
    if (pa) this.legMat.color.set(pa.c); else this.legMat.color.copy(this.legBase);
  }
  squash() { this.squashT = 0.45; }
  chalk() { this.chalkDur = this.climbing ? 1.0 : 1.5; this.chalkT = this.chalkDur; this.puffed = false; this.clapIdx = 0; this.chalkyT = 25; }
  // 자동 말풍선: 금방 사라짐 (아래 칸)
  say(text, ms = 2800) {
    if (this.bubble) { this.group.remove(this.bubble); disposeSprite(this.bubble); }
    clearTimeout(this.bubbleT);
    const b = textSprite(text, { h: 0.21, bg: '#ffffff', fg: '#151515', tail: true, font: '700 40px "Noto Sans KR", sans-serif' });
    this.group.add(b);
    this.bubble = b;
    this.layoutBubbles();
    this.bubbleT = setTimeout(() => { if (this.bubble === b) { this.group.remove(b); disposeSprite(b); this.bubble = null; this.layoutBubbles(); } }, ms);
  }
  // 직접 입력한 채팅 (위 칸)
  chat(text, ms = 15000) {
    if (this.chatBubble) { this.group.remove(this.chatBubble); disposeSprite(this.chatBubble); }
    clearTimeout(this.chatT);
    const b = textSprite(text, { h: 0.23, bg: '#ffffff', fg: '#151515', border: this.color, tail: true, font: '700 40px "Noto Sans KR", sans-serif' });
    this.group.add(b);
    this.chatBubble = b;
    this.layoutBubbles();
    this.chatT = setTimeout(() => { if (this.chatBubble === b) { this.group.remove(b); disposeSprite(b); this.chatBubble = null; this.layoutBubbles(); } }, ms);
  }
  layoutBubbles() {
    if (this.bubble) this.bubble.position.y = this.bubbleY;
    if (this.chatBubble) this.chatBubble.position.y = this.bubble ? this.bubbleY + 0.34 : this.bubbleY;
  }
  // 두 마디 IK: 목표점(리그 좌표)을 향해 팔꿈치/무릎을 굽힘. 늘어나지 않음
  solve(l, target) {
    const r = l.root, d = tmpV2.copy(target).sub(r);
    let dist = d.length();
    if (dist < 1e-4) { d.set(0, -1, 0); dist = 0.1; }
    const dir = d.multiplyScalar(1 / dist).clone();
    dist = clamp(dist, 0.08, l.len - 0.002);
    const cosA = clamp((l.a * l.a + dist * dist - l.b * l.b) / (2 * l.a * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    // 팔꿈치는 바깥·아래, 무릎은 앞(등반 중이면 바깥·벽 반대쪽)
    const pole = l.kind === 'arm'
      ? (this.climbing ? new V3(l.side, -1, -0.7) : new V3(l.side * 0.6, -0.2, -1))
      : (this.climbing ? new V3(l.side, 0.2, -0.8) : new V3(l.side * 0.15, 0, 1));
    pole.sub(dir.clone().multiplyScalar(pole.dot(dir)));
    if (pole.lengthSq() < 1e-6) pole.set(0, 0, 1);
    pole.normalize();
    const mid = r.clone().addScaledVector(dir, l.a * cosA).addScaledVector(pole, l.a * sinA);
    const end = r.clone().addScaledVector(dir, dist);
    placeSeg(l.upper, r, mid); placeSeg(l.lower, mid, end);
    l.joint.position.copy(mid); l.end.position.copy(end);
    if (l.kind === 'leg') l.end.rotation.set(0, 0, 0);
  }
  // 각도로 자세 잡기 (아래 방향을 회전) — 기존 포즈 코드와 호환
  limbRot(l, rx, rz = 0) {
    l.dir.copy(DOWN).applyEuler(new THREE.Euler(rx, 0, rz));
    this.solve(l, l.root.clone().addScaledVector(l.dir, l.len * 0.96));
  }
  limbLen(l, d) { this.solve(l, l.root.clone().addScaledVector(l.dir, Math.min(d, l.len))); }
  limbTo(l, world) { this.solve(l, this.rig.worldToLocal(world.clone())); }
  update(dt) {
    this.t += dt;
    const p = this.group.position;
    const mv = Math.hypot(p.x - this.prev.x, p.z - this.prev.z) / Math.max(dt, 1e-3);
    this.prev.copy(p);
    this.speed = lerp(this.speed, mv, damp(8, dt));
    let sx = 1, sy = 1;
    if (this.squashT > 0) {
      this.squashT -= dt;
      const k = this.squashT / 0.45;
      sy = 1 - 0.3 * Math.sin(k * Math.PI) * k; sx = 1 + (1 - sy) * 0.7;
    }
    const [la, ra, ll, rl] = this.limbs;
    this.rig.position.y = 0; this.rig.rotation.set(0, 0, 0); this.head.rotation.set(0, 0, 0);
    if (this.chalkT > 0) this.chalkT = Math.max(0, this.chalkT - dt);
    const ck = this.chalkT > 0 ? this.chalkDur - this.chalkT : -1;
    if (this.chalkyT > 0) this.chalkyT -= dt;
    this.skin.color.set(this.skinBase).lerp(new THREE.Color('#ffffff'), clamp(this.chalkyT / 4, 0, 1));
    this.rig.scale.set(1, 1, 1);
    this.group.updateMatrixWorld(true);
    if (this.climbing && this.grips) {
      if (this.swing) this.rig.rotation.z = this.swing;
      this.rig.updateMatrixWorld(true);
      this.limbTo(la, this.grips[0]);
      if (ck >= 0) this.limbRot(ra, ck < 0.5 ? 0.9 : 0.3, 0.35); else this.limbTo(ra, this.grips[1]);
      if (this.ceremony) {
        // 뒤돌아서 한 손은 TOP, 다른 팔 번쩍
        this.rig.rotation.y = Math.PI * 0.85;
        this.rig.updateMatrixWorld(true);
        this.limbTo(la, this.grips[0]);
        const pump = Math.sin(this.t * 10) * 0.06;
        this.solve(ra, new V3(0.22, BODY.shY + 0.4 + pump, 0.05));
        const f = Math.sin(this.t * 5) * 0.2;
        this.limbRot(ll, 0.3 + f, -0.15); this.limbRot(rl, 0.3 - f, 0.15);
        this.head.rotation.z = Math.sin(this.t * 6) * 0.08;
      } else if (this.tech === 'flag' && !this.hanging) {
        const fs = this.flagSide || 1, fl = fs > 0 ? ll : rl, other = fs > 0 ? rl : ll;
        this.limbTo(other, this.grips[fs > 0 ? 3 : 2]);
        this.solve(fl, fl.root.clone().add(new V3(fs * 0.55, -0.32, -0.05)));
        this.rig.rotation.z = -fs * 0.06;
      } else if (this.tech === 'heel') {
        this.limbTo(ll, this.grips[2]); this.limbTo(rl, this.grips[3]);
      } else if (this.campus || this.hanging || this.footless) {
        const f = Math.sin(this.t * (this.hanging ? 2 : 6)) * (this.hanging ? 0.15 : 0.3);
        this.limbRot(ll, 0.25 + f, -0.12); this.limbRot(rl, 0.25 - f, 0.12);
      } else { this.limbTo(ll, this.grips[2]); this.limbTo(rl, this.grips[3]); }
      this.head.rotation.z = Math.sin(this.t * 2.5) * 0.05;
    } else if (this.climbing || this.airborne) {
      const f = Math.sin(this.t * (this.airborne ? 18 : 4)) * (this.airborne ? 0.35 : 0.1);
      this.limbRot(la, Math.PI * 0.92 + f, -0.25); this.limbRot(ra, Math.PI * 0.92 - f, 0.25);
      this.limbRot(ll, -0.5 - f, -0.12); this.limbRot(rl, -0.5 + f, 0.12);
    } else if (this.sitting) {
      this.rig.position.y = -0.33;
      const b = Math.sin(this.t * 1.6) * 0.04;
      this.solve(la, new V3(-0.2, 0.47 + b, 0.3)); this.solve(ra, new V3(0.2, 0.47 - b, 0.3));
      this.solve(ll, new V3(-0.13, 0.32, 0.42)); this.solve(rl, new V3(0.13, 0.32, 0.42));
      sy *= 1 + Math.sin(this.t * 1.6) * 0.015;
    } else {
      const sp = clamp(this.speed / 3.4, 0, 1.9);
      const run = clamp(sp - 1, 0, 0.9) / 0.9;
      this.phase += dt * (4 + Math.min(sp, 1) * 8 + run * 5);
      const amp = Math.min(sp, 1) * 0.7 + run * 0.35;
      const s = Math.sin(this.phase) * amp;
      this.limbRot(la, s * 0.9, -0.12 - run * 0.15); this.limbRot(ra, -s * 0.9, 0.12 + run * 0.15);
      // 다리: 앞으로 나가는 쪽은 무릎을 들어 올림
      const lift = (v) => Math.max(0, Math.sin(v)) * 0.12 * Math.min(sp, 1.4);
      this.solve(ll, ll.root.clone().add(new V3(0, -ll.len * 0.97 + lift(this.phase + Math.PI), Math.sin(-this.phase) * 0.32 * Math.min(sp, 1.4))));
      this.solve(rl, rl.root.clone().add(new V3(0, -rl.len * 0.97 + lift(this.phase), Math.sin(this.phase) * 0.32 * Math.min(sp, 1.4))));
      const bob = sp > 0.1 ? Math.abs(Math.sin(this.phase)) * (0.04 + run * 0.05) * Math.min(sp, 1) : Math.sin(this.t * 2.6) * 0.01;
      this.rig.position.y = bob;
      this.rig.rotation.x = run * 0.2;
      this.head.rotation.z = Math.sin(this.phase) * 0.05 * Math.min(sp, 1);
    }
    if (this.photoPose) {
      this.solve(la, new V3(-0.1, BODY.shY + 0.28, 0.42)); this.solve(ra, new V3(0.1, BODY.shY + 0.28, 0.42));
    }
    if (this.phone) this.phone.visible = !!this.photoPose;
    const onWall = this.climbing && this.grips;
    if (ck >= 0 && !onWall) {
      // 초크백에 손 넣기 → 쫙! 쫙! 팡!!
      if (ck < 0.35) { this.solve(la, new V3(-0.08, BODY.hipY + 0.06, -0.26)); this.solve(ra, new V3(0.08, BODY.hipY + 0.06, -0.26)); }
      else {
        let pulse = 0;
        CLAPS.forEach((tc) => { pulse = Math.max(pulse, Math.exp(-(((ck - tc) / 0.06) ** 2))); });
        const gap = 0.02 + 0.26 * (1 - pulse);
        this.solve(la, new V3(-gap, BODY.shY - 0.05 + pulse * 0.08, 0.36)); this.solve(ra, new V3(gap, BODY.shY - 0.05 + pulse * 0.08, 0.36));
        sy *= 1 - 0.06 * pulse; sx *= 1 + 0.03 * pulse;
        this.head.rotation.x = -0.12 * pulse;
      }
    }
    if (ck >= 0) {
      if (onWall) {
        if (ck >= 0.5 && !this.puffed) {
          this.puffed = true;
          this.limbs[1].end.getWorldPosition(tmpV);
          chalkBurst(tmpV.clone(), 14, 1.0);
          popText('후~', tmpV.clone().add(new V3(0, 0.2, 0)), 0.24);
        }
      } else {
        while (this.clapIdx < CLAPS.length && ck >= CLAPS[this.clapIdx]) {
          const i = this.clapIdx++;
          const a = this.limbs[0].end.getWorldPosition(new V3()), b = this.limbs[1].end.getWorldPosition(new V3());
          chalkClap(this, i, a.lerp(b, 0.5));
        }
      }
    }
    this.rig.scale.set(sx, sy, sx);
    const gy = groundY(p.x, p.z);
    this.shadow.position.set(p.x, gy + 0.015, p.z);
    const s = clamp(1 - (p.y - gy) / 5, 0.3, 1);
    this.shadow.scale.setScalar(s);
    this.shadow.material.opacity = s;
  }
  dispose() {
    scene.remove(this.group); scene.remove(this.shadow);
    disposeSprite(this.tag);
    if (this.bubble) disposeSprite(this.bubble);
    if (this.chatBubble) disposeSprite(this.chatBubble);
    clearTimeout(this.bubbleT); clearTimeout(this.chatT);
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
    if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt)); else p.vel.multiplyScalar(0.985);
    p.sp.position.addScaledVector(p.vel, dt);
    if (p.pop) p.sp.scale.copy(p.base).multiplyScalar(p.life < 0.12 ? 0.4 + (p.life / 0.12) * 0.9 : 1.3 - Math.min(0.3, (p.life - 0.12) * 1.5));
    else if (p.grow) p.sp.scale.addScalar(p.grow * dt);
    p.sp.material.opacity = (p.alpha ?? 1) * Math.min(1, (1 - p.life / p.max) * 2);
  }
  for (let i = floorMarks.length - 1; i >= 0; i--) {
    const fm = floorMarks[i];
    fm.t += dt;
    fm.mesh.material.opacity = 0.75 * clamp(1 - (fm.t - 15) / 10, 0, 1);
    if (fm.t > 25) { scene.remove(fm.mesh); fm.mesh.material.dispose(); floorMarks.splice(i, 1); }
  }
}

// ----- 초크 쫙쫙 팡팡 -----
const CLAPS = [0.5, 0.78, 1.1];
const floorMarks = [];
const ringTex = canvasTex(128, 128, (g) => { g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 10; g.shadowColor = '#fff'; g.shadowBlur = 12; g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.stroke(); });
const blotchTex = canvasTex(128, 128, (g) => {
  const r = mulberry(7);
  for (let i = 0; i < 26; i++) {
    const x = 64 + (r() - 0.5) * 70, y = 64 + (r() - 0.5) * 70, rad = 6 + r() * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
});
Sound.clap = function (big, vol = 1) {
  this.tone(big ? 900 : 1500, 0.05, 'square', 0.06 * vol);
  this.tone(big ? 170 : 260, big ? 0.2 : 0.07, 'triangle', 0.14 * vol, 0, -70);
  if (big) this.tone(2400, 0.12, 'sawtooth', 0.025 * vol, 0.02, -1800);
};
function chalkBurst(pos, n, power) {
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthWrite: false }));
    sp.position.copy(pos);
    sp.scale.setScalar(0.06 + Math.random() * 0.1);
    scene.add(sp);
    const d = new V3(Math.random() - 0.5, Math.random() - 0.35, Math.random() - 0.5).normalize();
    particles.push({ sp, vel: d.multiplyScalar(power * (1.5 + Math.random() * 2.5)), g: -0.25, drag: 3.2, life: 0, max: 1.2 + Math.random() * 1.2, grow: 0.35 * power, alpha: 0.95 });
  }
  // 둥실 초크 구름
  for (let i = 0; i < Math.round(n / 5); i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthWrite: false }));
    sp.position.copy(pos).add(new V3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.3));
    sp.scale.setScalar(0.3 + Math.random() * 0.3 * power);
    scene.add(sp);
    particles.push({ sp, vel: new V3((Math.random() - 0.5) * 0.6, 0.15 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6), g: 0, drag: 0.8, life: 0, max: 2.2 + Math.random() * 1.3, grow: 0.3 * power, alpha: 0.42 });
  }
}
function popText(text, pos, h) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = '64px "Black Han Sans", sans-serif';
  g.font = font;
  const w = Math.ceil(g.measureText(text).width + 30);
  c.width = w; c.height = 90;
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#e3262b'; g.lineJoin = 'round';
  g.strokeText(text, w / 2, 48); g.fillStyle = '#fff'; g.fillText(text, w / 2, 48);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sp.renderOrder = 12;
  sp.position.copy(pos).add(new V3((Math.random() - 0.5) * 0.3, 0, 0));
  const base = new V3((w / 90) * h, h, 1);
  sp.scale.copy(base);
  scene.add(sp);
  particles.push({ sp, vel: new V3(0, 0.9, 0), g: 0, drag: 2, life: 0, max: 0.85, pop: true, base, alpha: 1 });
}
function shockRing(pos, size) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthWrite: false }));
  sp.position.copy(pos); sp.scale.setScalar(0.15);
  scene.add(sp);
  particles.push({ sp, vel: new V3(), g: 0, drag: 0, life: 0, max: 0.4, grow: size * 4.5, alpha: 0.9 });
}
function floorMark(pos) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blotchTex, transparent: true, depthWrite: false, opacity: 0.75 }));
  mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = Math.random() * 6;
  mesh.position.set(pos.x + (Math.random() - 0.5) * 0.3, groundY(pos.x, pos.z) + 0.02 + floorMarks.length * 0.0005, pos.z + (Math.random() - 0.5) * 0.3);
  mesh.scale.setScalar(0.9 + Math.random() * 0.7);
  scene.add(mesh);
  floorMarks.push({ mesh, t: 0 });
  if (floorMarks.length > 25) { const o = floorMarks.shift(); scene.remove(o.mesh); o.mesh.material.dispose(); }
}
function chalkClap(av, i, pos) {
  const big = i === CLAPS.length - 1;
  chalkBurst(pos, big ? 48 : 16, big ? 2.4 : 1.2);
  popText(big ? '팡!!' : '쫙!', pos.clone().add(new V3(0, 0.3, 0)), big ? 0.42 : 0.28);
  shockRing(pos, big ? 2.2 : 0.9);
  const dist = me ? me.group.position.distanceTo(pos) : 0;
  Sound.clap(big, av === me ? 1 : clamp(1 - dist / 12, 0, 0.6));
  if (!big) return;
  if (av === me) camCtl.shake = 0.12;
  if (av.group.position.y - groundY(av.group.position.x, av.group.position.z) < 0.05) floorMark(av.group.position);
  // 주변 사람 기침
  const near = [...npcs.map((n) => n.av), ...[...Net.peers.values()].map((p) => p.av), me].filter((o) => o && o !== av && o.group.position.distanceTo(pos) < 2.8);
  near.forEach((o, k) => {
    if (o === me ? Math.random() < 0.6 : Math.random() < 0.75) {
      setTimeout(() => o.say(pick(['콜록콜록 😷', '먼지 미쳤다 ㅋㅋ', '초크 아껴 써요~', '눈에 들어갔어!', '에취!']), 1800), 350 + k * 300);
    }
  });
}

// =================================================================
// 입력
// =================================================================
const keys = new Set();
const joy = { x: 0, y: 0, id: null };
const camCtl = { yaw: 0, pitch: 0.3, dist: 5, lastDrag: -9999, pointers: new Map(), pinch: 0 };
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
    if (document.querySelector('dialog[open]')) return;
    if (pl.mode === 'inst' && !e.repeat && instKey(e.code)) { e.preventDefault(); return; }
    if (pl.mode === 'route' && !e.repeat && routeKey(e.code)) { e.preventDefault(); return; }
    if (e.code === 'Enter') { e.preventDefault(); openChat(); return; }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') jumpPress();
    if (e.code === 'KeyE') grabToggle();
    if (e.code === 'KeyC') useChalk();
    if (e.code === 'KeyR') toggleSit();
    if (e.code === 'Digit1') setTech('flag');
    if (e.code === 'Digit2') setTech('inside');
    if (e.code === 'Digit3') setTech('outside');
    if (e.code === 'KeyH') toggleHang();
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
  const ray = new THREE.Raycaster();
  el.addEventListener('pointerdown', (e) => { camCtl.downAt = [e.clientX, e.clientY]; });
  el.addEventListener('click', (e) => {
    if (!camCtl.downAt || Math.hypot(e.clientX - camCtl.downAt[0], e.clientY - camCtl.downAt[1]) > 10) return;
    if (pl.mode === 'route') { routeTap(e.clientX, e.clientY); return; }
    const r = el.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(billboards)[0];
    if (hit && hit.distance < 14) openShop();
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
  $('#btn-act1').addEventListener('click', act1);
  document.querySelectorAll('[data-tech]').forEach((b) => b.addEventListener('click', () => setTech(b.dataset.tech)));
  $('#btn-act2').addEventListener('click', act2);
  $('#btn-chat').addEventListener('click', openChat);
  const icv = $('#inst-cv');
  icv.addEventListener('pointerdown', instPointerDown);
  icv.addEventListener('pointermove', instPointerMove);
  icv.addEventListener('pointerup', instPointerUp);
  icv.addEventListener('pointercancel', instPointerUp);
  $('#inst-hip').addEventListener('click', instToggleHip);
  $('#qte').addEventListener('click', () => { if (R.mash) mashTap(); else if (R.qte) qteResult(true); });
  $('#btn-up').addEventListener('click', routeAuto);
  $('#btn-cere').addEventListener('click', startCeremony);
  // 박자 게임: 화면 어디든 누르는 순간 판정 (반응 빠르게 pointerdown)
  window.addEventListener('pointerdown', (e) => { if (R.rhythm) { rhythmTap(); e.preventDefault(); e.stopPropagation(); } }, true);
  $('#inst-flag').addEventListener('click', instFlag);
  $('#inst-auto').addEventListener('click', instToggleAuto);
  $('#inst-down').addEventListener('click', () => { if (pl.mode === 'inst') letGo('down'); });
  window.addEventListener('resize', () => { if (inst.on) resizeInst(); });
  $('#chatlog').addEventListener('click', () => { if (document.body.classList.contains('touch')) openChat(); });
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
const SPAWN = m([435, 985]);
const pl = {
  av: null, mode: 'walk', pos: new V3(SPAWN[0], 0, SPAWN[1]), vel: new V3(), vy: 0, yaw: Math.PI,
  strip: null, u: 0, v: 0, du: 0, dv: 0, t: 0, launch: null, problem: null, topped: false, topT: 0,
  pump: 0, charging: false, charge: 0, chalkReady: true, mountCand: null,
  sitting: false, runToggle: false, campusToggle: false, hanging: false, hangT: 0, hangHold: null, usedFeet: false, dustT: 0,
};
const shiftDown = () => keys.has('ShiftLeft') || keys.has('ShiftRight');
function isCampus() { return pl.mode === 'climb' && !pl.hanging && !pl.tech && (shiftDown() || pl.campusToggle); }
function isRunning() { return shiftDown() || pl.runToggle; }
function toggleSit() {
  if (pl.mode !== 'walk') { toast('앉기는 매트 위에서만! 벽에서는 H로 매달리기'); return; }
  if (pl.pos.y - groundY(pl.pos.x, pl.pos.z) > 0.01) return;
  pl.sitting = !pl.sitting;
  me.sitting = pl.sitting;
  if (!pl.sitting) { onStandUp(); Net.sync(true); return; }
  if (pl.sitting) {
    pl.sitT = 0; pl.nagN = 0; pl.nagNext = 9 + Math.random() * 3;
    me.say(pick(['휴~', '잠깐 쉬어갈게요', '매트 최고…', '팔 털어야지']), 1600);
    const n = npcs.find((x) => x.state === 'idle' && x.av.group.position.distanceTo(me.group.position) < 4);
    if (n) setTimeout(() => n.av.say(pick(['같이 쉬어요~', '물 마실래요?', '오늘 몇 개 깼어요?'])), 900);
  }
  Net.sync(true);
}
function standUp() { if (!pl.sitting) return; pl.sitting = false; me.sitting = false; onStandUp(); Net.sync(true); }
// ----- 앉아만 있으면 잔소리 -----
const NAGS = [
  '쉬는 거 좋지~ 근데 너무 오래 쉬는 거 아냐?',
  '너는 맨날 앉아서 쉬냐? 등반은 언제 할래?',
  '매트 지박령 등장 👻',
  '여기 매트 대여료 받습니다 💸',
  '노랑 V0라도 하나 하자… 응?',
];
const NAGS_MORE = ['등반은 언제 할래?', '엉덩이에 뿌리 내리겠다 🌱', '펌핑 다 풀렸잖아 ㅋㅋ', '오늘 몇 개 깼어? …0개?',
  '사장님 여기 앉아만 있는 사람 있어요', '초크값은 냈니?', '암장에 쉬러 왔어? ㅋㅋㅋ', '눈 감으면 잔다 진짜'];
function nagger() {
  const pos = me.group.position;
  const idle = npcs.filter((n) => n.state === 'idle').sort((a, b) => a.av.group.position.distanceTo(pos) - b.av.group.position.distanceTo(pos));
  return idle[0] || null;
}
function updateSitNag(dt) {
  if (!pl.sitting) return;
  pl.sitT += dt;
  if (pl.sitT < pl.nagNext) return;
  const n = nagger();
  pl.nagNext = pl.sitT + 8 + Math.random() * 5;
  if (!n) return;
  const line = pl.nagN < NAGS.length ? NAGS[pl.nagN] : pick(NAGS_MORE);
  pl.nagN++;
  const g = n.av.group;
  g.rotation.y = Math.atan2(me.group.position.x - g.position.x, me.group.position.z - g.position.z);
  n.av.sitting = false;
  setTimeout(() => { if (n.state === 'idle') n.av.sitting = true; }, 3500);
  n.av.say(line, 3200);
  if (pl.nagN === 3) setTimeout(() => toast('🏅 칭호 획득: 매트 지박령 👻', 2600), 1200);
  if (pl.nagN === 3) { Store.data.titles = Store.data.titles || {}; Store.data.titles.mat = true; Store.save(); }
  if (pl.nagN === 2) setTimeout(() => me.say(pick(['아 조금만 더…', '5분만…', '지금 일어나려 했어!']), 2000), 1800);
  if (pl.nagN === 2) westPraise('sit', 3800);
}
function onStandUp() {
  if ((pl.nagN || 0) >= 2) {
    const n = nagger();
    if (n) setTimeout(() => n.av.say(pick(['오 드디어 일어났다!', '가자가자~!!', '그래 그거야 🔥']), 2200), 400);
  }
  pl.nagN = 0; pl.sitT = 0;
}
function toggleHang() {
  if (pl.mode !== 'climb') { toast('매달리기는 벽에서! 매트에서는 R로 앉아 쉬기'); return; }
  if (pl.hanging) { stopHang(); return; }
  const r = nearestGrab(pl.strip, pl.u, pl.v, pl.problem);
  if (!r || r.d > REACH) return;
  pl.hanging = true; pl.hangT = 0; pl.hangHold = r.h;
  pl.u = r.h.u; pl.v = r.h.v;
  me.hanging = true;
  me.say(pick(['대롱대롱~', '팔 쭉!', '버틴다…']), 1400);
  Net.sync(true);
}
function stopHang(silent) {
  if (!pl.hanging) return;
  pl.hanging = false; me.hanging = false;
  const t = pl.hangT, best = Store.data.bestHang || 0;
  if (!silent && t > 1) {
    if (t > best) { Store.data.bestHang = t; Store.save(); toast(`🙌 매달리기 신기록! ${t.toFixed(1)}초`, 2400); Sound.top(); westPraise('hang', 800); }
    else toast(`🙌 매달리기 ${t.toFixed(1)}초 (최고 ${best.toFixed(1)}초)`, 2000);
  } else if (t > best && t > 1) { Store.data.bestHang = t; Store.save(); }
  Net.sync(true);
}
function setTech(t, silent) {
  if (t && pl.mode !== 'climb') { toast('기술은 벽에 매달려서 써요!'); return; }
  pl.tech = pl.tech === t ? null : t;
  if (pl.tech) { pl.campusToggle = false; stopHang(); }
  if (me) me.tech = pl.tech;
  if (pl.tech && !silent) {
    popText(TECHS[pl.tech].n + '!', me.group.position.clone().add(new V3(0, 1.6, 0)), 0.3);
    Sound.tone(660, 0.06, 'triangle', 0.06);
    if (Math.random() < 0.4) westPraise('tech', 900);
  }
  Net.sync(true);
}
function act1() { if (pl.mode === 'walk') toggleSit(); else if (pl.mode === 'climb') toggleHang(); }
function act2() {
  if (pl.mode === 'walk') { pl.runToggle = !pl.runToggle; toast(pl.runToggle ? '🏃 달리기 ON' : '걷기', 1000); }
  else { pl.campusToggle = !pl.campusToggle; toast(pl.campusToggle ? '🦍 캠퍼싱 ON — 발 없이 팔로만!' : '캠퍼싱 OFF', 1200); }
}
let me = null;
let guide = null, guideMesh = null;

function nearestGrab(st, u, v, problem, exclude) {
  let best = null, bd = Infinity;
  for (const h of st.holds) {
    if (problem && h.problem !== problem) continue;
    if (h.tap) continue; // 터치 홀드는 못 잡음
    if (exclude && uvDist(st, h.u, h.v, exclude.u, exclude.v) < 0.55) continue;
    const d = uvDist(st, h.u, h.v, u, v);
    if (d < bd) { bd = d; best = h; }
  }
  return best ? { h: best, d: bd } : null;
}
function techBonus(h, u, v) {
  const dv = h.v - v, du = Math.abs(h.u - u);
  if (pl.tech === 'inside' && dv > 0) return 0.25;
  if (pl.tech === 'outside' && du > Math.abs(dv)) return 0.3;
  return 0;
}
function canHold(u, v) {
  const st = pl.strip;
  for (const h of st.holds) {
    if (pl.problem && h.problem !== pl.problem) continue;
    if (h.tap) continue;
    if (uvDist(st, h.u, h.v, u, v) <= REACH + techBonus(h, u, v)) return true;
  }
  return false;
}
function signedDu(st, a, b) { let d = a - b; if (st.closed) { d = ((d % st.L) + st.L * 1.5) % st.L - st.L / 2; } return d; }
// 다이노 계획: 방향에 있는 목표 홀드와 필요한 힘(0~1), 게이지 초록 칸 폭
function planDyno(fromU, fromV, dirU, dirV, launchQ) {
  const st = pl.strip;
  let best = null, bs = Infinity;
  for (const h of st.holds) {
    if (pl.problem && h.problem !== pl.problem) continue;
    const du = signedDu(st, h.u, fromU), dv = h.v - fromV, d = Math.hypot(du, dv);
    if (d < (h.tap ? 0.3 : REACH * 0.8) || d > 3.4) continue;
    const dot = (du * dirU + dv * dirV) / d;
    if (dot < 0.55) continue;
    const sol = dynoSolve(du, dv);
    if (sol.p > 1.02) continue;
    const sc = d - dot * 0.6;
    if (sc < bs) { bs = sc; best = { h, du, dv, ...sol }; }
  }
  if (!best) return null;
  const q = Math.min(launchQ, best.h.q);
  best.width = 0.07 + 0.27 * q;
  best.center = clamp(best.p, 0.06, 0.94);
  return best;
}
function dynoSolve(du, dv) {
  const g = 9.8;
  let vy, T;
  if (dv > 0.05) { vy = Math.sqrt(2 * g * (dv + 0.04)); T = vy / g; }
  else { vy = 2.2; T = (vy + Math.sqrt(vy * vy - 2 * g * dv)) / g; }
  const vu = du / T;
  const sp = Math.hypot(vu, vy);
  return { vu, vy, p: (sp - 2.4) / 3.4 };
}
function currentHoldQ() { const r = nearestGrab(pl.strip, pl.u, pl.v, pl.problem); return r ? r.h.q : 1; }
function bodyPos(st, u, v, out = new V3(), dropMax = BODY_DROP) {
  const drop = Math.min(dropMax, v - MAT_H - 0.02);
  const [s] = segAt(st, u);
  surf(st, u, v - drop, out).addScaledVector(s.n3, 0.3);
  return out;
}

// 손·발이 실제로 잡을/디딜 홀드 찾기
function gripPoints(st, u, v, problem, out) {
  const [s] = segAt(st, u);
  const g = out || [new V3(), new V3(), new V3(), new V3()];
  [-1, 1].forEach((sd, i) => {
    const r = nearestGrab(st, u + sd * 0.24, v - 0.05, problem);
    if (r && r.d < 0.34) g[i].copy(r.h.pos); else surf(st, u + sd * 0.24, v - 0.05, g[i]);
    g[i].addScaledVector(s.n3, 0.07);
    const fv = Math.max(0.36, v - 0.94);
    const f = nearestGrab(st, u + sd * 0.18, fv, null);
    if (f && f.d < 0.4) g[i + 2].copy(f.h.pos); else surf(st, u + sd * 0.18, fv, g[i + 2]);
    g[i + 2].addScaledVector(s.n3, 0.06);
  });
  return g;
}

function findMount() {
  if (pl.pos.y - groundY(pl.pos.x, pl.pos.z) > 0.5) return null;
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
  if (!prob) { st.problems.forEach((p) => { const d = uvDist(st, p.start.u, p.start.v, u, v); if (d <= REACH * 1.6 && d < bd) { bd = d; prob = p; } }); }
  if (!prob) { toast('여기엔 문제가 없어요 — 시작 홀드(S) 앞에서 잡아요 (★ 문제·기록 → 안내)', 2400); return; }
  const conflicts = conflictsAt(bodyPos(st, u, v), 2.0);
  pl.mode = 'climb'; pl.strip = st; pl.u = u; pl.v = v; pl.problem = prob; pl.topped = false;
  pl.climbStart = Date.now();
  pl.usedFeet = false; pl.hanging = false;
  standUp();
  me.setClimbing(true);
  me.sitting = false;
  setFocus(prob);
  if (prob) {
    if (guide === prob) setGuide(null);
    toast(`${problemLabel(prob)} 시작! 손·발·엉덩이를 끌어서 올라가요`, 2600);
  } else toast('자유 등반 — 아무 홀드나 잡아도 돼요', 1800);
  if (conflicts.length) {
    const c = conflicts[0];
    c.av.say(pick(['저 먼저 출발했어요~ 😅', '어… 저 지금 하는 중인데요?', '새치기 멈춰!']), 2600);
    setTimeout(() => Manner.add(-1, '새치기 노노! 선출발자 우선'), 900);
    if (staffMayNag(0.2)) setTimeout(() => staffSay(pick(STAFF_LINES.cutin), 2200), 1800);
  } else if (ety.waitedFor && Date.now() - ety.waitedAt < 30000) {
    const w = ety.waitedFor; ety.waitedFor = null;
    w.av.say('기다려줘서 고마워요 🙏', 2400);
    setTimeout(() => Manner.add(+0.5, '기다릴 줄 아는 클라이머'), 900);
    westPraise('yield', 2000);
  }
  Sound.grab();
  pl.usedFeet = true; enterRoute(prob, st);
  Net.sync(true);
}
function letGo(reason) {
  exitInstanceUI();
  endRoute();
  const st = pl.strip;
  const [s] = segAt(st, pl.u);
  bodyPos(st, pl.u, pl.v, pl.pos);
  pl.vel.set(s.n3.x, 0, s.n3.z).multiplyScalar(reason === 'down' ? 1.2 : 1.8);
  pl.vy = reason === 'down' ? 1.2 : 0;
  pl.mode = 'fall';
  pl.fallReason = reason;
  stopHang(reason === 'down' ? false : true);
  me.campus = false;
  setTech(null, true);
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
    if (reason !== 'crash' && Math.random() < 0.7) westPraise('fall', 1500);
    if (staff.av && staff.av.group.position.distanceTo(me.group.position) < 12 && staffMayNag(0.25)) setTimeout(() => staffSay(pick(STAFF_LINES.care), 2600), 2600);
  }
  Net.sync(true);
}

function grabToggle() {
  if (pl.mode === 'walk') {
    const c = findMount();
    if (c) mount(c); else toast('벽 가까이 가서 눌러주세요');
  } else if (pl.mode === 'climb' || pl.mode === 'route') {
    const nb = ety.near;
    if (nb && nb.start < pl.climbStart && !pl.topped) {
      nb.av.say(pick(['감사합니다~ 🙏', '양보 천사다…', '다음엔 먼저 하세요!']), 2400);
      setTimeout(() => Manner.add(+0.5, '양보는 매너의 꽃'), 700);
      westPraise('yield', 1800);
    }
    letGo('down');
  }
}
function jumpPress() {
  if (pl.mode === 'walk' && pl.sitting) { standUp(); return; }
  if (pl.mode === 'climb' && pl.hanging) stopHang();
  if (pl.mode === 'walk') { if (pl.pos.y - groundY(pl.pos.x, pl.pos.z) <= 0.001) { pl.vy = 5.2; Sound.tone(300, 0.08, 'sine', 0.06, 0, 200); } return; }
  if (pl.mode === 'climb') {
    const [ix, iy] = input();
    let dx = ix * climbSign(), dy = iy;
    if (Math.hypot(dx, dy) < 0.3) { dx = 0; dy = 1; }
    const l = Math.hypot(dx, dy);
    pl.dynoDir = [dx / l, dy / l];
    pl.launchQ = currentHoldQ();
    pl.plan = planDyno(pl.u, pl.v, dx / l, dy / l, pl.launchQ);
    pl.gaugeT = 0; pl.charging = true; pl.charge = 0;
    pl.gaugeSpeed = 1.15 + (1 - pl.launchQ) * 0.7 + (pl.problem ? pl.problem.level * 0.05 : 0);
    return;
  }
  if (pl.mode === 'air') tryDoubleDyno();
  if (pl.mode === 'route' && R.gauge) routeFireGauge();
}
function tryDoubleDyno() {
  if (pl.doubleUsed) return;
  pl.doubleUsed = true;
  const st = pl.strip;
  let tap = null, td = Infinity;
  for (const h of st.holds) { if (!h.tap || (pl.problem && h.problem !== pl.problem)) continue; const d = uvDist(st, h.u, h.v, pl.u, pl.v); if (d < td) { td = d; tap = h; } }
  // 터치 홀드가 없으면 아무 홀드나 살짝 치고 튀기기 (창이 더 좁음)
  if (!tap) { const r = nearestGrab(st, pl.u, pl.v, pl.problem, pl.launch); if (r) { tap = r.h; td = r.d; } }
  const win = tap ? (tap.tap ? 0.2 : 0.12) + 0.2 * tap.q : 0;
  if (!tap || td > win) {
    popText('삐끗!', me.group.position.clone().add(new V3(0, 1.5, 0)), 0.26);
    Sound.tone(180, 0.15, 'square', 0.06);
    return;
  }
  const plan = planDyno(tap.u, tap.v, 0, 1, tap.q);
  if (!plan) { popText('삐끗!', me.group.position.clone().add(new V3(0, 1.5, 0)), 0.26); return; }
  pl.u = tap.u; pl.v = tap.v;
  pl.du = plan.vu; pl.dv = plan.vy;
  pl.launch = { u: tap.u, v: tap.v };
  pl.t = 0; pl.didDouble = true;
  pl.pump += 4;
  popText('더블!!', me.group.position.clone().add(new V3(0, 1.5, 0)), 0.38);
  chalkBurst(surf(st, tap.u, tap.v), 10, 0.8);
  Sound.tone(520, 0.1, 'triangle', 0.1); Sound.tone(780, 0.14, 'triangle', 0.1, 0.06);
}
function jumpRelease(cancel) {
  if (!pl.charging) return;
  pl.charging = false;
  if (cancel || pl.mode !== 'climb') { pl.charge = 0; return; }
  const pos = pl.charge, plan = pl.plan;
  let verdict = 'free';
  if (plan) {
    const diff = Math.abs(pos - plan.center);
    verdict = diff <= plan.width * 0.22 ? 'perfect' : diff <= plan.width / 2 ? 'good' : 'miss';
  }
  const head = me.group.position.clone().add(new V3(0, 1.6, 0));
  if (verdict === 'perfect' || verdict === 'good') {
    pl.du = plan.vu; pl.dv = plan.vy;
    popText(verdict === 'perfect' ? 'PERFECT!' : 'GOOD!', head, verdict === 'perfect' ? 0.36 : 0.3);
    pl.pump += verdict === 'perfect' ? 2 : 5;
  } else {
    const [dx, dy] = plan ? [plan.du / Math.hypot(plan.du, plan.dv), plan.dv / Math.hypot(plan.du, plan.dv)] : pl.dynoDir;
    const sp = 2.4 + 3.4 * pos;
    pl.du = dx * sp; pl.dv = dy * sp;
    if (verdict === 'miss') popText(pos < plan.center ? '힘 부족…' : '너무 셌다!', head, 0.26);
    pl.pump += 5;
  }
  pl.launch = { u: pl.u, v: pl.v };
  pl.mode = 'air'; pl.t = 0; pl.doubleUsed = false; pl.didDouble = false;
  pl.charge = 0; pl.plan = null;
  stopHang(true);
  Sound.tone(220, 0.25, 'triangle', 0.1, 0, 400);
  Net.sync(true);
}
function useChalk() {
  if (!pl.chalkReady) return;
  if (chalkLeft() <= 0) {
    if (Store.data.chalkGift !== todayStr()) {
      Store.data.chalkGift = todayStr(); Store.data.chalk = 3; Store.save(); updateChalkBadge();
      staffSay('초크도 없이 다녀요? …제 거 조금 써요. 오늘만이에요, 다음엔 챙겨와요 🐯', 3000);
    } else { toast('🤍 초크가 다 떨어졌어요', 1800); return; }
  }
  const liquid = (Store.data.liquid || 0) > 0;
  if (liquid) Store.data.liquid--; else Store.data.chalk--;
  Store.save(); updateChalkBadge();
  pl.chalkReady = false;
  $('#btn-chalk').disabled = true;
  Sound.chalk();
  me.chalk();
  Net.event('chalk');
  onChalkUsed();
  pl.pump = Math.max(0, pl.pump - (liquid ? 28 : 18));
  if (liquid) popText('리퀴드!', me.group.position.clone().add(new V3(0, 1.9, 0)), 0.24);
  if (pl.mode === 'climb' || pl.mode === 'route') me.say(pick(['슥슥', '후~ 초크 충전']), 1000);
  else setTimeout(() => me.say(pick(['쫙쫙 팡팡!', '가루 날린다~ 💨', '초크 풀충전!']), 1400), 1150);
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
  const first = Store.data.sends[p.id] === 1;
  const reward = (REWARD[p.rank] || 3000) * (first ? 2 : 1);
  setTimeout(() => addMoney(reward, first ? '첫 완등 보너스 ×2' : '완등 보상'), 1200);
  Net.event('top', { pid: p.id, text: line });
  addFeed(Store.data.name, p, true);
  logChat('', '', `🔥 ${Store.data.name}님 ${problemLabel(p)} 완등!`, 'sys');
  toast(`🔥 ${problemLabel(p)} 완등! (총 ${Store.data.sends[p.id]}번째)`, 3000);
  if (!pl.usedFeet) {
    Store.data.campus = Store.data.campus || {};
    Store.data.campus[p.id] = (Store.data.campus[p.id] || 0) + 1; Store.save();
    setTimeout(() => { toast('🦍 캠퍼싱 완등! 발 하나도 안 썼어요', 2800); fireConfetti(me.group.position.clone().add(new V3(0, 1.4, 0)), 20); }, 1500);
    setTimeout(() => { const n = npcs.find((x) => x.state === 'idle'); if (n) n.av.say(pick(['고릴라다… 🦍', '발 안 쓰고?!', '팔 미쳤다'])); }, 2000);
    westPraise('campus', 4200);
  }
  npcs.forEach((n, k) => { if (n.state === 'idle') setTimeout(() => n.av.say(pick(LINES.cheer)), 300 + k * 450); });
  const firstSend = Store.data.sends[p.id] === 1;
  if ((firstSend ? westCanShoot() : p.rank >= 6 && westCanShoot(0.5))) { pl.topHoldMax = 5.5; westPhoto(me, `${Store.data.name} — ${problemLabel(p)} 완등!`, segAt(p.strip, pl.u)[0].n3); }
  else { pl.topHoldMax = 3; westPraise('top', 600); }
  if (staff.av && staff.av.group.position.distanceTo(me.group.position) < 14 && staffMayNag(0.2)) setTimeout(() => staffSay(pick(STAFF_LINES.praise), 2600), 3500);
  checkFestival();
}

function updatePlayer(dt) {
  if (pl.mode === 'route') { if (R.on) routeStep(dt); return; }
  if (pl.mode === 'inst') {
    if (inst.on) { updateInstance(dt); if (inst.on && ['lf', 'rf'].some((k) => inst.limbs[k].hold)) pl.usedFeet = true; }
    return;
  }
  const [ix, iy] = input();
  if (pl.mode === 'walk') {
    const fx = -Math.sin(camCtl.yaw), fz = -Math.cos(camCtl.yaw);
    const rx = Math.cos(camCtl.yaw), rz = -Math.sin(camCtl.yaw);
    let mx = fx * iy + rx * ix, mz = fz * iy + rz * ix;
    if (pl.sitting) { if (Math.hypot(ix, iy) > 0.2) standUp(); else { mx = 0; mz = 0; } }
    if (pl.stunT > 0) { pl.stunT -= dt; mx = 0; mz = 0; }
    const running = isRunning() && Math.hypot(mx, mz) > 0.1;
    pl.isRunningNow = running;
    const spd = running ? 6.2 : 3.4;
    if (running && pl.pos.y - groundY(pl.pos.x, pl.pos.z) < 0.01 && (pl.dustT -= dt) < 0) { pl.dustT = 0.16; chalkPuff(pl.pos.clone().add(new V3(0, 0.05, 0)), 2); }
    pl.vel.x = lerp(pl.vel.x, mx * spd, damp(12, dt));
    pl.vel.z = lerp(pl.vel.z, mz * spd, damp(12, dt));
    const nx = pl.pos.x + pl.vel.x * dt, nz = pl.pos.z + pl.vel.z * dt;
    if (walkable(nx, nz)) { pl.pos.x = nx; pl.pos.z = nz; }
    else if (walkable(nx, pl.pos.z)) pl.pos.x = nx;
    else if (walkable(pl.pos.x, nz)) pl.pos.z = nz;
    if (!paidToday() && pl.pos.z < GATE_Z) {
      pl.pos.z = GATE_Z + 0.02; pl.vel.z = Math.max(0, pl.vel.z);
      if (performance.now() - watch.gateMsg > 2500) {
        watch.gateMsg = performance.now();
        toast('🐯 2만원 내야 입장 가능! 무호K를 기다려요');
        if (staff.state === 'collect') { staffSay('계산부터 하고 가요~ 그냥 들어가면 안 돼요 🐯', 1800); setTimeout(openPay, 900); }
      }
    }
    if (Math.hypot(mx, mz) > 0.1) pl.yaw = lerpAngle(pl.yaw, Math.atan2(mx, mz), damp(10, dt));
    pl.vy -= 16 * dt;
    pl.pos.y += pl.vy * dt;
    const gy = groundY(pl.pos.x, pl.pos.z);
    if (pl.pos.y <= gy) { if (pl.vy < -4) me.squash(); pl.pos.y = gy; pl.vy = 0; }
    pl.pump = Math.max(0, pl.pump - (pl.sitting ? 30 : 12) * dt);
    pl.mountCand = findMount();
    me.group.position.lerp(pl.pos, damp(20, dt));
    me.group.rotation.y = lerpAngle(me.group.rotation.y, pl.yaw, damp(14, dt));
  } else if (pl.mode === 'climb') {
    const st = pl.strip, sg = climbSign();
    const campus = isCampus();
    me.campus = campus;
    if (pl.hanging && (Math.hypot(ix, iy) > 0.3)) stopHang();
    const spdU = campus ? 0.9 : 1.15, spdV = campus ? (iy > 0 ? 1.75 : 1.0) : 1.15;
    const nu = wrapU(st, pl.u + ix * sg * spdU * dt), nv = clamp(pl.v + iy * spdV * dt, 0.75, st.H - 0.18);
    const moving = !pl.hanging && Math.hypot(ix, iy) > 0.1;
    if (moving && !campus) pl.usedFeet = true;
    if (pl.hanging) pl.hangT += dt;
    if (moving) {
      if (canHold(nu, nv)) { pl.u = nu; pl.v = nv; }
      else if (canHold(nu, pl.v)) pl.u = nu;
      else if (canHold(pl.u, nv)) pl.v = nv;
    }
    if (iy < -0.5 && pl.v <= 0.8) { letGo('down'); return; }
    if (pl.charging) { pl.gaugeT += dt * pl.gaugeSpeed; const ph = pl.gaugeT % 2; pl.charge = ph < 1 ? ph : 2 - ph; }
    const lvl = pl.problem ? pl.problem.level : 1;
    const hq = currentHoldQ();
    const techMul = pl.tech === 'flag' ? 0.6 : pl.tech ? 0.9 : 1;
    if (pl.hanging) pl.pump += dt * (0.8 + (1 - hq) * 0.8);
    else pl.pump += dt * (1.6 + lvl * 0.55 + (moving ? 1.1 : 0) + (1 - hq) * 1.6) * (campus ? 2 : 1) * techMul * (1.2 - 0.35 * (gear().f + gear().e + gear().h) / 3) * gear().pumpMul;
    pl.holdName = (nearestGrab(st, pl.u, pl.v, pl.problem) || {}).h?.type?.n || '';
    // 닿을 듯 말 듯한 홀드 힌트
    if (iy > 0.5 && moving && !canHold(pl.u, nv) && (pl.stuckT = (pl.stuckT || 0) + dt) > 0.8) {
      pl.stuckT = 0;
      const far = st.holds.find((h) => (!pl.problem || h.problem === pl.problem) && !h.tap && h.v > pl.v && uvDist(st, h.u, h.v, pl.u, pl.v) < REACH + 0.3);
      if (far && !pl.tech) toast('닿을 듯 말 듯… 인사이드 스텝(2)이나 다이노로!', 1800);
      else if (!far) toast('너무 멀어요 — Space 꾹 → 초록 칸에서 떼서 다이노!', 1800);
    }
    if (pl.problem && !pl.topped && uvDist(st, pl.u, pl.v, pl.problem.top.u, pl.problem.top.v) < 0.5) sendProblem(pl.problem);
    if (pl.topped) { pl.topT += dt; if (pl.topT > (pl.topHoldMax || 3)) { letGo('down'); return; } }
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
        if (pl.didDouble) { toast('🔥🔥 더블다이노 성공!!', 2200); Store.data.doubles = (Store.data.doubles || 0) + 1; Store.save(); westPraise('dyno', 400); }
        else if (r.h.dynoTarget) { toast('🔥 다이노 성공!', 1400); westPraise('dyno', 400); }
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
    if (pl.pos.y <= groundY(pl.pos.x, pl.pos.z)) {
      pl.vy = 0; pl.vel.set(0, 0, 0);
      let k = 0;
      const [s] = segAt(pl.strip, pl.u);
      while (!walkable(pl.pos.x, pl.pos.z) && k++ < 30) { pl.pos.x += s.n3.x * 0.1; pl.pos.z += s.n3.z * 0.1; }
      pl.pos.y = groundY(pl.pos.x, pl.pos.z);
      me.squash();
      chalkPuff(pl.pos.clone().add(new V3(0, 0.1, 0)), pl.fallReason === 'down' ? 6 : 14);
      pl.mode = 'walk'; pl.problem = null; pl.strip = null;
      Net.sync(true);
    }
    me.group.position.lerp(pl.pos, damp(25, dt));
  }
  me.airborne = pl.mode === 'air' || pl.mode === 'fall';
  if (pl.mode === 'climb') {
    me.grips = gripPoints(pl.strip, pl.u, pl.v, pl.problem, me.grips || undefined);
    if (pl.hanging && pl.hangHold) {
      const [s] = segAt(pl.strip, pl.hangHold.u);
      me.grips[0].copy(pl.hangHold.pos).addScaledVector(s.along3, -0.07).addScaledVector(s.n3, 0.07);
      me.grips[1].copy(pl.hangHold.pos).addScaledVector(s.along3, 0.07).addScaledVector(s.n3, 0.07);
    }
  } else me.grips = null;
  if (pl.mode === 'climb' || pl.mode === 'air') {
    const st = pl.strip;
    const [s] = segAt(st, pl.u);
    bodyPos(st, pl.u, pl.v, pl.pos, pl.hanging ? 1.25 : me.campus ? 1.1 : BODY_DROP);
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
  if (pl.mode === 'route' && R.on) { routeCamera(dt); return; }
  camCtl.routePos = null;
  const target = me.group.position.clone();
  const climbing = pl.mode === 'climb' || pl.mode === 'air' || pl.mode === 'inst';
  if (climbing) {
    const [s] = segAt(pl.strip, pl.u);
    target.y += 1.1;
    if (performance.now() - camCtl.lastDrag > 1500) {
      camCtl.yaw = lerpAngle(camCtl.yaw, Math.atan2(s.n3.x, s.n3.z), damp(3, dt));
      camCtl.pitch = lerp(camCtl.pitch, 0.18, damp(2, dt));
    }
  } else target.y += 1.0;
  const d = camCtl.dist;
  const dirOf = (pitch, out = new V3()) => out.set(Math.sin(camCtl.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(camCtl.yaw) * Math.cos(pitch));
  const rayHit = (pitch) => {
    const dr = dirOf(pitch);
    for (let k = 0.6; k <= d; k += 0.25) { const p = tmpV.copy(target).addScaledVector(dr, k); if (camBlocked(p.x, p.y, p.z)) return k; }
    return null;
  };
  // 벽에 가리면 카메라를 위로 올려서 벽 너머로 내려다보기 → 그래도 안 되면 가까이
  let usePitch = camCtl.pitch, use = d;
  const hit = rayHit(camCtl.pitch);
  if (hit !== null) {
    let found = false;
    for (let pp = camCtl.pitch + 0.1; pp <= Math.min(1.35, camCtl.pitch + 0.45); pp += 0.1) { if (rayHit(pp) === null) { usePitch = pp; found = true; break; } }
    if (!found) use = Math.max(1.2, hit - 0.3);
  }
  camCtl.usePitch = lerp(camCtl.usePitch ?? usePitch, usePitch, damp(usePitch > (camCtl.usePitch ?? 0) ? 10 : 3, dt));
  camCtl.useDist = lerp(camCtl.useDist || use, use, damp(use < (camCtl.useDist || use) ? 20 : 4, dt));
  const dir = dirOf(camCtl.usePitch);
  const pos = tmpV2.copy(target).addScaledVector(dir, camCtl.useDist);
  pos.y = Math.max(0.3, pos.y);
  camera.position.copy(pos);
  if (camCtl.shake > 0) {
    camCtl.shake = Math.max(0, camCtl.shake - dt * 0.5);
    camera.position.x += (Math.random() - 0.5) * camCtl.shake;
    camera.position.y += (Math.random() - 0.5) * camCtl.shake;
  }
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
  av.group.position.set(spot[0], groundY(spot[0], spot[1]), spot[1]);
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
      g.position.y = lerp(g.position.y, groundY(g.position.x, g.position.z), damp(14, dt));
      g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(dx, dz), damp(10, dt));
    }
  } else if (n.state === 'summon') {
    const tgt = n.path[0];
    if (!tgt) { n.state = 'idle'; n.next = now + 15000; const f = n.onArrive; n.onArrive = null; if (f) f(); return; }
    const dx = tgt[0] - g.position.x, dz = tgt[1] - g.position.z, d = Math.hypot(dx, dz);
    if (d < 0.1) n.path.shift();
    else {
      const sp = Math.min(d, 5 * dt);
      g.position.x += (dx / d) * sp; g.position.z += (dz / d) * sp;
      g.position.y = lerp(g.position.y, groundY(g.position.x, g.position.z), damp(14, dt));
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
      if (n.hold === p.holds.length - 1 && !n.topPose) {
        fireConfetti(surf(st, h.u, h.v), 16);
        n.av.say(pick(LINES.npcTop), 1800);
        npcs.forEach((o) => { if (o !== n && o.state === 'idle' && Math.random() < 0.7) setTimeout(() => o.av.say(pick(LINES.cheer)), 400 + Math.random() * 600); });
        n.holdT = -3.5; n.topPose = true;
        if (westCanShoot(0.05)) westPhoto(n.av, `${n.av.name} — ${problemLabel(p)} 완등!`, s.n3);
        else westPraise('top', 500);
      } else if (n.topPose) {
        n.topPose = false;
        n.state = 'drop'; n.vy = 1.2; n.dropT = 0;
      } else if (n.hold > 0 && Math.random() < 0.03 + p.level * 0.045) {
        n.av.say(pick(LINES.npcFall), 1600);
        n.state = 'drop'; n.vy = 0; n.dropT = 0;
      } else n.hold++;
    }
  } else if (n.state === 'drop') {
    n.av.setClimbing(false);
    const ngy = groundY(g.position.x, g.position.z);
    n.av.airborne = g.position.y - ngy > 0.05;
    const [s] = segAt(n.problem.strip, n.problem.holds[n.hold].u);
    n.vy -= 16 * dt;
    g.position.y += n.vy * dt;
    g.position.x += s.n3.x * 1.3 * dt; g.position.z += s.n3.z * 1.3 * dt;
    if (g.position.y <= ngy) {
      g.position.y = ngy;
      n.av.squash();
      chalkPuff(g.position.clone().add(new V3(0, 0.1, 0)), 8);
      let k = 0;
      while (!walkable(g.position.x, g.position.z, 0.15) && k++ < 30) { g.position.x += s.n3.x * 0.1; g.position.z += s.n3.z * 0.1; }
      g.position.y = groundY(g.position.x, g.position.z);
      n.state = 'rest'; n.restT = 1.2; n.av.airborne = false;
    }
  } else if (n.state === 'rest') {
    n.restT -= dt;
    if (n.restT <= 0) { n.path = planPath([g.position.x, g.position.z], n.spot); n.state = 'return'; }
  }
}

// =================================================================
// 🗣️ NPC와 대화 — Vercel 서버 함수(/api/npc)가 Claude Haiku로 대답
// =================================================================
// GitHub Pages에서 열면 Vercel 주소로 요청 (Vercel 배포 후 주소를 여기에)
const NPC_API_REMOTE = 'https://spicyclimbing.vercel.app';
function npcApiUrl() {
  const q = new URLSearchParams(location.search).get('npcapi');
  if (q) return q;
  if (location.hostname.endsWith('github.io')) return NPC_API_REMOTE ? NPC_API_REMOTE.replace(/\/$/, '') + '/api/npc' : '';
  return '/api/npc';
}
const NPC_KEYS = { 하바네로: 'habanero', 청양이: 'cheongyang', 떡볶이: 'tteokbokki' };
const NPC_FALLBACK = {
  muho: ['…네? 듣고 있었어요. 진짜로요 🐯', '물은 마셨어요? 그것부터 해요. 그냥 물어본 거예요', '다치지만 마요. 걱정한 건 아니고요 🐯'],
  west: ['오 좋아요 좋아!! 🤠', '오늘 폼 미쳤던데요?', '완등하면 사진 찍어줄게요 📸'],
  habanero: ['가자가자!!', '오늘 다이노 각이다 🔥', '한 판 더 붙자!'],
  cheongyang: ['천천히 해도 돼요.', '그 문제 발이 핵심이에요.', '쉬었다 가요.'],
  tteokbokki: ['ㅋㅋㅋ 배고프다', '나 좀만 더 쉬고 갈래~', '떡볶이 먹고 싶다 ㅋㅋ'],
};
const npcTalkState = { last: 0, hist: {}, busy: false };
function npcTargets() {
  const list = npcs.map((n) => ({ key: NPC_KEYS[n.av.name], av: n.av, name: n.av.name, npc: n }));
  if (staff.av) list.push({ key: 'muho', av: staff.av, name: '무호K' });
  if (west.av) list.push({ key: 'west', av: west.av, name: '웨스트' });
  return list.filter((t) => t.key);
}
// 이름 부르기: 띄어쓰기·호칭(쌤/님/씨/아/야) 상관없이
const NPC_ALIASES = {
  muho: ['무호', '호랑이', '호랑', '무호k', '무호케이', 'muho'],
  west: ['웨스트', '카우보이', 'west'],
  habanero: ['하바네로', '하바'],
  cheongyang: ['청양이', '청양'],
  tteokbokki: ['떡볶이', '떡볶', '떡뽁이', '떡보끼'],
};
function pickTalkTarget(text) {
  const all = npcTargets();
  const norm = text.replace(/\s+/g, '').toLowerCase();
  const byName = all.find((t) => (NPC_ALIASES[t.key] || []).some((a) => norm.includes(a)));
  if (byName) return { ...byName, called: true };
  const pos = me.group.position;
  const near = all.map((t) => ({ t, d: t.av.group.position.distanceTo(pos) })).filter((x) => x.d < 4.5).sort((a, b) => a.d - b.d)[0];
  return near ? near.t : null;
}
// 불리면 달려와서 내 앞에 섬
function summonTo(t) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; resolve(); };
    setTimeout(finish, 15000);
    const g = t.av.group, mp = me.group.position;
    if (g.position.distanceTo(mp) < 2.2 || pl.mode !== 'walk') { finish(); return; }
    const dir = new V3(g.position.x - mp.x, 0, g.position.z - mp.z).normalize();
    let pt = [mp.x + dir.x * 1.1, mp.z + dir.z * 1.1];
    if (!walkable(pt[0], pt[1], 0.2)) pt = [mp.x + 0.8, mp.z + 0.8];
    if (!walkable(pt[0], pt[1], 0.2)) pt = [mp.x, mp.z + 1];
    t.av.say(pick(['네~ 가요!', '잠깐만요~', '부르셨어요?']), 1600);
    if (t.key === 'muho') {
      if (['collect', 'rush'].includes(staff.state)) { finish(); return; }
      staffGo(pt, 7); staff.state = 'summon'; staff.onArrive = finish;
    } else if (t.key === 'west') {
      if (west.state === 'photo') { finish(); return; }
      westGo(pt, 6.5); west.state = 'summon'; west.onArrive = finish;
    } else if (t.npc && ['idle', 'rest', 'return', 'walk'].includes(t.npc.state)) {
      const n = t.npc;
      n.problem = null;
      n.path = planPath([g.position.x, g.position.z], pt); n.state = 'summon'; n.av.sitting = false; n.onArrive = finish;
    } else finish();
  });
}
async function npcTalk(text) {
  const t = pickTalkTarget(text);
  if (!t) return;
  const now = Date.now();
  if (npcTalkState.busy || now - npcTalkState.last < 2500) return;
  npcTalkState.last = now; npcTalkState.busy = true;
  const g = t.av.group;
  const arrive = t.called ? summonTo(t) : Promise.resolve();
  if (t.npc && t.npc.state === 'idle') { t.npc.next = Math.max(t.npc.next, performance.now() + 15000); }
  const hist = (npcTalkState.hist[t.key] = npcTalkState.hist[t.key] || []);
  const doing = pl.mode === 'route' && pl.problem ? `${problemLabel(pl.problem)} 등반 중` : pl.sitting ? '매트에 앉아 쉬는 중' : '암장을 돌아다니는 중';
  let reply = '';
  const url = npcApiUrl();
  const fetchReply = (async () => {
  if (url) {
    try {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 12000);
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ npc: t.key, text, history: hist.slice(-6), ctx: { name: Store.data.name, doing, sends: Object.values(Store.data.sends).reduce((a, b) => a + b, 0) } }),
      });
      clearTimeout(to);
      if (r.ok) reply = ((await r.json()).reply || '').trim();
    } catch (e) { /* 서버 없음/시간 초과 → 기본 대사 */ }
  }
  })();
  await arrive;
  g.rotation.y = Math.atan2(me.group.position.x - g.position.x, me.group.position.z - g.position.z);
  t.av.say('…', 6000);
  await fetchReply;
  g.rotation.y = Math.atan2(me.group.position.x - g.position.x, me.group.position.z - g.position.z);
  if (!reply) reply = pick(NPC_FALLBACK[t.key]);
  hist.push({ role: 'user', text }, { role: 'npc', text: reply });
  if (hist.length > 12) hist.splice(0, hist.length - 12);
  t.av.say(reply, 5200);
  logChat(t.name, t.key === 'muho' ? '#f39a2b' : t.key === 'west' ? '#ffd166' : t.av.color, reply);
  // 웨스트한테 사진 부탁하면 진짜 찍어줌
  if (t.key === 'west' && /사진|찍어|📸|셀카/.test(text) && west.state !== 'photo') setTimeout(() => { west.lastPhoto = -1e9; westPhoto(me, `${Store.data.name} 기념샷`); }, 1200);
  npcTalkState.busy = false;
}

// =================================================================
// 💬 채팅 로그 — 게임처럼 화면 빈 곳에 글씨만
// =================================================================
function logChat(name, color, text, kind = 'msg') {
  const box = $('#chatlog');
  if (!box) return;
  const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 8;
  const ln = document.createElement('div');
  ln.className = 'ln ' + kind;
  if (kind === 'msg') {
    const b = document.createElement('b'); b.textContent = name; b.style.color = color;
    ln.append(b, document.createTextNode(': ' + text));
  } else ln.textContent = text;
  box.appendChild(ln);
  while (box.children.length > 60) box.firstChild.remove();
  if (stick) box.scrollTop = box.scrollHeight;
}

// =================================================================
// 🐯 무호K — 입장료 2만원 받고, 나쁜 짓 하면 잔소리
// =================================================================
const ENTRY = m([435, 985]);
const GATE_Z = (905 - 100) * S;
const STAFF_PATROL = [[450, 460], [690, 470], [420, 820], [690, 800], [180, 440], [520, 300], [430, 950]].map(m);
const staff = { av: null, state: 'patrol', path: [], speed: 2, next: 0, replan: 0, nagT: 0, dustT: 0, onArrive: null };
const watch = { chalks: [], runT: 0, calmT: 0, chaseNag: 0, chalkNag: 0, gateMsg: 0 };
// 무호K = 잔소리 많은 츤데레: 잔소리는 길게, 마지막엔 쑥스러운 한마디
const STAFF_LINES = {
  run: ['뛰지 말라고 했죠~ 넘어지면 어쩌려고요. …걱정한 건 아니고요 🐯', '천천히 좀 다녀요! 벽은 안 도망가요. 그냥 하는 말이에요', '또 뛰어요? 발목 다치면 큰일이에요. 조심해요 🐯', '거기 거기! 뛰지 말고요~ 흥, 그래도 제가 더 빨라요 🐯💨', '몇 번째예요 이게… 다치면 속상하… 아 아무것도 아니에요'],
  chalk: ['초크 그렇게 막 뿌리면 옆사람 콜록거려요~ 적당히! 🐯', '팡팡은 완등하고 해요. 그땐… 박수 정도는 쳐줄게요', '손에 얇게 바르는 거예요 얇게! 알려준 거 아니고 그냥 보여서요', '또 팡팡이에요? …그 소리 좀 좋긴 한데 그래도 적당히요 🐯'],
  crash: ['둘 다 괜찮아요?! 그러니까 동선 보라고 했잖아요… 걱정한 건 아니고요 🐯', '부딪히고 그러면 안 돼요~ 먼저 붙은 사람 먼저! 다친 데는 없죠?'],
  cutin: ['저분 먼저 붙었잖아요~ 순서 지켜요. 그래야 멋있… 아니 그냥요 🐯', '조금만 기다려요~ 클라이밍은 기다리는 것도 실력이에요'],
  calm: ['그래요 그렇게 천천히~ 진작 그럴 것이지 🐯', '훨씬 낫네요. …칭찬한 거 맞아요, 한 번만 말해요', '봐요 걸어 다니니까 좋잖아요~'],
  care: ['괜찮아요? 그러니까 무리하지 말랬잖아요… 걱정한 거 아니에요 🐯', '떨어질 때 손 짚지 마요, 손목 나가요. 그냥 알려주는 거예요', '물 좀 마시고 해요~ 그래야 오래 하죠 🐯'],
  praise: ['오… 좀 하네요? 근데 발은 좀 조용히 놔요. 칭찬은 아니고요 🐯', '완등했어요? 흥, 잘했어요. 오늘만 말해주는 거예요', '그래요 그거예요~ 제가 그렇게 하라고 했잖아요 🐯'],
};
const todayStr = () => new Date().toLocaleDateString('ko-KR');
const STAFF_NAG_COOLDOWN = 45000; // 잔소리 한 번 하면 45초는 조용
let staffLastNag = -1e9;
function staffMayNag(chance = 1) { if (performance.now() - staffLastNag < STAFF_NAG_COOLDOWN || Math.random() >= chance) return false; staffLastNag = performance.now(); return true; }
const paidToday = () => Store.data.paidDate === todayStr();
function staffSay(text, ms = 2800) {
  if (!staff.av) return;
  staff.av.say(text, ms);
  if (me && staff.av.group.position.distanceTo(me.group.position) > 9) toast(`🐯 무호K: ${text}`, 2400);
}
function staffGo(pt, speed) { const g = staff.av.group; staff.path = planPath([g.position.x, g.position.z], pt); staff.speed = speed; }
function makeStaff() {
  staff.av = new Avatar('무호K', '#2b2b30', { tiger: true });
  const st = m([690, 470]);
  staff.av.group.position.set(st[0], groundY(st[0], st[1]), st[1]);
}
function staffRushToEntry(onArrive, line = '잠깐만요~ 지금 가요! 🐯💨') {
  const tgt = [ENTRY[0] + 0.6, ENTRY[1] - 1.1];
  staffGo(tgt, 9.5);
  staff.state = 'rush'; staff.onArrive = onArrive;
  staffSay(line, 1800);
}
function staffArrivedForPlayer() {
  const g = staff.av.group;
  g.rotation.y = Math.atan2(me.group.position.x - g.position.x, me.group.position.z - g.position.z);
  if (paidToday()) {
    staffSay('또 왔어요? 손가락은 괜찮고요? …반가운 건 아니고요. 들어가요 🐯', 3000);
    staff.state = 'thanks'; staff.next = performance.now() + 2200;
    return;
  }
  staffSay('왔어요? 일일이용 2만원이에요. 스트레칭은 하고 왔죠? 기다린 건 아니고요 🐯', 3200);
  staff.state = 'collect';
  setTimeout(openPay, 700);
}
function openPay() {
  if (paidToday()) return;
  const d = $('#pay');
  $('#pay-say').innerHTML = '"어서와요~ 스파이시예요. 일일이용 <b>2만원</b>이에요. …오늘 재밌게 놀다 가요 🐯"';
  d.querySelector('[data-pay="member"]').disabled = false;
  if (!d.open) d.showModal();
}
function payDone(method) {
  Store.data.wallet = (Store.data.wallet || 0) - 20000; Store.save(); updateWallet();
  if (Store.data.wallet < 0) setTimeout(() => staffSay('돈도 없이 왔어요? …외상 달아둘게요. 이번만이에요 🐯', 2800), 1400);
  logChat('', '', '🐯 무호K: 고마워요~ 즐클해요! (일일이용권 결제)', 'sys');
  Store.data.paidDate = todayStr();
  Store.data.spent = (Store.data.spent || 0) + 20000;
  Store.save();
  $('#pay').close();
  Sound.tone(1800, 0.08, 'square', 0.06); Sound.tone(1800, 0.08, 'square', 0.06, 0.12);
  toast(`🧾 일일이용권 20,000원 결제 완료 (${method}) — 입장!`, 2600);
  staffSay(pick(['다치지 말고, 물 자주 마시고, 무리하지 말고요. …잔소리 아니에요 🐯', '손톱은 깎고 왔죠? 그냥 물어본 거예요', '욕심내지 말고 하나씩 해요~ 응원한 거 아니고요 🐯']), 2800);
  setTimeout(() => me.say('들어갑니다~!', 1600), 600);
  westPraise('enter', 3000);
  staff.state = 'thanks'; staff.next = performance.now() + 2200;
}
function setupPay() {
  const d = $('#pay');
  d.addEventListener('cancel', (e) => e.preventDefault());
  d.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.pay;
    if (k === 'card') payDone('카드 삑!');
    else if (k === 'cash') payDone('현금');
    else if (k === 'member') {
      b.disabled = true;
      $('#pay-say').textContent = '"회원권이요? 특별히 조회해줄게요… 🔍"';
      setTimeout(() => { $('#pay-say').innerHTML = '"명단엔 없네요~ 오늘은 <b>2만원</b>이에요. 다음엔 회원권 만들어요… 그냥 하는 말이에요"'; staffSay('명단에 없는데요? 다음엔 회원권 만들어요~ 🐯', 2000); }, 1300);
    } else if (k === 'sneak') {
      d.close();
      staffSay('어딜 몰래 가요~ 다 보여요. 계산하고 들어가요 🐯', 2200);
      me.say('헉 들켰다', 1400);
      setTimeout(openPay, 1800);
    }
  }));
}
function staffCatch() {
  pl.vel.set(0, 0, 0); pl.runToggle = false; pl.stunT = 1.3;
  staffSay('잡았다~ 뛰지 말랬잖아요. 다친 데는 없죠? 걱정한 건 아니고요 🐯', 2800);
  setTimeout(() => me.say('죄송합니다…', 1600), 700);
  setTimeout(() => Manner.add(-0.3, '무호K한테 잡힘 🐯'), 1000);
  staff.state = 'thanks'; staff.next = performance.now() + 2500;
  watch.runT = 0;
}
function onChalkUsed() {
  const now = Date.now();
  watch.chalks = watch.chalks.filter((t) => now - t < 30000);
  watch.chalks.push(now);
  if (watch.chalks.length === 1 && Math.random() < 0.4) westPraise('chalk', 1800);
  if (watch.chalks.length >= 5 && paidToday() && (staff.state === 'patrol' || staff.state === 'thanks') && staffMayNag(1)) {
    staff.state = 'scold'; staff.replan = 0; staff.scoldT = 0;
    staffSay(STAFF_LINES.chalk[Math.min(watch.chalkNag++, STAFF_LINES.chalk.length - 1)], 3000);
    watch.chalks = [];
  }
}
function updateStaff(dt, now) {
  if (!staff.av) return;
  const g = staff.av.group;
  // 이동
  if (staff.path.length) {
    const tgt = staff.path[0];
    const dx = tgt[0] - g.position.x, dz = tgt[1] - g.position.z, d = Math.hypot(dx, dz);
    if (d < 0.12) staff.path.shift();
    else {
      const sp = Math.min(d, staff.speed * dt);
      g.position.x += (dx / d) * sp; g.position.z += (dz / d) * sp;
      g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(dx, dz), damp(12, dt));
      if (staff.speed > 6 && (staff.dustT -= dt) < 0) { staff.dustT = 0.08; chalkPuff(g.position.clone().add(new V3(0, 0.1, 0)), 2); }
    }
  }
  g.position.y = lerp(g.position.y, groundY(g.position.x, g.position.z), damp(14, dt));
  const toMe = me.group.position.distanceTo(g.position);
  // 감시: 뛰기
  if (pl.isRunningNow) { watch.runT += dt; watch.calmT = 0; } else { watch.runT = 0; watch.calmT += dt; }
  switch (staff.state) {
    case 'patrol':
      if (!staff.path.length && now > staff.next) { staffGo(pick(STAFF_PATROL), 1.8); staff.next = now + 5000 + Math.random() * 6000; }
      // 4초 넘게 계속 뛰면 4초마다 20% 확률로 눈치챔
      if (watch.runT < 0.1) watch.runRoll = 4;
      let spotted = false;
      if (watch.runT > (watch.runRoll || 4)) { watch.runRoll = watch.runT + 4; spotted = Math.random() < 0.2 && staffMayNag(1); }
      if (paidToday() && spotted && pl.mode === 'walk') {
        staff.state = 'chase'; staff.replan = 0; staff.nagT = 0;
        staffSay(STAFF_LINES.run[Math.min(watch.chaseNag++, STAFF_LINES.run.length - 1)], 2400);
      }
      break;
    case 'rush':
      if (!staff.path.length) { const f = staff.onArrive; staff.onArrive = null; staff.state = 'wait'; if (f) f(); }
      break;
    case 'collect':
      g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(me.group.position.x - g.position.x, me.group.position.z - g.position.z), damp(6, dt));
      break;
    case 'thanks':
    case 'wait':
      if (now > staff.next) { staff.state = 'patrol'; staff.next = now + 800; }
      break;
    case 'summon':
      if (!staff.path.length) { staff.state = 'wait'; staff.next = now + 8000; const f = staff.onArrive; staff.onArrive = null; if (f) f(); }
      break;
    case 'chase':
      if ((staff.replan -= dt) <= 0) { staff.replan = 0.6; staffGo([me.group.position.x, me.group.position.z], 5.2); }
      if ((staff.nagT += dt) > 3.5) { staff.nagT = 0; staffSay(pick(STAFF_LINES.run), 2000); }
      if (toMe < 1.0 && pl.isRunningNow) staffCatch();
      else if (watch.calmT > 2.5 || pl.mode !== 'walk') {
        staffSay(pl.mode !== 'walk' ? '벽 위는 봐줄게요~ 조심해요. 진짜로요 🐯' : pick(STAFF_LINES.calm), 2400);
        staff.state = 'thanks'; staff.next = now + 1500; staff.path = [];
      }
      break;
    case 'scold':
      staff.scoldT += dt;
      if ((staff.replan -= dt) <= 0 && toMe > 1.4) { staff.replan = 0.6; staffGo([me.group.position.x, me.group.position.z], 4.2); }
      if (toMe <= 1.4) { staff.path = []; g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(me.group.position.x - g.position.x, me.group.position.z - g.position.z), damp(8, dt)); }
      if (staff.scoldT > 5) { staff.state = 'patrol'; staff.next = now + 1000; }
      break;
  }
  staff.av.update(dt);
}

// =================================================================
// 🤠 웨스트 — 잔소리 0%, 칭찬 100%, 완등하면 달려와서 찰칵 📸
// =================================================================
const west = { av: null, state: 'roam', path: [], speed: 1.6, next: 0, target: null, shotT: 0, cheerT: 0, photos: [], lastPhoto: -1e9 };
const WEST_COOLDOWN = 180000; // 사진은 3분에 한 번만
function westCanShoot(chance = 1) { return west.av && west.state !== 'photo' && performance.now() - west.lastPhoto > WEST_COOLDOWN && Math.random() < chance; }
const WEST_LINES = {
  photo: ['찰칵! 📸 인생샷 건졌다 🤠', '이 각도 미쳤다 📸', '프로필 사진 각이에요!', '완등 기념샷 찰칵~ 🤠'],
  top: ['나이스!!! 🤠', '와 완등 축하해요!!', '무브 진짜 예뻤어요', '오늘 폼 미쳤다 🔥'],
  climb: ['가보자고~!! 🤠', '발 좋다 발 좋다!', '자세 너무 좋아요!', '거의 다 왔어요!', '호흡 천천히~ 할 수 있어!'],
  fall: ['괜찮아요! 떨어지는 것도 등반이에요 🤠', '방금 무브 진짜 좋았는데!', '다음엔 무조건 돼요!', '시도한 게 멋있는 거예요 👍'],
  dyno: ['다이노 미쳤다!!! 🤠', '날았다!! 슈퍼맨인 줄', '저 점프력 뭐예요?!'],
  yield: ['양보하는 거 진짜 멋있어요 👍', '매너 클라이머 인정 🤠'],
  campus: ['팔 힘 보소… 리스펙 🤠', '발 없이?! 진짜 고릴라다'],
  hang: ['버티기 장인 🤠', '악력 실화예요?'],
  gear: ['그 신발 뭐예요?! 부럽다 🤠', '새 장비 개시! 오늘 날아다니겠는데요?', '장비빨도 실력이에요 😎'],
  tech: ['기술 깔끔하다 🤠', '오 그 무브 교과서다!', '발 쓰는 거 보소 👍'],
  sit: ['쉬는 것도 훈련이에요~ 🤠', '천천히 쉬어요, 벽은 안 도망가요'],
  enter: ['어서와요~ 오늘 재밌게 놀아요 🤠', '입장 축하해요! 오늘 폼 좋아 보이는데요?'],
  chalk: ['초크 바르는 폼이 프로네 🤠', '그 박수 소리 좋다 ㅋㅋ'],
};
function westSay(text, ms = 2600, important = false) {
  if (!west.av) return;
  west.av.say(text, ms);
  if (important && me && west.av.group.position.distanceTo(me.group.position) > 9) toast(`🤠 웨스트: ${text}`, 2200);
}
function westPraise(kind, delay = 900) { if (west.av && west.state !== 'photo' && WEST_LINES[kind] && (kind === 'top' || Math.random() < 0.6)) setTimeout(() => westSay(pick(WEST_LINES[kind]), 2600), delay); }
function westGo(pt, speed) { const g = west.av.group; west.path = planPath([g.position.x, g.position.z], pt); west.speed = speed; }
function makeWest() {
  west.av = new Avatar('웨스트', '#3d7bd9', { cowboy: true });
  const st = m([420, 820]);
  west.av.group.position.set(st[0], groundY(st[0], st[1]), st[1]);
}
// 완등한 사람(av)을 찍으러 달려감. normal: 벽 바깥 방향
function westPhoto(av, label, normal) {
  if (!west.av || west.state === 'photo') return;
  west.lastPhoto = performance.now();
  const P = av.group.position;
  let dir = normal ? new V3(normal.x, 0, normal.z) : new V3(west.av.group.position.x - P.x, 0, west.av.group.position.z - P.z);
  if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
  dir.normalize();
  let tx = P.x + dir.x * 3.0, tz = P.z + dir.z * 3.0;
  for (let k = 0; k < 20 && !walkable(tx, tz); k++) { tx -= dir.x * 0.15; tz -= dir.z * 0.15; }
  westGo([tx, tz], 7);
  west.state = 'photo'; west.subject = av; west.label = label; west.shotT = 0;
  westSay(pick(['잠깐!! 사진 찍어줄게요 📸', '그대로 멈춰요~ 📸', '완등샷 각!! 🤠']), 1800);
}
function updateWest(dt, now) {
  if (!west.av) return;
  const g = west.av.group;
  if (west.path.length) {
    const tgt = west.path[0];
    const dx = tgt[0] - g.position.x, dz = tgt[1] - g.position.z, d = Math.hypot(dx, dz);
    if (d < 0.12) west.path.shift();
    else {
      const sp = Math.min(d, west.speed * dt);
      g.position.x += (dx / d) * sp; g.position.z += (dz / d) * sp;
      g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(dx, dz), damp(12, dt));
    }
  }
  g.position.y = lerp(g.position.y, groundY(g.position.x, g.position.z), damp(14, dt));
  if (west.state === 'roam') {
    if (!west.path.length && now > west.next) { westGo(pick(STAFF_PATROL), 1.5); west.next = now + 6000 + Math.random() * 7000; }
    // 벽에 붙은 플레이어 응원
    if ((pl.mode === 'climb' || pl.mode === 'route') && (west.cheerT -= dt) <= 0) {
      west.cheerT = 15 + Math.random() * 10;
      if (g.position.distanceTo(me.group.position) < 9) westSay(pick(WEST_LINES.climb), 2200);
    }
  } else if (west.state === 'summon') {
    if (!west.path.length) { west.state = 'roam'; west.next = now + 8000; const f = west.onArrive; west.onArrive = null; if (f) f(); }
  } else if (west.state === 'photo') {
    west.shotT += dt;
    const S = west.subject.group.position;
    const arrived = !west.path.length;
    if (arrived || west.shotT > 2.2) {
      west.path = [];
      g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(S.x - g.position.x, S.z - g.position.z), damp(10, dt));
      west.av.photoPose = true;
      if (!west.posedAt) west.posedAt = now;
      if (now - west.posedAt > 600 && !west.shotPending && !west.shotDone) west.shotPending = true;
      if (west.shotDone && now - west.posedAt > 2200) {
        west.av.photoPose = false; west.posedAt = 0; west.shotDone = false;
        west.state = 'roam'; west.next = now + 1500;
      }
    }
  }
  west.av.update(dt);
}
// 렌더 직후 호출: 웨스트 시점으로 한 장 찍기
const photoCam = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
function takeWestShot() {
  west.shotPending = false; west.shotDone = true;
  const S = west.subject.group.position;
  const from = west.av.group.position.clone().add(new V3(0, 1.3, 0));
  const look = S.clone().add(new V3(0, 0.8, 0));
  photoCam.aspect = renderer.domElement.width / renderer.domElement.height;
  photoCam.position.copy(from); photoCam.lookAt(look); photoCam.updateProjectionMatrix();
  const vis = west.av.group.visible;
  west.av.group.visible = false;
  renderer.render(scene, photoCam);
  west.av.group.visible = vis;
  const src = renderer.domElement;
  const H = src.height, W = Math.round(H * 0.8);
  const c = document.createElement('canvas'); c.width = 480; c.height = 600;
  c.getContext('2d').drawImage(src, (src.width - W) / 2, 0, W, H, 0, 0, 480, 600);
  const url = c.toDataURL('image/jpeg', 0.85);
  renderer.render(scene, camera);
  // 플래시 + 셔터
  const fl = $('#flash'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
  Sound.tone(2600, 0.04, 'square', 0.05); Sound.tone(1200, 0.06, 'square', 0.04, 0.06);
  westSay(pick(WEST_LINES.photo), 2600, true);
  west.photos.unshift({ url, label: west.label, t: Date.now() });
  if (west.photos.length > 8) west.photos.length = 8;
  showPolaroid(url, west.label);
}
let polaroidT;
function showPolaroid(url, label) {
  const el = $('#polaroid');
  el.querySelector('img').src = url;
  el.querySelector('.pol-cap').textContent = label;
  const a = el.querySelector('a'); a.href = url; a.download = `spicy-west-${Date.now()}.jpg`;
  el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(polaroidT);
  polaroidT = setTimeout(() => { if (!el.matches(':hover')) el.hidden = true; }, 9000);
}

// =================================================================
// 😈 빌런 — 가끔 알아서 빌런 짓, 주변이 반응
// =================================================================
const VILLAIN_LINES = {
  beta: ['그거 발 바꿔서 하면 돼요~', '제가 하면 한 번에 되는데…', '그 홀드 사이드로 잡아요 사이드로', '아 그거 그렇게 하는 거 아닌데', '저 그거 플래시했어요 ㅎ'],
  mat: ['(매트에 대자로 누움)', '여기 내 자리임', '5분만 더 누워있을게요…', '매트가 제일 편해', '벽은 보는 거지 오르는 게 아님'],
  chalk: ['초크 팡팡 한 번 더~ 💨', '초크는 많을수록 좋지!', '바닥 하얗게 만들어주마', '공기 중에 초크 농도 올리는 중'],
  shirtless: ['더워서 벗었어요 💪', '등근육 보이죠?', '이게 진짜 클라이밍 복장이지', '바람 시원하다~'],
};
const VILLAIN_REACT = {
  beta: ['…안 물어봤는데요 😑', '베타 스포 금지!!', '제가 알아서 할게요 ㅎㅎ'],
  mat: ['저기 매트 좀 비켜주세요~', '거기 낙하지점이에요!', '누울 거면 쉼터 가요 ㅋㅋ'],
  chalk: ['콜록콜록…', '초크 아껴요~!', '앞이 안 보여요 😵'],
  shirtless: ['옷 좀 입어요 ㅋㅋ', '눈 둘 곳이 없네', '감기 걸려요~'],
};
const STAFF_VILLAIN = {
  beta: '안 물어본 베타는 알려주는 거 아니에요~ …열정은 인정하지만요 🐯',
  mat: '거기 낙하지점이에요! 누울 거면 쉼터 가요. 걱정돼서 그러는 거 아니고요 🐯',
  chalk: '초크를 무슨 밀가루처럼 써요~ 적당히요 적당히 🐯',
  shirtless: '옷 입어요 옷! 감기 걸려요… 진짜 걱정돼서 하는 말 아니에요 🐯',
};
const vil = { next: performance.now() + 20000 };
function updateVillain(now) {
  const v = me && me.villain;
  if (!v || !paidToday() || now < vil.next) return;
  // 초크 빌런은 벽 위에서 아래로 초크를 뿌림
  if (v === 'chalk' && pl.mode === 'route' && R.on && !R.anim) {
    vil.next = now + 14000 + Math.random() * 10000;
    const hand = me.group.position.clone().add(new V3(0, 1.5, 0));
    chalkRain(hand); Net.event('chalkrain');
    me.say(pick(['초크 비 내려갑니다~ 💨', '아래 계신 분들 초크 서비스!', '팡팡 공중 버전 ㅋㅋ']), 2200);
    const below = [...npcs.map((n) => n.av), staff.av, west.av].filter((a) => a && Math.hypot(a.group.position.x - me.group.position.x, a.group.position.z - me.group.position.z) < 4 && a.group.position.y < me.group.position.y - 0.5);
    below.slice(0, 2).forEach((a, k) => setTimeout(() => a.say(pick(['콜록… 위에서 초크 내려와요!', '앞이 안 보여 ㅋㅋㅋ', '눈에 들어갔어!!']), 2200), 900 + k * 500));
    return;
  }
  if (pl.mode !== 'walk') return;
  vil.next = now + 22000 + Math.random() * 18000;
  const line = pick(VILLAIN_LINES[v]);
  me.say(line, 2600);
  Net.event('vsay', { text: line });
  if (v === 'chalk' && pl.chalkReady && chalkLeft() > 0) useChalk();
  if (v === 'mat' && !pl.sitting && groundY(pl.pos.x, pl.pos.z) > 0) toggleSit();
  const near = npcs.filter((n) => n.state === 'idle' && n.av.group.position.distanceTo(me.group.position) < 7);
  if (near.length) setTimeout(() => pick(near).av.say(pick(VILLAIN_REACT[v]), 2400), 1400);
  if (staffMayNag(0.3)) setTimeout(() => staffSay(STAFF_VILLAIN[v], 3000), 3200);
  else if (Math.random() < 0.3) setTimeout(() => westSay(pick(['빌런도 매력이죠 🤠', '캐릭터 확실하네요 ㅋㅋ', '오늘도 빌런 컨셉 유지 중? 🤠'])), 3200);
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
    if (staffMayNag(0.2)) setTimeout(() => staffSay(pick(STAFF_LINES.crash), 2600), 2400);
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
  const climbing = pl.mode === 'climb' || pl.mode === 'air' || pl.mode === 'inst' || pl.mode === 'route';
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
    PROBLEMS.filter((p) => p.sector === sec).sort((a, b) => a.rank - b.rank).forEach((p) => {
      const row = document.createElement('div'); row.className = 'prob';
      const sent = d.sends[p.id] || 0;
      row.innerHTML = `<span class="dot" style="background:${p.hex}"></span>${p.name} <span class="grade">${p.grade}</span>${p.double ? '<span class="tag">더블다이노</span>' : p.dyno ? '<span class="tag">다이노</span>' : ''}${p.side ? '<span class="tag">사이드 다이노</span>' : ''}${p.lock ? `<span class="tag lock${p.lock.test() ? ' ok' : ''}">🥁 박자 크럭스${p.lock.test() ? ' (장비 OK)' : ''}</span>` : ''}<span class="grade">${p.holds.length}홀드</span>${p.holds.some((h) => h.stretch) ? '<span class="tag">기술</span>' : ''}${(d.campus || {})[p.id] ? '<span class="tag">🦍</span>' : ''}<span class="count">${sent ? '✔ ' + sent : ''}</span>`;
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
  const alb = $('#album');
  alb.innerHTML = west.photos.length ? '' : '<p class="empty">완등하면 웨스트가 달려와서 찍어줘요 🤠📸</p>';
  west.photos.forEach((ph) => {
    const a = document.createElement('a'); a.href = ph.url; a.download = `spicy-west-${ph.t}.jpg`; a.className = 'album-item';
    const img = document.createElement('img'); img.src = ph.url; img.alt = ph.label;
    const cap = document.createElement('span'); cap.textContent = ph.label;
    a.append(img, cap); alb.appendChild(a);
  });
  const total = Object.values(d.sends).reduce((a, b) => a + b, 0);
  const done = PROBLEMS.filter((p) => d.sends[p.id]).length;
  $('#records-summary').textContent = `${d.name || '불꽃이'}님 · 총 ${total}번 완등 · ${done}/${PROBLEMS.length} 문제 클리어 · 매너 온도 ${Manner.v}℃ ${Manner.emoji()} · 매달리기 최고 ${(d.bestHang || 0).toFixed(1)}초 · 캠퍼싱 완등 ${Object.values(d.campus || {}).reduce((a, b) => a + b, 0)}회 · 더블다이노 ${d.doubles || 0}회${(d.titles || {}).mat ? ' · 칭호: 매트 지박령 👻' : ''} · 지갑 ${won(d.wallet || 0)} · 신발 ${gear().shoe.n} · 오늘 일일이용권 ${paidToday() ? '✔' : '✘'} · 누적 이용료 ${(d.spent || 0).toLocaleString('ko-KR')}원`;
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
  if (staff.av) { const [sx, sy] = P(staff.av.group.position.x, staff.av.group.position.z); g.font = '26px sans-serif'; g.fillText('🐯', sx, sy); }
  if (west.av) { const [wx, wy] = P(west.av.group.position.x, west.av.group.position.z); g.font = '26px sans-serif'; g.fillText('🤠', wx, wy); }
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
      m: pl.mode === 'climb' || pl.mode === 'air' || pl.mode === 'inst' || pl.mode === 'route' ? 'c' : 'w', pid: pl.problem ? pl.problem.id : '', g: (pl.mode === 'climb' || pl.mode === 'inst' || pl.mode === 'route') && me.grips ? me.grips.flatMap((v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]) : 0, o: `${Store.data.equip.shoe}|${Store.data.equip.pants || ''}`, k: lookToStr({ ...DEFAULT_LOOK, ...(Store.data.look || {}) }), st: pl.climbStart || 0, a: pl.sitting ? 's' : pl.hanging ? 'h' : me.campus ? 'k' : pl.tech ? 't' + pl.tech[0] : '',
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
      const av = new Avatar(name, color, { visitor: true, look: lookFromStr(d.k) });
      av.group.position.set(x, y, z);
      p = { av, name, target: new V3(x, y, z), r };
      this.peers.set(id, p);
      this.updateCount();
      if (Date.now() - this.startedAt > 4000) {
        toast(`${name}님이 암장에 들어왔어요 👋`, 2000);
        logChat('', '', `👋 ${name}님이 들어왔어요`, 'sys');
        if (staff.state === 'patrol') staffRushToEntry(() => { staffSay(`${name}님 왔어요? 일일이용 2만원이에요~ 기다린 건 아니고요 🐯`, 2600); staff.state = 'thanks'; staff.next = performance.now() + 2500; });
        const idle = npcs.filter((n) => n.state === 'idle');
        if (idle.length) setTimeout(() => pick(idle).av.say(`${name}님 어서 와요~`), 700);
      }
    }
    p.last = Date.now();
    p.target.set(x, y, z); p.r = r;
    p.mode = d.m === 'c' ? 'c' : 'w';
    p.st = Number.isFinite(+d.st) ? +d.st : 0;
    p.av.setClimbing(p.mode === 'c');
    if (p.mode === 'c' && Array.isArray(d.g) && d.g.length === 12 && d.g.every((n) => Number.isFinite(n) && Math.abs(n) < 100)) {
      p.gripT = p.gripT || [new V3(), new V3(), new V3(), new V3()];
      for (let i = 0; i < 4; i++) p.gripT[i].set(d.g[i * 3], d.g[i * 3 + 1], d.g[i * 3 + 2]);
      if (!p.av.grips) p.av.grips = p.gripT.map((v) => v.clone());
    } else { p.gripT = null; p.av.grips = null; }
    p.av.sitting = d.a === 's'; p.av.hanging = d.a === 'h'; p.av.campus = d.a === 'k';
    if (typeof d.o === 'string' && d.o !== p.outfit) { p.outfit = d.o; const [so, pa] = d.o.split('|'); p.av.setOutfit(so, pa); }
    p.av.tech = d.a === 'tf' ? 'flag' : d.a === 'ti' ? 'inside' : d.a === 'to' ? 'outside' : null;
  },
  onEvent(p, d) {
    if (!p) return;
    const text = typeof d.text === 'string' ? d.text.slice(0, 24) : '';
    if (d.type === 'say' && text) { p.av.chat(text); logChat(p.name, p.av.color, text); }
    if (d.type === 'chalk') p.av.chalk();
    if (d.type === 'ceremony') { p.av.ceremony = true; fireConfetti(p.av.group.position.clone().add(new V3(0, 1.8, 0)), 10); setTimeout(() => { p.av.ceremony = false; }, 2200); }
    if (d.type === 'ceremonyfail') { p.av.ceremony = false; logChat('', '', `😵 ${p.name}님 성급한 세레머니로 추락… 풋 ㅋ`, 'sys'); }
    if (d.type === 'chalkrain') chalkRain(p.av.group.position.clone().add(new V3(0, 1.4, 0)));
    if (d.type === 'vsay' && text) p.av.say(text, 2600);
    if (d.type === 'fall') { if (text) p.av.say(text, 1600); setTimeout(() => chalkPuff(p.av.group.position.clone(), 10), 500); }
    if (d.type === 'top') {
      const prob = PROBLEMS.find((x) => x.id === d.pid);
      if (!prob) return;
      if (text) p.av.say(text, 2000);
      fireConfetti(p.av.group.position.clone().add(new V3(0, 1.4, 0)), 22);
      addFeed(p.name, prob, false);
      logChat('', '', `🔥 ${p.name}님 ${problemLabel(prob)} 완등!`, 'sys');
      toast(`🔥 ${p.name}님 ${problemLabel(prob)} 완등!`, 2200);
      if (westCanShoot(0.2)) westPhoto(p.av, `${p.name} — ${problemLabel(prob)} 완등!`, segAt(prob.strip, prob.top.u)[0].n3);
      else westPraise('top', 900);
      npcs.forEach((n, k) => { if (n.state === 'idle' && Math.random() < 0.6) setTimeout(() => n.av.say(pick(LINES.cheer)), 400 + k * 400); });
    }
    if (d.type === 'bump' && d.to === this.id) { p.av.say('💥 앗 죄송해요!', 2200); toast(`${p.name}님과 부딪혔어요! 선출발자인 당신은 무사 😎`, 2400); }
    if (d.type === 'festival') { addFeed(p.name, { festival: true, hex: '#ffcf4a' }, false); toast(`🏆 ${p.name}님이 오픈 페스티벌을 완주했어요!`, 3000); }
  },
  update(dt) {
    this.peers.forEach((p) => {
      p.av.group.position.lerp(p.target, damp(10, dt));
      p.av.group.rotation.y = lerpAngle(p.av.group.rotation.y, p.r, damp(10, dt));
      if (p.gripT && p.av.grips) p.av.grips.forEach((g, i) => g.lerp(p.gripT[i], damp(12, dt)));
      p.av.update(dt);
    });
  },
  remove(id) { const p = this.peers.get(id); if (!p) return; logChat('', '', `🚪 ${p.name}님이 나갔어요`, 'sys'); p.av.dispose(); this.peers.delete(id); this.updateCount(); },
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
  updateGauge();
  if (hudT < 0.1) return;
  hudT = 0;
  const status = $('#status'), title = $('#status-title'), prompt = $('#prompt');
  const climbing = pl.mode === 'climb' || pl.mode === 'air';
  const touch = document.body.classList.contains('touch');
  if (pl.mode === 'route' && R.on) {
    status.classList.add('climbing');
    const p = pl.problem;
    const holdN = R.lh.v >= R.rh.v ? R.lh.type.n : R.rh.type.n;
    title.innerHTML = `<span style="color:${p.color === 'black' ? '#fff' : p.hex}">${problemLabel(p)}</span>${p.double ? ' 🔥🔥' : p.dyno ? ' 🔥' : ''}<small>${R.done ? '완등! 곧 내려와요' : R.gauge ? '다이노 — 초록 칸에서 탭!' : R.qte ? '버튼을 눌러요!' : '초록 = 손 닿음 · 노랑 = 데드포인트 · 주황 = 다이노'}</small><small>✊ ${holdN}${R.hipIn ? ' · 🍑' : ''}${me.tech === 'flag' ? ' · 🦵 플래깅' : me.tech === 'heel' ? ' · 👟 힐훅' : ''}</small>`;
    if (ety.near) title.innerHTML += `<small style="color:#ffcf4a">⚠️ 옆에 ${ety.near.name}님! 부딪히면 교통사고</small>`;
    const v = Math.round(pl.pump);
    $('#pump-val').textContent = v + '%'; $('#pump-fill').style.width = v + '%'; $('#pump').classList.toggle('danger', v >= 75);
    prompt.textContent = R.atTop || R.done ? (touch ? '🙌 버튼으로 세레머니! (3초 버틴 뒤에 하세요)' : 'V 세레머니 · 3초 버틴 뒤에 하세요 · E 내려오기') : R.anim ? '' : touch ? '링을 탭하거나 ⬆️ 버튼!' : '링 클릭 또는 W(⬆️)로 올라가기 · C 초크 · E 내려오기';
    $('#grab-label').innerHTML = touch ? '내려오기' : '내려오기 <kbd>E</kbd>';
    $('#jump-label').innerHTML = touch ? '다이노' : '다이노 <kbd>Space</kbd>';
    $('#btn-cere').hidden = !(R.atTop || R.done) || !!R.ceremony;
    if (R.atTop && !R.done) title.innerHTML += `<small style="color:#ffcf4a">⏱️ TOP 홀드 ${Math.min(3, R.topHold).toFixed(1)} / 3초</small>`;
    drawMinimap();
    return;
  }
  status.classList.toggle('climbing', climbing);
  if (climbing) {
    const p = pl.problem;
    title.innerHTML = p ? `<span style="color:${p.color === 'black' ? '#fff' : p.hex}">${problemLabel(p)}</span>${p.dyno ? ' 🔥' : ''}<small>${pl.topped ? '완등! 곧 내려와요' : 'TOP 홀드까지 같은 색만!'}</small>`
      : `자유 등반<small>${pl.strip.sec.name} · 아무 홀드나 OK</small>`;
    if (pl.holdName) title.innerHTML += `<small>✊ ${pl.holdName}${pl.tech ? ` · ${TECHS[pl.tech].icon} ${TECHS[pl.tech].n}` : ''}</small>`;
    if (pl.hanging) title.innerHTML += `<small style="color:#9fe0ff">🙌 매달리기 ${pl.hangT.toFixed(1)}초 · 최고 ${(Store.data.bestHang || 0).toFixed(1)}초</small>`;
    else if (me.campus) title.innerHTML += `<small style="color:#ffb26b">🦍 캠퍼싱 중 — 펌핑 ×2${pl.problem ? (pl.usedFeet ? ' (발 이미 씀)' : ' · 발 안 씀 유지!') : ''}</small>`;
    if (ety.near) title.innerHTML += `<small style="color:#ffcf4a">⚠️ 옆에 ${ety.near.name}님! 부딪히면 교통사고 — ${ety.near.start < (pl.climbStart || 0) ? '상대가 선출발' : '내가 선출발'}</small>`;
    const v = Math.round(pl.pump);
    $('#pump-val').textContent = v + '%';
    $('#pump-fill').style.width = v + '%';
    $('#pump').classList.toggle('danger', v >= 75);
    prompt.textContent = pl.mode === 'air' ? '' : pl.hanging ? '🙌 대롱대롱… 움직이면 다시 등반' : touch ? '🔥 꾹→떼기 다이노 · 🙌 매달리기 · 🦍 캠퍼싱' : 'WASD 이동 · Space 꾹→떼기 다이노 · H 매달리기 · Shift 캠퍼싱 · E 내려오기';
    $('#grab-label').innerHTML = touch ? '내려오기' : '내려오기 <kbd>E</kbd>';
    $('#act1-icon').textContent = pl.hanging ? '✊' : '🙌';
    $('#act1-label').innerHTML = (pl.hanging ? '그만' : '매달리기') + (touch ? '' : ' <kbd>H</kbd>');
    $('#act2-icon').textContent = '🦍';
    $('#act2-label').innerHTML = '캠퍼싱' + (touch ? '' : ' <kbd>Shift</kbd>');
    $('#btn-act2').setAttribute('aria-pressed', me.campus ? 'true' : 'false');
    $('#jump-label').innerHTML = touch ? '다이노' : '다이노 <kbd>Space</kbd>';
  } else {
    const n = FEST_SECTORS.filter(sectorDone).length;
    title.innerHTML = guide ? `★ ${problemLabel(guide)}<small>미니맵의 ★로 가서 벽을 잡으세요</small>` : `스탬프 ${n} / ${SECTORS.length} · 🌡️ ${Manner.v}℃ ${Manner.emoji()}<small>${Store.data.festival ? '🏆 페스티벌 완주자' : '섹터마다 한 문제씩 완등!'}</small>`;
    const c = pl.mountCand;
    if (pl.sitting) prompt.textContent = '🪑 앉아서 쉬는 중 — 펌핑이 빨리 풀려요';
    else if (c && pl.mode === 'walk') {
      const near = c.st.problems.find((p) => uvDist(c.st, p.start.u, p.start.v, c.u, 1.55) <= REACH);
      const busy = conflictsAt(bodyPos(c.st, c.u, 1.55), 2.0);
      if (busy.length) {
        prompt.textContent = `⚠️ ${busy[0].name}님 등반 중 — 선출발자 우선! 잠깐 기다려요`;
        ety.waitedFor = busy[0]; ety.waitedAt = Date.now();
      } else prompt.textContent = `${touch ? '✋' : 'E'} 벽 잡기 — ${near ? `${near.name} ${near.grade} 시작 홀드!` : c.st.sec.name + ' 자유 등반'}`;
    } else prompt.textContent = '';
    $('#btn-grab').classList.toggle('ready', !!c);
    $('#grab-label').innerHTML = touch ? '잡기' : '잡기 <kbd>E</kbd>';
    $('#act1-icon').textContent = pl.sitting ? '🧍' : '🪑';
    $('#act1-label').innerHTML = (pl.sitting ? '일어나기' : '앉아 쉬기') + (touch ? '' : ' <kbd>R</kbd>');
    $('#act2-icon').textContent = '🏃';
    $('#act2-label').innerHTML = '달리기' + (touch ? '' : ' <kbd>Shift</kbd>');
    $('#btn-act2').setAttribute('aria-pressed', isRunning() ? 'true' : 'false');
    $('#jump-label').innerHTML = touch ? '점프' : '점프 <kbd>Space</kbd>';
  }
  drawMinimap();
}

// =================================================================
// 🛒 무호K 프로샵 + 📢 광고
// =================================================================
function statBar(label, v) { return `<div class="stat"><span>${label}</span><i><b style="width:${Math.round(v * 100)}%"></b></i></div>`; }
function renderShop() {
  $('#shop-wallet').textContent = won(Store.data.wallet || 0);
  const card = (it, kind) => {
    const owned = !!Store.data.owned[it.id] || it.price === 0;
    const equipped = kind === 'shoe' ? Store.data.equip.shoe === it.id : Store.data.equip.pants === it.id;
    const el = document.createElement('div');
    el.className = 'item' + (it.id === 'him' ? ' best' : '') + (equipped ? ' on' : '');
    const pic = kind === 'shoe' ? `<div class="item-pic${it.photo ? ' photo' : ''}"><img src="${it.photo || shoeArt(it)}" alt="${it.n}"${it.photo ? ` data-fallback="${shoeArt(it)}"` : ''}></div>` : '';
    el.innerHTML = pic + `<div class="item-head"><span class="swatch-dot" style="background:${it.c}"></span><b>${it.n}</b>${it.ad ? '<span class="ad-tag">AD</span>' : ''}${it.id === 'him' ? '<span class="tag best-tag">최강</span>' : ''}<span class="price">${it.price ? won(it.price) : '무료'}</span></div>
      <p>${it.d}</p>${kind === 'shoe' ? statBar('마찰', it.f) + statBar('엣지', it.e) + statBar('오버행', it.h) : ''}`;
    const act = document.createElement('div'); act.className = 'item-act';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (owned ? '' : ' btn-primary');
    b.textContent = equipped ? '장착 중' : owned ? '장착하기' : `${won(it.price)}에 사기`;
    b.disabled = equipped;
    b.addEventListener('click', () => buyOrEquip(it, kind));
    act.appendChild(b);
    if (it.url) { const a = document.createElement('a'); a.className = 'btn ad-link'; a.href = it.url; a.target = '_blank'; a.rel = 'noopener sponsored'; a.textContent = '실제 제품 보기 ↗'; act.appendChild(a); }
    el.appendChild(act);
    return el;
  };
  const ss = $('#shop-shoes'); ss.innerHTML = ''; SHOES.forEach((it) => ss.appendChild(card(it, 'shoe')));
  ss.querySelectorAll('img[data-fallback]').forEach((im) => { im.onerror = () => { im.onerror = null; im.src = im.dataset.fallback; im.parentElement.classList.remove('photo'); }; });
  const pp = $('#shop-pants'); pp.innerHTML = ''; PANTS.forEach((it) => pp.appendChild(card(it, 'pants')));
  const cc = $('#shop-chalk'); cc.innerHTML = '';
  $('#chalk-have').textContent = `가루 ${Store.data.chalk || 0}회 · 리퀴드 ${Store.data.liquid || 0}회 남음`;
  CHALKS.forEach((it) => {
    const el = document.createElement('div'); el.className = 'item';
    el.innerHTML = `<div class="item-head"><span class="swatch-dot" style="background:${it.c}"></span><b>${it.n}</b><span class="price">${won(it.price)}</span></div><p>${it.d}</p>`;
    const act = document.createElement('div'); act.className = 'item-act';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-primary'; b.textContent = `${won(it.price)}에 사기 (+${it.uses}회)`;
    b.addEventListener('click', () => {
      if ((Store.data.wallet || 0) < it.price) { toast(`돈이 ${won(it.price - (Store.data.wallet || 0))} 모자라요 — 완등해서 벌어요!`, 2200); return; }
      addMoney(-it.price, `${it.n} 구매`);
      if (it.id === 'liquid') Store.data.liquid = (Store.data.liquid || 0) + it.uses; else Store.data.chalk = (Store.data.chalk || 0) + it.uses;
      Store.save(); updateChalkBadge(); Sound.tone(1400, 0.05, 'square', 0.05);
      renderShop();
    });
    act.appendChild(b); el.appendChild(act); cc.appendChild(el);
  });
}
function buyOrEquip(it, kind) {
  const owned = !!Store.data.owned[it.id] || it.price === 0;
  if (!owned) {
    if ((Store.data.wallet || 0) < it.price) { toast(`돈이 ${won(it.price - (Store.data.wallet || 0))} 모자라요 — 완등해서 벌어요!`, 2400); return; }
    addMoney(-it.price, `${it.n} 구매`);
    Store.data.owned[it.id] = true;
    Sound.top();
  }
  if (kind === 'shoe') Store.data.equip.shoe = it.id; else Store.data.equip.pants = Store.data.equip.pants === it.id && owned ? '' : it.id;
  Store.save();
  me.setOutfit(Store.data.equip.shoe, Store.data.equip.pants);
  Net.sync(true);
  renderShop();
  logChat('', '', `👟 ${Store.data.name}님이 ${it.n} ${kind === 'shoe' ? '신었어요' : '입었어요'}`, 'sys');
}
function openShop() { renderShop(); const d = $('#shop'); if (!d.open) d.showModal(); }
let adIdx = 0, adTimer;
function showAd(i = adIdx++ % ADS.length, prefix = '') {
  if (pl.mode === 'inst' || pl.mode === 'route' || document.querySelector('dialog[open]')) return;
  const ad = ADS[i % ADS.length];
  $('#ad-title').textContent = prefix + ad.title;
  $('#ad-copy').textContent = ad.copy;
  const img = $('#ad-img'); const it = SHOES.find((x) => x.id === ad.item);
  if (it && it.photo) { img.src = it.photo; img.hidden = false; } else img.hidden = true;
  const a = $('#ad-link'); a.href = ad.url;
  $('#ad-shop').onclick = () => { $('#adcard').hidden = true; openShop(); };
  const el = $('#adcard'); el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(adTimer); adTimer = setTimeout(() => { if (!el.matches(':hover')) el.hidden = true; }, 14000);
}
function scheduleAds() { setTimeout(function tick() { if (pl.mode === 'walk') showAd(); setTimeout(tick, 240000 + Math.random() * 120000); }, 60000); }
// 3D 광고판
const billboards = [];
function buildBillboards() {
  const poster = (lines, bg, fg, accent) => canvasTex(512, 720, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 720);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(24, 24, 70, 34); g.fillStyle = '#111'; g.font = '900 24px "Noto Sans KR"'; g.fillText('AD', 40, 50);
    g.textAlign = 'center';
    g.fillStyle = accent; g.font = '110px "Sedgwick Ave Display", cursive'; g.fillText(lines[0], 256, 230);
    g.fillStyle = fg; g.font = '900 64px "Black Han Sans", sans-serif'; g.fillText(lines[1], 256, 340);
    g.font = '700 34px "Noto Sans KR"'; lines.slice(2).forEach((t, i) => g.fillText(t, 256, 440 + i * 56));
    g.fillStyle = accent; g.fillRect(96, 610, 320, 70); g.fillStyle = bg; g.font = '900 34px "Noto Sans KR"'; g.fillText('🛒 프로샵에서 보기', 256, 657);
  });
  const add = (px, pz, rotY, tex, item) => {
    const [x, z] = m([px, pz]);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.25), new THREE.MeshBasicMaterial({ map: tex }));
    mesh.position.set(x, 2.2, z); mesh.rotation.y = rotY; mesh.userData.item = item;
    scene.add(mesh); billboards.push(mesh);
  };
  const himTex = poster(['HIM', '힘 에디션', '스파이시 최강 암벽화', '마찰·엣지·오버행 MAX'], '#111111', '#ffffff', '#e3262b');
  add(291, 975, Math.PI / 2, himTex, 'him');
  const photo = new Image();
  photo.onload = () => {
    const c = himTex.image, g = c.getContext('2d');
    g.fillStyle = '#111'; g.fillRect(0, 70, 512, 530);
    g.fillStyle = '#f4f2ee'; g.fillRect(36, 250, 440, 330);
    g.drawImage(photo, 46, 258, 420, 314);
    g.textAlign = 'center'; g.fillStyle = '#e3262b'; g.font = '100px "Sedgwick Ave Display", cursive'; g.fillText('HIM', 256, 170);
    g.fillStyle = '#fff'; g.font = '900 54px "Black Han Sans", sans-serif'; g.fillText('힘 에디션 151,000원', 256, 234);
    himTex.needsUpdate = true;
  };
  photo.src = SHOES[0].photo;
  add(579, 1000, -Math.PI / 2, poster(['BITE', '클라이밍 팬츠', '하이스텝도 쭉쭉', '발 닿는 거리 +8cm'], '#28331f', '#f3f0e4', '#c8f03c'), 'bite');
}

// =================================================================
// 🧗 등반 인던 (2D) — 사지와 엉덩이 포지셔닝으로 무게중심·효율 → 펌핑
// =================================================================
const ARM = 0.78, LEG = 0.95, TORSO = 0.55, SH_W = 0.2, HIP_W = 0.11;
const LIMB_KEYS = ['lh', 'rh', 'lf', 'rf'];
const LIMB_NAME = { lh: '왼손', rh: '오른손', lf: '왼발', rf: '오른발' };
const inst = { on: false, drags: new Map(), fx: [] };
const isHand = (k) => k[1] === 'h';
const sideOf = (k) => (k[0] === 'l' ? -1 : 1);
const limbMax = (k) => (isHand(k) ? ARM : LEG + gear().leg);
function jointOf(k, hip = inst.hip) {
  return isHand(k) ? { x: hip.x + sideOf(k) * SH_W, y: hip.y + TORSO } : { x: hip.x + sideOf(k) * HIP_W, y: hip.y };
}
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function instX(u) { return inst.st.closed ? inst.uc + signedDu(inst.st, u, inst.uc) : u; }
function instU(x) { return wrapU(inst.st, x); }

function enterInstance(p, st) {
  inst.on = true; inst.p = p; inst.st = st; inst.uc = p.start.u;
  inst.angle = st.sec.angle ?? 10;
  inst.H = st.H;
  inst.holds = st.holds.filter((h) => !h.tap || h.problem === p).map((h) => ({ h, x: instX(h.u), y: h.v, prob: h.problem === p, rot: (h.u * 7.3 + h.v * 3.1) % Math.PI }));
  const s = inst.holds.find((o) => o.h === p.start);
  inst.hip = { x: s.x, y: Math.max(0.82, s.y - TORSO - 0.45) };
  inst.limbs = {};
  LIMB_KEYS.forEach((k) => { inst.limbs[k] = { hold: null, x: 0, y: 0, pump: 0, chalky: 0, drag: false }; });
  instAttach('lh', s); instAttach('rh', s);
  instAutoFoot('lf'); instAutoFoot('rf');
  instConstrainHip();
  inst.auto = Store.data.autoPose !== false; inst.hipR = { ...inst.hip }; inst.boing = 0;
  LIMB_KEYS.forEach((k) => { const l = inst.limbs[k]; l.flag = null; l.r = null; });
  inst.hipIn = false; inst.done = false; inst.doneT = 0; inst.bdT = 0; inst.noHandT = 0; inst.gauge = null;
  inst.t = 0; inst.camX = s.x; inst.camY = -0.3; inst.drags.clear(); inst.fx = []; inst.swing = 0; inst.msgT = 0;
  inst.stats = { eff: 1, foot: 0, imb: 0, straight: 1 };
  pl.mode = 'inst'; pl.strip = st; pl.problem = p; pl.topped = false; pl.pump = 0;
  me.setClimbing(true); me.sitting = false;
  document.body.classList.add('inst');
  $('#inst').hidden = false;
  $('#inst-title').innerHTML = `<span style="color:${p.color === 'black' ? '#fff' : p.hex}">${problemLabel(p)}</span> <small>${st.sec.name} · ${inst.angle > 0 ? `오버행 ${inst.angle}°` : inst.angle < 0 ? `슬랩 ${-inst.angle}°` : '수직'}</small>`;
  $('#inst-auto').setAttribute('aria-pressed', inst.auto ? 'true' : 'false');
  resizeInst();
  instSync();
}
function exitInstanceUI() {
  if (!inst.on) return;
  inst.on = false; inst.gauge = null; inst.drags.clear();
  document.body.classList.remove('inst');
  $('#inst').hidden = true;
  $('#gauge').hidden = true;
}
function instAttach(k, o) { const l = inst.limbs[k]; l.hold = o; l.x = o.x; l.y = o.y; }
function instAutoFoot(k) {
  const j = jointOf(k);
  let best = null, bs = Infinity;
  inst.holds.forEach((o) => {
    if (o.h.tap || o.y > inst.hip.y - 0.12) return;
    if (d2(j, o) > LEG) return;
    const sc = Math.abs(o.x - (j.x + sideOf(k) * 0.15)) + Math.abs(o.y - (inst.hip.y - 0.7)) * 0.8;
    if (sc < bs) { bs = sc; best = o; }
  });
  if (best) instAttach(k, best); else inst.limbs[k].hold = null;
}
function instConstrainHip() {
  const hip = inst.hip;
  for (let it = 0; it < 8; it++) {
    LIMB_KEYS.forEach((k) => {
      const l = inst.limbs[k];
      if (!l.hold) return;
      const j = jointOf(k, hip), d = d2(j, l.hold), mx = limbMax(k);
      if (d > mx) { const f = (d - mx) / d; hip.x += (l.hold.x - j.x) * f; hip.y += (l.hold.y - j.y) * f; }
    });
  }
  hip.y = clamp(hip.y, 0.45, inst.H - 0.35);
}
function instFreePos(k) {
  const j = jointOf(k), sd = sideOf(k);
  const fl = inst.limbs[k].flag;
  if (fl) return { x: inst.hip.x + fl.dx, y: Math.max(0.05, inst.hip.y + fl.dy) };
  return isHand(k) ? { x: j.x + sd * 0.18, y: j.y - 0.5 } : { x: j.x + sd * 0.06 + Math.sin(inst.t * 3 + sd) * 0.04, y: Math.max(0.05, j.y - 0.82) };
}
function instBagPos() { return { x: inst.hip.x, y: inst.hip.y + 0.05 }; }

// ---------- 화면 좌표 ----------
const instV = { w: 0, h: 0, s: 100, cx: 0, y0: 0, k: 0 };
function resizeInst() {
  const cv = $('#inst-cv');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  instV.w = window.innerWidth; instV.h = window.innerHeight;
  cv.width = instV.w * dpr; cv.height = instV.h * dpr;
  cv.style.width = instV.w + 'px'; cv.style.height = instV.h + 'px';
  cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  const top = 96, bottom = 70;
  const span = Math.min((inst.H || 4.3) + 0.4, 3.9); // 한 화면에 보이는 높이 (벽이 높으면 몸을 따라 스크롤)
  instV.s = Math.min((instV.h - top - bottom) / span, instV.w / 3.4);
  instV.vh = (instV.h - top - bottom) / instV.s;
  instV.y0 = instV.h - bottom;
  instV.cx = instV.w / 2;
  instV.k = clamp((inst.angle || 0) / 90, -0.3, 0.6) * 0.9; // 오버행일수록 위가 넓어 보임
}
function w2s(x, y) { const sc = instV.s * (1 + instV.k * (y / inst.H)); return [instV.cx + (x - inst.camX) * sc, instV.y0 - (y - inst.camY) * instV.s]; }
function s2w(px, py) { const y = (instV.y0 - py) / instV.s + inst.camY; const sc = instV.s * (1 + instV.k * (y / inst.H)); return { x: inst.camX + (px - instV.cx) / sc, y }; }

// ---------- 입력 ----------
function instPointerDown(e) {
  if (!inst.on || inst.done) return;
  e.preventDefault();
  if (inst.gauge) { instFireGauge(); return; }
  const w = s2w(e.offsetX, e.offsetY);
  let best = null, bd = Infinity;
  LIMB_KEYS.forEach((k) => {
    const l = inst.limbs[k];
    const pos = l.r || (l.hold ? l.hold : instFreePos(k)); // 화면에 그려진 위치로 판정
    const [sx, sy] = w2s(pos.x, pos.y);
    const d = Math.hypot(sx - e.offsetX, sy - e.offsetY);
    if (d < 40 && d < bd) { bd = d; best = k; }
  });
  e.currentTarget.setPointerCapture(e.pointerId);
  if (best) {
    const l = inst.limbs[best];
    l.hold = null; l.flag = null; l.drag = true; l.x = w.x; l.y = w.y;
    inst.drags.set(e.pointerId, { k: best });
    Sound.tone(300, 0.04, 'triangle', 0.04);
  } else {
    // 몸통(엉덩이) 끌기
    const [hx, hy] = w2s(inst.hip.x, inst.hip.y + 0.25);
    if (Math.hypot(hx - e.offsetX, hy - e.offsetY) < instV.s * 0.6) inst.drags.set(e.pointerId, { k: 'hip', ox: inst.hip.x - w.x, oy: inst.hip.y - w.y });
  }
}
function instPointerMove(e) {
  const dr = inst.drags.get(e.pointerId);
  if (!dr) return;
  const w = s2w(e.offsetX, e.offsetY);
  if (dr.k === 'hip') {
    inst.hip.x = w.x + dr.ox; inst.hip.y = w.y + dr.oy;
    instConstrainHip();
  } else { const l = inst.limbs[dr.k]; l.x = w.x; l.y = w.y; }
}
function instPointerUp(e) {
  const dr = inst.drags.get(e.pointerId);
  inst.drags.delete(e.pointerId);
  if (!dr || dr.k === 'hip') return;
  const k = dr.k, l = inst.limbs[k];
  l.drag = false;
  const w = { x: l.x, y: l.y };
  let best = null, bd = Infinity;
  inst.holds.forEach((o) => {
    if (isHand(k) && !o.prob) return;
    if (!isHand(k) && o.h.tap) return;
    const d = d2(w, o);
    if (d < 0.3 && d < bd) { bd = d; best = o; }
  });
  // 홀드가 없고 초크백 근처면 초크
  if (!best && isHand(k) && d2(w, instBagPos()) < 0.28) { instChalk(k); return; }
  if (!best) return;
  const j = jointOf(k);
  if (d2(j, best) <= limbMax(k)) { instGrab(k, best); return; }
  // 자동 자세: 조금 멀면 몸을 끌어올려서 잡기 (다른 손이 안 놓치는 선에서)
  if (isHand(k) && inst.auto && d2(j, best) <= ARM + 0.65) {
    const other = k === 'lh' ? 'rh' : 'lh', oh = inst.limbs[other].hold;
    const dd = d2(j, best), need = dd - ARM + 0.03;
    const nh = { x: inst.hip.x + ((best.x - j.x) / dd) * need, y: inst.hip.y + ((best.y - j.y) / dd) * need };
    if (!oh || d2(jointOf(other, nh), oh) <= ARM) { inst.hip.x = nh.x; inst.hip.y = nh.y; instGrab(k, best); return; }
  }
  if (isHand(k) && d2(j, best) <= ARM + 0.25) { instMsg('조금 멀어요 — 엉덩이를 올리거나 발을 높여봐요'); return; }
  if (isHand(k) && d2(j, best) <= 3.1) { instStartDyno(k, best); return; }
  instMsg(`${LIMB_NAME[k]}이 안 닿아요 — 두 손을 모으고(매칭) 엉덩이를 올려봐요`);
}
function instGrab(k, o) {
  instAttach(k, o);
  Sound.grab();
  instFx(o.x, o.y, isHand(k) ? 'grab' : 'step');
  inst.boing = 1;
  if (isHand(k)) {
    instFx(o.x, o.y + 0.25, 'text', pick(['영차!', '으쌰!', '잡았다!', '착!', '가즈아']));
    if (inst.auto) instAutoBody();
  }
}
// 손을 옮기면 엉덩이와 발이 알아서 편한 자리로 (팔 쭉, 발은 엉덩이 아래)
function instAutoBody() {
  const L = inst.limbs, hands = ['lh', 'rh'].filter((k) => L[k].hold);
  if (!hands.length) return;
  const hy = Math.min(...hands.map((k) => L[k].hold.y)), hx = hands.reduce((a, k) => a + L[k].hold.x, 0) / hands.length;
  inst.hip.x = hx; inst.hip.y = hy - TORSO - ARM * 0.8;
  ['lf', 'rf'].forEach((k) => { L[k].hold = null; L[k].flag = null; });
  instConstrainHip();
  ['lf', 'rf'].forEach((k) => instAutoFoot(k));
  instConstrainHip();
}
// 🦵 플래깅: 지지점 반대편 발을 반대쪽으로 쭉 뻗어서 무게중심 되돌리기
function instFlag() {
  const L = inst.limbs, hip = inst.hip;
  const sup = ['lh', 'rh', 'lf', 'rf'].filter((k) => L[k].hold);
  if (!sup.length) return;
  const sx = sup.reduce((a, k) => a + L[k].hold.x, 0) / sup.length;
  const dir = Math.sign(sx - hip.x) || 1;
  const k = dir > 0 ? 'lf' : 'rf';
  L[k].hold = null; L[k].flag = { dx: dir * 0.78, dy: -0.32 };
  const fp = instFreePos(k);
  instFx(fp.x, fp.y + 0.15, 'text', '플래깅!');
  instMsg('🦵 플래깅! 다리를 쭉 뻗어서 중심을 잡았어요');
  Sound.tone(660, 0.06, 'triangle', 0.06);
  inst.boing = 1;
  if (Math.random() < 0.5) westPraise('tech', 700);
}
function instToggleAuto() {
  inst.auto = !inst.auto; Store.data.autoPose = inst.auto; Store.save();
  $('#inst-auto').setAttribute('aria-pressed', inst.auto ? 'true' : 'false');
  instMsg(inst.auto ? '🤖 자동 자세 ON — 손만 옮기면 몸과 발이 따라와요' : '자동 자세 OFF — 손·발·엉덩이를 직접!');
}
function instKey(code) {
  if (code === 'KeyF') { instFlag(); return true; }
  if (code === 'KeyA' && !inst.drags.size) { instToggleAuto(); return true; }
  if (code === 'Space') { if (inst.gauge) instFireGauge(); return true; }
  if (code === 'KeyH') { instToggleHip(); return true; }
  if (code === 'KeyE') { letGo('down'); return true; }
  if (code === 'KeyC') { const k = inst.limbs.lh.pump > inst.limbs.rh.pump ? 'lh' : 'rh'; instChalk(k); return true; }
  return false;
}
function instToggleHip() {
  inst.hipIn = !inst.hipIn;
  $('#inst-hip').setAttribute('aria-pressed', inst.hipIn ? 'true' : 'false');
  instMsg(inst.hipIn ? '🍑 엉덩이를 벽에 붙였어요' + (inst.angle > 10 ? ' — 오버행에선 팔이 편해져요' : '') : '엉덩이를 벽에서 뗐어요');
}
function instChalk(k) {
  const l = inst.limbs[k];
  if (!pl.chalkReady) { instMsg('초크는 잠깐 있다가~'); return; }
  pl.chalkReady = false; setTimeout(() => { pl.chalkReady = true; }, 2500);
  l.pump = Math.max(0, l.pump - 22); l.chalky = 20;
  Sound.chalk();
  instFx(inst.hip.x, inst.hip.y, 'chalk');
  me.chalk(); Net.event('chalk'); onChalkUsed();
  instMsg(`${LIMB_NAME[k]} 초크 충전 🤍`);
}
function instMsg(t) { const el = $('#inst-msg'); el.textContent = t; el.classList.add('show'); clearTimeout(inst.msgTimer); inst.msgTimer = setTimeout(() => el.classList.remove('show'), 2000); }
function instFx(x, y, kind, text) {
  if (kind === 'text') { inst.fx.push({ x, y, vx: 0, vy: 0.5, life: 0, max: 0.9, text }); return; }
  const n = kind === 'chalk' ? 22 : kind === 'grab' ? 8 : 5;
  for (let i = 0; i < n; i++) inst.fx.push({ x, y, vx: (Math.random() - 0.5) * (kind === 'chalk' ? 1.6 : 0.8), vy: Math.random() * 0.8, life: 0, max: 0.5 + Math.random() * 0.6, r: kind === 'chalk' ? 4 + Math.random() * 6 : 2 + Math.random() * 3 });
}

// ---------- 다이노 (게이지) ----------
function instStartDyno(k, o) {
  const j = jointOf(k);
  const from = inst.limbs[k === 'lh' ? 'rh' : 'lh'].hold;
  const q = Math.min(from ? from.h.q : 0.7, o.h.q);
  const dist = d2(j, o);
  inst.gauge = { k, o, t: 0, speed: 1.0 + (1 - q) * 0.7 + inst.p.level * 0.04, center: clamp(0.25 + (dist - ARM) / (3.1 - ARM) * 0.6, 0.12, 0.9), width: 0.1 + 0.26 * q };
  instMsg('다이노! 초록 칸에서 탭 / Space');
}
function instFireGauge() {
  const g = inst.gauge;
  const ph = g.t % 2, pos = ph < 1 ? ph : 2 - ph;
  const diff = Math.abs(pos - g.center);
  const ok = diff <= g.width / 2, perfect = diff <= g.width * 0.22;
  inst.gauge = null;
  $('#gauge').hidden = true;
  const head = me.group.position.clone().add(new V3(0, 1.6, 0));
  if (!ok) { popText(pos < g.center ? '힘 부족…' : '너무 셌다!', head, 0.26); instMsg('다이노 실패!'); setTimeout(() => { if (inst.on) letGo('fall'); }, 250); return; }
  popText(perfect ? 'PERFECT!' : 'GOOD!', head, perfect ? 0.36 : 0.3);
  // 몸을 날려서 그 손으로 목표 홀드 잡기, 나머지는 떨어짐(컷루즈)
  const k = g.k, o = g.o, sd = sideOf(k);
  const sh = { x: o.x - sd * 0.05, y: o.y - ARM * 0.88 };
  inst.hip.x = sh.x - sd * SH_W; inst.hip.y = sh.y - TORSO;
  LIMB_KEYS.forEach((kk) => { inst.limbs[kk].hold = null; });
  instAttach(k, o);
  inst.limbs[k].pump += perfect ? 4 : 9;
  inst.swing = sd * 0.5;
  instFx(o.x, o.y, 'grab');
  Sound.grab(); Sound.tone(660, 0.12, 'triangle', 0.08, 0.02);
  if (o.h.tap) {
    // 더블다이노: 터치 홀드에서 곧바로 한 번 더
    const next = inst.holds.filter((h) => h.prob && !h.h.tap && h.y > o.y + 0.3).sort((a, b) => a.y - b.y)[0];
    if (next) { popText('더블!!', head, 0.36); setTimeout(() => { if (inst.on) instStartDyno(k, next); }, 120); pl.didDouble = true; return; }
  }
  if (pl.didDouble) { toast('🔥🔥 더블다이노 성공!!', 2200); Store.data.doubles = (Store.data.doubles || 0) + 1; Store.save(); pl.didDouble = false; }
  else toast('🔥 다이노 성공!', 1600);
  westPraise('dyno', 400);
  setTimeout(() => { if (inst.on && inst.auto && !inst.gauge) { instAutoBody(); instFx(inst.hip.x, inst.hip.y - 0.3, 'text', '발 착!'); } }, 450);
}

// ---------- 물리: 무게중심, 효율, 펌핑 ----------
function updateInstance(dt) {
  inst.t += dt;
  const L = inst.limbs, hip = inst.hip, ang = inst.angle;
  if (inst.gauge) {
    inst.gauge.t += dt * inst.gauge.speed;
    const g = $('#gauge'); g.hidden = false; g.classList.remove('double');
    const ph = inst.gauge.t % 2, pos = ph < 1 ? ph : 2 - ph;
    $('#g-zone').style.display = $('#g-perfect').style.display = 'block';
    $('#g-zone').style.left = ((inst.gauge.center - inst.gauge.width / 2) * 100) + '%'; $('#g-zone').style.width = (inst.gauge.width * 100) + '%';
    $('#g-perfect').style.left = ((inst.gauge.center - inst.gauge.width * 0.22) * 100) + '%'; $('#g-perfect').style.width = (inst.gauge.width * 44) + '%';
    $('#g-mark').style.left = (pos * 100) + '%';
    $('#g-label').textContent = `다이노 — 초록 칸에서 탭! (${inst.gauge.o.h.tap ? '터치 홀드 TAP' : inst.gauge.o.h.type.n})`;
  }
  const hands = ['lh', 'rh'].filter((k) => L[k].hold), feet = ['lf', 'rf'].filter((k) => L[k].hold);
  // 발에 실리는 무게
  let foot = 0;
  if (feet.length) {
    const gr = gear();
    let base = clamp(0.72 - ang * 0.013, 0.08, 0.86) * (0.82 + 0.3 * gr.f) * (ang > 12 ? 0.7 + 0.4 * gr.h : 1);
    if (inst.hipIn) base += ang > 5 ? ang * 0.007 : 0.06;
    const below = feet.filter((k) => L[k].hold.y < hip.y - 0.05).length / feet.length;
    const fq = feet.reduce((a, k) => a + Math.sqrt(Math.min(1, L[k].hold.h.q + 0.3 * gr.e)), 0) / feet.length;
    foot = clamp(base * (feet.length === 2 ? 1 : 0.6) * fq * (0.45 + 0.55 * below), 0, 0.9);
  }
  // 무게중심 (자유로운 발을 반대쪽으로 뻗으면 플래깅 → 중심이 돌아옴)
  let cogX = hip.x;
  let flag = false;
  ['lf', 'rf'].forEach((k) => {
    if (L[k].hold) return;
    const fp = L[k].drag ? L[k] : instFreePos(k);
    if (Math.abs(fp.x - hip.x) > 0.3) { cogX += (fp.x - hip.x) * 0.35; flag = true; }
  });
  const sup = [...hands, ...feet].map((k) => L[k].hold.x);
  const fx = feet.length ? feet.map((k) => L[k].hold.x) : sup;
  let imb = 0;
  if (fx.length) {
    const lo = Math.min(...fx) - 0.1, hi = Math.max(...fx) + 0.1;
    imb = clamp((cogX < lo ? lo - cogX : cogX > hi ? cogX - hi : 0) / 0.5, 0, 1);
  }
  // 바니도어: 한쪽 손발만 걸쳐서 몸이 문짝처럼 돌아감
  const allLeft = sup.length && sup.every((x) => x < cogX - 0.06), allRight = sup.length && sup.every((x) => x > cogX + 0.06);
  const barn = (allLeft || allRight) && feet.length >= 1 && sup.length <= 3 && !inst.gauge;
  if (barn) inst.bdT += dt; else inst.bdT = Math.max(0, inst.bdT - dt * 2);
  if (barn && inst.auto && inst.bdT > 0.7 && !L.lf.flag && !L.rf.flag) instFlag();
  inst.swing = lerp(inst.swing, barn ? (allLeft ? -1 : 1) * Math.min(1, inst.bdT) * 0.6 : 0, damp(4, dt));
  if (inst.bdT > 3.0) { instMsg('🚪 바니도어! 몸이 돌아갔어요 — 반대 발로 플래깅!'); popText('바니도어!', me.group.position.clone().add(new V3(0, 1.6, 0)), 0.3); letGo('fall'); return; }
  // 팔 펴기
  let straight = 1;
  if (hands.length) straight = hands.reduce((a, k) => a + clamp((d2(jointOf(k), L[k].hold) / ARM - 0.5) / 0.42, 0, 1), 0) / hands.length;
  const arm = clamp((1 - foot) * (1 + imb * 0.9) * (inst.hipIn || ang <= 5 ? 1 : 1 + ang * 0.008), 0, 1.8);
  // 손별 펌핑
  const lvl = 1 + inst.p.level * 0.06;
  ['lh', 'rh'].forEach((k) => {
    const l = L[k];
    if (l.chalky > 0) l.chalky -= dt;
    if (l.hold) {
      const st1 = clamp((d2(jointOf(k), l.hold) / ARM - 0.5) / 0.42, 0, 1);
      const bent = 1.35 - 0.6 * st1;
      const share = arm / hands.length;
      const rate = share * 1.5 / Math.pow(l.hold.h.q, 0.7) * bent * lvl * (l.chalky > 0 ? 0.85 : 1) * gear().pumpMul;
      l.pump += (share < 0.15 ? -2 : rate) * dt;
    } else if (!l.drag && hands.length) l.pump -= 10 * dt; // 털기
    l.pump = clamp(l.pump, 0, 100);
    if (l.hold && l.pump >= 100) { l.hold = null; instMsg(`💥 ${LIMB_NAME[k]} 펌핑 한계! 손이 풀렸어요`); popText('손 풀림!', me.group.position.clone().add(new V3(0, 1.5, 0)), 0.26); }
  });
  // 손이 하나도 없으면 추락 (잠깐 유예)
  if (!['lh', 'rh'].some((k) => L[k].hold) && !inst.gauge) {
    inst.noHandT += dt;
    if (inst.noHandT > 0.35) { instMsg('손이 다 떨어졌어요!'); letGo('fall'); return; }
  } else inst.noHandT = 0;
  // 완등: TOP 매칭
  const top = inst.holds.find((o) => o.h === inst.p.top);
  if (!inst.done && L.lh.hold === top && L.rh.hold === top) {
    inst.done = true; inst.doneT = 0;
    sendProblem(inst.p);
    instMsg('🔥 TOP 매칭! 완등!');
  }
  if (inst.done) { inst.doneT += dt; if (inst.doneT > (pl.topHoldMax || 3) + 0.5) { letGo('down'); return; } }
  inst.stats = { eff: clamp(1 - arm * 0.62, 0, 1), foot, imb, straight, feet: feet.length, barn, flag };
  pl.pump = Math.max(L.lh.pump, L.rh.pump);
  inst.camX = lerp(inst.camX, hip.x, damp(3, dt));
  const camYT = clamp(hip.y + 0.55 - instV.vh / 2, -0.3, Math.max(-0.3, inst.H + 0.25 - instV.vh));
  inst.camY = lerp(inst.camY, camYT, damp(3, dt));
  instSync();
  renderInst(dt);
  updateInstHud();
}
// 3D 세상의 내 캐릭터도 같은 자세로
function instSync() {
  const st = inst.st, hip = inst.hip;
  pl.u = instU(hip.x); pl.v = hip.y + BODY_DROP;
  const [s] = segAt(st, pl.u);
  const bp = surf(st, pl.u, hip.y - 0.3).addScaledVector(s.n3, inst.hipIn ? 0.22 : 0.42);
  pl.pos.copy(bp);
  me.group.position.lerp(bp, 0.4);
  me.group.rotation.y = Math.atan2(-s.n3.x, -s.n3.z);
  me.grips = me.grips || [new V3(), new V3(), new V3(), new V3()];
  LIMB_KEYS.forEach((k, i) => {
    const l = inst.limbs[k];
    const p = l.hold ? l.hold : l.drag ? l : instFreePos(k);
    const u = instU(p.x);
    surf(st, u, Math.max(0.05, p.y), me.grips[i]).addScaledVector(segAt(st, u)[0].n3, l.hold ? 0.07 : 0.2);
  });
  me.campus = !inst.limbs.lf.hold && !inst.limbs.rf.hold;
}

// ---------- 그리기 ----------
function renderInst(dt) {
  const cv = $('#inst-cv'), g = cv.getContext('2d');
  const W = instV.w, Hh = instV.h, st = inst.st, H = inst.H;
  g.clearRect(0, 0, W, Hh);
  const bg = g.createLinearGradient(0, 0, 0, Hh); bg.addColorStop(0, '#16161a'); bg.addColorStop(1, '#0c0c0e');
  g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
  // 벽 (오버행이면 위가 넓어지는 사다리꼴)
  const x0 = inst.camX - 4, x1 = inst.camX + 4;
  const corners = [w2s(x0, 0), w2s(x1, 0), w2s(x1, H), w2s(x0, H)];
  g.beginPath(); corners.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
  g.fillStyle = st.sec.dark ? '#46414d' : st.sec.id === 'trial' ? '#efede7' : '#e6c18c'; g.fill();
  const shade = g.createLinearGradient(0, corners[3][1], 0, corners[0][1]);
  shade.addColorStop(0, inst.angle > 0 ? 'rgba(0,0,0,.28)' : 'rgba(255,255,255,.12)'); shade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = shade; g.fill();
  // 볼트 구멍, 판넬 이음새
  g.fillStyle = 'rgba(90,60,30,.45)';
  for (let y = 0.1; y < H; y += 0.2) for (let x = Math.floor(x0 / 0.2) * 0.2; x < x1; x += 0.2) { const [sx, sy] = w2s(x, y); g.fillRect(sx - 1.2, sy - 1.2, 2.4, 2.4); }
  g.strokeStyle = 'rgba(120,85,50,.5)'; g.lineWidth = 1.5;
  for (let x = Math.floor(x0 / 1.2) * 1.2; x < x1; x += 1.2) { const [ax, ay] = w2s(x, 0), [bx, by] = w2s(x, H); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
  // 섹터 띠 + 매트
  const [tlx, tly] = w2s(x0, H), [trx] = w2s(x1, H);
  g.fillStyle = st.sec.color; g.fillRect(tlx, tly - 10, trx - tlx, 10);
  const [mlx, mly] = w2s(x0, 0), [mrx] = w2s(x1, 0);
  g.fillStyle = '#c3c8ce'; g.fillRect(mlx - 40, mly, mrx - mlx + 80, 26);
  g.fillStyle = '#8c939b'; g.fillRect(mlx - 40, mly + 26, mrx - mlx + 80, 14);
  // 홀드
  const drag = [...inst.drags.values()].find((d) => d.k !== 'hip');
  inst.holds.forEach((o) => {
    if (o.x < x0 - 0.3 || o.x > x1 + 0.3) return;
    const [sx, sy] = w2s(o.x, o.y);
    const sc = instV.s * (1 + instV.k * (o.y / H));
    const r = o.h.size * 1.6 * sc, t = o.h.type.sc;
    g.save(); g.translate(sx, sy); g.rotate(o.rot);
    g.globalAlpha = o.prob ? 1 : 0.42;
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(2, 4, r * t[0] * 1.15, r * t[1], 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = o.h.hex; g.beginPath(); g.ellipse(0, 0, r * t[0] * 1.15, r * t[1], 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.ellipse(-r * 0.3, -r * 0.3 * t[1], r * 0.35, r * 0.18, 0, 0, Math.PI * 2); g.fill();
    g.restore(); g.globalAlpha = 1;
    // 끌고 있는 손발이 닿는 홀드 강조
    if (drag) {
      const k = drag.k;
      const allowed = isHand(k) ? o.prob : !o.h.tap;
      if (allowed) {
        const reach = d2(jointOf(k), o) <= limbMax(k);
        if (reach || (isHand(k) && d2(jointOf(k), o) > ARM + 0.25 && d2(jointOf(k), o) <= 3.1)) {
          g.strokeStyle = reach ? 'rgba(47,210,107,.95)' : 'rgba(255,207,74,.9)'; g.lineWidth = 3; g.setLineDash(reach ? [] : [5, 4]);
          g.beginPath(); g.arc(sx, sy, r * 1.4 + 8, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
        }
      }
    }
    if (o.prob && (o.h === inst.p.start || o.h === inst.p.top || o.h.tap)) {
      g.fillStyle = o.h.hex; g.font = '900 13px "Noto Sans KR", sans-serif';
      const txt = o.h === inst.p.start ? 'S' : o.h.tap ? 'TAP' : 'TOP';
      const tw = g.measureText(txt).width + 10;
      g.fillRect(sx - r - tw - 4, sy - 9, tw, 18);
      g.fillStyle = DARK_TAPE.includes(inst.p.color) ? '#fff' : '#111';
      g.fillText(txt, sx - r - tw + 1, sy + 5);
    }
  });
  // 캐릭터
  drawInstClimber(g);
  // 이펙트
  for (let i = inst.fx.length - 1; i >= 0; i--) {
    const f = inst.fx[i]; f.life += dt;
    if (f.life > f.max) { inst.fx.splice(i, 1); continue; }
    f.x += f.vx * dt; f.y += f.vy * dt; f.vy -= 0.6 * dt;
    const [sx, sy] = w2s(f.x, f.y);
    if (f.text) {
      const a = 1 - f.life / f.max, sc = f.life < 0.12 ? 0.6 + f.life * 4 : 1.08;
      g.save(); g.globalAlpha = a; g.translate(sx, sy); g.scale(sc, sc);
      g.font = '900 22px "Black Han Sans", sans-serif'; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = '#e3262b'; g.lineJoin = 'round';
      g.strokeText(f.text, 0, 0); g.fillStyle = '#fff'; g.fillText(f.text, 0, 0); g.restore();
      continue;
    }
    g.fillStyle = `rgba(255,255,255,${(1 - f.life / f.max) * 0.85})`;
    g.beginPath(); g.arc(sx, sy, f.r * (1 + f.life), 0, Math.PI * 2); g.fill();
  }
  drawInstSide();
}
function limbBend(a, b, len, outward) {
  // 두 마디 팔다리: 가운데 관절을 바깥쪽으로 굽혀서 그리기
  const d = Math.min(Math.hypot(b[0] - a[0], b[1] - a[1]), len * 0.999);
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const h = Math.sqrt(Math.max(0, (len / 2) ** 2 - (d / 2) ** 2));
  const nx = -(b[1] - a[1]), ny = b[0] - a[0], nl = Math.hypot(nx, ny) || 1;
  return [mx + (nx / nl) * h * outward, my + (ny / nl) * h * outward];
}
function drawInstClimber(g) {
  const L = inst.limbs, s = instV.s, dt = 1 / 60;
  // 부드럽게 따라가는 렌더 위치 (홀드 잡을 때 쓱 움직이는 느낌)
  inst.hipR.x = lerp(inst.hipR.x, inst.hip.x, 0.18); inst.hipR.y = lerp(inst.hipR.y, inst.hip.y, 0.18);
  LIMB_KEYS.forEach((k) => {
    const l = L[k];
    const p = l.hold ? l.hold : l.drag ? l : instFreePos(k);
    if (!l.r || l.drag) l.r = { x: p.x, y: p.y };
    else { l.r.x = lerp(l.r.x, p.x, 0.28); l.r.y = lerp(l.r.y, p.y, 0.28); }
  });
  inst.boing = Math.max(0, inst.boing - dt * 3);
  const hip = { x: inst.hipR.x + inst.swing * 0.1, y: inst.hipR.y + Math.sin(inst.t * 2.2) * 0.012 };
  const color = me.color, dark = new THREE.Color(color).multiplyScalar(0.72).getStyle();
  const g2 = gear();
  const legCol = g2.pants ? g2.pants.c : dark, shoeCol = g2.shoe.id !== 'rental' ? g2.shoe.c : '#2a2a2e';
  const hipS = w2s(hip.x, hip.y), neckS = w2s(hip.x + inst.swing * 0.25, hip.y + TORSO + 0.05);
  const pumpCol = (p) => `rgb(255,${Math.round(230 - p * 1.9)},${Math.round(204 - p * 1.9)})`;
  const limbs = ['lf', 'rf', 'lh', 'rh'];
  limbs.forEach((k) => {
    const l = L[k];
    const p = l.r;
    const j = jointOf(k, { x: hip.x + (isHand(k) ? inst.swing * 0.25 : 0), y: hip.y });
    const a = w2s(j.x, j.y), b = w2s(p.x, p.y);
    const len = limbMax(k) * s;
    const far = l.drag && Math.hypot(b[0] - a[0], b[1] - a[1]) > len * 1.02;
    const flagged = !!l.flag;
    const m = flagged ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : limbBend(a, b, len, isHand(k) ? -sideOf(k) : sideOf(k));
    g.strokeStyle = far ? 'rgba(227,38,43,.85)' : isHand(k) ? dark : legCol;
    g.lineWidth = Math.max(7, s * (isHand(k) ? 0.1 : 0.12)); g.lineCap = 'round'; g.lineJoin = 'round';
    if (far) g.setLineDash([8, 6]);
    g.beginPath(); g.moveTo(a[0], a[1]);
    if (far) g.lineTo(b[0], b[1]); else { g.lineTo(m[0], m[1]); g.lineTo(b[0], b[1]); }
    g.stroke(); g.setLineDash([]);
    const rr = Math.max(10, s * (isHand(k) ? 0.08 : 0.09));
    if (isHand(k)) {
      g.fillStyle = l.chalky > 0 ? '#ffffff' : pumpCol(l.pump);
      g.strokeStyle = l.hold ? '#fff' : 'rgba(255,255,255,.5)'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(b[0], b[1], rr, 0, Math.PI * 2); g.fill(); g.stroke();
      if (l.pump > 70 && l.hold) { g.fillStyle = '#7fd0ff'; g.beginPath(); g.arc(b[0] + rr, b[1] - rr, 3 + Math.sin(inst.t * 9) * 1.2, 0, Math.PI * 2); g.fill(); } // 땀방울
    } else {
      // 암벽화 (플래깅이면 발끝 쭉)
      const ang = flagged ? Math.atan2(b[1] - m[1], b[0] - m[0]) : 0;
      g.save(); g.translate(b[0], b[1]); g.rotate(ang);
      g.fillStyle = shoeCol; g.strokeStyle = l.hold ? '#fff' : 'rgba(255,255,255,.5)'; g.lineWidth = 2.5;
      g.beginPath(); g.ellipse(flagged ? rr * 0.4 : 0, 0, rr * 1.35, rr * 0.75, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.restore();
    }
    if (l.drag) { g.strokeStyle = '#ffcf4a'; g.lineWidth = 3; g.beginPath(); g.arc(b[0], b[1], rr + 7, 0, Math.PI * 2); g.stroke(); }
  });
  // 몸통 + 엉덩이
  g.strokeStyle = dark; g.lineWidth = Math.max(16, s * 0.28); g.lineCap = 'round';
  g.beginPath(); g.moveTo(hipS[0], hipS[1]); g.lineTo(neckS[0], neckS[1]); g.stroke();
  g.fillStyle = legCol; g.beginPath(); g.ellipse(hipS[0], hipS[1] + s * 0.02, s * 0.17, s * 0.12, 0, 0, Math.PI * 2); g.fill();
  // 초크백
  const bag = w2s(instBagPos().x, instBagPos().y);
  g.fillStyle = '#f4f1ea'; g.strokeStyle = '#e3262b'; g.lineWidth = 3;
  g.beginPath(); if (g.roundRect) g.roundRect(bag[0] - s * 0.07, bag[1] - s * 0.08, s * 0.14, s * 0.15, 4); else g.rect(bag[0] - s * 0.07, bag[1] - s * 0.08, s * 0.14, s * 0.15); g.fill(); g.stroke();
  if (inst.hipIn) { g.font = `${Math.max(12, s * 0.12)}px sans-serif`; g.textAlign = 'center'; g.fillText('🍑', hipS[0], hipS[1] + s * 0.05); g.textAlign = 'left'; }
  // 큰 불꽃 머리 (영차 할 때 통통)
  const bo = inst.boing, hw = s * 0.64 * (1 + bo * 0.12), hh = s * 0.64 * (1 - bo * 0.1);
  g.save(); g.translate(neckS[0], neckS[1]); g.rotate(inst.swing * 0.3 + Math.sin(inst.t * 2.4) * 0.04);
  g.translate(-hw / 2, -hh * 0.95); g.scale(hw / 100, hh / 100);
  g.fillStyle = color; g.strokeStyle = '#fff'; g.lineWidth = 6; const fp = new Path2D(FLAME_D); g.fill(fp); g.stroke(fp);
  g.restore();
}
function drawInstSide() {
  // 옆에서 본 단면: 벽 각도, 엉덩이 거리, 중력
  const cv = $('#inst-side'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(14,14,16,.78)'; g.fillRect(0, 0, W, H);
  const a = (inst.angle * Math.PI) / 180, base = [W * 0.62, H - 30], len = H - 70;
  const top = [base[0] - Math.sin(a) * len, base[1] - Math.cos(a) * len];
  g.fillStyle = '#c3c8ce'; g.fillRect(10, H - 30, W - 20, 10);
  g.strokeStyle = '#e6c18c'; g.lineWidth = 10; g.lineCap = 'round';
  g.beginPath(); g.moveTo(base[0], base[1]); g.lineTo(top[0], top[1]); g.stroke();
  // 몸 (엉덩이 붙이면 벽에 가깝게)
  const t = clamp((inst.hip.y - 0.2) / inst.H, 0, 1);
  const wx = base[0] - Math.sin(a) * len * t, wy = base[1] - Math.cos(a) * len * t;
  const off = inst.hipIn ? 22 : 46;
  const hx = wx - Math.cos(a) * off, hy = wy + Math.sin(a) * off;
  g.strokeStyle = me.color; g.lineWidth = 6;
  const handT = clamp(t + 0.22, 0, 1), footT = clamp(t - 0.18, 0, 1);
  const hpx = base[0] - Math.sin(a) * len * handT - 6, hpy = base[1] - Math.cos(a) * len * handT;
  const fpx = base[0] - Math.sin(a) * len * footT - 6, fpy = base[1] - Math.cos(a) * len * footT;
  g.beginPath(); g.moveTo(hpx, hpy); g.lineTo(hx, hy); g.lineTo(fpx, fpy); g.stroke();
  g.fillStyle = me.color; g.beginPath(); g.arc(hx - 4, hy - 26, 13, 0, Math.PI * 2); g.fill();
  // 중력 화살표
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx, hy + 34); g.stroke();
  g.beginPath(); g.moveTo(hx - 5, hy + 28); g.lineTo(hx, hy + 34); g.lineTo(hx + 5, hy + 28); g.stroke();
  g.fillStyle = '#fff'; g.font = '700 15px "Noto Sans KR", sans-serif';
  g.fillText(inst.angle > 0 ? `오버행 ${inst.angle}°` : inst.angle < 0 ? `슬랩 ${-inst.angle}°` : '수직', 12, 22);
  g.fillStyle = inst.hipIn ? '#ffcf4a' : '#a29d97'; g.font = '700 13px "Noto Sans KR", sans-serif';
  g.fillText(inst.hipIn ? '엉덩이 붙임 🍑' : '엉덩이 뗌', 12, 42);
}
function updateInstHud() {
  const st = inst.stats, L = inst.limbs;
  $('#inst-eff').textContent = Math.round(st.eff * 100) + '%';
  $('#inst-eff').style.color = st.eff > 0.66 ? '#2fd26b' : st.eff > 0.4 ? '#ffcf4a' : '#ff6b6b';
  $('#pump-l').style.width = L.lh.pump + '%'; $('#pump-r').style.width = L.rh.pump + '%';
  const ck = (ok, good, bad) => `<li class="${ok ? 'ok' : 'no'}">${ok ? '✔' : '✖'} ${ok ? good : bad}</li>`;
  const over = inst.angle > 10;
  $('#inst-checks').innerHTML =
    ck(st.feet === 2, '발 두 개', st.feet === 1 ? '발 하나뿐 — 나머지 발도 올려요' : '발이 없어요 — 캠퍼싱 중!') +
    ck(st.straight > 0.6, '팔 쭉 폈어요', '팔이 굽었어요 — 엉덩이를 낮춰요') +
    ck(st.imb < 0.15, '무게중심 OK', '중심이 치우쳤어요 — 엉덩이를 발 위로') +
    (over ? ck(inst.hipIn, '엉덩이 붙임', '오버행! 엉덩이를 벽에 붙여요 (H)') : '') +
    (st.barn ? '<li class="no warn">🚪 바니도어 위험! 반대 발로 플래깅</li>' : st.flag ? '<li class="ok">🦵 플래깅 중</li>' : '');
}

// =================================================================
// 🧗 등반 모드 (3D 고정 카메라) — 다음 홀드를 탭하면 캐릭터가 무브
// 자세는 필요할 때 뜨는 버튼(플래깅 / 엉덩이 / 힐훅)으로
// =================================================================
const ARM_R = 0.44;          // 어깨에서 손까지 (벽 평면 기준) 닿는 거리
const DEAD_R = ARM_R + 0.3;  // 데드포인트(살짝 튀어서 잡기)
const LEG_R = 0.47;
const R = { on: false };
const ringMat = {
  reach: new THREE.MeshBasicMaterial({ color: '#2fd26b', transparent: true, opacity: 0.95, depthTest: false }),
  dead: new THREE.MeshBasicMaterial({ color: '#ffcf4a', transparent: true, opacity: 0.95, depthTest: false }),
  dyno: new THREE.MeshBasicMaterial({ color: '#ff8a1f', transparent: true, opacity: 0.95, depthTest: false }),
  locked: new THREE.MeshBasicMaterial({ color: '#ff2d55', transparent: true, opacity: 0.95, depthTest: false }),
};
const ringGeo = new THREE.TorusGeometry(0.17, 0.022, 8, 28);
const routeRings = [];
const ruv = (h) => ({ u: h.u, v: h.v });
function rDu(a, b) { return signedDu(R.st, a, b); } // a - b
function shoulderOf(side, body) { return { u: body.u + side * BODY.shW, v: body.v + BODY.shY }; }
function hipOf(side, body) { return { u: body.u + side * BODY.hipW, v: body.v + BODY.hipY }; }
function pd(a, b) { return Math.hypot(rDu(a.u, b.u), a.v - b.v); }

// 두 손 홀드로 몸 위치 정하기 (팔이 쭉 펴지는 쪽으로). 안 되면 null
function solveBody(lh, rh, reach = ARM_R) {
  const hi = lh.v >= rh.v ? lh : rh, lo = hi === lh ? rh : lh;
  const mu = R.st.closed ? lh.u + rDu(rh.u, lh.u) / 2 : (lh.u + rh.u) / 2;
  const vMax = lo.v + reach * 0.98 - BODY.shY, vMin = hi.v - reach * 0.98 - BODY.shY;
  const pref = hi.v - reach * 0.86 - BODY.shY;
  for (const du of [0, -0.1, 0.1, -0.2, 0.2]) {
    for (const v of [clamp(pref, vMin, vMax), vMin + 0.02, (vMin + vMax) / 2]) {
      const body = { u: mu + du, v: Math.max(MAT_H - 0.02, v) };
      if (pd(lh, shoulderOf(-1, body)) <= reach + 0.001 && pd(rh, shoulderOf(1, body)) <= reach + 0.001) return body;
    }
  }
  return null;
}
// 발 디딤: 엉덩이 아래 무릎 굽힐 만한 곳 (발은 아무 홀드나)
function pickFeet(body) {
  // 발도 루트 홀드만 (손으로 잡고 있는 홀드는 제외). 없으면 벽에 스미어
  const used = new Set([R.lh, R.rh]);
  return [-1, 1].map((side) => {
    const hp = hipOf(side, body);
    let best = null, bs = Infinity;
    for (const h of R.st.holds) {
      if (h.problem !== R.p || h.tap || used.has(h)) continue;
      const d = pd(h, hp);
      if (d > LEG_R || h.v > hp.v - 0.12) continue;
      const sc = Math.abs(rDu(h.u, hp.u + side * 0.1)) * 1.3 + Math.abs(h.v - (hp.v - 0.32));
      if (sc < bs) { bs = sc; best = h; }
    }
    if (best) { used.add(best); return best; }
    const v = Math.max(MAT_H + 0.06, hp.v - 0.36);
    return { u: hp.u + side * 0.12, v, q: 0.55, smear: true };
  });
}
// 이 홀드로 어떤 손이, 어떤 방식으로 갈 수 있나
function classify(h) {
  const { lh, rh } = R;
  if (h === lh || h === rh) return null;
  const cx = R.p.crux;
  if (cx && cx.lock && !cx.lock.test()) {
    const top = Math.max(lh.v, rh.v);
    // 잠긴 크럭스를 건너뛰는 다이노도 막음
    if (h !== cx && h.v > cx.v + 0.05 && top < cx.v - 0.05) return null;
    if (h === cx) { const r = classifyRaw(h); return r ? { ...r, kind: 'locked', raw: r.kind } : null; }
  }
  return classifyRaw(h);
}
function classifyRaw(h) {
  const { lh, rh } = R;
  const tries = [];
  const lowHand = lh.v <= rh.v ? 'lh' : 'rh';
  const sideHand = rDu(h.u, R.body.u) < 0 ? 'lh' : 'rh';
  [lowHand, sideHand, lowHand === 'lh' ? 'rh' : 'lh'].forEach((k) => { if (!tries.includes(k)) tries.push(k); });
  if (!h.tap && !h.dynoTarget) {
    for (const k of tries) { const b = solveBody(k === 'lh' ? h : lh, k === 'rh' ? h : rh); if (b) return { kind: 'reach', k, body: b }; }
    for (const k of tries) { const b = solveBody(k === 'lh' ? h : lh, k === 'rh' ? h : rh, DEAD_R); if (b) return { kind: 'dead', k, body: b }; }
  }
  // 다이노: 위로 멀리 또는 옆으로 멀리
  const top = Math.max(lh.v, rh.v);
  const dv = h.v - top, du = Math.abs(rDu(h.u, R.body.u));
  const dHand = Math.min(pd(h, lh), pd(h, rh));
  if (dv > -0.35 && dHand > 0.6 && dHand < 2.6 && du < 1.9 && (dv > 0.3 || du > 0.75)) return { kind: 'dyno', k: rDu(h.u, R.body.u) < 0 ? 'lh' : 'rh' };
  return null;
}

function enterRoute(p, st) {
  R.on = true; R.atTop = false; R.ceremony = null; R.topHold = 0; me.ceremony = false; R.mash = null; R.rhythm = null; R.zoneHit = false; R.missStreak = 0; R.backs = 0; R.visited = new Set([p.start]); R.p = p; R.st = st; R.done = false; R.doneT = 0; R.anim = null; R.qte = null; R.gauge = null; R.hipIn = false; R.slipT = 0; R.swing = 0;
  R.lh = p.start; R.rh = p.start;
  R.body = solveBody(R.lh, R.rh) || { u: p.start.u, v: Math.max(MAT_H, p.start.v - BODY.shY - 0.4) };
  [R.lf, R.rf] = pickFeet(R.body);
  R.cur = routeSnapshot();
  pl.mode = 'route'; pl.strip = st; pl.problem = p; pl.topped = false; pl.pump = 0;
  me.setClimbing(true); me.sitting = false; me.tech = null; me.footless = false;
  me.setHeadAlpha(0.45);
  document.body.classList.add('route');
  refreshRings();
  routeSync(1);
  toast(p.lock && !p.lock.test() ? `${problemLabel(p)} — 🥁 크럭스는 박자 맞춰 꽉!` : `${problemLabel(p)} 시작! 반짝이는 홀드를 탭해서 올라가요`, 2800);
}
function endRoute() {
  if (!R.on) return;
  R.on = false; R.qte = null; R.gauge = null; R.mash = null; R.rhythm = null; $('#rhythm').hidden = true;
  document.body.classList.remove('route');
  routeRings.forEach((r) => (r.visible = false));
  $('#qte').hidden = true; $('#gauge').hidden = true;
  me.tech = null; me.footless = false; me.swing = 0; me.ceremony = false;
  me.setHeadAlpha(1);
}
// 현재 자세 (u,v)를 한 덩어리로
function routeSnapshot() {
  const f = (h, fallback) => (h ? { u: h.u, v: h.v, on: true } : fallback);
  const b = R.body;
  return {
    body: { ...b },
    lh: { u: R.lh.u, v: R.lh.v, on: true }, rh: { u: R.rh.u, v: R.rh.v, on: true },
    lf: f(R.lf, { u: b.u - 0.12, v: b.v + 0.05, on: false }), rf: f(R.rf, { u: b.u + 0.12, v: b.v + 0.05, on: false }),
  };
}
function refreshRings() {
  routeRings.forEach((r) => (r.visible = false));
  if (!R.on || R.anim || R.done || R.gauge) return;
  let i = 0;
  R.cands = [];
  for (const h of R.st.holds) {
    if (h.problem !== R.p) continue;
    const c = classify(h);
    if (!c) continue;
    R.cands.push({ h, ...c });
    let ring = routeRings[i];
    if (!ring) { ring = new THREE.Mesh(ringGeo, ringMat.reach); ring.renderOrder = 20; scene.add(ring); routeRings.push(ring); }
    ring.material = ringMat[c.kind];
    const [s] = segAt(R.st, h.u);
    ring.position.copy(h.pos).addScaledVector(s.n3, 0.06);
    ring.lookAt(ring.position.clone().add(s.n3));
    ring.visible = true; ring.userData.h = h;
    i++;
  }
}
// 화면 탭 → 가까운 후보 홀드
function routeTap(cx, cy) {
  if (!R.on || R.anim || R.done) return false;
  if (R.rhythm) return true;
  if (R.mash) { mashTap(); return true; }
  if (R.qte) qteResult(false);
  if (R.gauge) { routeFireGauge(); return true; }
  const r = renderer.domElement.getBoundingClientRect();
  let best = null, bd = document.body.classList.contains('touch') ? 90 : 70;
  (R.cands || []).forEach((c) => {
    const v = c.h.pos.clone().project(camera);
    const sx = (v.x * 0.5 + 0.5) * r.width + r.left, sy = (-v.y * 0.5 + 0.5) * r.height + r.top;
    const d = Math.hypot(sx - cx, sy - cy);
    if (d < bd) { bd = d; best = c; }
  });
  if (!best) { toast('반짝이는 홀드(초록·노랑·주황 링)를 눌러요', 1400); return true; }
  routeMove(best);
  return true;
}
// 💪 크럭스: 장비 없으면 연타로 꽉 잡기 (장비 있으면 그냥 잡힘)
function startMash(c) {
  const need = Math.round(7 + R.p.rank * 0.85);
  R.mash = { c, need, n: 0, t: 3.2, max: 3.2 };
  routeRings.forEach((r) => (r.visible = false));
  $('#qte-label').textContent = `💪 꽉 잡아! 0/${need}`; $('#qte-key').textContent = '연타';
  const b = $('#qte'); b.hidden = false; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  popText('꽉!!', c.h.pos.clone().add(new V3(0, 0.3, 0)), 0.36);
  if (staffMayNag(0.4)) setTimeout(() => staffSay(pick(['꽉 잡아요 꽉! 힘없이 잡으면 미끄러져요 🐯', '어깨 들지 말고 손가락에 힘! …응원한 거 아니고요 🐯', '보는 제가 다 손에 땀 나네요. 아 그냥요 🐯']), 2600), 500);
}
function mashTap() {
  const m = R.mash; if (!m) return;
  m.n++;
  $('#qte-label').textContent = `💪 꽉 잡아! ${m.n}/${m.need}`;
  Sound.tone(300 + m.n * 25, 0.04, 'square', 0.04);
  me.squash();
  if (m.n >= m.need) {
    R.mash = null; $('#qte').hidden = true;
    popText('버텼다!!', me.group.position.clone().add(new V3(0, 2.0, 0)), 0.34);
    pl.pump += 6;
    westPraise('tech', 700);
    routeMove({ ...m.c, kind: m.c.raw || 'dead' });
  }
}
function mashFail() {
  const m = R.mash; R.mash = null; $('#qte').hidden = true;
  popText('미끄덩!', me.group.position.clone().add(new V3(0, 2.0, 0)), 0.32);
  Sound.tone(160, 0.2, 'square', 0.06);
  pl.pump += 18;
  toast(`💪 ${m.n}/${m.need} — 조금만 더 꽉!`, 2200);
  refreshRings();
}

// 🥁 크럭스 박자 게임: 노트가 과녁에 닿는 순간 탭
// kind: 'move'(모든 무브) | 'crux'(크럭스: 70% 이상 맞혀야)
function startRhythm(c, kind = 'crux') {
  const rank = R.p.rank;
  const holdN = c.h.q >= 1 ? 2 : c.h.q >= 0.55 ? 3 : 4;               // 저그 2 · 엣지/핀치 3 · 크림프/슬로퍼 4
  const notes = kind === 'crux' ? 4 + Math.floor(rank / 2) : holdN + (c.kind === 'dead' ? 1 : 0) + Math.floor(rank / 4);
  const beat = 60 / (96 + rank * 7);                                 // 96 ~ 166 BPM
  const pattern = [];
  let t = kind === 'crux' ? 1.4 : 0.9;
  for (let i = 0; i < notes; i++) { pattern.push({ time: t, j: null }); t += beat * (rank >= 6 && rand01() < 0.3 ? 0.5 : 1) * (rank >= 3 && rand01() < 0.15 ? 2 : 1); }
  R.rhythm = { c, kind, notes: pattern, t: 0, need: kind === 'crux' ? Math.ceil(notes * 0.7) : 0, hits: 0, end: t + 0.3, win: 0.13 - rank * 0.005 };
  routeRings.forEach((r) => (r.visible = false));
  const box = $('#rhythm'); box.hidden = false; box.classList.toggle('crux', kind === 'crux');
  const lane = $('#r-notes'); lane.innerHTML = '';
  pattern.forEach((nt) => { const d = document.createElement('i'); lane.appendChild(d); nt.el = d; });
  rhythmLabel();
  $('#r-judge').textContent = '';
  if (kind === 'crux') {
    popText('크럭스!', c.h.pos.clone().add(new V3(0, 0.3, 0)), 0.34);
    if (staffMayNag(0.4)) setTimeout(() => staffSay(pick(['박자 맞춰요 박자! 하나둘 세줄까요? …농담이에요 🐯', '리듬 좀 타요~ 몸이 너무 뻣뻣해요. 걱정돼서 그런 거 아님 🐯']), 2600), 400);
  }
}
function rhythmLabel() {
  const r = R.rhythm; if (!r) return;
  const streak = R.missStreak ? ` · 💀 미스 ${R.missStreak}/3` : '';
  $('#r-label').textContent = r.kind === 'crux' ? `🥁 크럭스! ${r.hits}/${r.need}${streak}` : `🥁 ${r.c.h.type.n} ${r.hits}/${r.notes.length}${streak}`;
}
// 박자 하나 놓침: 나쁜 홀드일수록 체력 많이, 연속 3번이면 추락
function rhythmMiss() {
  const q = (R.lh.q + R.rh.q) / 2;
  pl.pump += 4 / Math.pow(q, 0.9) * (1 + R.p.rank * 0.06);
  R.missStreak = (R.missStreak || 0) + 1;
  rhythmLabel();
  if (R.missStreak >= 3) {
    R.rhythm = null; $('#rhythm').hidden = true;
    popText('3연속 미스!', me.group.position.clone().add(new V3(0, 2.0, 0)), 0.34);
    toast('💀 박자 3번 연속 놓쳐서 손이 풀렸어요!', 2400);
    letGo('fall');
    return true;
  }
  return false;
}
function rand01() { return Math.random(); }
function rhythmTap() {
  const r = R.rhythm; if (!r) return;
  let best = null, bd = Infinity;
  r.notes.forEach((nt) => { if (nt.j) return; const d = Math.abs(nt.time - r.t); if (d < bd) { bd = d; best = nt; } });
  if (!best || bd > 0.35) return;
  const jd = $('#r-judge');
  if (bd <= r.win * 0.45) { best.j = 'p'; r.hits++; R.missStreak = 0; jd.textContent = 'PERFECT'; jd.className = 'r-judge p'; Sound.tone(880, 0.06, 'triangle', 0.07); }
  else if (bd <= r.win) { best.j = 'g'; r.hits++; R.missStreak = 0; jd.textContent = 'GOOD'; jd.className = 'r-judge g'; Sound.tone(660, 0.06, 'triangle', 0.06); }
  else { best.j = 'm'; jd.textContent = 'MISS'; jd.className = 'r-judge m'; Sound.tone(180, 0.08, 'square', 0.05); }
  best.el.className = best.j;
  if (best.j === 'm' && rhythmMiss()) return;
  me.squash();
  rhythmLabel();
  if (r.notes.every((nt) => nt.j)) finishRhythm();
}
function updateRhythm(dt) {
  const r = R.rhythm; if (!r) return;
  r.t += dt; pl.pump += dt * 0.5 / Math.pow((R.lh.q + R.rh.q) / 2, 0.6);
  const pxPerSec = 34; // % per second
  for (const nt of r.notes) {
    if (!nt.j && r.t - nt.time > r.win) { nt.j = 'm'; nt.el.className = 'm'; const jd = $('#r-judge'); jd.textContent = 'MISS'; jd.className = 'r-judge m'; if (rhythmMiss()) return; }
  }
  r.notes.forEach((nt) => {
    nt.el.style.left = (14 + (nt.time - r.t) * pxPerSec) + '%';
    nt.el.style.opacity = nt.j && nt.j !== 'm' ? 0 : nt.time - r.t > 2.6 ? 0 : 1;
  });
  // 메트로놈 (소리 켰을 때)
  r.notes.forEach((nt) => { if (!nt.tick && r.t >= nt.time) { nt.tick = true; Sound.tone(1200, 0.02, 'square', 0.02); } });
  if (r.t >= r.end || r.notes.every((nt) => nt.j)) finishRhythm();
}
function finishRhythm() {
  const r = R.rhythm; R.rhythm = null; $('#rhythm').hidden = true;
  const head = me.group.position.clone().add(new V3(0, 2.0, 0));
  if (r.kind === 'move') {
    if (r.notes.every((nt) => nt.j === 'p')) popText('PERFECT 무브!', head, 0.28);
    routeMove({ ...r.c, beatDone: true });
    return;
  }
  if (r.hits >= r.need) {
    popText(r.notes.every((nt) => nt.j === 'p') ? 'ALL PERFECT!!' : '버텼다!!', head, 0.34);
    pl.pump += 4; westPraise('tech', 700);
    routeMove({ ...r.c, kind: r.c.raw || 'dead', beatDone: true });
  } else {
    popText('미끄덩!', head, 0.32); Sound.tone(160, 0.2, 'square', 0.06);
    pl.pump += 16;
    toast(`🥁 ${r.hits}/${r.need} — 박자 다시!`, 2200);
    refreshRings();
  }
}

// ⬆️ 버튼: 제일 높이 갈 수 있는 홀드로 (닿는 것 우선, 없으면 데드포인트, 그다음 다이노)
function routeAuto() {
  if (!R.on || R.anim || R.done || R.atTop) return;
  if (R.rhythm) return;
  if (R.mash) { mashTap(); return; }
  if (R.gauge) { routeFireGauge(); return; }
  if (R.qte) return;
  const c = R.cands || [];
  const pickBest = (kind) => c.filter((x) => x.kind === kind).sort((a, b) => b.h.v - a.h.v)[0];
  const best = pickBest('reach') || pickBest('dead') || pickBest('dyno') || pickBest('locked');
  if (best) routeMove(best); else toast('갈 수 있는 홀드가 없어요', 1400);
}
function routeMove(c) {
  if (c.kind === 'locked') { startRhythm(c, 'crux'); return; }
  if (c.kind === 'dyno') { routeStartGauge(c); return; }
  if (!c.beatDone) { startRhythm(c, 'move'); return; }
  // 왔다갔다: 이미 잡았던 홀드로 돌아가면 힘 빠짐, 두 번째엔 끝
  R.visited = R.visited || new Set();
  if (R.visited.has(c.h)) {
    R.backs = (R.backs || 0) + 1;
    if (R.backs >= 2) { popText('왔다갔다…', me.group.position.clone().add(new V3(0, 2.0, 0)), 0.3); toast('↩️ 왔다갔다하다 힘이 다 빠졌어요!', 2400); letGo('fall'); return; }
    pl.pump += 15; toast('↩️ 왔다갔다하면 힘 빠져요! 한 번 더 그러면 끝', 2200);
  }
  R.visited.add(c.h);
  const prev = routeSnapshot();
  if (c.k === 'lh') R.lh = c.h; else R.rh = c.h;
  R.body = c.body;
  [R.lf, R.rf] = pickFeet(R.body);
  R.anim = { t: 0, dur: c.kind === 'dead' ? 0.85 : 1.0, from: prev, to: routeSnapshot(), k: c.k, kind: c.kind };
  me.tech = null; me.footless = false; R.hipIn = false;
  const g = gear();
  const add = (1.2 + R.p.level * 0.5) / Math.pow(c.h.q, 0.7) * (c.kind === 'dead' ? 1.6 : 1) * (1.15 - 0.3 * (g.f + g.e + g.h) / 3) * g.pumpMul * (6 / Math.max(6, R.p.holds.length)) * 0.75; // 홀드가 많을수록 무브당 펌핑은 작게
  pl.pump += add;
  routeRings.forEach((r) => (r.visible = false));
  if (c.kind === 'dead') { popText('데드포인트!', me.group.position.clone().add(new V3(0, 2.0, 0)), 0.26); Sound.tone(420, 0.12, 'triangle', 0.08, 0, 200); }
}
// 애니메이션 진행 → 끝나면 버튼 이벤트/완등 판정
function routeStep(dt) {
  if (R.anim) {
    const a = R.anim;
    a.t += dt / a.dur;
    if (a.t >= 1) {
      R.anim = null; R.cur = a.to;
      Sound.grab();
      popText(pick(['영차!', '으쌰!', '착!', '잡았다!']), me.group.position.clone().add(new V3(0, 2.0, 0)), 0.24);
      me.squash();
      afterMove(a);
    } else R.cur = lerpPose(a.from, a.to, a.t, a.k, a.kind);
  }
  // 시간에 따른 펌핑
  if (!R.done) {
    const ang = R.st.sec.angle || 0, g = gear();
    const feet = (R.lf ? 1 : 0) + (R.rf ? 1 : 0) - (R.slipT > 0 ? 2 : 0);
    let rate = 0.35 * (0.35 + R.p.level * 0.12) * (1 + R.p.rank * 0.05) * (1 + Math.max(0, ang - 10) / 40) * (R.hipIn ? 0.6 : 1) * (feet <= 0 ? 2.2 : feet === 1 ? 1.3 : 1);
    rate *= (1.15 - 0.3 * (g.f + g.e + g.h) / 3) * g.pumpMul;
    if (me.tech === 'flag') rate *= 0.7;
    const restful = R.lh.q >= 1 && R.rh.q >= 1 && feet >= 2 && !R.anim;
    pl.pump = clamp(pl.pump + (restful ? -0.8 : rate) * dt, 0, 100);
    if (R.slipT > 0) { R.slipT -= dt; if (R.slipT <= 0) { me.footless = false; [R.lf, R.rf] = pickFeet(R.body); R.cur = routeSnapshot(); } }
  }
  if (pl.pump >= 100 && (!R.done || R.ceremony)) {
    if (R.ceremony && !R.done) { ceremonyFail(); return; }
    if (R.ceremony && R.done) { popText('세레머니 하다 펌핑!', me.group.position.clone().add(new V3(0, 2.0, 0)), 0.28); letGo('pump'); setTimeout(() => teaseNear(['ㅋㅋㅋ 그래도 완등은 했네', '세레머니 과했다 ㅋㅋ', '멋있었는데 마무리가 ㅋㅋ']), 900); return; }
    toast('펌핑 100%… 초크 바르고 매트에서 쉬었다가 다시!', 2400); letGo('pump'); return;
  }
  updateRhythm(dt);
  if (R.mash) {
    R.mash.t -= dt; pl.pump += dt * 4;
    $('#qte').style.setProperty('--t', clamp(R.mash.t / R.mash.max, 0, 1).toFixed(3));
    if (R.mash.t <= 0) mashFail();
  }
  // 버튼 이벤트 시간
  if (R.qte) {
    R.qte.t -= dt;
    $('#qte').style.setProperty('--t', clamp(R.qte.t / R.qte.max, 0, 1).toFixed(3));
    if (R.qte.t <= 0) qteResult(false);
  }
  // 다이노 게이지
  if (R.gauge) {
    R.gauge.t += dt * R.gauge.speed;
    const ph = R.gauge.t % 2, pos = ph < 1 ? ph : 2 - ph;
    const g = $('#gauge'); g.hidden = false; g.classList.remove('double');
    $('#g-zone').style.display = $('#g-perfect').style.display = 'block';
    $('#g-zone').style.left = ((R.gauge.center - R.gauge.width / 2) * 100) + '%'; $('#g-zone').style.width = (R.gauge.width * 100) + '%';
    $('#g-perfect').style.left = ((R.gauge.center - R.gauge.width * 0.22) * 100) + '%'; $('#g-perfect').style.width = (R.gauge.width * 44) + '%';
    $('#g-mark').style.left = (pos * 100) + '%';
    $('#g-label').textContent = `다이노 — 초록 칸에서 탭! (${R.gauge.h.tap ? '터치 홀드 TAP' : R.gauge.h.type.n})`;
  }
  // TOP 3초 홀드 카운트 (세레머니 중이면 멈춤)
  if (R.atTop && !R.done && !R.ceremony) {
    R.topHold += dt;
    const left = 3 - Math.floor(R.topHold);
    if (left < R.topCount && left > 0) { R.topCount = left; popText(String(left), me.group.position.clone().add(new V3(0, 2.1, 0)), 0.34); Sound.tone(660, 0.06, 'triangle', 0.05); }
    if (R.topHold >= 3) {
      R.done = true; R.doneT = 0; R.atTop = false;
      popText('완등!!', me.group.position.clone().add(new V3(0, 2.1, 0)), 0.38);
      sendProblem(R.p);
    }
  }
  if (R.ceremony) {
    R.ceremony.t += dt;
    pl.pump += dt * 16; // 세레머니는 펌핑을 엄청 씀
    if (R.ceremony.t > 2.2) { R.ceremony = null; me.ceremony = false; if (R.atTop) { R.topHold = 0; R.topCount = 3; } }
  }
  if (R.done) { R.doneT += dt; if (R.doneT > 7 && !R.ceremony) { letGo('down'); return; } }
  routeSync(dt);
}
function lerpPose(A, Bp, t, k, kind) {
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const L = (a, b, w) => ({ u: a.u + rDu(b.u, a.u) * w, v: a.v + (b.v - a.v) * w, on: b.on, lift: 0 });
  // 순서: 손 뻗기(0~0.45) → 몸 끌어올리기(0.25~0.8) → 발 올리기(0.6~1)
  const handW = clamp(t / 0.45, 0, 1), bodyW = clamp((t - 0.25) / 0.55, 0, 1), footW = clamp((t - 0.6) / 0.4, 0, 1);
  const ez = (w) => (w < 0.5 ? 2 * w * w : 1 - Math.pow(-2 * w + 2, 2) / 2);
  const out = { body: L(A.body, Bp.body, ez(bodyW) + (kind === 'dead' ? Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.12 : 0)) };
  ['lh', 'rh'].forEach((kk) => {
    if (kk === k) { const p = L(A[kk], Bp[kk], ez(handW)); p.lift = Math.sin(handW * Math.PI) * 0.18; out[kk] = p; }
    else out[kk] = { ...Bp[kk] };
  });
  ['lf', 'rf'].forEach((kk, i) => { const w = clamp((footW - i * 0.3) / 0.7, 0, 1); const p = L(A[kk], Bp[kk], ez(w)); p.lift = Math.sin(w * Math.PI) * 0.12; out[kk] = p; });
  void e;
  return out;
}
// 3D 캐릭터를 현재 자세로
function routeSync(dt) {
  const st = R.st, c = R.cur;
  if (!c) return;
  const bodyOff = R.hipIn ? 0.13 : 0.21;
  const [s] = segAt(st, c.body.u);
  const bp = surf(st, wrapU(st, c.body.u), Math.max(0.02, c.body.v)).addScaledVector(s.n3, bodyOff);
  me.group.position.copy(bp);
  me.group.rotation.y = Math.atan2(-s.n3.x, -s.n3.z);
  me.grips = me.grips || [new V3(), new V3(), new V3(), new V3()];
  ['lh', 'rh', 'lf', 'rf'].forEach((k, i) => {
    const q = c[k];
    let u = q.u, v = q.v;
    if (k === 'lf' || k === 'rf') { if (!q.on) { const hp = hipOf(k === 'lf' ? -1 : 1, c.body); u = hp.u; v = hp.v - 0.4; } }
    if (me.tech === 'heel' && k === R.heelK && R.heelH) { u = R.heelH.u; v = R.heelH.v; }
    const uu = wrapU(st, u);
    surf(st, uu, Math.max(0.05, v), me.grips[i]).addScaledVector(segAt(st, uu)[0].n3, 0.07 + (q.lift || 0) + (q.on ? 0 : 0.15));
  });
  me.footless = !R.lf && !R.rf || R.slipT > 0;
  me.flagSide = R.flagSide;
  R.swing = lerp(R.swing, R.swingT || 0, 0.15); R.swingT = (R.swingT || 0) * 0.92; me.swing = R.swing;
  pl.u = wrapU(st, c.body.u); pl.v = c.body.v + BODY_DROP;
  pl.pos.copy(bp);
}
// 무브가 끝나면: 완등? 아니면 상황에 따라 버튼 이벤트
function afterMove(a) {
  const p = R.p;
  if (p.zone && !R.zoneHit && (R.lh === p.zone || R.rh === p.zone)) {
    R.zoneHit = true;
    popText('ZONE!', me.group.position.clone().add(new V3(0, 2.2, 0)), 0.36);
    Sound.tone(740, 0.1, 'triangle', 0.08); Sound.tone(980, 0.12, 'triangle', 0.08, 0.08);
    Store.data.zones = Store.data.zones || {};
    if (!Store.data.zones[p.id]) { Store.data.zones[p.id] = 1; Store.save(); setTimeout(() => addMoney(1000, `${p.name} 첫 ZONE`), 600); }
  }
  if (R.lh === p.top || R.rh === p.top) {
    if (R.lh !== R.rh) {
      // 다른 손도 TOP으로 매칭
      const k = R.lh === p.top ? 'rh' : 'lh';
      const prev = routeSnapshot();
      if (k === 'lh') R.lh = p.top; else R.rh = p.top;
      R.body = solveBody(R.lh, R.rh) || R.body;
      [R.lf, R.rf] = pickFeet(R.body);
      R.anim = { t: 0, dur: 0.6, from: prev, to: routeSnapshot(), k, kind: 'reach' };
      return;
    }
    // IFSC처럼: TOP 매칭 후 3초 버텨야 완등 인정
    R.topHold = 0; R.topCount = 3; R.atTop = true;
    popText('TOP! 3초 버텨요', me.group.position.clone().add(new V3(0, 2.1, 0)), 0.3);
    return;
  }
  const lv = p.level, ang = R.st.sec.angle || 0, g = gear();
  const feet = (R.lf ? 1 : 0) + (R.rf ? 1 : 0);
  const spread = Math.abs(rDu(R.lh.u, R.rh.u));
  const handsSide = Math.sign(rDu(R.lh.u, R.body.u) + rDu(R.rh.u, R.body.u));
  const dif = p.rank / 10, qt = 1 - 0.35 * dif; // 검정일수록 버튼 시간 짧고 자주
  if (p.rank >= 9 && Math.random() < 0.5) {
    const kinds = [['flag', '🦵 플래깅!', 'F'], ['hip', '🍑 엉덩이 붙여!', 'H'], ['heel', '👟 힐훅!', 'G']];
    const [k, l, key] = pick(kinds);
    if (k === 'flag') R.flagSide = -(handsSide || 1);
    startQte(k, l, key, (1.4 + g.f * 0.3) * qt);
  } else if (lv >= 2 && (feet <= 1 || spread > 0.55) && Math.random() < 0.35 + lv * 0.08) {
    R.flagSide = -(handsSide || 1);
    startQte('flag', '🦵 플래깅!', 'F', (1.9 - lv * 0.12 + g.f * 0.4) * qt);
  } else if (lv >= 2 && ang >= 20 && Math.random() < 0.3 + lv * 0.05) {
    startQte('hip', '🍑 엉덩이 붙여!', 'H', (1.8 - lv * 0.1 + g.h * 0.3) * qt);
  } else if (lv >= 4 && ang >= 30 && Math.random() < 0.4) {
    startQte('heel', '👟 힐훅!', 'G', (1.5 - lv * 0.08 + g.h * 0.5) * qt);
  }
  refreshRings();
}
function startQte(kind, label, key, max) {
  R.qte = { kind, t: Math.max(0.6, max), max: Math.max(0.6, max) };
  $('#qte-label').textContent = label; $('#qte-key').textContent = key;
  const b = $('#qte'); b.hidden = false; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  Sound.tone(880, 0.08, 'square', 0.05);
}
function qteResult(ok) {
  const q = R.qte; if (!q) return;
  R.qte = null; $('#qte').hidden = true;
  const head = me.group.position.clone().add(new V3(0, 2.1, 0));
  if (ok) {
    Sound.tone(660, 0.08, 'triangle', 0.08); Sound.tone(990, 0.1, 'triangle', 0.08, 0.06);
    if (q.kind === 'flag') { me.tech = 'flag'; popText('플래깅!', head, 0.3); }
    if (q.kind === 'hip') { R.hipIn = true; popText('엉덩이 착!', head, 0.28); }
    if (q.kind === 'heel') {
      // 손 옆 높은 곳에 발을 걸기
      const hiHand = R.lh.v >= R.rh.v ? R.lh : R.rh;
      R.heelK = rDu(hiHand.u, R.body.u) < 0 ? 'lf' : 'rf'; R.heelH = hiHand; me.tech = 'heel';
      popText('힐훅!', head, 0.3);
    }
    if (Math.random() < 0.35) westPraise('tech', 600);
  } else {
    if (q.kind === 'flag') { popText('바니도어!', head, 0.32); R.swingT = (R.flagSide || 1) * 0.5; pl.pump += 22; }
    if (q.kind === 'hip') { popText('팔 터진다…', head, 0.26); pl.pump += 15; }
    if (q.kind === 'heel') { popText('발 미끄러짐!', head, 0.28); R.slipT = 1.6; pl.pump += 15; }
    Sound.tone(160, 0.2, 'square', 0.06);
  }
}
// 🙌 세레머니: TOP에서 뒤돌아 한 팔 번쩍. 펌핑을 엄청 씀
function startCeremony() {
  if (!R.on || !(R.atTop || R.done) || R.ceremony || R.anim) return;
  R.ceremony = { t: 0, early: !R.done };
  me.ceremony = true;
  pl.pump += 22;
  popText(pick(['🙌 가즈아!!', '🔥 세레머니!', '💪 이것이 매운맛!']), me.group.position.clone().add(new V3(0, 2.2, 0)), 0.34);
  fireConfetti(me.group.position.clone().add(new V3(0, 1.8, 0)), 14);
  Sound.top();
  Net.event('ceremony');
  if (!R.done) toast('⚠️ 아직 3초 안 지났어요! 성급한 세레머니…', 1800);
}
// 😈 초크 빌런: 벽 위에서 아래로 초크 뿌리기
function chalkRain(pos, n = 28) {
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthWrite: false }));
    sp.position.copy(pos).add(new V3((Math.random() - 0.5) * 0.4, Math.random() * 0.2, (Math.random() - 0.5) * 0.4));
    sp.scale.setScalar(0.06 + Math.random() * 0.08);
    scene.add(sp);
    particles.push({ sp, vel: new V3((Math.random() - 0.5) * 0.6, -0.3 - Math.random() * 0.6, (Math.random() - 0.5) * 0.6), g: -1.6, drag: 0.6, life: 0, max: 2 + Math.random() * 1.2, grow: 0.12, alpha: 0.9 });
  }
}
function teaseNear(lines) {
  const pos = me.group.position;
  const near = npcs.filter((n) => n.state !== 'climb' && n.av.group.position.distanceTo(pos) < 16);
  near.slice(0, 2).forEach((n, k) => setTimeout(() => n.av.say(pick(lines), 2400), k * 600));
}
function ceremonyFail() {
  R.ceremony = null; me.ceremony = false;
  popText('성급한 세레머니…', me.group.position.clone().add(new V3(0, 2.0, 0)), 0.3);
  toast('😵 3초 버티기 전에 세레머니하다 떨어졌어요 — 완등 인정 안 됨!', 2800);
  logChat('', '', `😵 ${Store.data.name}님 성급한 세레머니로 추락…`, 'sys');
  Net.event('ceremonyfail');
  letGo('pump');
  setTimeout(() => teaseNear(['풋 ㅋ', '세레머니 먼저 하더니 ㅋㅋㅋ', '3초는 버티고 해야지 ㅋㅋ', '아 ㅋㅋㅋㅋ 다 왔는데', '세레머니 장인 ㅋㅋ']), 700);
  if (staffMayNag(0.5)) setTimeout(() => staffSay('그러니까 3초는 버티라고 했잖아요~ 안 다쳤죠? 🐯', 2800), 2200);
  setTimeout(() => westSay(pick(['괜찮아요! 세레머니는 진짜 멋졌어요 🤠', '다음엔 3초 버티고 해요! 폼은 최고였어요'])), 2800);
}
function routeKey(code) {
  if (code === 'Space') { if (R.rhythm) rhythmTap(); else if (R.mash) mashTap(); else if (R.gauge) routeFireGauge(); return true; }
  if (code === 'KeyE') { grabToggle(); return true; }
  if (code === 'KeyV') { startCeremony(); return true; }
  if (code === 'KeyW' || code === 'ArrowUp') { routeAuto(); return true; }
  const map = { KeyF: 'flag', KeyH: 'hip', KeyG: 'heel' };
  if (map[code]) { if (R.qte) qteResult(R.qte.kind === map[code]); return true; }
  return false;
}
// ---------- 다이노 ----------
function routeStartGauge(c) {
  const from = R.lh.v >= R.rh.v ? R.lh : R.rh;
  const q = Math.min(from.q, c.h.q);
  const dist = Math.min(pd(c.h, R.lh), pd(c.h, R.rh));
  const dif = R.p.rank / 10; // 0(핑크) ~ 1(검정)
  R.gauge = { h: c.h, k: c.k, t: 0, speed: (0.9 + (1 - q) * 0.6 + dif * 0.7) * (1 + Math.max(0, dist - 0.8) * 1.1), // 멀리(높이) 뛸수록 바늘 훨씬 빠르게
    center: clamp(0.2 + dist / 2.6 * 0.65, 0.15, 0.88), width: (0.12 + 0.26 * q) * (1 - 0.5 * dif) * (0.85 + 0.25 * gear().f) };
  routeRings.forEach((r) => (r.visible = false));
  toast('다이노! 초록 칸에서 탭 / Space', 1500);
}
function routeFireGauge() {
  const gg = R.gauge; if (!gg) return;
  const ph = gg.t % 2, pos = ph < 1 ? ph : 2 - ph;
  const diff = Math.abs(pos - gg.center), ok = diff <= gg.width / 2, perfect = diff <= gg.width * 0.22;
  R.gauge = null; $('#gauge').hidden = true;
  const head = me.group.position.clone().add(new V3(0, 2.0, 0));
  if (!ok) { popText(pos < gg.center ? '힘 부족…' : '너무 셌다!', head, 0.28); setTimeout(() => { if (R.on) letGo('fall'); }, 250); return; }
  popText(perfect ? 'PERFECT!' : 'GOOD!', head, perfect ? 0.36 : 0.3);
  const prev = routeSnapshot();
  // 날아서 잡기: 그 손으로 목표, 다른 손도 같은 홀드에 매칭
  R.lh = gg.h; R.rh = gg.h;
  R.body = solveBody(R.lh, R.rh) || { u: gg.h.u, v: gg.h.v - BODY.shY - 0.5 };
  [R.lf, R.rf] = pickFeet(R.body);
  R.anim = { t: 0, dur: 0.7, from: prev, to: routeSnapshot(), k: gg.k, kind: 'dead' };
  pl.pump += perfect ? 3 : 7;
  Sound.tone(220, 0.25, 'triangle', 0.1, 0, 400);
  if (gg.h.tap) {
    // 더블다이노: 터치 홀드는 못 잡으니 바로 다음 게이지
    const next = R.st.holds.filter((h) => h.problem === R.p && !h.tap && h.v > gg.h.v + 0.3).sort((a, b) => a.v - b.v)[0];
    setTimeout(() => {
      if (!R.on) return;
      popText('더블!!', me.group.position.clone().add(new V3(0, 2.0, 0)), 0.36);
      if (next) { R.anim = null; R.cur = routeSnapshot(); routeStartGauge({ h: next, k: gg.k }); pl.didDouble = true; }
    }, 650);
    return;
  }
  if (pl.didDouble) { toast('🔥🔥 더블다이노 성공!!', 2200); Store.data.doubles = (Store.data.doubles || 0) + 1; Store.save(); pl.didDouble = false; }
  else toast('🔥 다이노 성공!', 1500);
  westPraise('dyno', 500);
}
function routeCamera(dt) {
  const st = R.st, c = R.cur;
  const [s] = segAt(st, c.body.u);
  // 세로 화면이면 더 멀리서, 다음 홀드(위쪽)가 화면 가운데 오도록 시선을 올림
  const portrait = camera.aspect < 0.9;
  const center = surf(st, wrapU(st, c.body.u), c.body.v + (portrait ? 1.75 : 1.45));
  const pos = center.clone().addScaledVector(s.n3, portrait ? 5.6 : 4.3).add(new V3(0, portrait ? -0.1 : 0.1, 0));
  if (!camCtl.routePos) camCtl.routePos = camera.position.clone();
  camCtl.routePos.lerp(pos, damp(4, dt));
  camera.position.copy(camCtl.routePos);
  camera.lookAt(center);
  camCtl.yaw = Math.atan2(s.n3.x, s.n3.z);
  routeRings.forEach((r) => { if (r.visible) r.scale.setScalar(1 + Math.sin(performance.now() / 180) * 0.12); });
}

// 다이노 게이지 (농구 3점슛 게이지 느낌)
function updateGauge() {
  const g = $('#gauge');
  const climbingNow = pl.mode === 'climb' || pl.mode === 'air';
  document.body.classList.toggle('climbing', climbingNow);
  document.querySelectorAll('[data-tech]').forEach((b) => b.setAttribute('aria-pressed', pl.tech === b.dataset.tech ? 'true' : 'false'));
  if (pl.mode === 'inst' || pl.mode === 'route') return;
  if (pl.charging) {
    g.hidden = false; g.classList.remove('double');
    const plan = pl.plan;
    const zone = $('#g-zone'), perf = $('#g-perfect');
    if (plan) {
      zone.style.display = perf.style.display = 'block';
      zone.style.left = ((plan.center - plan.width / 2) * 100) + '%'; zone.style.width = (plan.width * 100) + '%';
      perf.style.left = ((plan.center - plan.width * 0.22) * 100) + '%'; perf.style.width = (plan.width * 44) + '%';
      $('#g-label').textContent = `다이노 — 초록 칸에서 떼요! (${plan.h.tap ? '터치 홀드 TAP' : plan.h.type.n})`;
    } else { zone.style.display = perf.style.display = 'none'; $('#g-label').textContent = '다이노 — 방향에 잡을 홀드가 없어요'; }
    $('#g-mark').style.left = (pl.charge * 100) + '%';
    return;
  }
  if (pl.mode === 'air' && !pl.doubleUsed) {
    const st = pl.strip;
    const tap = st.holds.find((h) => h.tap && (!pl.problem || h.problem === pl.problem) && uvDist(st, h.u, h.v, pl.u, pl.v) < 0.55);
    if (tap) { g.hidden = false; g.classList.add('double'); $('#g-label').textContent = '더블다이노 — 지금 Space!'; return; }
  }
  g.hidden = true;
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
  updateSitNag(dt);
  updateStaff(dt, now);
  updateVillain(now);
  updateWest(dt, now);
  if (now > chatNext) {
    const idle = npcs.filter((n) => n.state === 'idle');
    if (idle.length) {
      const n = pick(idle);
      if (Math.random() < 0.35) { n.av.chalk(); setTimeout(() => n.av.say(pick(['쫙쫙 팡팡!', '초크 충전 💨']), 1200), 1150); }
      else n.av.say(pick(LINES.idle));
    }
    chatNext = now + 7000 + Math.random() * 7000;
  }
  if (guideMesh) { guideMesh.position.copy(guideMesh.userData.base); guideMesh.position.y += Math.sin(now / 250) * 0.12; }
  updateParticles(dt);
  updateCamera(dt);
  updateHud(dt);
  Net.sync(false);
  if (!inst.on) renderer.render(scene, camera);
  if (west.shotPending) takeWestShot();
  requestAnimationFrame(loop);
}
let chatNext = performance.now() + 5000;

// =================================================================
// 입장
// =================================================================
function setupIntro() {
  Store.load();
  const look = { ...DEFAULT_LOOK, ...(Store.data.look || {}) };
  let chosen = Store.data.color || PLAYER_COLORS[0].c;
  // 3D 미리보기
  const pcv = $('#look-preview');
  let prev = null;
  try {
    const pr = new THREE.WebGLRenderer({ canvas: pcv, antialias: true, alpha: true });
    pr.setPixelRatio(Math.min(window.devicePixelRatio, 2)); pr.setSize(pcv.clientWidth || 180, pcv.clientHeight || 180, false);
    const ps = new THREE.Scene();
    ps.add(new THREE.HemisphereLight(0xfff4e2, 0x4a4a52, 2.6));
    const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(2, 4, 5); ps.add(dl);
    const pc = new THREE.PerspectiveCamera(32, 1, 0.1, 20); pc.position.set(0, 1.05, 3.4); pc.lookAt(0, 0.82, 0);
    prev = { pr, ps, pc, av: null, t: 0, on: true };
  } catch (e) { pcv.hidden = true; }
  const rebuild = () => {
    if (!prev) return;
    const keep = scene; scene = prev.ps;
    if (prev.av) prev.av.dispose();
    prev.av = new Avatar('', chosen, { look }); prev.av.tag.visible = false; prev.av.shadow.visible = false;
    scene = keep;
  };
  const tick = () => {
    if (!prev || !prev.on) return;
    prev.t += 0.016;
    if (prev.av) { prev.av.group.rotation.y = Math.sin(prev.t * 0.7) * 0.7; prev.av.update(0.016); }
    prev.pr.render(prev.ps, prev.pc);
    requestAnimationFrame(tick);
  };
  const radioRow = (box, items, cur, onPick, render) => {
    box.innerHTML = '';
    items.forEach(([val, label]) => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', val === cur() ? 'true' : 'false'); b.setAttribute('aria-label', label);
      render(b, val, label);
      b.addEventListener('click', () => { onPick(val); box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', 'false')); b.setAttribute('aria-checked', 'true'); rebuild(); });
      box.appendChild(b);
    });
  };
  radioRow($('#swatches'), PLAYER_COLORS.map((c) => [c.c, c.name]), () => chosen, (v) => { chosen = v; }, (b, v) => {
    b.className = 'swatch';
    b.innerHTML = `<svg viewBox="0 0 100 100"><path d="${HEAD_SHAPES[look.head].d}" fill="${v}"/><circle cx="38" cy="60" r="5" fill="#1a0a06"/><circle cx="62" cy="60" r="5" fill="#1a0a06"/></svg>`;
  });
  const chipRow = (id, map, key) => radioRow($(id), Object.entries(map).map(([k, v]) => [k, typeof v === 'string' ? v : v.n]), () => look[key], (v) => {
    look[key] = v;
    if (key === 'head') $('#swatches').querySelectorAll('path').forEach((pth) => pth.setAttribute('d', HEAD_SHAPES[v].d));
  }, (b, v, label) => { b.textContent = label; });
  chipRow('#opt-head', HEAD_SHAPES, 'head');
  chipRow('#opt-eyes', EYES, 'eyes');
  chipRow('#opt-acc', ACCS, 'acc');
  chipRow('#opt-vil', VILLAINS, 'vil');
  const dotRow = (id, list, key, auto) => radioRow($(id), (auto ? [['', auto]] : []).concat(list.map((c) => [c, c])), () => look[key], (v) => { look[key] = v; }, (b, v) => {
    if (v) b.style.background = v; else { b.textContent = '기본'; b.style.background = '#2a2a2e'; }
  });
  dotRow('#opt-skin', SKINS, 'skin');
  dotRow('#opt-shirt', CLOTH, 'shirt', '기본');
  dotRow('#opt-pants', CLOTH, 'pants', '기본');
  const bl = $('#opt-blush'); bl.checked = !!look.blush; bl.addEventListener('change', () => { look.blush = bl.checked ? 1 : 0; rebuild(); });
  rebuild(); tick();
  const nick = $('#nickname');
  if (Store.data.name) nick.value = Store.data.name;
  $('#enter-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nick.value.trim().slice(0, 8) || '불꽃이';
    Store.data.name = name; Store.data.color = chosen; Store.data.look = { ...look }; Store.save();
    if (prev) { prev.on = false; if (prev.av) { const keep = scene; scene = prev.ps; prev.av.dispose(); scene = keep; } prev.pr.dispose(); }
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
  me = new Avatar(name, color, { isPlayer: true, look: Store.data.look });
  me.group.position.copy(pl.pos);
  me.group.rotation.y = pl.yaw;
  makeStaff();
  makeWest();
  me.setOutfit(Store.data.equip.shoe, Store.data.equip.pants);
  updateWallet();
  updateChalkBadge();
  $('#btn-shop').addEventListener('click', openShop);
  $('#btn-visit').addEventListener('click', () => window.open(GYM_MAP, '_blank', 'noopener'));
  $('#ad-close').addEventListener('click', () => { $('#adcard').hidden = true; });
  setupPay();
  $('#polaroid .pol-close').addEventListener('click', () => { $('#polaroid').hidden = true; });
  setTimeout(() => { toast('🐯 무호K가 누구보다 빠르게 입구로 달려오는 중…', 2200); staffRushToEntry(staffArrivedForPlayer); }, 900);
  setupInput();
  drawMinimapStatic();
  $('#loading').hidden = true;

  Net.start(name, color);
  logChat('', '', '💬 Enter(모바일은 💬)로 채팅해요. 같은 링크로 들어온 사람들과 대화할 수 있어요', 'sys');
  setTimeout(() => me.say(`안녕하세요! ${name}예요`, 2400), 600);
  setTimeout(() => npcs[0].av.say('어서 와요~ 오늘 컨디션 어때요?', 2600), 1700);


  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#chat-input');
    const v = inp.value.trim();
    inp.blur(); $('#chat-form').classList.remove('open');
    if (!v) return;
    me.chat(v);
    logChat(Store.data.name, me.color, v);
    Net.event('say', { text: v });
    inp.value = '';
    npcTalk(v);
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
  window.__spicy = { vil, R, rhythmTap, startCeremony, routeMove, routeFireGauge, qteResult, classify, refreshRings, inst, w2s, enterInstance, instAttach, instConstrainHip, get me() { return me; }, west, westPhoto, staff, watch, payDone, pl, strips, PROBLEMS, npcs, ety, Manner, crash, wallClimbers, mount, findMount, setGuide, camCtl, Net, surf, segAt, bodyPos };
  clock.getDelta();
  loop();
}

setupIntro();
