/* srm/graphics.js \u2014 real 4K / super-sampling graphics controller.
   Talks to the live renderer through window.__GAME (set by logic.js). */
window.SRM = window.SRM || {};

SRM.graphics = {
  /* Return the pixel-ratio the renderer should use for the active preset.
     HIGH matches the original behaviour; ULTRA/4K super-sample above it. */
  prCap: function (dpr) {
    var p = SRM.presets[SRM.current] || SRM.presets.HIGH;
    if (SRM.current === 'HIGH') return Math.min(dpr || 1, p.prCap);
    return p.prCap;
  },

  /* Apply a preset live: resolution, shadow-map size, exposure. */
  apply: function (name) {
    if (name && SRM.presets[name]) SRM.current = name;
    if (SRM.save) SRM.save.set('quality', SRM.current);

    var G = window.__GAME;
    if (!G || !G.renderer) return SRM.current;
    var p = SRM.presets[SRM.current] || SRM.presets.HIGH;

    G.renderer.toneMappingExposure = p.exposure;

    /* resize shadow maps (desktop only \u2014 phones keep the light footprint) */
    if (!G.isTouch) {
      [G.bulb, G.moon].forEach(function (L) {
        if (L && L.shadow && L.shadow.mapSize) {
          L.shadow.mapSize.set(p.shadow, p.shadow);
          if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; }
        }
      });
    }

    /* re-run the game's own resize so prCap() is re-read everywhere */
    if (typeof G.resize === 'function') G.resize();

    /* hand off to the high-end 4k.js layer (anisotropy, soft shadows,
       env boost, cinematic grade) when it is loaded */
    if (window.SRM && SRM.ultra && SRM.ultra.apply) SRM.ultra.apply(SRM.current);
    return SRM.current;
  },

  /* Cycle HIGH -> ULTRA -> 4K -> HIGH. */
  cycle: function () {
    var i = SRM.order.indexOf(SRM.current);
    return SRM.graphics.apply(SRM.order[(i + 1) % SRM.order.length]);
  }
};
