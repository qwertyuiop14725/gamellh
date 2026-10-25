/* ============================================================
 * config.js  ——  数值中枢（改玩法只动这里）
 * ============================================================ */

/* 每帧共享的时间戳，供动画使用（避免逐帧调用 performance.now） */
let NOW = 0;

const CFG = {
  W: 450,          // 逻辑宽
  H: 800,          // 逻辑高

  stars: 90,
  caps: {          // 实体上限，超了就不再生成，保证帧率稳定
    bullets: 240,
    particles: 90,
    enemies: 42,
    powerups: 8
  },

  player: {
    r: 14,           // 绘制半径
    hitR: 6,         // 判定半径（更小，手感更宽容）
    speed: 340,      // 拖动跟随速度
    lives: 3,
    invuln: 1.6,
    startWeapon: 'vulcan'
  },

  combo: { window: 2.2, max: 6 },

  bomb: { start: 2, max: 5, damage: 14, scorePerCharge: 7000 },

  powerup: { dropChance: 0.17, fallSpeed: 95, life: 11 },

  shield: { max: 3 },

  bossEvery: 5
};

/* ---------------- 武器 ----------------
 * 4 种武器，各自独立 1~3 级；拾取同类升级，拾取异类切换
 * rate: 射击间隔（秒）；dmg: 单发伤害
 */
const WEAPONS = {
  vulcan: {
    name: '速射炮', icon: '🔫', color: '#7fd6ff',
    desc: '高频直射，稳定输出',
    rate: [0.15, 0.13, 0.11],
    dmg: [1.2, 1.2, 1.3],
    shots: [1, 2, 3],          // 弹数
    spread: [0, 0.16, 0.24]    // 弧度
  },
  spread: {
    name: '散射炮', icon: '💥', color: '#ffd54f',
    desc: '扇形覆盖，清理杂兵',
    rate: [0.34, 0.30, 0.26],
    dmg: [1.0, 1.1, 1.2],
    shots: [3, 5, 7],
    spread: [0.30, 0.42, 0.54]
  },
  laser: {
    name: '激光', icon: '⚡', color: '#b388ff',
    desc: '持续贯穿，无视弹幕',
    dps: [11, 16, 24],
    width: [10, 14, 22]
  },
  missile: {
    name: '追踪弹', icon: '🚀', color: '#ff8a65',
    desc: '自动追踪，高单发伤害',
    rate: [0.50, 0.42, 0.34],
    dmg: [3.2, 3.6, 4.2],
    shots: [1, 2, 3],
    homing: [3.2, 3.6, 4.2]
  }
};

const WEAPON_KEYS = ['vulcan', 'spread', 'laser', 'missile'];

/* ---------------- 敌人 ---------------- */
const ENEMIES = {
  scout: {
    name: '侦察机', hp: 2, r: 15, speed: 150, score: 10,
    color: '#ef5350', dark: '#b71c1c', light: '#ff8a80', pattern: 'dive'
  },
  fighter: {
    name: '战斗机', hp: 4, r: 18, speed: 88, score: 20,
    color: '#ffa726', dark: '#e65100', light: '#ffcc80', pattern: 'descend', fire: 2.4
  },
  weaver: {
    name: '织翼机', hp: 3, r: 16, speed: 105, score: 15,
    color: '#ab47bc', dark: '#4a148c', light: '#ce93d8', pattern: 'weave'
  },
  turret: {
    name: '炮台机', hp: 9, r: 20, speed: 75, score: 35,
    color: '#26c6da', dark: '#006064', light: '#80deea', pattern: 'hover', fire: 1.9, aimed: true
  },
  tank: {
    name: '重装舰', hp: 17, r: 27, speed: 42, score: 55,
    color: '#78909c', dark: '#37474f', light: '#b0bec5', pattern: 'slow', fire: 2.8, spread: 3
  }
};

const ENEMY_KEYS = ['scout', 'fighter', 'weaver', 'turret', 'tank'];

