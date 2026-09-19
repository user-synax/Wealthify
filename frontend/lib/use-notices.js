"use client";

import { useEffect, useRef } from "react";
import { useToast } from "../components/toast-provider";

/* ----------------------------------------------------------------------------
   Economy notices → toasts.

   The server decides what happened while the user was away (a salary, an
   autopay that collected, one that could not) and returns those as `notices`
   on every economy response. This turns them into toasts.

   De-duplication is by transaction reference, because several pages call
   economy routes and each call re-returns the same notice for the same event.
   Without the guard, opening the store after opening the dashboard would
   announce the same salary twice.
   -------------------------------------------------------------------------- */
export function useNotices(notices, { onNotice } = {}) {
  const toast = useToast();
  const seen = useRef(new Set());

  useEffect(() => {
    if (!notices?.length) return;
    for (const notice of notices) {
      const id = notice.transactionId ?? notice.reference ?? `${notice.kind}:${notice.title}`;
      if (seen.current.has(id)) continue;
      seen.current.add(id);

      toast.push({
        tone: notice.tone,
        title: notice.title,
        body: notice.body,
        // Credits linger: a payday is the best thing that happens in this app
        // and hiding it after the default window is a wasted moment.
        duration: notice.tone === "credit" || notice.tone === "milestone" ? 9000 : 7000,
      });

      onNotice?.(notice);
    }
  }, [notices, toast, onNotice]);
}

export default useNotices;
