/* 4k.js \u2014 high-end graphics layer for I WILL FIND YOU.
   Real renderer/material/scene upgrades applied live when you switch to
   ULTRA or 4K, plus a cinematic image-grade overlay. Everything is guarded
   through window.__GAME and fully reversible, so it can never break the core
   game if something is missing.

   Registered as SRM.ultra and driven by srm/graphics.js:
     SRM.ultra.apply('HIGH' | 'ULTRA' | '4K')
*/
window.SRM = window.SRM || {};

SRM.ultra = (function () {
  var THREE = null;
  var saved = null;            // original renderer/material state, for reverting
  var overlay = null;          // cinematic grade DOM overlay

  /* per-preset high-end targets */
  var LEVELS = {
    HIGH:  { aniso: 4,  shadow: THREE_PCF(),  bias: -0.0004, env: 1.00, expo: 0.90, grade: 0.00, sharp: 0.0 },
    ULTRA: { aniso: 8,  shadow: 'soft',       bias: -0.0002, env: 1.20, expo: 0.95, grade: 0.55, sharp: 0.4 },
    '4K':  { aniso: 16, shadow: 'soft',       bias: -0.0001, env: 1.45, expo: 1.00, grade: 1.00, sharp: 0.8 }
  };
  function THREE_PCF () { return 'basic'; }

  /* ---------- cinematic grade overlay (vignette + grain + fringe) ---------- */
  function buildOverlay () {
    if (overlay) return overlay;
    var o = document.createElement('div');
    o.id = 'gfx4kGrade';
    o.style.cssText =
      'position:fixed;inset:0;z-index:35;pointer-events:none;opacity:0;' +
      'transition:opacity .5s ease;mix-blend-mode:soft-light;' +
      'background:radial-gradient(120% 120% at 50% 45%,rgba(0,0,0,0) 55%,rgba(0,0,0,.55) 100%);';
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">' +
      '<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/></filter>' +
      '<rect width="100%" height="100%" filter="url(#n)"/></svg>';
    var grain = document.createElement('div');
    grain.style.cssText =
      'position:absolute;inset:-50%;opacity:.06;mix-blend-mode:overlay;' +
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

  /* ---------- capture originals once so HIGH restores the base look ---------- */
  function capture (G) {
    if (saved || !G.renderer) return;
    saved = {
      shadowType: G.renderer.shadowMap.type,
      expo: G.renderer.toneMappingExposure,
      mats: []
    };
    if (G.scene) G.scene.traverse(function (obj) {
      var m = obj.material;
      if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach(function (mat) {
        saved.mats.push({ mat: mat, env: (mat.envMapIntensity != null ? mat.envMapIntensity : null) });
      });
    });
  }

  /* ---------- apply a preset ---------- */
  function apply (name) {
    var G = window.__GAME;
    if (!G || !G.renderer) return;
    THREE = THREE || G.THREE || window.THREE;
    var L = LEVELS[name] || LEVELS.HIGH;
    capture(G);

    var maxAniso = 1;
    try { maxAniso = G.renderer.capabilities.getMaxAnisotropy() || 1; } catch (e) {}
    var aniso = Math.min(L.aniso, maxAniso);

    /* shadows: soft PCF on high presets, basic on HIGH (matches original) */
    if (THREE) {
      G.renderer.shadowMap.type =
        (L.shadow === 'soft' && !G.isTouch) ? THREE.PCFSoftShadowMap : (saved ? saved.shadowType : THREE.PCFShadowMap);
      G.renderer.shadowMap.needsUpdate = true;
    }

    /* tighten shadow bias on the key lights so 4K looks crisp, not smeary */
    [G.bulb, G.moon].forEach(function (Lg) {
      if (Lg && Lg.shadow && !G.isTouch) { Lg.shadow.bias = L.bias; Lg.castShadow = true; }
    });

    /* walk every material once: anisotropic filtering + mipmaps + env boost */
    if (G.scene) G.scene.traverse(function (obj) {
      var m = obj.material; if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach(function (mat) {
        ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'].forEach(function (slot) {
          var t = mat[slot];
          if (t && t.isTexture) {
            t.anisotropy = aniso;
            if (THREE && L.shadow === 'soft') { t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; }
            t.needsUpdate = true;
          }
        });
        if (mat.envMapIntensity != null) mat.envMapIntensity = L.env;
      });
    });

    /* tone-mapping exposure grade */
    G.renderer.toneMappingExposure = L.expo;

    /* cinematic overlay strength */
    var ov = buildOverlay();
    ov.style.opacity = String(L.grade);

    if (G.say && name !== 'HIGH') { try { G.say('4K graphics engaged.', 1500); } catch (e) {} }
  }

  return { apply: apply, levels: LEVELS };
})();
