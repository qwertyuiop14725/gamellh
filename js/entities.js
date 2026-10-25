/* ============================================================
 * entities.js  ——  玩家 / 敌人 / Boss / 子弹 / 粒子 / 道具
 * 所有绘制都走 Sprites 缓存，运行时只做 drawImage
 * ============================================================ */

/* ---------------- 僚机 ---------------- */
class Drone {
  constructor(index) {
    this.i = index;
    this.x = 0; this.y = 0;
    this.level = 1;
    this.fireT = Math.random() * 0.3;
    this.ox = DRONE.offset[index] || 0;
  }

  update(dt, game) {
    const p = game.player;
    // 跟随玩家侧后方，带一点滞后感
    const tx = p.x + this.ox;
    const ty = p.y + DRONE.followY;
    this.x += (tx - this.x) * Math.min(1, dt * 9);
    this.y += (ty - this.y) * Math.min(1, dt * 9);

    this.fireT -= dt;
    if (this.fireT <= 0) {
      const rate = DRONE.rate[this.level - 1] * p.mods.rate * (game.od > 0 ? OVERDRIVE.rateMul : 1);
      this.fireT = rate;
      const dmg = DRONE.dmg[this.level - 1] * p.mods.dmg * (game.od > 0 ? OVERDRIVE.dmgMul : 1);
      game.spawnBullet(this.x, this.y - 8, 0, -520, 'p', '#cfd8dc', 4, dmg);
      SFX.play('shoot');
    }
  }

  draw(ctx) {
    ctx.drawImage(Sprites.drone, this.x - 17, this.y - 17, 34, 34);
  }
}

/* ---------------- 玩家 ---------------- */
class Player {
  constructor() {
    this.ship = SHIPS.falcon;
    this.shipKey = 'falcon';
    this.reset();
  }

  reset() {
    const sh = this.ship;
    this.x = CFG.W / 2;
    this.y = CFG.H - 120;
    this.tx = this.x;
    this.ty = this.y;
    this.lives = sh.lives;
    this.shieldMax = CFG.shield.max + (sh.startShield > 0 ? 1 : 0);
    this.shield = sh.startShield;
    this.speed = sh.speed;
    this.invuln = 0;
    this.fireT = 0;
    this.levels = { vulcan: 0, spread: 0, laser: 0, missile: 0 };
    this.weapon = sh.startWeapon;
    this.levels[sh.startWeapon] = 1;
    this.bombs = CFG.bomb.start;
    this.bombMax = CFG.bomb.max;
    this.dead = false;
    this.tilt = 0;

    // 随局成长
    this.drones = [];
    this.mods = { dmg: sh.dmgMul, rate: sh.rateMul, crit: 0, pierce: 0 };
    this.comboWindow = CFG.combo.window + sh.comboBonus;
    this.comboMax = CFG.combo.max;
    this.magnet = false;
    this.splash = false;
    this.odGain = 1;
    this.odDur = OVERDRIVE.dur;
    this.od = 0;
    this.odActive = 0;
  }

  get lv() { return Math.max(1, this.levels[this.weapon] || 1); }

  addDrone() {
    if (this.drones.length < DRONE.max) {
      this.drones.push(new Drone(this.drones.length));
      return true;
    }
    // 已满则升级最低的那架
    let low = this.drones[0];
    for (const d of this.drones) if (d.level < low.level) low = d;
    if (low.level < 3) { low.level++; return true; }
    return false;
  }

  switchWeapon(key) {
    if (!this.levels[key]) return false;
    if (this.weapon === key) return false;
    this.weapon = key;
    this.fireT = 0;
    return true;
  }

  unlock(key) {
    if (!this.levels[key]) this.levels[key] = 1;
    else if (this.levels[key] < 3) this.levels[key]++;
    this.weapon = key;
  }

  get weaponsUnlocked() {
    let n = 0;
    for (const k of WEAPON_KEYS) if (this.levels[k]) n++;
    return n;
  }

  update(dt, game) {
    const dx = this.tx - this.x, dy = this.ty - this.y;
    const d = Math.hypot(dx, dy);
    const maxStep = this.speed * dt;
    if (d > 0.5) {
      const k = Math.min(1, maxStep / d);
      this.x += dx * k;
      this.y += dy * k;
    }
    this.x = Math.max(16, Math.min(CFG.W - 16, this.x));
    this.y = Math.max(60, Math.min(CFG.H - 30, this.y));
    this.tilt += ((dx / 60) - this.tilt) * Math.min(1, dt * 8);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.fireT > 0) this.fireT -= dt;

