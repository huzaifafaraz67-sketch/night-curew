/* srm/animation.js \u2014 extra per-frame ambient life on top of the core loop.
   Called every frame from logic.js as SRM.animation.ambient(now). Guarded:
   if the game isn't ready yet it simply does nothing. It captures each fill
   light's baseline once and only breathes gently AROUND that baseline, so it
   never overrides the game's own lighting or scare states. */
window.SRM = window.SRM || {};

SRM.animation = (function () {
  var base = null;
  return {
    ambient: function (now) {
      if (SRM.hud) SRM.hud.tick();

      var G = window.__GAME;
      if (!G) return;

      if (base === null) {
        base = {
          hemi:    (G.hemi    ? G.hemi.intensity    : null),
          ambient: (G.ambient ? G.ambient.intensity : null)
        };
      }

      var t = now * 0.001;
      if (G.hemi    && base.hemi    != null) G.hemi.intensity    = base.hemi    * (1 + Math.sin(t * 0.70) * 0.06);
      if (G.ambient && base.ambient != null) G.ambient.intensity = base.ambient * (1 + Math.sin(t * 0.50 + 1.3) * 0.05);
    }
  };
})();
