/* srm/move.js \u2014 movement tuning table.
   Exposes tunable speeds so movement feel lives in one place. logic.js reads
   these values if present; otherwise it uses its own built-in defaults. */
window.SRM = window.SRM || {};

SRM.move = {
  walk:   2.6,   /* metres / second while walking            */
  run:    4.6,   /* metres / second while sprinting           */
  crouch: 1.4,   /* metres / second while crouched            */
  accel:  12.0,  /* acceleration blend factor                 */
  mouse:  0.0022 /* look sensitivity (radians / pixel)        */
};