    // 超载计时
    if (this.odActive > 0) {
      this.odActive -= dt;
      if (this.odActive <= 0) {
        UI.toast('超载结束', 'warn');
        game.uiDirty = true;
      }
    }
    for (const dr of this.drones) dr.update(dt, game);
  }

  /* 实际生效的射速 / 伤害倍率 */
  get rateMul() { return this.mods.rate * (this.odActive > 0 ? OVERDRIVE.rateMul : 1); }
  get dmgMul() { return this.mods.dmg * (this.odActive > 0 ? OVERDRIVE.dmgMul : 1); }

  draw(ctx) {
    // 超载光环
    if (this.odActive > 0) {
      const S = 110;
      const g = Sprites.glow.get('#b388ff');
      ctx.globalAlpha = 0.5 + Math.sin(NOW / 90) * 0.2;
      ctx.drawImage(g, this.x - S / 2, this.y - S / 2, S, S);
      ctx.globalAlpha = 1;
    }

    for (const dr of this.drones) dr.draw(ctx);

    if (this.shield > 0) {
      const S = 78;
      ctx.globalAlpha = 0.55 + Math.sin(NOW / 160) * 0.15;
      ctx.drawImage(Sprites.shield, this.x - S / 2, this.y - S / 2, S, S);
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.tilt * 0.18);

    if (this.invuln > 0 && this.odActive <= 0 && Math.floor(NOW / 90) % 2 === 0) ctx.globalAlpha = 0.4;

    const flame = 12 + Math.sin(NOW / 55) * 5;
    ctx.drawImage(Sprites.glow.get('#ff8a65'), -9, 18, 18, flame + 10);
    ctx.drawImage(Sprites.ship, -26, -30, 52, 60);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

/* ---------------- 敌人 ---------------- */
class Enemy {
  constructor(type, x, y, hpMul, opt) {
    const def = ENEMIES[type];
    this.type = type;
    this.def = def;
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.elite = !!(opt && opt.elite);
    const em = this.elite ? ELITE.rMul : 1;
    this.r = def.r * em;
    this.maxHp = Math.ceil(def.hp * hpMul * (this.elite ? ELITE.hpMul : 1));
    this.hp = this.maxHp;
    this.speed = def.speed * (this.elite ? 0.8 : 1);
    this.t = Math.random() * 6;
    const fm = this.elite ? ELITE.fireMul : 1;
    this.fireT = (def.fire || 0) * fm * (0.5 + Math.random() * 0.6);
    this.dead = false;
    this.hitFlash = 0;
    this.flash = 0;
    this.targetY = opt && opt.targetY ? opt.targetY : 120 + Math.random() * 90;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.entering = true;
    // 侧翼入场：先横向飞入，再转入常规行为
    this.vx = (opt && opt.vx) || 0;
    this.entryT = (opt && opt.entryT) || 0;
  }

  update(dt, game) {
    this.t += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    if (this.entryT > 0) {
      this.entryT -= dt;
      this.x += this.vx * dt;
      this.y += this.speed * 0.55 * dt;
      if (this.entryT <= 0) this.baseX = this.x;
      return;
    }

    const p = this.def.pattern;
    if (p === 'dive') {
      this.y += this.speed * dt;
      this.x += (game.player.x - this.x) * 0.5 * dt;
    } else if (p === 'weave') {
      this.y += this.speed * dt;
      this.x = this.baseX + Math.sin(this.t * 2.2) * 92;
    } else if (p === 'hover') {
      if (this.y < this.targetY) this.y += this.speed * dt;
      else {
        this.x += this.dir * 72 * dt;
        if (this.x < 30) { this.x = 30; this.dir = 1; }
        if (this.x > CFG.W - 30) { this.x = CFG.W - 30; this.dir = -1; }
      }
    } else {
      // descend / slow
      this.y += this.speed * dt;
    }

    // 开火
    const f = this.def.fire;
    if (f) {
      this.fireT -= dt;
      if (this.fireT <= 0 && this.y > 40 && this.y < CFG.H - 120) {
        this.fireT = f * (this.elite ? ELITE.fireMul : 1) * (0.75 + Math.random() * 0.5);
        this.shoot(game);
        if (this.elite) this.shoot(game);   // 精英双发
      }
    }

    if (this.y > CFG.H + 60) this.dead = true;
  }

  shoot(game) {
    const d = this.def;
    if (d.aimed) {
      const a = Math.atan2(game.player.y - this.y, game.player.x - this.x);
      game.spawnBullet(this.x, this.y, Math.cos(a) * 150, Math.sin(a) * 150, 'e', '#ffb74d', 5);
    } else if (d.spread) {
      const base = Math.atan2(game.player.y - this.y, game.player.x - this.x);
      for (let i = 0; i < d.spread; i++) {
        const a = base + (i - (d.spread - 1) / 2) * 0.22;
        game.spawnBullet(this.x, this.y, Math.cos(a) * 128, Math.sin(a) * 128, 'e', '#ff7043', 6);
      }
    } else {
      game.spawnBullet(this.x, this.y + this.r * 0.5, 0, 172, 'e', '#ffb74d', 5);
    }
    SFX.play('hit');
  }

  hit(dmg, game) {
    this.hp -= dmg;
    this.hitFlash = 0.08;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      if (this.elite) game.stats.eliteKills++;
      game.onEnemyKilled(this);
      if (game.player.splash) game.splashAt(this.x, this.y);
    }
  }

  draw(ctx) {
    if (this.elite) {
      const R = this.r * 3.4;
      ctx.drawImage(Sprites.eliteRing, this.x - R / 2, this.y - R / 2, R, R);
    }
    const spr = Sprites.enemy.get(this.type);
    const S = this.r * 2 + 16;
    ctx.drawImage(spr, this.x - S / 2, this.y - S / 2, S, S);
    if (this.hitFlash > 0) {
      const g = Sprites.glow.get('#ffffff');
      const gs = this.r * 3;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(g, this.x - gs / 2, this.y - gs / 2, gs, gs);
      ctx.globalAlpha = 1;
    }
  }
}

