/* 4k.js \u2014 high-end graphics layer for I WILL FIND YOU.
   Real quality upgrades applied live on ULTRA / 4K, and a full restore to the
   game's original hand-tuned look on HIGH. Everything is guarded through
   window.__GAME and fully reversible, so it can never break the core game.

   IMPORTANT: HIGH is a pure passthrough \u2014 it puts every material, light and
   renderer setting back exactly the way the game authored it. The extra
   effects only ever ADD on top at ULTRA / 4K, and they never touch shadow bias
   or the per-material reflection tuning destructively (they scale relative to
   the originals), so no shadow-acne or blown-out reflections.

   Registered as SRM.ultra and driven by srm/graphics.js:
     SRM.ultra.apply('HIGH' | 'ULTRA' | '4K')
*/
window.SRM = window.SRM || {};

SRM.ultra = (function () {
  var THREE = null;
  var saved = null;            // captured original state, for a clean restore
  var overlay = null;          // cinematic grade DOM overlay

  /* per-preset targets. 'env' is a MULTIPLIER on each material's own value,
     never an absolute override, so the metal/wood/floor balance is kept.
     Shadow bias is intentionally never changed. */
  var LEVELS = {
    HIGH:  { aniso: 0,  env: 1.00, expoAdd: 0.00, mips: false, soft: false, grade: 0.00 },
    ULTRA: { aniso: 8,  env: 1.12, expoAdd: 0.03, mips: true,  soft: true,  grade: 0.45 },
    '4K':  { aniso: 16, env: 1.25, expoAdd: 0.06, mips: true,  soft: true,  grade: 0.85 }
  };

  var MAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];

  /* ---------- capture the original look ONCE ---------- */
  function capture (G) {
    if (saved || !G.renderer) return;
    saved = {
      shadowType: G.renderer.shadowMap.type,
      expo: G.renderer.toneMappingExposure,
      mats: []
    };
    if (!G.scene) return;
    G.scene.traverse(function (obj) {
      var m = obj.material; if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach(function (mat) {
        var rec = { mat: mat, env: (mat.envMapIntensity != null ? mat.envMapIntensity : null), tex: [] };
        MAP_SLOTS.forEach(function (slot) {
          var t = mat[slot];
          if (t && t.isTexture) {
            rec.tex.push({ t: t, aniso: t.anisotropy, min: t.minFilter, mips: t.generateMipmaps });
          }
        });
        saved.mats.push(rec);
      });
    });
  }

  /* ---------- restore everything to the captured originals ---------- */
  function restore (G) {
    if (!saved) return;
    if (G.renderer) {
      G.renderer.shadowMap.type = saved.shadowType;
      G.renderer.shadowMap.needsUpdate = true;
      G.renderer.toneMappingExposure = saved.expo;
    }
    saved.mats.forEach(function (rec) {
      if (rec.env != null) rec.mat.envMapIntensity = rec.env;
      rec.tex.forEach(function (e) {
        e.t.anisotropy = e.aniso;
        e.t.minFilter = e.min;
        e.t.generateMipmaps = e.mips;
        e.t.needsUpdate = true;
      });
    });
  }

  /* ---------- cinematic grade overlay (vignette + gentle grain) ---------- */
  function buildOverlay () {
    if (overlay) return overlay;
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">' +
      '<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/></filter>' +
      '<rect width="100%" height="100%" filter="url(#n)"/></svg>';
    var o = document.createElement('div');
    o.id = 'gfx4kGrade';
    o.style.cssText =
      'position:fixed;inset:0;z-index:35;pointer-events:none;opacity:0;' +
      'transition:opacity .5s ease;mix-blend-mode:soft-light;' +
      'background:radial-gradient(120% 120% at 50% 45%,rgba(0,0,0,0) 58%,rgba(0,0,0,.5) 100%);';
    var grain = document.createElement('div');
    grain.style.cssText =
      'position:absolute;inset:-50%;opacity:.05;mix-blend-mode:overlay;' +
      'background-image:url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '");' +
      'background-size:180px 180px;animation:gfx4kGrain 0.9s steps(4) infinite;';
    o.appendChild(grain);
    var css = document.createElement('style');
    css.textContent =
      '@keyframes gfx4kGrain{0%{transform:translate(0,0)}25%{transform:translate(-6%,4%)}' +
      '50%{transform:translate(5%,-5%)}75%{transform:translate(-4%,-3%)}100%{transform:translate(4%,5%)}}';
    document.head.appendChild(css);
    (document.body || document.documentElement).appendChild(o);
    overlay = o;
    return o;
  }

  /* ---------- apply a preset ---------- */
  function apply (name) {
    var G = window.__GAME;
    if (!G || !G.renderer) return;
    THREE = THREE || G.THREE || window.THREE;
    capture(G);

    // always start from the original look, then layer the preset on top
    restore(G);

    var L = LEVELS[name] || LEVELS.HIGH;

    if (name === 'HIGH') {
      if (overlay) overlay.style.opacity = '0';
      return;   // pure passthrough: the game looks exactly as authored
    }

    var maxAniso = 1;
    try { maxAniso = G.renderer.capabilities.getMaxAnisotropy() || 1; } catch (e) {}
    var aniso = Math.min(L.aniso, maxAniso);

    // soft shadows (never touching bias, so no acne) \u2014 desktop only
    if (THREE && L.soft && !G.isTouch) {
      G.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      G.renderer.shadowMap.needsUpdate = true;
    }

    // per-material: crisper texture filtering + a gentle env-reflection boost
    if (G.scene) G.scene.traverse(function (obj) {
      var m = obj.material; if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach(function (mat) {
        MAP_SLOTS.forEach(function (slot) {
          var t = mat[slot];
          if (t && t.isTexture) {
            if (aniso > 0) t.anisotropy = aniso;
            if (THREE && L.mips) { t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; }
            t.needsUpdate = true;
          }
        });
        if (mat.envMapIntensity != null) mat.envMapIntensity *= L.env;  // relative, keeps tuning
      });
    });

    // a touch more exposure, relative to the game's own value
    G.renderer.toneMappingExposure = (saved ? saved.expo : 0.9) + L.expoAdd;

    buildOverlay().style.opacity = String(L.grade);

    if (G.say) { try { G.say(name + ' graphics engaged.', 1500); } catch (e) {} }
  }

  return { apply: apply, levels: LEVELS };
})();
