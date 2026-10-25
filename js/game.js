/* ============================================================
 * game.js  ——  主循环 / 波次 / 碰撞 / 输入
 *
 * 性能要点：
 *   1) 位图按总像素封顶，不无脑跟随 devicePixelRatio
 *   2) 子弹与粒子用对象池，运行期零分配
 *   3) 所有图形走 Sprites 缓存，drawImage 即可
 *   4) 星空用 fillRect 分批绘制（3 次 fillStyle 切换）
 *   5) 暂停 / 结束时完全不更新也不绘制
 * ============================================================ */

/* 画质档位：位图总像素上限是主要性能旋钮，弱机自动降档 */
const QUALITY = [
  { name: '流畅', maxPx: 0.40, partMul: 0.45 },
  { name: '均衡', maxPx: 0.62, partMul: 0.75 },
  { name: '高清', maxPx: 0.92, partMul: 1.0 }
];

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });

    // 默认「均衡」起步，测到余量再自动升到高清
    this.quality = 1;
    this.autoQuality = true;
    this.frameSamples = [];
    this.cooldown = 0;
    this.upgradeOk = true;

    this.setupCanvas();

    this.player = new Player();
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.powerups = [];
    this.floaters = [];
    this.bulletPool = [];
    this.particlePool = [];

    this.boss = null;
    this.state = 'title';       // title | play | pause | boon | over
    this.waveIndex = 1;
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboT = 0;
    this.best = Number(localStorage.getItem('starflight.best') || 0);
    this.shake = 0;
    this.beam = null;
    this.shipKey = 'falcon';
    try {
      this.unlocked = JSON.parse(localStorage.getItem('starflight.ach') || '{}');
    } catch (e) { this.unlocked = {}; }
    this.stats = this.freshStats();
    this.eliteBudget = 0;
    this.boonWave = 0;
    this.pendingWave = 0;

    this.initStars();
    this.bindInput();

    window.addEventListener('resize', () => {
      clearTimeout(this._rt);
      this._rt = setTimeout(() => { this.setupCanvas(); this.uiDirty = true; }, 200);
    });
  }

  get ship() { return SHIPS[this.shipKey] || SHIPS.falcon; }

  /* ---------------- 画布与位图 ---------------- */
  setupCanvas() {
    // 先按 9:16 等比适配容器（JS 计算，比纯 CSS 更可控）
    const box = this.canvas.parentElement.getBoundingClientRect();
    let scale = 1;
    if (box.width > 0 && box.height > 0) {
      scale = Math.min(box.width / CFG.W, box.height / CFG.H);
    }
    this.canvas.style.width = Math.max(1, Math.round(CFG.W * scale)) + 'px';
    this.canvas.style.height = Math.max(1, Math.round(CFG.H * scale)) + 'px';

    const cssW = CFG.W * scale;
    let dpr = Math.min((window.devicePixelRatio || 1) * scale, 2.2);
    // 按总像素封顶（射击游戏永远在动，填充率是主要瓶颈）
    const MAX = QUALITY[this.quality].maxPx * 1e6;
    const px = CFG.W * CFG.H * dpr * dpr;
    if (px > MAX) dpr = Math.sqrt(MAX / (CFG.W * CFG.H));
    dpr = Math.max(1, Math.min(dpr, 2.2));

    this.dpr = dpr;
    this.canvas.width = Math.round(CFG.W * dpr);
    this.canvas.height = Math.round(CFG.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 背景渐变缓存一次（逻辑坐标固定，尺寸变化无需重建）
    if (!this.bgGrad) {
      const g = this.ctx.createLinearGradient(0, 0, 0, CFG.H);
      g.addColorStop(0, '#050b16');
      g.addColorStop(0.55, '#081426');
      g.addColorStop(1, '#0b1a2e');
      this.bgGrad = g;
    }
    Sprites.setDpr(dpr);
    this.uiDirty = true;
  }

  /* ---------------- 自适应画质 ---------------- */
  trackPerf(raw) {
    if (raw > 0.05) return;
    this.frameSamples.push(raw * 1000);
    if (this.frameSamples.length < 45) return;
    const s = this.frameSamples.slice().sort((a, b) => a - b);
    const p90 = s[Math.floor(s.length * 0.9)];
    const median = s[Math.floor(s.length * 0.5)];
    this.frameSamples.length = 0;
    if (this.cooldown > 0) { this.cooldown--; return; }

    if (p90 > 21 && this.quality > 0) {
      this.setQuality(this.quality - 1, true);
      this.cooldown = 3;
      if (p90 > 21) this.upgradeOk = false;
    } else if (median < 12 && p90 < 17 && this.quality < 2 && this.upgradeOk) {
      this.setQuality(this.quality + 1, true);
      this.cooldown = 4;
    }
  }

  setQuality(level, auto) {
    level = Math.max(0, Math.min(2, level));
    if (level === this.quality && !auto) return;
    this.quality = level;
    this.setupCanvas();
    this.uiDirty = true;
    if (auto) {
      if (this._qTip === undefined || level < this._qTip) {
        this._qTip = level;
        UI.toast('已切换为「' + QUALITY[level].name + '」画质', 'warn');
      }
    } else {
      this._qTip = level;
      UI.toast('画质：' + QUALITY[level].name, 'good');
    }
  }

  /* ---------------- 星空 ---------------- */
  initStars() {
    // 3 层，各自同色，绘制时只需 3 次 fillStyle 切换
    this.starLayers = [
      { c: 'rgba(255,255,255,0.35)', v: 34, s: 1, list: [] },
      { c: 'rgba(255,255,255,0.62)', v: 72, s: 1.5, list: [] },
      { c: 'rgba(180,220,255,0.95)', v: 130, s: 2, list: [] }
    ];
    for (let i = 0; i < CFG.stars; i++) {
      const li = i % 3;
      this.starLayers[li].list.push({
        x: Math.random() * CFG.W,
        y: Math.random() * CFG.H
      });
    }
  }

  updateStars(dt) {
    for (const L of this.starLayers) {
      const list = L.list, dy = L.v * dt;
      for (let i = 0; i < list.length; i++) {
        const st = list[i];
        st.y += dy;
        if (st.y > CFG.H) { st.y -= CFG.H; st.x = Math.random() * CFG.W; }
      }
    }
  }

  drawStars(ctx) {
    for (const L of this.starLayers) {
      ctx.fillStyle = L.c;
      const list = L.list, s = L.s;
      for (let i = 0; i < list.length; i++) {
        const st = list[i];
        ctx.fillRect(st.x, st.y, s, s * 2.2);
      }
    }
  }

  freshStats() {
    return {
      kills: 0, bossKills: 0, eliteKills: 0, wave: 1, score: 0,
      maxCombo: 0, damageTaken: 0, weaponsUnlocked: 1,
      drones: 0, droneMaxLevel: 0, odUses: 0, crits: 0
    };
  }

  /* ---------------- 对象池 ---------------- */
  spawnBullet(x, y, vx, vy, owner, color, r, dmg, homing, pierce) {
    if (this.bullets.length >= CFG.caps.bullets) return null;
    const b = this.bulletPool.pop() || new Bullet();
    b.init(x, y, vx, vy, owner, color, r, dmg, homing, pierce);
    this.bullets.push(b);
    return b;
  }

  spawnParticle(x, y, vx, vy, life, color, size) {
    if (this.particles.length >= CFG.caps.particles) return null;
    const p = this.particlePool.pop() || new Particle();
    p.init(x, y, vx, vy, life, color, size);
    this.particles.push(p);
    return p;
  }

  burst(x, y, n, color, speed, size, life) {
    n = Math.max(1, Math.round(n * QUALITY[this.quality].partMul));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.85);
      this.spawnParticle(
        x, y,
        Math.cos(a) * v, Math.sin(a) * v,
        life * (0.6 + Math.random() * 0.7),
        color, size * (0.7 + Math.random() * 0.7)
      );
    }
  }

  /* ---------------- 生成敌人 ---------------- */
  spawnEnemy(type, x, y, hpMul, opt) {
    if (this.enemies.length >= CFG.caps.enemies) return null;
    const e = new Enemy(type, x, y, hpMul || hpScale(this.waveIndex), opt);
    this.enemies.push(e);
    return e;
  }

  spawnGroup(type, count, form) {
    const hpMul = hpScale(this.waveIndex);
    const M = 46;
    // 精英使用「整波预算」：每波先定额度，生成时逐架扣减，避免数量失控
    const maybeElite = () => {
      if (this.eliteBudget <= 0) return null;
      if (Math.random() < 0.4) { this.eliteBudget--; return { elite: true }; }
      return null;
    };
    if (form === 'line') {
      const step = (CFG.W - M * 2) / Math.max(1, count - 1);
      for (let i = 0; i < count; i++) {
        this.spawnEnemy(type, M + step * i, -40 - i * 12, hpMul, maybeElite());
      }
    } else if (form === 'arc') {
      const step = (CFG.W - M * 2) / Math.max(1, count - 1);
      for (let i = 0; i < count; i++) {
        const k = Math.abs(i - (count - 1) / 2);
        this.spawnEnemy(type, M + step * i, -40 - k * 26, hpMul, maybeElite());
      }
    } else if (form === 'column') {
      const x = M + Math.random() * (CFG.W - M * 2);
      for (let i = 0; i < count; i++) {
        this.spawnEnemy(type, x, -40 - i * 52, hpMul, maybeElite());
      }
    } else {
      // sides：从左右两侧斜插进来
      for (let i = 0; i < count; i++) {
        const left = i % 2 === 0;
        const x = left ? -24 : CFG.W + 24;
        const vx = left ? 130 : -130;
        const opt = { vx, entryT: 0.85 };
        const el = maybeElite();
        this.spawnEnemy(type, x, 40 + i * 34, hpMul, el ? Object.assign(opt, el) : opt);
      }
    }
  }

  spawnPowerUp(x, y) {
    const r = Math.random();
    let kind = 'weapon';
    if (r > 0.60) kind = 'shield';
    if (r > 0.85) kind = 'bomb';
    if (this.powerups.length >= CFG.caps.powerups) this.powerups.shift();
    this.powerups.push(new PowerUp(kind, x, y));
  }

  nearestEnemy(x, y) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    if (this.boss && !this.boss.dead) {
      const d = (this.boss.x - x) * (this.boss.x - x) + (this.boss.y - y) * (this.boss.y - y);
      if (d < bd) best = this.boss;
    }
    return best;
  }

  /* ---------------- 波次 ---------------- */
  startWave(n) {
    this.waveIndex = n;
    // 精英额度：第 4 波起，随波次缓慢增长，单波上限 4 架
    this.eliteBudget = n >= ELITE.fromWave ? Math.min(4, 1 + Math.floor((n - ELITE.fromWave) / 3)) : 0;
    this.wave = buildWave(n);
    this.waveT = 0;
    this.wavePtr = 0;
    if (this.wave.boss) {
      UI.toast('⚠️ Boss 来袭', 'bad');
      SFX.play('boss');
    } else {
      UI.toast('第 ' + n + ' 波', 'warn');
      SFX.play('wave');
    }
    this.uiDirty = true;
  }

  updateWave(dt) {
    this.waveT += dt;
    const ev = this.wave.ev;
    while (this.wavePtr < ev.length && ev[this.wavePtr].t <= this.waveT) {
      const e = ev[this.wavePtr++];
      if (e.kind === 'boss') {
        this.boss = new Boss(e.boss, hpScale(this.waveIndex) * 0.85);
      } else {
        this.spawnGroup(e.type, e.count, e.form);
      }
    }
    const done = this.wavePtr >= ev.length && this.enemies.length === 0 && !this.boss;
    if (done) {
      this.score += 200 + this.waveIndex * 60;
      this.stats.wave = this.waveIndex;
      // 每 2 波给一次三选一（Boss 波后必给）
      const giveBoon = (this.waveIndex % 2 === 0 || this.wave.boss) && this.boonWave !== this.waveIndex;
      if (giveBoon) {
        this.boonWave = this.waveIndex;
        this.pendingWave = this.waveIndex + 1;
        this.offerBoons();
        return;
      }
      this.startWave(this.waveIndex + 1);
    }
  }

  /* ---------------- 开火 ---------------- */
  fire() {
    const p = this.player;
    const w = WEAPONS[p.weapon];
    const lv = p.lv;

    if (p.weapon === 'laser') {
      this.beam = { w: w.width[lv - 1], dps: w.dps[lv - 1] * p.mods.dmg };
      SFX.play('laser');
      return;
    }
    if (p.fireT > 0) return;
    p.fireT = w.rate[lv - 1] * p.rateMul;

    const n = w.shots[lv - 1];
    const dmg = w.dmg[lv - 1];
    const pierce = Math.floor(p.mods.pierce);

    if (p.weapon === 'vulcan') {
      for (let i = 0; i < n; i++) {
        const ox = (i - (n - 1) / 2) * 15;
        this.spawnBullet(p.x + ox, p.y - 26, 0, -580, 'p', w.color, 5, dmg, 0, pierce);
      }
      SFX.play('shoot');

    } else if (p.weapon === 'spread') {
      const fan = w.spread[lv - 1];
      const step = fan / Math.max(1, n - 1);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * step;
        this.spawnBullet(p.x, p.y - 22, Math.cos(a) * 470, Math.sin(a) * 470, 'p', w.color, 5, dmg, 0, pierce);
      }
      SFX.play('shoot');

    } else {
      const homing = w.homing[lv - 1];
      for (let i = 0; i < n; i++) {
        const ox = (i - (n - 1) / 2) * 20;
        this.spawnBullet(p.x + ox, p.y - 20, ox * 3, -240, 'p', w.color, 8, dmg, homing, pierce);
      }
      SFX.play('missile');
    }
  }

  /* ---------------- 受击 / 死亡 ---------------- */
  hurt() {
    const p = this.player;
    if (p.invuln > 0) return;
    if (p.shield > 0) {
      p.shield--;
      p.invuln = 0.8;
      this.burst(p.x, p.y, 12, '#76ff03', 190, 12, 0.4);
      SFX.play('hit');
      this.uiDirty = true;
      return;
    }
    p.lives--;
    this.stats.damageTaken++;
    p.invuln = CFG.player.invuln;
    this.shake = 14;
    this.combo = 0;
    this.burst(p.x, p.y, 26, '#ff5252', 240, 16, 0.6);
    SFX.play('hurt');
    // 清掉附近敌弹，避免连环死
    for (const b of this.bullets) {
      if (b.owner === 'e' && Math.hypot(b.x - p.x, b.y - p.y) < 170) b.dead = true;
    }
    this.uiDirty = true;
    if (p.lives <= 0) this.gameOver();
  }

  useBomb() {
    const p = this.player;
    if (p.bombs <= 0 || this.state !== 'play') return;
    p.bombs--;
    this.shake = 20;
    SFX.play('bomb');
    UI.toast('💥 全屏轰炸', 'good');

    for (const b of this.bullets) if (b.owner === 'e') b.dead = true;
    for (const e of this.enemies.slice()) {
      e.hit(CFG.bomb.damage, this);
      if (!e.dead) this.burst(e.x, e.y, 5, '#ffd54f', 150, 10, 0.35);
    }
    if (this.boss && !this.boss.dead) {
      this.boss.hit(CFG.bomb.damage * 2.5, this);
      this.burst(this.boss.x, this.boss.y, 30, '#ffd54f', 260, 18, 0.6);
    }
    // 冲击波
    for (let i = 0; i < 3; i++) {
      this.particles.length < CFG.caps.particles && this.spawnParticle(
        p.x, p.y - i * 90, 0, 0, 0.3 + i * 0.1, '#ffffff', 200 + i * 120
      );
    }
    this.uiDirty = true;
  }

  onEnemyKilled(e) {
    this.kills++;
    const p = this.player;
    this.comboT = p.comboWindow;
    this.combo = Math.min(this.combo + 1, p.comboMax);
    const mul = Math.max(1, this.combo) * (e.elite ? ELITE.scoreMul : 1);
    const gain = Math.round(e.def.score * mul * this.ship.scoreMul);
    this.score += gain;

    // 统计与成就
    this.stats.kills = this.kills;
    this.stats.wave = this.waveIndex;
    this.stats.score = this.score;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    this.stats.weaponsUnlocked = p.weaponsUnlocked;
    this.stats.drones = p.drones.length;
    this.stats.droneMaxLevel = p.drones.length ? Math.max.apply(null, p.drones.map(d => d.level)) : 0;
    this.addCharge(e.elite ? OVERDRIVE.perKill * 3 : OVERDRIVE.perKill);

    this.burst(e.x, e.y, 9, e.def.color, 200, 13, 0.45);
    this.burst(e.x, e.y, 5, '#ffffff', 130, 9, 0.3);
    this.addFloater(e.x, e.y, (mul > 1 ? '×' + mul + ' ' : '') + '+' + gain, mul > 2 ? '#ffd54f' : '#ffffff');
    SFX.play('boom');

    // 精英必掉道具
    if (e.elite) { this.spawnPowerUp(e.x, e.y); this.uiDirty = true; }
    else if (Math.random() < CFG.powerup.dropChance) this.spawnPowerUp(e.x, e.y);
    this.checkBombCharge();
    this.checkAchievements();
  }

  onBossKilled(b) {
    this.kills++;
    this.stats.bossKills++;
    this.stats.wave = this.waveIndex;
    this.addCharge(OVERDRIVE.perBossKill);
    const gain = Math.round(b.def.score * hpScale(this.waveIndex) * this.ship.scoreMul);
    this.score += gain;
    this.shake = 26;
    this.burst(b.x, b.y, 46, b.def.color, 320, 22, 0.9);
    this.burst(b.x, b.y, 24, '#ffffff', 200, 16, 0.7);
    this.addFloater(b.x, b.y - 30, 'BOSS +' + gain, '#ffd54f');
    SFX.play('bigboom');
    for (let i = 0; i < 3; i++) this.spawnPowerUp(b.x - 40 + i * 40, b.y);
    this.boss = null;
    this.checkBombCharge();
    this.checkAchievements();
  }

  checkBombCharge() {
    const p = this.player;
    const want = 2 + Math.floor(this.score / CFG.bomb.scorePerCharge);
    if (want > p.bombs && p.bombs < p.bombMax) {
      p.bombs = Math.min(p.bombMax, want);
      UI.toast('🎁 获得炸弹 ×1', 'good');
      SFX.play('pick');
    }
  }

  addFloater(x, y, text, color) {
    if (this.floaters.length > 22) this.floaters.shift();
    this.floaters.push({ x, y, text, color, t: 0, dur: 0.85 });
  }

  gameOver() {
    this.state = 'over';
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem('starflight.best', String(this.best));
    }
    SFX.play('over');
    UI.showGameOver(this);
  }

  /* ---------------- 输入 ---------------- */
  bindInput() {
    const c = this.canvas;
    const toLocal = e => {
      const r = c.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (CFG.W / r.width),
        y: (e.clientY - r.top) * (CFG.H / r.height)
      };
    };

    let dragging = false, offX = 0, offY = 0;

    c.addEventListener('pointerdown', e => {
      SFX.init(); SFX.resume();
      if (this.state !== 'play') return;
      c.setPointerCapture && c.setPointerCapture(e.pointerId);
      const p = toLocal(e);
      dragging = true;
      // 记录手指与机身的偏移，避免飞船瞬间跳到手指下
      offX = this.player.x - p.x;
      offY = this.player.y - p.y;
      this.player.tx = this.player.x;
      this.player.ty = this.player.y;
    });

    c.addEventListener('pointermove', e => {
      if (!dragging || this.state !== 'play') return;
      const p = toLocal(e);
      this.player.tx = p.x + offX;
      this.player.ty = p.y + offY;
    });

    const endDrag = () => { dragging = false; };
    c.addEventListener('pointerup', endDrag);
    c.addEventListener('pointercancel', endDrag);
    c.addEventListener('pointerleave', endDrag);

    // 键盘（桌面）
    this.keys = {};
    window.addEventListener('keydown', e => {
      this.keys[e.key.toLowerCase()] = true;
      if (e.key === ' ') { e.preventDefault(); this.useBomb(); }
      if (e.key.toLowerCase() === 'q' || e.key.toLowerCase() === 'e') this.activateOverdrive();
      if (e.key.toLowerCase() === 'p') this.togglePause();
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 4) {
        const k = WEAPON_KEYS[n - 1];
        if (this.player.switchWeapon(k)) {
          UI.toast('切换武器：' + WEAPONS[k].name, 'good');
          SFX.play('click');
          this.uiDirty = true;
        }
      }
    });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
  }

  applyKeys(dt) {
    const k = this.keys;
    const p = this.player;
    let dx = 0, dy = 0;
    if (k['arrowleft'] || k['a']) dx -= 1;
    if (k['arrowright'] || k['d']) dx += 1;
    if (k['arrowup'] || k['w']) dy -= 1;
    if (k['arrowdown'] || k['s']) dy += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      p.tx = p.x + (dx / len) * 90;
      p.ty = p.y + (dy / len) * 90;
    }
  }

  /* ---------------- 主循环 ---------------- */
  start() {
    this.lastTs = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }

  loop(ts) {
    const dt = Math.min((ts - this.lastTs) / 1000, 0.05);
    this.lastTs = ts;
    NOW = ts;

    if (this.state === 'play') {
      if (this.autoQuality) this.trackPerf(dt);
      this.update(dt);
      this.draw();
      // UI 刷新降到约 15fps
      this.uiAcc = (this.uiAcc || 0) + dt;
      if (this.uiAcc > 0.066 || this.uiDirty) {
        this.uiAcc = 0;
        this.uiDirty = false;
        UI.refresh(this);
      }
    }
    // 暂停 / 标题 / 结束：完全不更新也不绘制

    requestAnimationFrame(t => this.loop(t));
  }

  update(dt) {
    const p = this.player;

    this.applyKeys(dt);
    p.update(dt, this);
    this.updateStars(dt);

    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 60);

    this.updateWave(dt);

    // 开火
    this.beam = null;
    this.fire();

    // 激光持续伤害
    if (this.beam) {
      const half = this.beam.w / 2;
      for (const e of this.enemies.slice()) {
        if (e.y < p.y && Math.abs(e.x - p.x) < half + e.r * 0.55) {
          e.hit(this.beam.dps * dt * (p.mods.crit > 0 && Math.random() < p.mods.crit ? 2 : 1), this);
        }
      }
      if (this.boss && !this.boss.dead &&
          this.boss.y < p.y && Math.abs(this.boss.x - p.x) < half + this.boss.r * 0.6) {
        this.boss.hit(this.beam.dps * dt, this);
      }
    }

    // 敌人
    {
      const arr = this.enemies;
      let w = 0;
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        e.update(dt, this);
        if (!e.dead) arr[w++] = e;
      }
      arr.length = w;
    }

    if (this.boss) {
      this.boss.update(dt, this);
      if (this.boss.dead) this.boss = null;
    }

    // 子弹
    {
      const arr = this.bullets;
      let w = 0;
      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        b.update(dt, this);
        if (b.dead) this.bulletPool.push(b);
        else arr[w++] = b;
      }
      arr.length = w;
    }

    // 粒子
    {
      const arr = this.particles;
      let w = 0;
      for (let i = 0; i < arr.length; i++) {
        const q = arr[i];
        q.update(dt);
        if (q.dead) this.particlePool.push(q);
        else arr[w++] = q;
      }
      arr.length = w;
    }

    // 道具
    {
      const arr = this.powerups;
      let w = 0;
      for (let i = 0; i < arr.length; i++) {
        const u = arr[i];
        u.update(dt);
        if (!u.dead) arr[w++] = u;
      }
      arr.length = w;
    }

    // 飘字
    {
      const arr = this.floaters;
      let w = 0;
      for (let i = 0; i < arr.length; i++) {
        const f = arr[i];
        f.t += dt;
        if (f.t < f.dur) arr[w++] = f;
      }
      arr.length = w;
    }

    this.collide();
  }

  collide() {
    const p = this.player;
    const dt2 = 1 / 60;   // 吸附用的时间步（与渲染帧一致即可）

    // 玩家子弹 → 敌人 / Boss
    for (const b of this.bullets) {
      if (b.owner !== 'p' || b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (b.hitSet && b.hitSet.has(e)) continue;   // 穿透时不重复伤害同一目标
        const rr = e.r + b.r;
        if ((e.x - b.x) * (e.x - b.x) + (e.y - b.y) * (e.y - b.y) < rr * rr) {
          e.hit(this.rollDamage(b.dmg), this);
          if (b.pierce > 0) {
            b.pierce--;
            (b.hitSet || (b.hitSet = new Set())).add(e);
          } else {
            b.dead = true;
          }
          this.burst(b.x, b.y, 2, '#ffffff', 90, 7, 0.18);
          break;
        }
      }
      if (b.dead) continue;
      const bo = this.boss;
      if (bo && !bo.dead) {
        const rr = bo.r * 0.95 + b.r;
        if ((bo.x - b.x) * (bo.x - b.x) + (bo.y - b.y) * (bo.y - b.y) < rr * rr) {
          bo.hit(this.rollDamage(b.dmg), this);
          if (b.pierce > 0) b.pierce--; else b.dead = true;
          this.burst(b.x, b.y, 2, '#ffffff', 90, 7, 0.18);
        }
      }
    }

    if (this.state !== 'play') return;

    // 敌弹 → 玩家
    const pr = CFG.player.hitR;
    for (const b of this.bullets) {
      if (b.owner !== 'e' || b.dead) continue;
      const rr = pr + b.r;
      if ((b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) < rr * rr) {
        b.dead = true;
        this.hurt();
        break;
      }
    }

    // 敌机撞机
    for (const e of this.enemies) {
      if (e.dead) continue;
      const rr = pr + e.r * 0.7;
      if ((e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y) < rr * rr) {
        e.hit(4, this);
        this.hurt();
        break;
      }
    }
    if (this.boss && !this.boss.dead) {
      const rr = pr + this.boss.r * 0.8;
      if ((this.boss.x - p.x) * (this.boss.x - p.x) + (this.boss.y - p.y) * (this.boss.y - p.y) < rr * rr) {
        this.hurt();
      }
    }

    // 道具拾取（磁力牵引会自动吸附）
    for (const u of this.powerups) {
      if (u.dead) continue;
      if (p.magnet) {
        const dx = p.x - u.x, dy = p.y - u.y;
        const d = Math.hypot(dx, dy);
        if (d < 215 && d > 1) {
          const pull = Math.min(1, dt2 / d) * 260;
          u.x += dx * pull;
          u.y += dy * pull;
        }
      }
      const rr = 26;
      if ((u.x - p.x) * (u.x - p.x) + (u.y - p.y) * (u.y - p.y) < rr * rr) {
        u.dead = true;
        this.pickup(u.kind);
      }
    }
  }

  pickup(kind) {
    const p = this.player;
    if (kind === 'weapon') {
      const k = WEAPON_KEYS[Math.floor(Math.random() * WEAPON_KEYS.length)];
      p.unlock(k);
      UI.toast(WEAPONS[k].icon + ' ' + WEAPONS[k].name + ' Lv' + p.levels[k], 'good');
    } else if (kind === 'shield') {
      p.shield = Math.min(CFG.shield.max, p.shield + 1);
      UI.toast('🛡 护盾 +1', 'good');
    } else {
      p.bombs = Math.min(CFG.bomb.max, p.bombs + 1);
      UI.toast('💣 炸弹 +1', 'good');
    }
    this.burst(p.x, p.y, 10, POWERUPS[kind].color, 170, 11, 0.35);
    SFX.play('pick');
    this.stats.weaponsUnlocked = p.weaponsUnlocked;
    this.checkAchievements();
    this.uiDirty = true;
  }

  /* 暴击判定 + 穿透层数 */
  rollDamage(base) {
    const p = this.player;
    let d = base * p.dmgMul;
    if (p.mods.crit > 0 && Math.random() < p.mods.crit) {
      d *= 2;
      this.stats.crits++;
    }
    return d;
  }

  /* 溅射：击杀时对附近敌人造成伤害 */
  splashAt(x, y) {
    const R = 62;
    for (const e of this.enemies.slice()) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < R) e.hit(1.6 * this.player.mods.dmg, this);
    }
    this.burst(x, y, 4, '#ffd54f', 130, 9, 0.25);
  }

  /* ---------------- 超载 ---------------- */
  addCharge(n) {
    const p = this.player;
    if (p.odActive > 0) return;
    p.od = Math.min(OVERDRIVE.max, p.od + n * p.odGain);
    if (p.od >= OVERDRIVE.max) this.uiDirty = true;
  }

  activateOverdrive() {
    const p = this.player;
    if (p.od < OVERDRIVE.max || p.odActive > 0 || this.state !== 'play') return;
    p.od = 0;
    p.odActive = p.odDur;
    p.invuln = Math.max(p.invuln, p.odDur);
    this.stats.odUses++;
    this.shake = 10;
    this.burst(p.x, p.y, 26, '#b388ff', 260, 16, 0.6);
    UI.toast('⚡ 超载启动！', 'good');
    SFX.play('boss');
    this.uiDirty = true;
    this.checkAchievements();
  }

  /* ---------------- 成就 ---------------- */
  checkAchievements() {
    const st = this.stats;
    for (const a of ACHIEVEMENTS) {
      if (this.unlocked[a.id]) continue;
      if (a.test(st)) {
        this.unlocked[a.id] = true;
        UI.toast('🏆 成就达成：' + a.name, 'good');
        SFX.play('pick');
      }
    }
    localStorage.setItem('starflight.ach', JSON.stringify(this.unlocked));
  }

  /* ---------------- 波次间三选一 ---------------- */
  offerBoons() {
    const p = this.player;
    const pool = BOONS.filter(b => {
      if (b.id === 'drone' && p.drones.length >= DRONE.max) {
        return p.drones.some(d => d.level < 3);
      }
      if (b.id === 'life' && p.lives >= 6) return false;
      return true;
    });
    // 随机取 3 个不重复
    const pick = [];
    const copy = pool.slice();
    while (pick.length < 3 && copy.length) {
      pick.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    if (!pick.length) return;
    this.state = 'boon';
    UI.showBoons(this, pick);
  }

  applyBoon(b) {
    b.apply(this.player);
    UI.hideModal();
    UI.toast(b.icon + ' ' + b.name, 'good');
    SFX.play('pick');
    this.uiDirty = true;
    this.checkAchievements();
    // ★ 必须推进波次：否则 updateWave 会再次判定「本波已清空」而无限弹窗
    const next = this.pendingWave || this.waveIndex + 1;
    this.pendingWave = 0;
    this.startWave(next);
    this.state = 'play';
    this.lastTs = performance.now();
  }

  /* ---------------- 绘制 ---------------- */
  draw() {
    const ctx = this.ctx;
    const W = CFG.W, H = CFG.H;

    ctx.fillStyle = this.bgGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    if (this.shake > 0.3) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    this.drawStars(ctx);

    for (const u of this.powerups) u.draw(ctx);

    // 激光束（在敌人之下）
    if (this.beam) {
      const p = this.player;
      const spr = Sprites.laser;
      const bw = this.beam.w;
      ctx.globalAlpha = 0.85 + Math.sin(NOW / 40) * 0.12;
      ctx.drawImage(spr, p.x - bw / 2, 0, bw, p.y - 22);
      ctx.globalAlpha = 1;
    }

    // 敌弹先画，玩家弹后画（更易分辨）
    for (const b of this.bullets) if (b.owner === 'e') b.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    if (this.boss) this.boss.draw(ctx);
    for (const b of this.bullets) if (b.owner === 'p') b.draw(ctx);

    if (this.state === 'play' || this.state === 'pause') this.player.draw(ctx);

    for (const q of this.particles) q.draw(ctx);

    // 飘字
    if (this.floaters.length) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px sans-serif';
      for (const f of this.floaters) {
        const k = f.t / f.dur;
        ctx.globalAlpha = Math.max(0, 1 - k * k);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y - k * 34);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Boss 血条（画在最上层，不受抖动影响）
    if (this.boss && !this.boss.dead) {
      const b = this.boss;
      const bw = W - 80;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(40, 12, bw, 12);
      ctx.fillStyle = b.def.color;
      ctx.fillRect(40, 12, bw * Math.max(0, b.frac), 12);
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(40, 12, bw, 12);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(b.def.name, 40, 34);
    }

    // 连击提示
    if (this.combo >= 2) {
      ctx.textAlign = 'right';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = '#ffd54f';
      ctx.globalAlpha = Math.min(1, this.comboT / 0.6);
      ctx.fillText('×' + this.combo, W - 16, 40);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------------- 控制 ---------------- */
  togglePause() {
    if (this.state !== 'play' && this.state !== 'pause') return;
    if (this.state === 'play') {
      this.state = 'pause';
      UI.showPause(this);
    } else if (this.state === 'pause') {
      this.state = 'play';
      UI.hideModal();
      this.lastTs = performance.now();
    }
  }

  restart(shipKey) {
    if (shipKey) {
      this.shipKey = shipKey;
      this.player.ship = this.ship;
      this.player.shipKey = shipKey;
    }
    this.player.reset();
    this.enemies.length = 0;
    this.bullets.length = 0;
    this.particles.length = 0;
    this.powerups.length = 0;
    this.floaters.length = 0;
    this.boss = null;
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.shake = 0;
    this.state = 'play';
    this.stats = this.freshStats();
    this.eliteBudget = 0;
    this.boonWave = 0;
    this.pendingWave = 0;
    this.startWave(1);
    this.lastTs = performance.now();
    UI.refresh(this);
  }
}
