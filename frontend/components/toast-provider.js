"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle, Info, WarningCircle, X } from "@phosphor-icons/react";

/* ----------------------------------------------------------------------------
   transitions-dev #22 — Toast.

   Used for things the payment sheet is not open for: a salary landing, an
   autopay collection that failed, an autopay toggle. Anything the user paid for
   gets the full checkout surface instead, because a toast is too quiet for a
   balance change.

   The stack is capped so a returning user with six notices does not come back
   to a wall of cards covering the page.
   -------------------------------------------------------------------------- */

const ToastContext = createContext({ push: () => {} });
const MAX_VISIBLE = 4;
const DISMISS_MS = 7000;

const TONES = {
  credit: { icon: CheckCircle, accent: "text-success" },
  debit: { icon: CheckCircle, accent: "text-charcoal" },
  milestone: { icon: CheckCircle, accent: "text-primary" },
  warning: { icon: WarningCircle, accent: "text-[var(--brand-orange)]" },
  info: { icon: Info, accent: "text-steel" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { ...toast, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), toast.duration ?? DISMISS_MS),
      );
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Bottom-centred on mobile, bottom-right on desktop — clear of the
          checkout sheet, which is the one thing that must not be covered. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        {toasts.map((toast) => {
          const tone = TONES[toast.tone] ?? TONES.info;
          const Icon = tone.icon;
          return (
            <div
              key={toast.id}
              className="t-toast is-open pointer-events-auto w-full max-w-sm rounded-xl border border-hairline bg-canvas p-3.5 shadow-[rgba(15,15,15,0.16)_0px_16px_48px_-8px]"
            >
              <div className="flex gap-3">
                <Icon size={20} weight="fill" className={`mt-0.5 shrink-0 ${tone.accent}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-charcoal">{toast.title}</p>
                  {toast.body && (
                    <p className="mt-0.5 text-[13px] leading-[1.5] text-steel">{toast.body}</p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => dismiss(toast.id)}
                  className="focus-ring -mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-stone hover:bg-surface hover:text-charcoal"
                >
                  <X size={14} weight="bold" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
