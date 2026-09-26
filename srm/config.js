/* srm/config.js \u2014 graphics quality presets + shared state.
   No dependencies. Loads first. */
window.SRM = window.SRM || {};

/* Each preset controls internal render resolution (prCap = super-sampling
   multiplier), shadow-map size, and tone-mapping exposure. */
SRM.presets = {
  HIGH:  { prCap: 1.75, shadow: 2048, exposure: 0.90, label: 'HIGH'  },
  ULTRA: { prCap: 2.20, shadow: 4096, exposure: 0.95, label: 'ULTRA' },
  '4K':  { prCap: 3.00, shadow: 4096, exposure: 1.00, label: '4K'    }
};
SRM.order   = ['HIGH', 'ULTRA', '4K'];
SRM.current = 'HIGH';