/* ---------------- Boss ---------------- */
const BOSSES = [
  {
    key: 'dreadnought', name: '无畏级战舰', hp: 240, r: 62,
    color: '#78909c', dark: '#37474f', light: '#cfd8dc', score: 800
  },
  {
    key: 'weaver', name: '织网者', hp: 320, r: 58,
    color: '#ab47bc', dark: '#4a148c', light: '#e1bee7', score: 1200
  },
  {
    key: 'fortress', name: '要塞核心', hp: 440, r: 66,
    color: '#26c6da', dark: '#006064', light: '#b2ebf2', score: 1800
  }
];

/* ---------------- 道具 ---------------- */
const POWERUPS = {
  weapon: { icon: 'W', color: '#7fd6ff', label: '武器' },
  shield: { icon: 'S', color: '#76ff03', label: '护盾' },
  bomb:   { icon: 'B', color: '#ff5252', label: '炸弹' }
};

/* ---------------- 波次生成 ----------------
 * 随机编排，每局都不一样；每 5 波一个 Boss
 */
function buildWave(n) {
  const ev = [];
  if (n % CFG.bossEvery === 0) {
    const bi = (Math.floor(n / CFG.bossEvery) - 1) % BOSSES.length;
    ev.push({ t: 0.8, kind: 'boss', boss: bi });
    return { ev, boss: true };
  }

  const pool = ['scout'];
  if (n >= 2) pool.push('fighter');
  if (n >= 3) pool.push('weaver');
  if (n >= 4) pool.push('turret');
  if (n >= 6) pool.push('tank');

  const forms = ['line', 'arc', 'column'];
  if (n >= 3) forms.push('sides');

  const groups = Math.min(3 + Math.floor(n / 3), 8);
  let t = 0.5;
  for (let g = 0; g < groups; g++) {
    const type = pool[Math.floor(Math.random() * pool.length)];
    const count = Math.min(2 + Math.floor(Math.random() * 3 + n / 4), 9);
    const form = forms[Math.floor(Math.random() * forms.length)];
    ev.push({ t, kind: 'group', type, count, form });
    t += 1.5 + Math.random() * 1.3;
  }
  return { ev, boss: false };
}

/* 敌人成长：血量随波次线性提升 */
function hpScale(n) { return 1 + (n - 1) * 0.11; }

/* ============================================================
 * 机体：3 种，基础属性与定位各不相同
 * ============================================================ */
const SHIPS = {
  falcon: {
    name: '游隼', icon: '🦅', color: '#90a4ae',
    desc: '3 命 · 速射起手',
    lives: 3, speed: 340, startWeapon: 'vulcan',
    dmgMul: 1.0, rateMul: 1.0, scoreMul: 1.0, comboBonus: 0, startShield: 0
  },
  aegis: {
    name: '神盾', icon: '🛡️', color: '#66bb6a',
    desc: '4 命 · 带 1 护盾',
    lives: 4, speed: 300, startWeapon: 'spread',
    dmgMul: 0.9, rateMul: 0.95, scoreMul: 0.95, comboBonus: 0, startShield: 1
  },
  wasp: {
    name: '黄蜂', icon: '🐝', color: '#ffca28',
    desc: '2 命 · 得分 +20%',
    lives: 2, speed: 395, startWeapon: 'missile',
    dmgMul: 1.1, rateMul: 1.1, scoreMul: 1.2, comboBonus: 0.6, startShield: 0
  }
};
const SHIP_KEYS = ['falcon', 'aegis', 'wasp'];

/* ---------------- 僚机 ----------------
 * 最多 2 架，跟随玩家自动开火；1~3 级各自提升射速与伤害
 */
const DRONE = {
  max: 2,
  rate: [0.42, 0.34, 0.26],
  dmg: [0.8, 1.1, 1.5],
  offset: [-34, 34],        // 左右侧后方
  followY: 34
};

/* ---------------- 超载（Overdrive） ----------------
 * 击杀积攒能量，满了可主动激活：射速 / 伤害大幅提升且短时无敌
 */
const OVERDRIVE = {
  perKill: 4,
  perBossKill: 30,
  max: 100,
  dur: 6,
  rateMul: 0.5,      // 射击间隔 ×0.5（即翻倍）
  dmgMul: 1.6,
  speedMul: 1.25
};

/* ---------------- 精英敌机 ---------------- */
const ELITE = {
  hpMul: 3.2,
  scoreMul: 4,
  rMul: 1.25,
  fromWave: 4,
  chance: 0.14,
  fireMul: 0.65      // 射击间隔更短
};

