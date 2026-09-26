/* srm/hud.js \u2014 on-screen graphics / FPS indicator (hidden by default). */
window.SRM = window.SRM || {};

(function () {
  var el = document.createElement('div');
  el.id = 'srmHud';
  el.style.cssText =
    'position:fixed;right:10px;bottom:10px;z-index:60;' +
    'font:11px/1.4 ui-monospace,monospace;color:#7fe0c8;' +
    'background:rgba(6,10,14,.55);padding:6px 9px;' +
    'border:1px solid rgba(127,224,200,.25);border-radius:6px;' +
    'pointer-events:none;letter-spacing:1px;display:none';

  function mount() {
    if (document.body) document.body.appendChild(el);
    else addEventListener('DOMContentLoaded', mount, { once: true });
  }
  mount();

  var last = performance.now(), frames = 0, fps = 0;

  SRM.hud = {
    el: el,
    tick: function () {
      frames++;
      var n = performance.now();
      if (n - last >= 500) {
        fps = Math.round(frames / ((n - last) / 1000));
        frames = 0; last = n;
        el.textContent = 'GFX ' + (SRM.current || '-') + '  \u00b7  ' + fps + ' FPS';
      }
    },
    visible: function () { return el.style.display !== 'none'; },
    show: function (v) { el.style.display = v ? 'block' : 'none'; }
  };
})();
