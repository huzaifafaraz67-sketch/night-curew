/* srm/save.js \u2014 tiny persistence layer for user settings.
   Restores the last-used graphics preset from localStorage. */
window.SRM = window.SRM || {};

SRM.save = {
  set: function (k, v) { try { localStorage.setItem('srm_' + k, v); } catch (e) {} },
  get: function (k)    { try { return localStorage.getItem('srm_' + k); } catch (e) { return null; } }
};

(function () {
  var q = SRM.save.get('quality');
  if (q && SRM.order && SRM.order.indexOf(q) >= 0) SRM.current = q;
})();
