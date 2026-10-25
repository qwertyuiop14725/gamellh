window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  UI.init(game);
  UI.refresh(game);
  UI.showTitle(game);
  game.start();

  const unlock = () => { SFX.init(); SFX.resume(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);

  // 首屏布局稳定后重新适配一次
  window.addEventListener('load', () => game.setupCanvas());

  // 切到后台自动暂停，避免回来时一次性补帧
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'play') game.togglePause();
  });

  window.GAME = game;
});
