/* ============================================================
 * sprites.js  ——  全部图形预渲染成离屏位图
 * 运行时只做 drawImage，不再构造渐变 / 路径，这是性能的关键
 * ============================================================ */

const Sprites = {
  dpr: 0,
  ready: false,
  ship: null,
  enemy: new Map(),
  boss: new Map(),
  bullet: new Map(),
  dot: new Map(),
  glow: new Map(),
  power: new Map(),
  shield: null,

  setDpr(dpr) {
    if (Math.abs(dpr - this.dpr) < 0.01 && this.ready) return;
    this.dpr = dpr;
    this.enemy.clear();
    this.boss.clear();
    this.bullet.clear();
    this.dot.clear();
    this.glow.clear();
    this.power.clear();
    this.build();
    this.ready = true;
  },

  make(w, h) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * this.dpr));
    cv.height = Math.max(1, Math.ceil(h * this.dpr));
    const g = cv.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return { cv, g };
  },

  build() {
    this.ship = this.makeShip();
    this.drone = this.makeDrone();
    this.eliteRing = this.makeEliteRing();
    for (const k of ENEMY_KEYS) this.enemy.set(k, this.makeEnemy(ENEMIES[k], k));
    for (let i = 0; i < BOSSES.length; i++) this.boss.set(i, this.makeBoss(BOSSES[i]));
    for (const c of ['#7fd6ff', '#ffd54f', '#ff8a65', '#ffb74d', '#ff7043', '#76ff03', '#ffffff', '#b388ff']) {
      this.bullet.set(c, this.makeOrb(c, 28));
      this.dot.set(c, this.makeOrb(c, 20));   // 粒子专用：绘制尺寸接近原生，避免降采样
      this.glow.set(c, this.makeGlow(c));
    }
    for (const k in POWERUPS) this.power.set(k, this.makePower(k));
    this.shield = this.makeShield();
    this.laser = this.makeLaser();
  },

  /* ---------- 激光束：竖向条带，绘制时按长度拉伸 ---------- */
  makeLaser() {
    const W = 32, H = 800;
    const { cv, g } = this.make(W, H);
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, 'rgba(179,136,255,0)');
    grd.addColorStop(0.2, 'rgba(179,136,255,0.55)');
    grd.addColorStop(0.5, '#ffffff');
    grd.addColorStop(0.8, 'rgba(179,136,255,0.55)');
    grd.addColorStop(1, 'rgba(179,136,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    // 沿程的能量节点
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (let y = 0; y < H; y += 46) g.fillRect(W * 0.3, y, W * 0.4, 22);
    return cv;
  },

  /* ---------- 通用：径向小球（子弹 / 粒子） ---------- */
  makeOrb(color, S) {
    S = S || 28;
    const { cv, g } = this.make(S, S);
    const c = S / 2;
    const grd = g.createRadialGradient(c, c, 0, c, c, c);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.42, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    // 内核
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(c, c, c * 0.3, 0, Math.PI * 2); g.fill();
    return cv;
  },

  makeGlow(color) {
    const S = 96;
    const { cv, g } = this.make(S, S);
    const c = S / 2;
    const grd = g.createRadialGradient(c, c, 0, c, c, c);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.25, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return cv;
  },

  /* ---------- 玩家飞船（朝上） ---------- */
  makeShip() {
    const W = 52, H = 60;
    const { cv, g } = this.make(W, H);
    g.translate(W / 2, H / 2 + 2);

    // 引擎尾焰底座
    g.fillStyle = '#37474f';
    g.beginPath();
    g.moveTo(-9, 20); g.lineTo(9, 20); g.lineTo(6, 27); g.lineTo(-6, 27);
    g.closePath(); g.fill();

    // 机翼
    const wing = g.createLinearGradient(0, -10, 0, 22);
    wing.addColorStop(0, '#5a7d8c');
    wing.addColorStop(1, '#2b4250');
    g.fillStyle = wing;
    g.beginPath();
    g.moveTo(-4, -6);
    g.lineTo(-24, 16); g.lineTo(-24, 24); g.lineTo(-6, 16);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(4, -6);
    g.lineTo(24, 16); g.lineTo(24, 24); g.lineTo(6, 16);
    g.closePath(); g.fill();

    // 主机身
    const body = g.createLinearGradient(-8, 0, 8, 0);
    body.addColorStop(0, '#cfd8dc');
    body.addColorStop(0.4, '#90a4ae');
    body.addColorStop(1, '#546e7a');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(0, -26);
    g.lineTo(9, -6); g.lineTo(10, 20); g.lineTo(4, 26);
    g.lineTo(-4, 26); g.lineTo(-10, 20); g.lineTo(-9, -6);
    g.closePath(); g.fill();

    // 机身边线
    g.strokeStyle = 'rgba(0,0,0,.35)';
    g.lineWidth = 1;
    g.stroke();

    // 座舱
    const cock = g.createRadialGradient(0, -10, 1, 0, -8, 8);
    cock.addColorStop(0, '#e1f5fe');
    cock.addColorStop(0.5, '#4fc3f7');
    cock.addColorStop(1, '#0288d1');
    g.fillStyle = cock;
    g.beginPath(); g.ellipse(0, -9, 5, 8, 0, 0, Math.PI * 2); g.fill();

    // 翼尖灯
    g.fillStyle = '#ff5252';
    g.beginPath(); g.arc(-22, 20, 2.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#76ff03';
    g.beginPath(); g.arc(22, 20, 2.2, 0, Math.PI * 2); g.fill();

    return cv;
  },

  /* ---------- 僚机（小型护航机） ---------- */
  makeDrone() {
    const W = 34, H = 34;
    const { cv, g } = this.make(W, H);
    g.translate(W / 2, H / 2 + 1);

    const body = g.createLinearGradient(0, -10, 0, 12);
    body.addColorStop(0, '#eceff1');
    body.addColorStop(0.5, '#90a4ae');
    body.addColorStop(1, '#455a64');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(0, -13); g.lineTo(7, 2); g.lineTo(5, 12);
    g.lineTo(-5, 12); g.lineTo(-7, 2);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.stroke();

    // 小翼
    g.fillStyle = '#546e7a';
    g.beginPath();
    g.moveTo(-5, 0); g.lineTo(-13, 9); g.lineTo(-11, 13); g.lineTo(-4, 8);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(5, 0); g.lineTo(13, 9); g.lineTo(11, 13); g.lineTo(4, 8);
    g.closePath(); g.fill();

    // 座舱
    g.fillStyle = '#4fc3f7';
    g.beginPath(); g.arc(0, -4, 3.4, 0, Math.PI * 2); g.fill();
    // 引擎光
    g.fillStyle = '#ff8a65';
    g.beginPath(); g.arc(0, 12, 2.4, 0, Math.PI * 2); g.fill();
    return cv;
  },

  /* ---------- 精英光环 ---------- */
  makeEliteRing() {
    const S = 120;
    const { cv, g } = this.make(S, S);
    const c = S / 2;
    const grd = g.createRadialGradient(c, c, S * 0.30, c, c, S * 0.5);
    grd.addColorStop(0, 'rgba(255,215,64,0)');
    grd.addColorStop(0.55, 'rgba(255,215,64,0.42)');
    grd.addColorStop(1, 'rgba(255,215,64,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,215,64,0.9)';
    g.lineWidth = 2.5;
    g.setLineDash([10, 7]);
    g.beginPath(); g.arc(c, c, S * 0.40, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    return cv;
  },

  /* ---------- 敌人（朝下） ---------- */
  makeEnemy(def, key) {
    const S = def.r * 2 + 16;
    const { cv, g } = this.make(S, S);
    g.translate(S / 2, S / 2);
    const r = def.r;

    const grad = g.createLinearGradient(-r, -r, r, r);
    grad.addColorStop(0, def.light);
    grad.addColorStop(0.5, def.color);
    grad.addColorStop(1, def.dark);

    if (key === 'scout') {
      // 尖锐三角
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, r); g.lineTo(-r * 0.8, -r * 0.6); g.lineTo(0, -r * 0.2); g.lineTo(r * 0.8, -r * 0.6);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(0, r * 0.15, r * 0.18, 0, Math.PI * 2); g.fill();

    } else if (key === 'fighter') {
      // 双叉机身
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(-r * 0.9, -r * 0.7); g.lineTo(-r * 0.2, r * 0.9);
      g.lineTo(r * 0.2, r * 0.9); g.lineTo(r * 0.9, -r * 0.7);
      g.lineTo(r * 0.4, -r * 0.2); g.lineTo(0, -r * 0.7); g.lineTo(-r * 0.4, -r * 0.2);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#37474f';
      g.fillRect(-r * 0.95, r * 0.1, r * 0.25, r * 0.7);
      g.fillRect(r * 0.7, r * 0.1, r * 0.25, r * 0.7);
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(0, -r * 0.15, r * 0.22, 0, Math.PI * 2); g.fill();

    } else if (key === 'weaver') {
      // 菱形 + 侧翼
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, r * 0.95); g.lineTo(-r * 0.55, 0); g.lineTo(0, -r * 0.95); g.lineTo(r * 0.55, 0);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = def.dark;
      g.beginPath();
      g.moveTo(-r * 0.5, 0); g.lineTo(-r, r * 0.45); g.lineTo(-r * 0.45, r * 0.5);
      g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(r * 0.5, 0); g.lineTo(r, r * 0.45); g.lineTo(r * 0.45, r * 0.5);
      g.closePath(); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(0, 0, r * 0.2, 0, Math.PI * 2); g.fill();

    } else if (key === 'turret') {
      // 圆盘 + 炮管
      g.fillStyle = grad;
      g.beginPath(); g.arc(0, 0, r * 0.85, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = def.dark;
      g.beginPath(); g.arc(0, 0, r * 0.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#cfd8dc';
      g.fillRect(-r * 0.16, r * 0.3, r * 0.32, r * 0.75);
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(0, 0, r * 0.22, 0, Math.PI * 2); g.fill();
      g.fillStyle = def.light;
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        g.beginPath();
        g.arc(Math.cos(a) * r * 0.68, Math.sin(a) * r * 0.68, r * 0.1, 0, Math.PI * 2);
        g.fill();
      }

    } else {
      // 重装舰：厚重六边形 + 装甲板
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, r);
      g.lineTo(-r * 0.85, r * 0.45); g.lineTo(-r * 0.9, -r * 0.5);
      g.lineTo(0, -r * 0.95); g.lineTo(r * 0.9, -r * 0.5); g.lineTo(r * 0.85, r * 0.45);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2; g.stroke();
      g.fillStyle = def.dark;
      g.fillRect(-r * 0.55, -r * 0.35, r * 1.1, r * 0.35);
      g.fillStyle = def.light;
      g.fillRect(-r * 0.35, r * 0.15, r * 0.7, r * 0.2);
      g.fillStyle = '#ff7043';
      g.beginPath(); g.arc(-r * 0.5, r * 0.6, r * 0.14, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(r * 0.5, r * 0.6, r * 0.14, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(0, -r * 0.45, r * 0.2, 0, Math.PI * 2); g.fill();
    }
    return cv;
  },

  /* ---------- Boss ---------- */
  makeBoss(def) {
    const W = def.r * 2.6, H = def.r * 2.0;
    const { cv, g } = this.make(W, H);
    g.translate(W / 2, H / 2);
    const r = def.r;

    const grad = g.createLinearGradient(0, -r, 0, r);
    grad.addColorStop(0, def.light);
    grad.addColorStop(0.45, def.color);
    grad.addColorStop(1, def.dark);

    if (def.key === 'dreadnought') {
      // 宽厚重甲舰
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(-r * 1.15, r * 0.35);
      g.lineTo(-r * 0.75, -r * 0.55); g.lineTo(-r * 0.3, -r * 0.85);
      g.lineTo(r * 0.3, -r * 0.85); g.lineTo(r * 0.75, -r * 0.55);
      g.lineTo(r * 1.15, r * 0.35); g.lineTo(r * 0.6, r * 0.8);
      g.lineTo(-r * 0.6, r * 0.8);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 3; g.stroke();
      // 炮塔
      g.fillStyle = '#263238';
      g.fillRect(-r * 0.95, r * 0.1, r * 0.3, r * 0.7);
      g.fillRect(r * 0.65, r * 0.1, r * 0.3, r * 0.7);
      g.fillRect(-r * 0.16, r * 0.35, r * 0.32, r * 0.6);
      // 核心
      const core = g.createRadialGradient(0, 0, 2, 0, 0, r * 0.35);
      core.addColorStop(0, '#fff');
      core.addColorStop(0.4, '#ff7043');
      core.addColorStop(1, 'rgba(255,112,67,0)');
      g.fillStyle = core;
      g.beginPath(); g.arc(0, 0, r * 0.35, 0, Math.PI * 2); g.fill();
      // 装甲条纹
      g.fillStyle = 'rgba(255,255,255,.12)';
      for (let i = -2; i <= 2; i++) g.fillRect(i * r * 0.3 - 3, -r * 0.5, 6, r * 0.5);

    } else if (def.key === 'weaver') {
      // 纺锤形 + 四翼
      g.fillStyle = grad;
      g.beginPath(); g.ellipse(0, 0, r * 0.62, r * 0.9, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = def.dark;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * r * 0.5, -r * 0.4);
        g.quadraticCurveTo(s * r * 1.15, 0, s * r * 0.5, r * 0.55);
        g.lineTo(s * r * 0.45, r * 0.15);
        g.closePath(); g.fill();
      }
      const core = g.createRadialGradient(0, 0, 2, 0, 0, r * 0.42);
      core.addColorStop(0, '#fff');
      core.addColorStop(0.35, '#ea80fc');
      core.addColorStop(1, 'rgba(234,128,252,0)');
      g.fillStyle = core;
      g.beginPath(); g.arc(0, 0, r * 0.42, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        g.beginPath();
        g.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.72, 2.5, 0, Math.PI * 2);
        g.fill();
      }

    } else {
      // 要塞核心：多层同心
      g.fillStyle = grad;
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const rr = i % 2 === 0 ? r * 0.95 : r * 0.6;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 3; g.stroke();
      g.fillStyle = def.dark;
      g.beginPath(); g.arc(0, 0, r * 0.55, 0, Math.PI * 2); g.fill();
      const core = g.createRadialGradient(0, 0, 2, 0, 0, r * 0.4);
      core.addColorStop(0, '#fff');
      core.addColorStop(0.35, '#18ffff');
      core.addColorStop(1, 'rgba(24,255,255,0)');
      g.fillStyle = core;
      g.beginPath(); g.arc(0, 0, r * 0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#cfd8dc';
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        g.save();
        g.translate(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75);
        g.rotate(a);
        g.fillRect(-4, -8, 8, 16);
        g.restore();
      }
    }
    return cv;
  },

  /* ---------- 道具胶囊 ---------- */
  makePower(kind) {
    const def = POWERUPS[kind];
    const S = 38;
    const { cv, g } = this.make(S, S);
    const c = S / 2;

    const grd = g.createRadialGradient(c, c - 4, 2, c, c, c);
    grd.addColorStop(0, 'rgba(255,255,255,.95)');
    grd.addColorStop(0.45, def.color);
    grd.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(c, c, c - 3, 0, Math.PI * 2); g.fill();

    g.strokeStyle = '#fff';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(c, c, c - 4, 0, Math.PI * 2); g.stroke();

    g.fillStyle = '#0d1a15';
    g.font = 'bold 20px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(def.icon, c, c + 1);
    return cv;
  },

  /* ---------- 护盾环 ---------- */
  makeShield() {
    const S = 96;
    const { cv, g } = this.make(S, S);
    const c = S / 2;
    const grd = g.createRadialGradient(c, c, S * 0.28, c, c, S * 0.48);
    grd.addColorStop(0, 'rgba(118,255,3,0)');
    grd.addColorStop(0.7, 'rgba(118,255,3,0.28)');
    grd.addColorStop(1, 'rgba(118,255,3,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(118,255,3,0.75)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(c, c, S * 0.42, 0, Math.PI * 2); g.stroke();
    return cv;
  }
};
