/* e5UI0.js \u2014 screen driver for I WILL FIND YOU.

   A single self-contained module that makes the whole game/app adapt to ANY
   screen: phone, tablet, laptop, desktop, ultrawide, portrait or landscape,
   high-DPI (retina/4K) displays, and browser resizes / device rotations.

   It does three jobs, all guarded so it can never crash the game:
     1. Keeps the 3D renderer + camera perfectly sized to the window
        (correct aspect ratio, no stretching, capped pixel-ratio for speed).
     2. Publishes live screen info as CSS variables + <body> classes so the
        HTML/CSS UI (HUD, menus, prompts) can restyle itself responsively.
     3. Scales the on-screen UI on very small / very large screens and reacts
        to orientation changes and fullscreen.

   HOW TO USE
   ----------
   Add ONE line to index.html, AFTER the game script (logic.js) loads:

       <script src="e5UI0.js" defer></script>

   It auto-starts. No other change is required. The game exposes
   window.__GAME = { renderer, camera, ... }; this driver hooks into that if
   present, and still drives the responsive CSS layer even if it isn't.

   OPTIONAL CSS HOOKS (already usable once this file runs):
     :root {
       --vw            live viewport width  (px)
       --vh            live viewport height (px, mobile-URL-bar safe)
       --vmin,--vmax   min/max of the two
       --dpr           device pixel ratio
       --ui-scale      recommended UI scale factor (0.75 .. 1.35)
       --safe-t/-r/-b/-l  safe-area insets (notches)
     }
     body.scr-phone / .scr-tablet / .scr-laptop / .scr-desktop / .scr-wide
     body.scr-portrait / .scr-landscape
     body.scr-touch / .scr-mouse
     body.scr-hidpi
*/
(function () {
  'use strict';
  if (window.__E5UI0__) return;          // never install twice
  window.__E5UI0__ = true;

  var DPR_CAP = 2.5;                      // hard cap so 4K/retina stays fast
  var root = document.documentElement;
  var lastKey = '';

  function num (v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }

  /* ---- breakpoints (by CSS px of the shorter... no, by width) ---- */
  function tier (w) {
    if (w < 600)  return 'phone';
    if (w < 900)  return 'tablet';
    if (w < 1280) return 'laptop';
    if (w < 1920) return 'desktop';
    return 'wide';
  }

  /* ---- recommended UI scale: bigger touch targets on tiny screens,
         a little larger on huge screens, ~1.0 in the sweet spot ---- */
  function uiScale (w, h, isTouch) {
    var s = 1;
    var minSide = Math.min(w, h);
    if (minSide < 380)      s = isTouch ? 0.82 : 0.80;
    else if (minSide < 560) s = isTouch ? 0.90 : 0.88;
    else if (minSide < 820) s = 1.0;
    else if (minSide < 1100) s = 1.08;
    else                    s = 1.18;
    if (w >= 2200) s += 0.12;              // ultrawide / 4K desktop
    return Math.max(0.75, Math.min(1.35, +s.toFixed(3)));
  }

  function safeInset (side) {
    // read env() safe-area via a probe once per call; cheap enough
    var probe = safeInset._p || (safeInset._p = (function () {
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;' +
        'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
        'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);';
      (document.body || root).appendChild(d);
      return d;
    })());
    var cs = getComputedStyle(probe);
    return { t: cs.paddingTop, r: cs.paddingRight, b: cs.paddingBottom, l: cs.paddingLeft };
  }

  /* ---- resize the 3D renderer + camera to match the window ---- */
  function resizeRenderer (w, h, dpr) {
    var G = window.__GAME;
    if (!G) return;
    try {
      if (G.renderer && G.renderer.setSize) {
        if (G.renderer.setPixelRatio) G.renderer.setPixelRatio(dpr);
        G.renderer.setSize(w, h, true);
      }
      var cam = G.camera;
      if (cam) {
        if (cam.isPerspectiveCamera || cam.aspect !== undefined) {
          cam.aspect = w / h;
        } else if (cam.isOrthographicCamera) {
          var half = (cam.top - cam.bottom) / 2;
          cam.left = -half * (w / h); cam.right = half * (w / h);
        }
        if (cam.updateProjectionMatrix) cam.updateProjectionMatrix();
      }
      // let the game run its own resize hook too, if it has one
      if (typeof G.onResize === 'function') G.onResize(w, h, dpr);
    } catch (e) { /* never let a resize break the frame loop */ }
  }

  /* ---- the main update ---- */
  function update () {
    var w = window.innerWidth  || root.clientWidth  || 1;
    var h = window.innerHeight || root.clientHeight || 1;
    var rawDpr = window.devicePixelRatio || 1;
    var dpr = Math.min(rawDpr, DPR_CAP);
    var isTouch = ('ontouchstart' in window) ||
                  (navigator.maxTouchPoints > 0) ||
                  window.matchMedia('(pointer:coarse)').matches;
    var portrait = h >= w;
    var t = tier(w);
    var scale = uiScale(w, h, isTouch);

    // CSS variables (always available to the stylesheet)
    var vmin = Math.min(w, h), vmax = Math.max(w, h);
    root.style.setProperty('--vw', w + 'px');
    root.style.setProperty('--vh', h + 'px');
    root.style.setProperty('--vmin', vmin + 'px');
    root.style.setProperty('--vmax', vmax + 'px');
    root.style.setProperty('--dpr', String(+dpr.toFixed(2)));
    root.style.setProperty('--ui-scale', String(scale));
    var ins = safeInset();
    root.style.setProperty('--safe-t', ins.t);
    root.style.setProperty('--safe-r', ins.r);
    root.style.setProperty('--safe-b', ins.b);
    root.style.setProperty('--safe-l', ins.l);

    // body classes (state the current screen so CSS can branch)
    var b = document.body;
    if (b) {
      var key = t + '|' + (portrait ? 'p' : 'l') + '|' + (isTouch ? 't' : 'm') +
                '|' + (dpr > 1.5 ? 'hd' : 'sd');
      if (key !== lastKey) {
        lastKey = key;
        b.classList.remove('scr-phone','scr-tablet','scr-laptop','scr-desktop','scr-wide',
                           'scr-portrait','scr-landscape','scr-touch','scr-mouse','scr-hidpi');
        b.classList.add('scr-' + t);
        b.classList.add(portrait ? 'scr-portrait' : 'scr-landscape');
        b.classList.add(isTouch ? 'scr-touch' : 'scr-mouse');
        if (dpr > 1.5) b.classList.add('scr-hidpi');
      }
    }

    resizeRenderer(w, h, dpr);
  }

  /* ---- debounce + rAF so rapid resizes stay smooth ---- */
  var pending = false;
  function schedule () {
    if (pending) return;
    pending = true;
    (window.requestAnimationFrame || window.setTimeout)(function () {
      pending = false;
      update();
    }, 16);
  }

  function bind () {
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('orientationchange', function () {
      // iOS reports stale sizes for a moment after rotating
      schedule(); setTimeout(update, 250); setTimeout(update, 600);
    }, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', schedule, { passive: true });
      window.visualViewport.addEventListener('scroll', schedule, { passive: true });
    }
    document.addEventListener('fullscreenchange', function () { setTimeout(update, 60); });
    document.addEventListener('webkitfullscreenchange', function () { setTimeout(update, 60); });
    // if the game boots a little after this file, keep syncing briefly
    var tries = 0;
    var iv = setInterval(function () {
      update();
      if (++tries > 20 || window.__GAME) { /* keep a few extra */ }
      if (tries > 40) clearInterval(iv);
    }, 300);
  }

  function start () {
    update();
    bind();
    // expose a manual hook in case the game wants to force a re-sync
    window.e5UI0 = { update: update, refresh: schedule };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
