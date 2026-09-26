# I WILL FIND YOU

A first-person browser horror game. **Design \u00b7 Code \u00b7 Sound: Huzaifaa** (with OreateAI).
Built on Three.js r160 (WebGL) with real-time shadows, post-processing (bloom,
GTAO ambient occlusion, filmic tone mapping) and a fully procedural WebAudio
soundtrack.

## How to run

**Just double-click `index.html`.** It works straight from your file system \u2014
no server and no build step.

> The 3D engine (Three.js + post-processing) is downloaded from the internet
> the first time you open it, so you need a working connection. If nothing
> loads, make sure no ad-blocker / firewall is blocking `cdn.jsdelivr.net`.

If your browser is very strict, you can also serve the folder locally:

```
cd i-will-find-you
python3 -m http.server 8000
# then open http://localhost:8000/
```

After updating any file, hard-refresh with **Ctrl+Shift+R** (Cmd+Shift+R on Mac)
to bypass the cache.

## Controls

| Key | Action |
|-----|--------|
| W A S D | Move |
| Mouse | Look |
| Shift | Run |
| Ctrl / C | Crouch |
| E | Interact / peek out the window |
| F | Flashlight |
| Q | Hide |
| **P** | **Cycle graphics quality: HIGH -> ULTRA -> 4K** |
| **H** | **Toggle the graphics / FPS indicator** |
| R | Restart |

## Install as an app / play offline (PWA)

The game ships as an installable Progressive Web App:

- `manifest.json` + `icons/` \u2014 app name, theme and icon (an eye in the dark).
- `sw.js` \u2014 a service worker that caches Three.js **and** every game file
  the first time you open it online. After that first load it runs **fully
  offline**, no internet needed, and the browser offers an *Install* option.

> Service workers and local module files only work over a server (or
> `localhost`), not from a `file://` double-click. Start the tiny server shown
> above once, and offline mode + install are enabled from then on. For a
> zero-setup online play, just double-click `single-file-version.html`.

See `cdn/README.md` for how to keep a literal local copy of the engine files.

## Project structure

```
index.html          Page shell: styles, HUD markup, engine boot splash,
                    the CDN module loader, and the classic-script loader.
style.css           All game / UI styling (extracted from the shell).
logic.js            The complete game: world building, lighting, AI, the
                    4 hide rounds, the window peek/jump-scare mechanic, all
                    endings and post-processing. This is the core engine.
4k.js               High-end graphics layer: anisotropic filtering, soft
                    (PCF) shadows, tighter shadow bias, env-map boost and a
                    cinematic grain + vignette grade. Engaged on ULTRA / 4K.
manifest.json       PWA manifest (name, icons, theme, fullscreen).
sw.js               Service worker \u2014 offline caching + install support.
icons/              App icons (512 / 192 / apple-touch / favicon).
cdn/                Notes + a script to keep a local copy of the 3D engine.
srm/                Modular add-on layer (loaded before logic.js):
  config.js           Graphics quality presets + shared state.
  save.js             Saves/restores the chosen quality in localStorage.
  graphics.js         Live 4K / super-sampling controller (resolution,
                      shadow-map size, exposure) driven through the running
                      renderer.
  hud.js              On-screen graphics / FPS indicator.
  animation.js        Extra gentle per-frame ambient light 'breathing'.
  audio.js            Optional extra audio sting layered on the game's
                      WebAudio graph.
  move.js             Movement tuning table.
  control.js          Binds the P and H add-on keys.
single-file-version.html   The original all-in-one build \u2014 identical game
                           in a single file, kept as a backup.
```

### How the pieces fit together

`index.html` imports Three.js and its post-processing add-ons from the CDN as
ES modules, exposes them as globals, then loads `srm/*.js` and finally
`logic.js` as ordinary scripts (in that order). The `srm/` modules register
themselves on a shared `window.SRM` object; `logic.js` runs the game and, once
everything exists, publishes the live renderer/scene/camera on `window.__GAME`
so the add-ons can drive real features (the 4K toggle actually changes the
render resolution). Every hook is guarded \u2014 if an add-on is missing the core
game still runs unchanged.

## A note on the \"4K\" option

Pressing **P** cycles the internal render resolution. HIGH matches the original
look; ULTRA and 4K super-sample the scene (render well above your screen's
native pixels, then downscale) and use larger shadow maps for a sharper,
cleaner image. 4K is demanding \u2014 if the frame-rate drops on a weaker GPU,
press P again to step back down.
