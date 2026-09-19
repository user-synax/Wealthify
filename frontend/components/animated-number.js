"use client";

import { useEffect, useRef } from "react";
import { useMotionValue, useSpring, useMotionValueEvent, useReducedMotion } from "motion/react";
import { formatPaise } from "../lib/api";

/* ----------------------------------------------------------------------------
   A balance that counts to its new value.

   The reason to reach for motion.dev rather than a CSS class: the number has to
   travel *through* the values in between. A payment that changes ₹2,500 to
   ₹1,180 and simply swaps the digits reads as a re-render; one that counts down
   reads as money leaving.

   The performance detail that matters: the spring writes to a ref's
   `textContent`, not to React state. A 60fps counter driven by setState
   re-renders the whole card sixty times a second to move six characters — which
   on a mid-range phone is exactly where the rest of the page starts dropping
   frames. Touching the DOM node directly means the cartesian work happens once.

   `formatPaise` runs inside the frame callback for the same reason: formatting
   is the expensive part, and it should cost one call per frame, not one per
   render plus one per frame.
   -------------------------------------------------------------------------- */

export default function AnimatedNumber({ value = 0, className, duration = 0.9 }) {
  const ref = useRef(null);
  const reduceMotion = useReducedMotion();

  const target = useMotionValue(value);
  const spring = useSpring(target, { stiffness: 90, damping: 20, mass: 0.8, duration });

  // Push the engine toward the new value. `useSpring` handles the rest.
  useEffect(() => {
    target.set(value);
  }, [target, value]);

  useMotionValueEvent(spring, "change", (latest) => {
    if (ref.current) ref.current.textContent = formatPaise(Math.round(latest));
  });

  /* First paint is the real value rather than zero: a balance that counts up
     from nothing on every page load would imply the money had just arrived. */
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current || !ref.current) return;
    initialised.current = true;
    ref.current.textContent = formatPaise(value);
  }, [value]);

  // Reduced motion keeps the value, loses the travel.
  if (reduceMotion) {
    return <span className={className}>{formatPaise(value)}</span>;
  }

  return (
    <span ref={ref} className={className}>
      {formatPaise(value)}
    </span>
  );
}
