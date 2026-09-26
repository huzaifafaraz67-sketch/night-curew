/* srm/control.js \u2014 wires in the add-on keyboard controls.
     P  \u2014 cycle graphics quality  (HIGH -> ULTRA -> 4K)
     H  \u2014 toggle the on-screen graphics / FPS indicator
   Both are guarded so they no-op if the modules above failed to load. */
window.SRM = window.SRM || {};

(function () {
  function notify(msg) {
    var G = window.__GAME;
    if (G && typeof G.say === 'function') { try { G.say(msg, 2200); } catch (e) {} }
  }

  function init() {
    addEventListener('keydown', function (e) {
      if (e.repeat) return;

      if (e.code === 'KeyP') {
        if (SRM.graphics && SRM.graphics.cycle) {
          var q = SRM.graphics.cycle();
          if (SRM.hud) SRM.hud.show(true);
          notify('Graphics quality: ' + q);
        }
      } else if (e.code === 'KeyH') {
        if (SRM.hud) SRM.hud.show(!SRM.hud.visible());
      }
    });
  }

  if (document.readyState !== 'loading') init();
  else addEventListener('DOMContentLoaded', init, { once: true });
})();
