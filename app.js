(() => {
  'use strict';

  // ---------------------------------------------------------------
  // 기본 설정
  // ---------------------------------------------------------------
  const NS = 'http://www.w3.org/2000/svg';
  const W = 1200;
  const WALL = { x: 30, y: 50, w: 1140, h: 535 };
  const GROUND = 605; // 매트 위에 서 있을 때 y (translate 기준)
  const HANG = 42; // 손(홀드)과 몸 중심 사이 거리
  const FLAME_D = 'M50 4 C57 17 63 21 70 15 C71 27 77 30 85 24 C81 39 93 50 91 67 C89 86 72 96 50 96 C28 96 11 86 9 67 C7 50 19 39 15 24 C23 30 29 27 30 15 C37 21 43 17 50 4 Z';

  const PLAYER_COLORS = [
    { name: '빨강', c: '#e3262b' },
    { name: '주황', c: '#ff8a1f' },
    { name: '핑크', c: '#ff5c8a' },
    { name: '노랑', c: '#ffc21a' },
    { name: '파랑', c: '#3b7bff' },
    { name: '초록', c: '#2fbf71' },
  ];

  // 문제(루트) — 좌표는 벽 viewBox(1200x720) 기준
  const PROBLEMS = [
    { id: 'yellow', name: '노랑', grade: 'V0', color: '#f6c915', level: 0, pump: 6,
      note: '몸풀기 국룰. 발만 잘 올려도 끝!',
      holds: [[110, 520], [155, 452], [118, 385], [182, 322], [148, 255], [204, 186], [168, 112]] },
    { id: 'black', name: '검정', grade: 'V6', color: '#232325', level: 5, pump: 17,
      note: '청양고추 3개 맛. 초크 필수.',
      holds: [[282, 535], [356, 438], [268, 350], [372, 262], [296, 164], [360, 88]] },
    { id: 'green', name: '초록', grade: 'V1', color: '#3fae5a', level: 1, pump: 8,
      note: '불꽃이 벽화 위를 지나가는 산책 코스.',
      holds: [[430, 528], [490, 470], [440, 405], [515, 345], [455, 275], [520, 210], [470, 140], [505, 82]] },
    { id: 'red', name: '빨강', grade: 'V4', color: '#e3262b', level: 3, pump: 13,
      note: '볼륨 사이로 길게 뻗는 매운맛 시그니처.',
      holds: [[630, 530], [708, 462], [652, 382], [728, 318], [662, 238], [738, 168], [690, 92]] },
    { id: 'blue', name: '파랑', grade: 'V2', color: '#2f6fd6', level: 2, pump: 10,
      note: '오른쪽으로 살짝 흐르는 리듬감 루트.',
      holds: [[860, 525], [920, 458], [878, 398], [948, 338], [898, 272], [962, 204], [918, 145], [952, 88]] },
    { id: 'purple', name: '보라', grade: 'V5', color: '#7b3fb8', level: 4, pump: 15,
      note: '멀리 뛰어야 하는 다이노 한 방.',
      holds: [[1030, 530], [1112, 440], [1040, 358], [1122, 272], [1048, 182], [1110, 92]] },
  ];

  const DECOR_COLORS = ['#f6c915', '#3fae5a', '#2f6fd6', '#e3262b', '#7b3fb8', '#232325', '#ff7aa8', '#ff8a1f', '#f2f2f2', '#9ad13b', '#4a5fb0'];

  const NPCS = [
    { name: '하바네로', color: '#ff8a1f', spot: 175 },
    { name: '청양이', color: '#2fbf71', spot: 790 },
    { name: '떡볶이', color: '#ff5c8a', spot: 1080 },
  ];

  const LINES = {
    idle: [
      '오늘 손가락 컨디션 좋다', '이 문제 발 어디 써요?', '초크 좀 빌려줘~', '빨강 크럭스 미쳤음',
      '스트레칭 먼저 해요', '조금만 쉬고 갈게', '여기 매트 푹신하다', '퇴근하고 오길 잘했다',
      '홀드 새로 바뀌었네?', '내일 팔 못 들 듯', '보라 다이노 한 번만 더…', '물 마시고 오자',
    ],
    cheer: ['나이스!!', '가자~!!', '미쳤다 🔥', '완등 축하해요!', '오 깔끔하다', '박수 👏'],
    comfort: ['아까비~', '거의 다 왔는데!', '괜찮아요 다시 가요', '쉬었다 한 번 더!', '펌핑 왔구나 ㅠ'],
    npcStart: ['가볼까', '한 번 붙어본다', '오늘은 된다', '집중…'],
    npcTop: ['완등!!', '됐다!!', '드디어 🔥'],
    npcFall: ['으악', '아 발 미끄러짐', '손 다 풀렸어', '다음엔 된다'],
    playerTop: ['완등! 🔥', '해냈다!!', '매운맛 클리어!'],
    playerFall: ['앗!!', '펌핑…', '손이 안 펴져'],
  };

  // ---------------------------------------------------------------
  // 유틸
  // ---------------------------------------------------------------
  const $ = (s) => document.querySelector(s);
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function mulberry(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function blobPath(cx, cy, r, rand) {
    const n = 7;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.45;
      const rr = r * (0.68 + rand() * 0.5);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.82]);
    }
    const f = (p) => p[0].toFixed(1) + ',' + p[1].toFixed(1);
    let d = 'M' + f(pts[0]);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += 'C' + f(c1) + ' ' + f(c2) + ' ' + f(p2);
    }
    return d + 'Z';
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  // ---------------------------------------------------------------
  // 사운드 (WebAudio, 기본 꺼짐)
  // ---------------------------------------------------------------
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

  // ---------------------------------------------------------------
  // 기록 (localStorage)
  // ---------------------------------------------------------------
  const Store = {
    key: 'spicy-climbing-v1',
    data: { name: '', color: '#e3262b', sends: {}, recent: [] },
    load() {
      try { const raw = localStorage.getItem(this.key); if (raw) Object.assign(this.data, JSON.parse(raw)); } catch (e) { /* 저장소 없음 */ }
    },
    save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* 무시 */ } },
    addSend(p) {
      this.data.sends[p.id] = (this.data.sends[p.id] || 0) + 1;
      this.data.recent.unshift({ id: p.id, t: Date.now() });
      this.data.recent = this.data.recent.slice(0, 12);
      this.save();
    },
  };

  // ---------------------------------------------------------------
  // 벽 그리기
  // ---------------------------------------------------------------
  const svg = $('#wall');
  const layers = {};
  const holdEls = new Map(); // "problemId:index" -> g

  function drawWall() {
    const defs = el('defs', null, svg);
    defs.innerHTML = `
      <pattern id="bolts" width="34" height="34" patternUnits="userSpaceOnUse" x="12" y="8">
        <circle cx="17" cy="17" r="2.1" fill="#7a5c3a" opacity=".55"/>
      </pattern>
      <linearGradient id="wallLight" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff6e6" stop-opacity=".35"/>
        <stop offset=".55" stop-color="#fff" stop-opacity="0"/>
        <stop offset="1" stop-color="#5a3c1c" stop-opacity=".18"/>
      </linearGradient>
      <linearGradient id="matTop" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#c4c8cd"/><stop offset="1" stop-color="#dfe2e6"/>
      </linearGradient>
      <linearGradient id="matFront" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#b3b8be"/><stop offset="1" stop-color="#8f949a"/>
      </linearGradient>
      <filter id="glow" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="6"/></filter>
      <filter id="soft"><feGaussianBlur stdDeviation="2.5"/></filter>`;

    // 배경 + 천장
    el('rect', { x: 0, y: 0, width: W, height: 720, fill: '#1b1b1d' }, svg);
    el('rect', { x: 0, y: 0, width: W, height: WALL.y, fill: '#2b2b2f' }, svg);
    for (let x = 0; x < W; x += 60) el('line', { x1: x, y1: 0, x2: x + 30, y2: WALL.y, stroke: '#35353a', 'stroke-width': 2 }, svg);
    [[120, 14, 260, 30], [520, 10, 700, 26], [880, 16, 1080, 32]].forEach(([x1, y1, x2, y2]) => {
      el('line', { x1, y1, x2, y2, stroke: '#fff', 'stroke-width': 14, 'stroke-linecap': 'round', opacity: 0.45, filter: 'url(#glow)', class: 'light-strip' }, svg);
      el('line', { x1, y1, x2, y2, stroke: '#fdfdf8', 'stroke-width': 5, 'stroke-linecap': 'round' }, svg);
    });

    // 벽 패널
    const panelX = [30, 300, 580, 830, 1170];
    const panelFill = ['#efcd99', '#e8c48d', '#f1d1a0', '#e6c088'];
    for (let i = 0; i < 4; i++) {
      el('rect', { x: panelX[i], y: WALL.y, width: panelX[i + 1] - panelX[i], height: WALL.h, fill: panelFill[i] }, svg);
    }
    el('rect', { x: WALL.x, y: WALL.y, width: WALL.w, height: WALL.h, fill: 'url(#bolts)' }, svg);
    el('rect', { x: WALL.x, y: WALL.y, width: WALL.w, height: WALL.h, fill: 'url(#wallLight)' }, svg);
    for (let i = 1; i < 4; i++) el('line', { x1: panelX[i], y1: WALL.y, x2: panelX[i], y2: WALL.y + WALL.h, stroke: '#b8925d', 'stroke-width': 2.5, opacity: 0.8 }, svg);
    el('line', { x1: WALL.x, y1: 318, x2: WALL.x + WALL.w, y2: 318, stroke: '#c7a16b', 'stroke-width': 1.5, opacity: 0.5 }, svg);
    // 좌우 기둥
    el('rect', { x: 0, y: WALL.y, width: WALL.x, height: 560, fill: '#26262a' }, svg);
    el('rect', { x: WALL.x + WALL.w, y: WALL.y, width: W - WALL.x - WALL.w, height: 560, fill: '#26262a' }, svg);

    // 불꽃이 벽화 + SPICY
    const mural = el('g', { opacity: 0.94 }, svg);
    el('path', { d: FLAME_D, fill: '#e3262b', transform: 'translate(335 130) scale(2.1)' }, mural);
    el('circle', { cx: 335 + 38 * 2.1, cy: 130 + 60 * 2.1, r: 8, fill: '#2a120a' }, mural);
    el('circle', { cx: 335 + 62 * 2.1, cy: 130 + 60 * 2.1, r: 8, fill: '#2a120a' }, mural);
    el('path', { d: `M${335 + 42 * 2.1} ${130 + 72 * 2.1} q8 -8 17 0 q8 8 17 0`, fill: 'none', stroke: '#2a120a', 'stroke-width': 5, 'stroke-linecap': 'round' }, mural);
    const t = el('text', { x: 440, y: 440, 'text-anchor': 'middle', fill: '#e3262b', 'font-size': 92, transform: 'rotate(-6 440 440)', 'font-family': '"Sedgwick Ave Display", "Black Han Sans", cursive' }, mural);
    t.textContent = 'SPICY';

    // 볼륨
    const vol = el('g', null, svg);
    [
      [[560, 250], [660, 186], [646, 338]],
      [[772, 478], [866, 420], [846, 548]],
      [[1000, 120], [1094, 150], [1030, 228]],
      [[132, 176], [232, 146], [214, 246]],
      [[600, 448], [560, 540], [672, 520]],
    ].forEach((pts) => {
      const c = pts.reduce((a, p) => [a[0] + p[0] / 3, a[1] + p[1] / 3], [0, 0]);
      const apex = [c[0] + 8, c[1] - 6];
      el('polygon', { points: pts.map((p) => p.join(',')).join(' '), fill: '#000', opacity: 0.18, transform: 'translate(5 9)', filter: 'url(#soft)' }, vol);
      for (let i = 0; i < 3; i++) {
        const a = pts[i], b = pts[(i + 1) % 3];
        el('polygon', { points: [a, b, apex].map((p) => p.join(',')).join(' '), fill: ['#9aa1aa', '#7f868f', '#8c939c'][i] }, vol);
      }
    });

    // 홀드 레이어
    layers.tape = el('g', null, svg);
    layers.holds = el('g', null, svg);
    drawDecorHolds();
    drawProblemHolds();
    layers.hint = el('g', null, svg);

    // 매트
    const mat = el('g', null, svg);
    el('rect', { x: 0, y: 585, width: W, height: 135, fill: '#202022' }, mat);
    el('polygon', { points: `0,590 ${W},590 ${W},660 0,660`, fill: 'url(#matTop)' }, mat);
    el('rect', { x: 0, y: 660, width: W, height: 44, fill: 'url(#matFront)' }, mat);
    el('rect', { x: 0, y: 704, width: W, height: 16, fill: '#262628' }, mat);
    el('rect', { x: 0, y: 585, width: W, height: 8, fill: '#000', opacity: 0.25, filter: 'url(#soft)' }, mat);
    for (let x = 150; x < W; x += 300) {
      el('line', { x1: x, y1: 590, x2: x - 14, y2: 660, stroke: '#aeb3b9', 'stroke-width': 2 }, mat);
      el('line', { x1: x - 14, y1: 660, x2: x - 14, y2: 704, stroke: '#80858b', 'stroke-width': 2 }, mat);
    }
    el('line', { x1: 0, y1: 660, x2: W, y2: 660, stroke: '#eef0f2', 'stroke-width': 2, opacity: 0.8 }, mat);

    layers.climbers = el('g', null, svg);
    layers.fx = el('g', { 'pointer-events': 'none' }, svg);
  }

  function drawHold(parent, x, y, r, color, rand, extra = {}) {
    const g = el('g', { class: 'hold', ...extra }, parent);
    const d = blobPath(x, y, r, rand);
    el('path', { d, fill: '#000', opacity: 0.22, transform: 'translate(2.5 5)' }, g);
    el('path', { d, fill: color, class: 'hold-body', stroke: shade(color, -40), 'stroke-width': 1.2 }, g);
    el('ellipse', { cx: x - r * 0.25, cy: y - r * 0.3, rx: r * 0.32, ry: r * 0.18, fill: '#fff', opacity: color === '#232325' ? 0.18 : 0.3 }, g);
    el('circle', { cx: x + r * 0.1, cy: y + r * 0.05, r: 2.6, fill: '#000', opacity: 0.45 }, g);
    return g;
  }

  function drawDecorHolds() {
    const rand = mulberry(20251004);
    const taken = PROBLEMS.flatMap((p) => p.holds.map(([x, y]) => ({ x, y })));
    let placed = 0, guard = 0;
    while (placed < 70 && guard++ < 3000) {
      const x = WALL.x + 30 + rand() * (WALL.w - 60);
      const y = WALL.y + 30 + rand() * (WALL.h - 70);
      if (taken.some((h) => dist(h, { x, y }) < 44)) continue;
      taken.push({ x, y });
      drawHold(layers.holds, x, y, 7 + rand() * 9, DECOR_COLORS[Math.floor(rand() * DECOR_COLORS.length)], rand);
      placed++;
    }
  }

  function drawProblemHolds() {
    const rand = mulberry(777);
    PROBLEMS.forEach((p) => {
      p.holds = p.holds.map(([x, y], i) => ({ x, y, i }));
      p.holds.forEach((h, i) => {
        const isTop = i === p.holds.length - 1;
        const r = isTop ? 22 : 15 + rand() * 6 + p.level * -0.8;
        const g = drawHold(layers.holds, h.x, h.y, r, p.color, rand, { class: 'hold prob', 'data-p': p.id, 'data-i': i, tabindex: -1 });
        holdEls.set(p.id + ':' + i, g);
        g.addEventListener('click', () => onHoldClick(p, i));
      });
      // 스타트/탑 테이프
      const s = p.holds[0], top = p.holds[p.holds.length - 1];
      const tg = el('g', { class: 'tape', 'data-p': p.id }, layers.tape);
      tape(tg, s.x - 34, s.y + 6, 'S', p.color);
      tape(tg, top.x + 26, top.y - 10, 'TOP', p.color);
      p.tape = tg;
    });
  }

  function tape(parent, x, y, label, color) {
    const w = label.length * 9 + 12;
    const dark = color === '#232325' || color === '#7b3fb8' || color === '#2f6fd6' || color === '#e3262b';
    el('rect', { x: x - w / 2, y: y - 9, width: w, height: 18, rx: 2, fill: color, transform: `rotate(-8 ${x} ${y})`, opacity: 0.95 }, parent);
    const t = el('text', { x, y: y + 4.5, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 900, fill: dark ? '#fff' : '#222', transform: `rotate(-8 ${x} ${y})`, 'font-family': 'Noto Sans KR, sans-serif' }, parent);
    t.textContent = label;
  }

  // ---------------------------------------------------------------
  // 클라이머
  // ---------------------------------------------------------------
  class Climber {
    constructor({ name, color, isPlayer = false }) {
      this.name = name; this.color = color; this.isPlayer = isPlayer;
      this.onWall = false; this.x = 600; this.y = GROUND;
      this.g = el('g', { class: 'climber' + (isPlayer ? ' me' : '') }, layers.climbers);
      this.inner = el('g', { class: 'body' }, this.g);
      const arms = el('g', { class: 'arms' }, this.inner);
      [[-13, -10, -4, -HANG], [13, -10, 4, -HANG]].forEach(([x1, y1, x2, y2]) => {
        el('line', { x1, y1, x2, y2, stroke: 'rgba(0,0,0,.35)', 'stroke-width': 8, 'stroke-linecap': 'round' }, arms);
        el('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': 5, 'stroke-linecap': 'round' }, arms);
      });
      const f = el('g', { transform: 'scale(.6) translate(-50 -55)' }, this.inner);
      el('path', { d: FLAME_D, fill: color, stroke: isPlayer ? '#fff' : 'rgba(0,0,0,.35)', 'stroke-width': isPlayer ? 5 : 3, 'stroke-linejoin': 'round' }, f);
      el('circle', { cx: 38, cy: 60, r: 4.6, fill: '#1a0a06' }, f);
      el('circle', { cx: 62, cy: 60, r: 4.6, fill: '#1a0a06' }, f);
      el('path', { d: 'M42 72 q4 -4 8 0 q4 4 8 0', fill: 'none', stroke: '#1a0a06', 'stroke-width': 3, 'stroke-linecap': 'round' }, f);
      // 이름표
      const tag = el('g', { class: 'tag' }, this.g);
      const tw = Math.max(36, name.length * 13 + 14);
      el('rect', { x: -tw / 2, y: 30, width: tw, height: 19, rx: 9.5, fill: isPlayer ? '#e3262b' : 'rgba(20,20,22,.78)' }, tag);
      const tt = el('text', { x: 0, y: 44, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#fff', 'font-family': 'Noto Sans KR, sans-serif' }, tag);
      tt.textContent = name;
      this.place(this.x, this.y, 0);
    }
    place(x, y, dur = 600, ease = 'cubic-bezier(.3,.7,.3,1)') {
      this.g.style.transition = dur ? `transform ${dur}ms ${ease}` : 'none';
      this.g.style.transform = `translate(${x}px, ${y}px)`;
      this.x = x; this.y = y;
      return wait(dur);
    }
    walkTo(x) {
      this.onWall = false;
      this.g.classList.remove('hanging');
      this.g.classList.remove('sitting');
      const d = Math.abs(x - this.x);
      return this.place(x, GROUND, clamp(d * 3, 250, 1600), 'ease-in-out');
    }
    grab(h, dur) {
      this.onWall = true;
      this.g.classList.remove('sitting');
      this.g.classList.add('hanging');
      const d = Math.hypot(h.x - this.x, h.y + HANG - this.y);
      return this.place(h.x, h.y + HANG, dur || clamp(d * 3.2, 280, 700));
    }
    async drop(kind = 'fall') {
      const h = GROUND - this.y;
      this.onWall = false;
      this.g.classList.remove('hanging');
      const dur = clamp(Math.sqrt(Math.max(h, 1)) * 32, 250, 800);
      await this.place(this.x, GROUND, dur, kind === 'fall' ? 'cubic-bezier(.55,0,1,.45)' : 'cubic-bezier(.4,0,.9,.6)');
      this.g.classList.remove('squash');
      void this.g.getBBox();
      this.g.classList.add('squash');
      setTimeout(() => this.g.classList.remove('squash'), 520);
    }
    sit() { this.g.classList.add('sitting'); }
    say(text, ms = 2600) {
      if (this.bubble) this.bubble.remove();
      clearTimeout(this.bubbleT);
      const b = el('g', { class: 'bubble' }, this.g);
      const txt = el('text', { x: 0, y: -70, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: '#151515', 'font-family': 'Noto Sans KR, sans-serif' }, null);
      txt.textContent = text;
      const rect = el('rect', { rx: 12, fill: '#fff', stroke: this.isPlayer ? '#e3262b' : 'rgba(0,0,0,.15)', 'stroke-width': this.isPlayer ? 2 : 1 }, b);
      const tail = el('path', { fill: '#fff' }, b);
      b.appendChild(txt);
      let w = 0;
      try { w = txt.getComputedTextLength(); } catch (e) { w = text.length * 14; }
      if (!w) w = text.length * 14;
      const bw = w + 24, bh = 30;
      // 화면 밖으로 안 나가게
      let bx = 0;
      if (this.x - bw / 2 < 8) bx = 8 - (this.x - bw / 2);
      if (this.x + bw / 2 > W - 8) bx = W - 8 - (this.x + bw / 2);
      const top = this.y - 70 - 20 < 4 ? 70 : -70; // 위쪽 끝이면 아래로
      const by = top - 20;
      rect.setAttribute('x', bx - bw / 2); rect.setAttribute('y', by);
      rect.setAttribute('width', bw); rect.setAttribute('height', bh);
      txt.setAttribute('x', bx); txt.setAttribute('y', by + 20);
      tail.setAttribute('d', top < 0 ? `M-6 ${by + bh - 1} L0 ${by + bh + 8} L6 ${by + bh - 1} Z` : `M-6 ${by + 1} L0 ${by - 8} L6 ${by + 1} Z`);
      this.bubble = b;
      this.bubbleT = setTimeout(() => { b.remove(); if (this.bubble === b) this.bubble = null; }, ms);
    }
  }

  // ---------------------------------------------------------------
  // 파티클 (초크 가루, 불꽃 컨페티)
  // ---------------------------------------------------------------
  const particles = [];
  function chalkPuff(x, y, n = 14) {
    for (let i = 0; i < n; i++) {
      const c = el('circle', { r: 2 + Math.random() * 4, fill: '#fff', opacity: 0.85 }, layers.fx);
      particles.push({ e: c, x: x + (Math.random() - 0.5) * 20, y, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 50, g: -10, life: 0, max: 0.9 + Math.random() * 0.6, kind: 'chalk' });
    }
  }
  function fireConfetti(x, y, n = 26) {
    const cols = ['#e3262b', '#ff8a1f', '#ffc21a', '#ff5c8a'];
    for (let i = 0; i < n; i++) {
      const g = el('g', null, layers.fx);
      el('path', { d: FLAME_D, fill: pick(cols), transform: 'scale(.14) translate(-50 -50)' }, g);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const s = 160 + Math.random() * 220;
      particles.push({ e: g, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 380, life: 0, max: 1.4 + Math.random() * 0.6, rot: Math.random() * 360, vr: (Math.random() - 0.5) * 500, kind: 'fire' });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.max) { p.e.remove(); particles.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= p.kind === 'chalk' ? 0.96 : 0.99;
      const k = 1 - p.life / p.max;
      if (p.kind === 'chalk') {
        p.e.setAttribute('cx', p.x); p.e.setAttribute('cy', p.y); p.e.setAttribute('opacity', (0.85 * k).toFixed(2));
      } else {
        p.rot += p.vr * dt;
        p.e.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rot.toFixed(0)})`);
        p.e.setAttribute('opacity', Math.min(1, k * 2).toFixed(2));
      }
    }
  }

  // ---------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------
  const ui = {
    problems: $('#problems'), current: $('#current'), pumpVal: $('#pump-val'), pumpFill: $('#pump-fill'),
    pump: document.querySelector('.pump'), toast: $('#toast'), wrap: $('#wall-wrap'),
    chalk: $('#btn-chalk'), down: $('#btn-down'),
  };
  let toastT;
  function toast(msg, ms = 2200) {
    ui.toast.textContent = msg;
    ui.toast.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => ui.toast.classList.remove('show'), ms);
  }

  function renderChips() {
    ui.problems.innerHTML = '';
    [...PROBLEMS].sort((a, b) => a.level - b.level).forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.setAttribute('role', 'listitem');
      b.setAttribute('aria-pressed', state.problem === p ? 'true' : 'false');
      const sent = Store.data.sends[p.id] || 0;
      b.innerHTML = `<span class="dot" style="background:${p.color}"></span>${p.name}<span class="grade">${p.grade}</span>${sent ? `<span class="sent">✔${sent > 1 ? sent : ''}</span>` : ''}`;
      b.addEventListener('click', () => selectProblem(p));
      ui.problems.appendChild(b);
    });
  }

  function renderCurrent() {
    const p = state.problem;
    if (!p) { ui.current.innerHTML = '문제를 골라주세요<small>아래 색깔 칩이나 벽의 홀드를 눌러보세요</small>'; return; }
    const total = p.holds.length;
    const prog = state.step < 0 ? '시작 전' : `${state.step + 1} / ${total}`;
    ui.current.innerHTML = `<span style="color:${p.color === '#232325' ? '#fff' : p.color}">${p.name} ${p.grade}</span> · ${prog}<small>${p.note}</small>`;
  }

  function renderPump() {
    const v = Math.round(state.pump);
    ui.pumpVal.textContent = v + '%';
    ui.pumpFill.style.width = v + '%';
    ui.pump.classList.toggle('danger', v >= 75);
  }

  function scrollWallTo(x) {
    const wrap = ui.wrap;
    if (wrap.scrollWidth <= wrap.clientWidth + 2) return;
    const px = (x / W) * svg.clientWidth;
    wrap.scrollTo({ left: px - wrap.clientWidth / 2, behavior: 'smooth' });
  }

  function updateHint() {
    layers.hint.innerHTML = '';
    holdEls.forEach((g) => g.classList.remove('active', 'done'));
    PROBLEMS.forEach((p) => p.tape.classList.toggle('active', p === state.problem));
    const p = state.problem;
    svg.classList.toggle('focus', !!p);
    if (!p) return;
    p.holds.forEach((h, i) => {
      const g = holdEls.get(p.id + ':' + i);
      g.classList.add('active');
      if (i <= state.step) g.classList.add('done');
    });
    const next = p.holds[state.step + 1];
    if (next && !state.busy) {
      el('circle', { cx: next.x, cy: next.y, r: 26, fill: 'none', stroke: '#fff', 'stroke-width': 4, class: 'hint-ring' }, layers.hint);
      el('circle', { cx: next.x, cy: next.y, r: 26, fill: 'none', stroke: p.color === '#f6c915' ? '#e3262b' : '#f6c915', 'stroke-width': 2, 'stroke-dasharray': '6 5', opacity: 0.9 }, layers.hint);
    }
  }

  // ---------------------------------------------------------------
  // 게임 상태
  // ---------------------------------------------------------------
  const state = { problem: null, step: -1, pump: 0, busy: false, chalkReady: true };
  let me;
  const npcs = [];

  async function selectProblem(p) {
    if (state.busy) return;
    if (state.problem === p && me.onWall) return;
    state.busy = true;
    if (me.onWall) { await me.drop('down'); }
    state.problem = p; state.step = -1;
    renderChips(); renderCurrent(); updateHint();
    scrollWallTo(p.holds[0].x);
    toast(`${p.name} ${p.grade} — 반짝이는 S 홀드부터 잡아보세요`);
    await me.walkTo(p.holds[0].x + 6);
    state.busy = false;
    updateHint();
  }

  async function onHoldClick(p, i) {
    if (state.busy) return;
    if (state.problem !== p) { selectProblem(p); return; }
    if (i !== state.step + 1) {
      const g = holdEls.get(p.id + ':' + i);
      g.classList.remove('shake'); void g.getBBox(); g.classList.add('shake');
      if (i <= state.step) me.say('이미 잡은 홀드!', 1400);
      else me.say('너무 멀어요… 다음 홀드부터!', 1600);
      return;
    }
    const h = p.holds[i];
    state.busy = true;
    updateHint();

    const reach = state.step < 0 ? 0 : dist(p.holds[state.step], h);
    state.pump += p.pump * (0.8 + Math.random() * 0.4) + reach / 45;

    if (state.pump >= 100) {
      // 손을 뻗다가 떨어짐
      me.grab({ x: (me.x + h.x) / 2, y: (me.y - HANG + h.y) / 2 }, 260);
      await wait(260);
      await playerFall();
      return;
    }

    Sound.grab();
    await me.grab(h);
    state.step = i;
    scrollWallTo(h.x);
    renderCurrent();
    if (i === p.holds.length - 1) {
      await playerTop();
    } else {
      if (Math.random() < 0.12) me.say(pick(['후…', '좋아', '발 올리고', '할 수 있다']), 1200);
      state.busy = false;
      updateHint();
    }
  }

  async function playerFall() {
    state.busy = true;
    Sound.fall();
    me.say(pick(LINES.playerFall), 1800);
    await me.drop('fall');
    chalkPuff(me.x, GROUND + 20, 18);
    state.step = -1;
    renderCurrent(); updateHint();
    const n = npcs.find((c) => !c.onWall && !c.busy);
    if (n) setTimeout(() => n.say(pick(LINES.comfort)), 500);
    toast('떨어졌어요! 매트에서 펌핑을 풀고 다시 도전해요');
    state.busy = false;
    updateHint();
  }

  async function playerTop() {
    const p = state.problem;
    Sound.top();
    fireConfetti(me.x, me.y - 40, 34);
    me.say(pick(LINES.playerTop), 2200);
    Store.addSend(p);
    renderChips();
    toast(`🔥 ${p.name} ${p.grade} 완등! (총 ${Store.data.sends[p.id]}번째)`, 2800);
    npcs.forEach((n, k) => { if (!n.busy) setTimeout(() => n.say(pick(LINES.cheer)), 300 + k * 450); });
    await wait(1700);
    await me.drop('down');
    state.step = -1;
    renderCurrent();
    state.busy = false;
    updateHint();
  }

  async function downClimb() {
    if (state.busy || !me.onWall) { if (!me.onWall) toast('이미 매트 위에 있어요'); return; }
    state.busy = true;
    await me.drop('down');
    state.step = -1;
    renderCurrent();
    state.busy = false;
    updateHint();
  }

  function useChalk() {
    if (!state.chalkReady) return;
    state.chalkReady = false;
    ui.chalk.disabled = true;
    Sound.chalk();
    chalkPuff(me.x, me.y - (me.onWall ? 20 : 10), 16);
    state.pump = Math.max(0, state.pump - 15);
    me.say(pick(['슥슥', '초크 충전', '후~']), 1000);
    setTimeout(() => { state.chalkReady = true; ui.chalk.disabled = false; }, 3500);
  }

  // ---------------------------------------------------------------
  // NPC (단골들)
  // ---------------------------------------------------------------
  function busyProblems() {
    const s = new Set();
    if (state.problem) s.add(state.problem.id);
    npcs.forEach((n) => { if (n.problem) s.add(n.problem.id); });
    return s;
  }

  async function npcClimb(n) {
    const used = busyProblems();
    const options = PROBLEMS.filter((p) => !used.has(p.id));
    if (!options.length) return;
    const p = pick(options);
    n.busy = true; n.problem = p;
    n.say(pick(LINES.npcStart), 1600);
    await n.walkTo(p.holds[0].x - 4);
    await wait(500);
    let fell = false;
    for (let i = 0; i < p.holds.length; i++) {
      if (i > 0 && Math.random() < 0.035 + p.level * 0.045) { fell = true; break; }
      await n.grab(p.holds[i]);
      await wait(700 + Math.random() * 900);
    }
    if (fell) {
      n.say(pick(LINES.npcFall), 1800);
      await n.drop('fall');
      chalkPuff(n.x, GROUND + 20, 10);
    } else {
      fireConfetti(n.x, n.y - 40, 14);
      n.say(pick(LINES.npcTop), 1800);
      npcs.forEach((o) => { if (o !== n && !o.busy && Math.random() < 0.7) setTimeout(() => o.say(pick(LINES.cheer)), 400 + Math.random() * 600); });
      await wait(1200);
      await n.drop('down');
    }
    await wait(900);
    n.problem = null;
    await n.walkTo(n.spot);
    n.sit();
    n.busy = false;
    n.nextClimb = performance.now() + 9000 + Math.random() * 12000;
  }

  // ---------------------------------------------------------------
  // 루프
  // ---------------------------------------------------------------
  let last = performance.now();
  let nextChat = performance.now() + 4000;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (me) {
      if (me.onWall && !state.busy) {
        const rate = 1.1 + (state.problem ? state.problem.level * 0.35 : 0);
        state.pump += rate * dt;
        if (state.pump >= 100) { state.pump = 100; playerFall(); }
      } else if (!me.onWall) {
        state.pump = Math.max(0, state.pump - 14 * dt);
      }
      state.pump = clamp(state.pump, 0, 100);
      renderPump();

      // 단골들
      if (now > nextChat) {
        const idle = npcs.filter((n) => !n.busy);
        if (idle.length) pick(idle).say(pick(LINES.idle));
        nextChat = now + 6000 + Math.random() * 6000;
      }
      npcs.forEach((n) => { if (!n.busy && now > n.nextClimb && !document.hidden) npcClimb(n); });
    }

    updateParticles(dt);
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------
  // 입장
  // ---------------------------------------------------------------
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

  function enterGym(name, color) {
    $('#intro').hidden = true;
    $('#gym').hidden = false;
    window.scrollTo(0, 0);

    NPCS.forEach((d, k) => {
      const n = new Climber({ name: d.name, color: d.color });
      n.spot = d.spot; n.busy = false;
      n.place(d.spot, GROUND, 0);
      n.sit();
      n.nextClimb = performance.now() + 5000 + k * 7000 + Math.random() * 4000;
      npcs.push(n);
    });
    me = new Climber({ name, color, isPlayer: true });
    me.place(600, GROUND, 0);

    renderChips(); renderCurrent(); renderPump(); updateHint();
    scrollWallTo(600);
    setTimeout(() => me.say(`안녕하세요! ${name}예요`, 2200), 400);
    setTimeout(() => npcs[1].say('어서 와요~ 신발 벗고 들어와요', 2600), 1500);
    toast('어서 오세요, 스파이시 클라이밍입니다 🔥', 2600);

    ui.chalk.addEventListener('click', useChalk);
    ui.down.addEventListener('click', downClimb);
    $('#chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = $('#chat-input');
      const v = inp.value.trim();
      if (!v) return;
      me.say(v, 3200);
      inp.value = '';
      if (/나이스|가자|화이팅|파이팅|안녕/.test(v)) {
        const idle = npcs.filter((x) => !x.busy);
        const n = idle.length ? pick(idle) : null;
        if (n) setTimeout(() => n.say(pick(['가자~!', '반가워요!', '화이팅 🔥', '나이스~'])), 800);
      }
    });
    $('#btn-sound').addEventListener('click', (e) => {
      Sound.on = !Sound.on;
      if (Sound.on) Sound.ensure().resume?.();
      e.currentTarget.textContent = Sound.on ? '🔊' : '🔈';
      toast(Sound.on ? '소리를 켰어요' : '소리를 껐어요', 1200);
    });
    $('#btn-records').addEventListener('click', openRecords);
    $('#btn-reset').addEventListener('click', () => {
      if (!confirm('완등 기록을 모두 지울까요?')) return;
      Store.data.sends = {}; Store.data.recent = []; Store.save();
      renderChips(); openRecords();
    });
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'c' || e.key === 'C') useChalk();
      if (e.key === 'ArrowDown') downClimb();
      if (e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        const p = state.problem;
        if (p && p.holds[state.step + 1]) onHoldClick(p, state.step + 1);
      }
    });

    requestAnimationFrame((t) => { last = t; requestAnimationFrame(loop); });
  }

  function openRecords() {
    const d = Store.data;
    const total = Object.values(d.sends).reduce((a, b) => a + b, 0);
    const done = PROBLEMS.filter((p) => d.sends[p.id]).length;
    $('#records-summary').textContent = `${d.name || '불꽃이'}님 · 총 ${total}번 완등 · ${done}/${PROBLEMS.length} 문제 클리어`;
    $('#records-list').innerHTML = [...PROBLEMS].sort((a, b) => a.level - b.level).map((p) =>
      `<li><span class="dot" style="background:${p.color}"></span>${p.name} <span style="color:var(--muted)">${p.grade}</span><span class="count">${d.sends[p.id] ? '✔ ' + d.sends[p.id] + '회' : '—'}</span></li>`).join('');
    const fmt = (t) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    $('#records-recent').innerHTML = d.recent.length
      ? d.recent.map((r) => { const p = PROBLEMS.find((x) => x.id === r.id); return p ? `<li>${p.name} ${p.grade} — ${fmt(r.t)}</li>` : ''; }).join('')
      : '<li>아직 완등 기록이 없어요</li>';
    const dlg = $('#records');
    if (!dlg.open) dlg.showModal();
  }

  // 시작
  drawWall();
  setupIntro();
})();
