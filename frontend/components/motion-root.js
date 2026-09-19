"use client";

import { LazyMotion, domAnimation } from "motion/react";

/* ----------------------------------------------------------------------------
   motion.dev, tree-shaken.

   One decision carries the whole bundle here: `m` plus `LazyMotion` instead of
   the `motion` component.

   Importing `motion.div` pulls the entire library into the client bundle —
   gestures, drag, the projection engine, every easing — for the handful of
   places this app animates. `m.div` inside `LazyMotion` ships only the feature
   bundle named below and loads the rest on demand.

   `domAnimation` is that bundle: enter/exit animations, variants, value
   animation and the transform/path renderers. That is the full list of what
   this app needs.

   `domMax` is deliberately *not* used. It adds drag, pan and — the close call —
   layout projection, which would let the freelance board animate its cards into
   new positions when a job goes ready. It roughly doubles the bundle for one
   reorder, so the board re-sorts without animating instead.

   Everything else on screen — the modal, the toast, the PIN shake, the success
   check, the countdown bars — is CSS keyed off a class or an attribute, which
   is free. motion.dev is reserved for what CSS genuinely cannot do: animating
   *values* and animating an element out of the tree.
   -------------------------------------------------------------------------- */

export function MotionRoot({ children }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
