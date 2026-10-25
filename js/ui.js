/* ============================================================
 * ui.js  ——  HUD / 弹窗 / 提示
 * 只在数值变化时写 DOM，避免每帧重排
 * ============================================================ */

const UI = {
  cache: {},
  game: null,
  wbtns: [],

  el(id) { return document.getElementById(id); },

  set(id, v) {
    if (this.cache[id] === v) return;
    this.cache[id] = v;
    const e = this.el(id);
    if (e) e.textContent = v;
  },

  init(game) {
    this.game = game;

    // 武器按钮
    const wrap = this.el('weapons');
    wrap.innerHTML = '';
    this.wbtns = WEAPON_KEYS.map((k, i) => {
      const def = WEAPONS[k];
      const b = document.createElement('button');
      b.className = 'wbtn';
      b.innerHTML = '<span class="wi">' + def.icon + '</span><span class="wn">' + def.name +
                    '</span><span class="wl">Lv0</span>';
      b.title = def.desc;
      b.addEventListener('click', () => {
        SFX.init();
        if (game.player.switchWeapon(k)) {
          UI.toast('切换武器：' + def.name, 'good');
          SFX.play('click');
          game.uiDirty = true;
        }
      });
      wrap.appendChild(b);
      return { el: b, key: k, lv: -1, on: false };
    });

    this.el('btnBomb').addEventListener('click', () => { SFX.init(); game.useBomb(); });
    this.el('btnPause').addEventListener('click', () => { SFX.play('click'); game.togglePause(); });
    this.el('btnSound').addEventListener('click', e => {
      SFX.init();
      const on = SFX.toggle();
      e.currentTarget.textContent = on ? '🔊' : '🔇';
      e.currentTarget.classList.toggle('off', !on);
      if (on) SFX.play('click');
    });
    this.el('btnOD').addEventListener('click', () => { SFX.init(); game.activateOverdrive(); });
    this.el('btnAch').addEventListener('click', () => {
      SFX.play('click');
      UI.showAchievements(game);
    });

    this.el('btnQuality').addEventListener('click', e => {
      SFX.init(); SFX.play('click');
      game.autoQuality = false;                 // 手动切换后不再自动调整
      game.setQuality((game.quality + 1) % 3, false);
      e.currentTarget.textContent = ['🎨流','🎨均','🎨高'][game.quality];
    });

    this.el('btnHelp').addEventListener('click', () => {
      this.el('help').classList.toggle('show');
      SFX.play('click');
    });
  },

  refresh(game) {
    this.set('score', game.score);
    this.set('best', game.best);
    this.set('wave', game.waveIndex);
    this.set('bombN', game.player.bombs);
    this.set('killN', game.kills);

    // 生命
    const hk = game.player.lives + '/' + game.player.shield;
    if (this.cache.ls !== hk) {
      this.cache.ls = hk;
      let s = '';
      for (let i = 0; i < game.player.lives; i++) s += '❤️';
      for (let i = 0; i < game.player.shield; i++) s += '🛡';
      this.el('lives').textContent = s || '—';
    }

    // 武器按钮状态
    for (const w of this.wbtns) {
      const lv = game.player.levels[w.key] || 0;
      const on = game.player.weapon === w.key;
      if (w.lv !== lv || w.on !== on) {
        w.lv = lv; w.on = on;
        w.el.querySelector('.wl').textContent = lv ? 'Lv' + lv : '未解锁';
        w.el.classList.toggle('locked', !lv);
        w.el.classList.toggle('active', on);
      }
    }

    // 超载条
    const p = game.player;
    const pct = Math.round(p.od / OVERDRIVE.max * 100);
    if (this.cache.odPct !== pct) {
      this.cache.odPct = pct;
      const f = this.el('odFill');
      if (f) f.style.width = pct + '%';
    }
    const odOn = p.odActive > 0;
    if (this.cache.odOn !== odOn) {
      this.cache.odOn = odOn;
      const t = this.el('odTxt');
      if (t) t.textContent = odOn ? Math.ceil(p.odActive) + 's' : (pct >= 100 ? '就绪' : '超载');
      const b = this.el('btnOD');
      if (b) b.classList.toggle('ready', pct >= 100 && !odOn);
      const row = document.querySelector('.od-row');
      if (row) row.classList.toggle('full', pct >= 100 && !odOn);
    }
    // 激活中显示剩余秒数
    if (odOn) {
      const t = this.el('odTxt');
      const v = Math.ceil(p.odActive) + 's';
      if (t && this.cache.odSec !== v) { this.cache.odSec = v; t.textContent = v; }
    }

    // 炸弹按钮可用态
    const bb = this.el('btnBomb');
    const can = game.player.bombs > 0;
    if (this.cache.canBomb !== can) {
      this.cache.canBomb = can;
      bb.classList.toggle('off', !can);
    }
  },

  /* ---------------- 弹窗 ---------------- */
  modal(html) {
    const m = this.el('modal');
    m.innerHTML = '<div class="modal-box">' + html + '</div>';
    m.classList.add('show');
  },

  hideModal() {
    const m = this.el('modal');
    m.classList.remove('show');
    m.innerHTML = '';
  },

  showTitle(game) {
    const ships = SHIP_KEYS.map(k => {
      const d = SHIPS[k];
      return '<button class="ship' + (k === game.shipKey ? ' sel' : '') + '" data-ship="' + k + '">' +
        '<span class="sico">' + d.icon + '</span>' +
        '<span class="sname">' + d.name + '</span>' +
        '<span class="sdesc">' + d.desc + '</span></button>';
    }).join('');

    this.modal(
      '<div class="ttl">🚀 星舰突击</div>' +
      '<div class="sub">选择机体 · 无尽波次 · 打造你的流派</div>' +
      '<div class="ships">' + ships + '</div>' +
      '<div class="tips">' +
        '<div><b>拖动</b>操控飞船，自动开火；<b>⚡超载</b>满能量可释放</div>' +
        '<div><b>每 2 波</b>三选一强化，叠出你的流派</div>' +
        '<div><b>桌面</b>：WASD · 空格轰炸 · 1~4 换武器 · P 暂停</div>' +
      '</div>' +
      '<button class="primary big" id="mStart">▶️ 开始战斗</button>' +
      '<button class="ghost" id="mAch" style="margin-top:7px">🏆 成就</button>'
    );

    this.el('mStart').onclick = () => {
      SFX.init(); SFX.resume(); SFX.play('click');
      this.hideModal();
      game.restart(game.shipKey);
    };
    this.el('mAch').onclick = () => { SFX.play('click'); this.showAchievements(game, true); };

    this.el('modal').querySelectorAll('.ship').forEach(b => {
      b.onclick = () => {
        SFX.init(); SFX.play('click');
        game.shipKey = b.dataset.ship;
        this.el('modal').querySelectorAll('.ship').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel');
      };
    });
  },

  showPause(game) {
    this.modal(
      '<div class="ttl">⏸ 已暂停</div>' +
      '<div class="sub">第 ' + game.waveIndex + ' 波 · 得分 ' + game.score + '</div>' +
      '<button class="primary big" id="mResume">▶️ 继续</button><br/>' +
      '<button class="ghost" id="mQuit">🔄 重新开始</button>'
    );
    this.el('mResume').onclick = () => { SFX.play('click'); game.togglePause(); };
    this.el('mQuit').onclick = () => { SFX.play('click'); this.hideModal(); game.restart(); };
  },

  showBoons(game, list) {
    const cards = list.map((b, i) =>
      '<button class="boon" data-i="' + i + '">' +
        '<span class="bico">' + b.icon + '</span>' +
        '<span class="bname">' + b.name + '</span>' +
        '<span class="bdesc">' + b.desc + '</span>' +
      '</button>'
    ).join('');
    this.modal(
      '<div class="ttl">✨ 强化选择</div>' +
      '<div class="sub">第 ' + game.waveIndex + ' 波完成 · 选择一项永久强化</div>' +
      '<div class="boons">' + cards + '</div>'
    );
    this.el('modal').querySelectorAll('.boon').forEach(b => {
      b.onclick = () => {
        game.applyBoon(list[Number(b.dataset.i)]);
      };
    });
  },

  showAchievements(game, backToTitle) {
    const rows = ACHIEVEMENTS.map(a => {
      const got = !!game.unlocked[a.id];
      return '<div class="ach' + (got ? ' got' : '') + '">' +
        '<span class="aico">' + (got ? '🏆' : '🔒') + '</span>' +
        '<span class="atext"><b>' + a.name + '</b><i>' + a.desc + '</i></span></div>';
    }).join('');
    const n = Object.keys(game.unlocked).filter(k => game.unlocked[k]).length;
    this.modal(
      '<div class="ttl">🏆 成就 ' + n + '/' + ACHIEVEMENTS.length + '</div>' +
      '<div class="sub">跨局永久记录</div>' +
      '<div class="ach-list">' + rows + '</div>' +
      (backToTitle ? '<button class="ghost" id="mBack">← 返回</button>' :
                     '<button class="primary big" id="mBack">关闭</button>')
    );
    this.el('mBack').onclick = () => {
      SFX.play('click');
      if (backToTitle) this.showTitle(game);
      else this.hideModal();
    };
  },

  showGameOver(game) {
    const isBest = game.score >= game.best && game.score > 0;
    this.modal(
      '<div class="ttl bad">💥 任务失败</div>' +
      '<div class="sub">' + (isBest ? '🏆 新纪录！' : '最好成绩 ' + game.best) + '</div>' +
      '<div class="ov-grid">' +
        '<div><span>' + game.score + '</span>得分</div>' +
        '<div><span>' + game.waveIndex + '</span>波次</div>' +
        '<div><span>' + game.kills + '</span>击杀</div>' +
        '<div><span>' + game.stats.bossKills + '</span>Boss</div>' +
        '<div><span>' + game.stats.eliteKills + '</span>精英</div>' +
        '<div><span>×' + game.stats.maxCombo + '</span>最高连击</div>' +
      '</div>' +
      '<button class="primary big" id="mAgain">🔄 再来一次</button><br/>' +
      '<button class="ghost" id="mHome">🚀 换机体</button>'
    );
    this.el('mAgain').onclick = () => { SFX.play('click'); this.hideModal(); game.restart(game.shipKey); };
    this.el('mHome').onclick = () => { SFX.play('click'); game.state = 'title'; this.showTitle(game); };
  },

  /* ---------------- 提示 ---------------- */
  toast(msg, kind) {
    const box = this.el('toasts');
    const d = document.createElement('div');
    d.className = 'toast ' + (kind || '');
    d.textContent = msg;
    box.appendChild(d);
    setTimeout(() => d.classList.add('out'), 1500);
    setTimeout(() => d.remove(), 2000);
    while (box.children.length > 3) box.removeChild(box.firstChild);
  }
};
