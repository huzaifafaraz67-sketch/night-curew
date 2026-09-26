/* srm/audio.js \u2014 optional extra audio sting, layered on the game's own
   procedural WebAudio graph via window.__GAME.sfxNoise (guarded). */
window.SRM = window.SRM || {};

SRM.audio = {
  sting: function () {
    var G = window.__GAME;
    if (!G || typeof G.sfxNoise !== 'function') return;
    try {
      G.sfxNoise(0.55, 1800, 0.40, 'highpass');
      G.sfxNoise(0.40,  120, 0.55, 'lowpass');
    } catch (e) {}
  }
};
