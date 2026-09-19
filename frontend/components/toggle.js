"use client";

import { useEffect, useRef, useState } from "react";

/* ----------------------------------------------------------------------------
   transitions-dev #27 — Toggle.

   The `is-init` class is what separates "the user just flipped this" from "this
   rendered already on". Without it, a switch that mounts in the on position
   plays the travel animation on page load, which reads as if something just
   turned itself on.
   -------------------------------------------------------------------------- */
export default function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  busy = false,
  id,
}) {
  const [initialised, setInitialised] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    // One frame later: the first paint places the thumb without motion.
    const timer = setTimeout(() => setInitialised(true), 60);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[14px] font-medium text-charcoal">
          {label}
        </label>
        {description && (
          <p className="mt-0.5 text-[12px] leading-[1.5] text-steel">{description}</p>
        )}
      </div>

      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled || busy}
        onClick={() => onChange?.(!checked)}
        data-on={checked ? "true" : "false"}
        className={`t-toggle ${initialised ? "is-init" : ""} focus-ring relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${
          checked ? "border-primary bg-primary" : "border-hairline-strong bg-surface"
        }`}
      >
        <span
          aria-hidden="true"
          className={`t-toggle-thumb absolute left-0.5 top-0.5 h-5 w-5 rounded-full shadow-[0_1px_2px_rgba(15,15,15,0.2)] ${
            checked ? "bg-canvas" : "bg-canvas"
          }`}
        />
        {busy && <span className="sr-only">Saving</span>}
      </button>
    </div>
  );
}