/* ---------------- 波次间三选一词条 ----------------
 * 每 2 波给一次（含 Boss 波后），从池中随机不重复地抽 3 个
 */
const BOONS = [
  { id: 'dmg',   icon: '⚔️', name: '火力增幅',  desc: '所有武器伤害 +18%',        apply: p => { p.mods.dmg *= 1.18; } },
  { id: 'rate',  icon: '⏩', name: '高速装填',  desc: '射击间隔 -14%',            apply: p => { p.mods.rate *= 0.86; } },
  { id: 'drone', icon: '🛩️', name: '增派僚机',  desc: '获得 1 架僚机（已满则升 1 级）', apply: p => p.addDrone() },
  { id: 'shield',icon: '🛡️', name: '护盾扩容',  desc: '立即 +1 护盾，上限 +1',    apply: p => { p.shieldMax++; p.shield = Math.min(p.shieldMax, p.shield + 1); } },
  { id: 'bomb',  icon: '💣', name: '弹药补给',  desc: '立即 +2 炸弹，上限 +1',    apply: p => { p.bombMax++; p.bombs = Math.min(p.bombMax, p.bombs + 2); } },
  { id: 'life',  icon: '❤️', name: '备用机体',  desc: '生命 +1',                  apply: p => { p.lives++; } },
  { id: 'combo', icon: '🔥', name: '连击专家',  desc: '连击窗口 +0.8s，上限 +1',  apply: p => { p.comboMax++; p.comboWindow += 0.8; } },
  { id: 'crit',  icon: '🎯', name: '精准核心',  desc: '暴击率 +12%（暴击 2 倍伤害）', apply: p => { p.mods.crit = Math.min(0.6, p.mods.crit + 0.12); } },
  { id: 'magnet',icon: '🧲', name: '磁力牵引',  desc: '道具自动吸附',              apply: p => { p.magnet = true; } },
  { id: 'od',    icon: '⚡', name: '超载回路',  desc: '超载充能 +35%，持续 +1.5s', apply: p => { p.odGain *= 1.35; p.odDur += 1.5; } },
  { id: 'pierce',icon: '🗡️',name: '穿甲弹头',  desc: '子弹无视目标 30% 减伤',      apply: p => { p.mods.pierce += 0.3; } },
  { id: 'ricochet', icon: '🌀', name: '溅射弹',  desc: '击杀时小范围溅射伤害',      apply: p => { p.splash = true; } }
];

/* ---------------- 成就（localStorage 持久化） ---------------- */
const ACHIEVEMENTS = [
  { id: 'first_blood', name: '首杀',        desc: '击落第 1 架敌机',        test: s => s.kills >= 1 },
  { id: 'wave5',       name: '深入敌后',    desc: '抵达第 5 波',            test: s => s.wave >= 5 },
  { id: 'boss1',       name: '猎杀者',      desc: '击破第 1 个 Boss',       test: s => s.bossKills >= 1 },
  { id: 'boss3',       name: 'Boss 终结者', desc: '击破 3 个 Boss',         test: s => s.bossKills >= 3 },
  { id: 'score10k',    name: '万分达成',    desc: '单局得分突破 10000',     test: s => s.score >= 10000 },
  { id: 'score30k',    name: '星辰征服者',  desc: '单局得分突破 30000',     test: s => s.score >= 30000 },
  { id: 'combo6',      name: '连锁大师',    desc: '达成 ×6 连击',           test: s => s.maxCombo >= 6 },
  { id: 'elite5',      name: '精英猎手',    desc: '击破 5 架精英敌机',      test: s => s.eliteKills >= 5 },
  { id: 'noHit15',     name: '零伤突进',    desc: '前 15 波未损失生命',     test: s => s.wave >= 15 && s.damageTaken === 0 },
  { id: 'allWeapons',  name: '军火全解',    desc: '单局解锁全部 4 种武器',  test: s => s.weaponsUnlocked >= 4 },
  { id: 'drones2',     name: '编队指挥',    desc: '同时拥有 2 架满级僚机',  test: s => s.droneMaxLevel >= 3 && s.drones >= 2 },
  { id: 'od3',         name: '超载狂人',    desc: '单局激活 3 次超载',      test: s => s.odUses >= 3 }
];