/* ---------------- Boss ---------------- */
class Boss {
  constructor(index, hpMul) {
    this.def = BOSSES[index];
    this.index = index;
    this.x = CFG.W / 2;
    this.y = -90;
    this.r = this.def.r;
    this.maxHp = Math.ceil(this.def.hp * hpMul);
    this.hp = this.maxHp;
    this.t = 0;
    this.phase = 0;
    this.attackT = 1.6;
    this.dead = false;
    this.hitFlash = 0;
    this.dir = 1;
    this.entered = false;
    this.spawnT = 6;
  }

  get frac() { return this.hp / this.maxHp; }

  update(dt, game) {
    this.t += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    // 入场 → 停在中上部
    if (!this.entered) {
      this.y += 70 * dt;
      if (this.y >= 135) { this.y = 135; this.entered = true; }
      return;
    }

    // 左右巡游
    this.x += this.dir * (48 + (1 - this.frac) * 45) * dt;
    if (this.x < this.r * 0.8) { this.x = this.r * 0.8; this.dir = 1; }
    if (this.x > CFG.W - this.r * 0.8) { this.x = CFG.W - this.r * 0.8; this.dir = -1; }
    this.y = 135 + Math.sin(this.t * 0.8) * 12;

    // 阶段：血量越低越凶
    this.phase = this.frac > 0.66 ? 0 : (this.frac > 0.33 ? 1 : 2);

    this.attackT -= dt;
    if (this.attackT <= 0) {
      this.attack(game);
    }

    // 要塞核心：定期放出小怪
    if (this.def.key === 'fortress') {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 7 - this.phase * 1.5;
        if (game.enemies.length < CFG.caps.enemies - 4) {
          game.spawnEnemy('scout', this.x - 60, this.y, 1);
          game.spawnEnemy('scout', this.x + 60, this.y, 1);
        }
      }
    }
  }

  attack(game) {
    const k = this.def.key;
    const sp = 1 + this.phase * 0.35;
    this.attackT = Math.max(0.5, (k === 'fortress' ? 1.5 : 1.9) / sp);

    if (k === 'dreadnought') {
      // 扇形弹幕
      const n = 5 + this.phase * 2;
      const base = Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * (0.5 / Math.max(3, n / 2));
        game.spawnBullet(this.x, this.y + 40, Math.cos(a) * 150, Math.sin(a) * 150, 'e', '#ff7043', 7);
      }
      // 两侧炮塔直射
      game.spawnBullet(this.x - this.r * 0.75, this.y + 30, -40, 190, 'e', '#ffb74d', 6);
      game.spawnBullet(this.x + this.r * 0.75, this.y + 30, 40, 190, 'e', '#ffb74d', 6);

    } else if (k === 'weaver') {
      // 螺旋 / 正弦波
      const n = 8;
      const off = this.t * 1.4;
      for (let i = 0; i < n; i++) {
        const a = off + i * (Math.PI * 2 / n);
        game.spawnBullet(this.x, this.y, Math.cos(a) * 120, Math.abs(Math.sin(a)) * 140 + 40, 'e', '#ffd54f', 6);
      }
      if (this.phase >= 1) {
        const a = Math.atan2(game.player.y - this.y, game.player.x - this.x);
        for (let i = -1; i <= 1; i++) {
          const aa = a + i * 0.18;
          game.spawnBullet(this.x, this.y, Math.cos(aa) * 180, Math.sin(aa) * 180, 'e', '#ff7043', 6);
        }
      }

    } else {
      // 要塞：环形爆发
      const n = 12 + this.phase * 4;
      const off = this.t * 0.9;
      for (let i = 0; i < n; i++) {
        const a = off + i * (Math.PI * 2 / n);
        game.spawnBullet(this.x, this.y, Math.cos(a) * 135, Math.sin(a) * 135, 'e', '#ffb74d', 6);
      }
    }
    SFX.play('hit');
  }

  hit(dmg, game) {
    this.hp -= dmg;
    this.hitFlash = 0.07;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      game.onBossKilled(this);
    }
  }

  draw(ctx) {
    const spr = Sprites.boss.get(this.index);
    const W = this.r * 2.6, H = this.r * 2.0;
    ctx.drawImage(spr, this.x - W / 2, this.y - H / 2, W, H);
    if (this.hitFlash > 0) {
      const g = Sprites.glow.get('#ffffff');
      const gs = this.r * 2.4;
      ctx.globalAlpha = 0.4;
      ctx.drawImage(g, this.x - gs / 2, this.y - gs / 2, gs, gs);
      ctx.globalAlpha = 1;
    }
  }
}

