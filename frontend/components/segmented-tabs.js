"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/* ----------------------------------------------------------------------------
   transitions-dev #16 — Tabs sliding.

   JS writes the active tab's offsetLeft / offsetWidth onto the pill; CSS owns
   the tween. The one subtlety the snippet calls out is the first paint and any
   resize: those writes must happen with the transition suspended, otherwise
   the pill animates in from translateX(0) / width 0 on every mount.
   -------------------------------------------------------------------------- */

const SIZES = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-3.5 text-sm",
};

export default function SegmentedTabs({ tabs, value, onChange, ariaLabel, size = "md" }) {
  const barRef = useRef(null);
  const pillRef = useRef(null);
  const tabRefs = useRef(new Map());

  const moveTo = useCallback((tab, animate) => {
    const pill = pillRef.current;
    if (!pill || !tab) return;

    if (!animate) {
      const previous = pill.style.transition;
      pill.style.transition = "none";
      pill.style.transform = `translateX(${tab.offsetLeft}px)`;
      pill.style.width = `${tab.offsetWidth}px`;
      void pill.offsetWidth; // reflow, so the snap is not tweened
      pill.style.transition = previous;
      return;
    }

    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
    pill.style.width = `${tab.offsetWidth}px`;
  }, []);

  // useLayoutEffect so the pill is positioned before the browser paints it.
  useLayoutEffect(() => {
    moveTo(tabRefs.current.get(value), false);
  }, [value, moveTo]);

  useEffect(() => {
    const onResize = () => moveTo(tabRefs.current.get(value), false);
    window.addEventListener("resize", onResize);
    // Web fonts land after first paint and change every tab's width.
    document.fonts?.ready.then(onResize).catch(() => {});
    return () => window.removeEventListener("resize", onResize);
  }, [value, moveTo]);

  return (
    <div ref={barRef} role="tablist" aria-label={ariaLabel} className="t-tabs max-w-full overflow-x-auto">
      <span ref={pillRef} aria-hidden="true" className="t-tabs-pill" />
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              if (node) tabRefs.current.set(tab.id, node);
              else tabRefs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => {
              if (!selected) onChange(tab.id);
            }}
            className={`t-tab focus-ring font-medium ${SIZES[size]}`}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span className="t-num ml-1.5 text-[11px] opacity-60">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