/* ---------------- 子弹 ---------------- */
class Bullet {
  constructor() { this.dead = true; }

  init(x, y, vx, vy, owner, color, r, dmg, homing, pierce) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.owner = owner; this.color = color; this.r = r || 5;
    this.dmg = dmg || 1;
    this.homing = homing || 0;
    this.pierce = pierce || 0;      // 剩余可穿透目标数
    this.hitSet = null;
    this.target = null;
    this.life = 6;
    this.dead = false;
    this.px = x; this.py = y;
  }

  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return this; }

    if (this.homing && this.owner === 'p') {
      if (!this.target || this.target.dead) this.target = game.nearestEnemy(this.x, this.y);
      if (this.target) {
        const a = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        const cur = Math.atan2(this.vy, this.vx);
        let diff = a - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const na = cur + Math.max(-this.homing * dt, Math.min(this.homing * dt, diff));
        const sp = Math.hypot(this.vx, this.vy) || 200;
        this.vx = Math.cos(na) * sp;
        this.vy = Math.sin(na) * sp;
      }
    }

    this.px = this.x; this.py = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.x < -30 || this.x > CFG.W + 30 || this.y < -40 || this.y > CFG.H + 40) this.dead = true;
    return this;
  }

  draw(ctx) {
    const orb = Sprites.bullet.get(this.color) || Sprites.bullet.get('#7fd6ff');
    const s = this.r * 2.7;          // 收紧尺寸，直接减少混合像素量
    ctx.drawImage(orb, this.x - s / 2, this.y - s / 2, s, s);
  }
}

/* ---------------- 粒子 ---------------- */
class Particle {
  constructor() { this.dead = true; }

  init(x, y, vx, vy, life, color, size) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.color = color; this.size = size;
    this.dead = false;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return this; }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.965;
    this.vy *= 0.965;
    return this;
  }

  draw(ctx) {
    const t = this.life / this.maxLife;
    const s = this.size * (0.4 + t * 0.9);
    ctx.globalAlpha = Math.min(1, t * 1.5);
    const orb = Sprites.dot.get(this.color) || Sprites.dot.get('#ffffff');
    ctx.drawImage(orb, this.x - s / 2, this.y - s / 2, s, s);
    ctx.globalAlpha = 1;
  }
}

/* ---------------- 道具 ---------------- */
class PowerUp {
  constructor(kind, x, y) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vy = CFG.powerup.fallSpeed;
    this.life = CFG.powerup.life;
    this.dead = false;
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    this.life -= dt;
    this.y += this.vy * dt;
    if (this.y > CFG.H + 30 || this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    const blink = this.life < 3 && Math.floor(this.t * 8) % 2 === 0;
    if (blink) return;
    const pulse = 1 + Math.sin(this.t * 6) * 0.08;
    const S = 38 * pulse;
    ctx.drawImage(Sprites.power.get(this.kind), this.x - S / 2, this.y - S / 2, S, S);
  }
}
