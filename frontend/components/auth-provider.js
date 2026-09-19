"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchMe, logout as apiLogout } from "../lib/auth";
import { fetchWallet } from "../lib/economy";
import { ApiError } from "../lib/api";

/* ----------------------------------------------------------------------------
   Session + wallet context.

   The wallet lives here rather than in each page because it is the number
   every surface displays, and three pages each fetching their own copy is how
   a dashboard ends up showing a different balance from the store.

   `applyWallet` is the important one: a payment response already carries the
   authoritative post-payment wallet, so the checkout success screen can update
   the shell instantly instead of re-fetching and briefly showing the old
   figure. Nothing here ever *computes* a balance — the value always comes from
   a server response.
   -------------------------------------------------------------------------- */

const AuthContext = createContext({
  status: "loading",
  user: null,
  wallet: null,
  clock: null,
  bills: null,
  refresh: async () => null,
  refreshWallet: async () => null,
  applyWallet: () => {},
  applyUser: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    status: "loading",
    user: null,
    wallet: null,
    clock: null,
    bills: null,
  });

  // Re-reads the session from the API (the source of truth). Returns the
  // session or null. Call it after login/signup and before pushing to a
  // protected route so the context is never stale behind the cookie.
  const refresh = useCallback(async () => {
    try {
      const data = await fetchMe();
      setState({
        status: "authenticated",
        user: data.user,
        wallet: data.wallet,
        clock: data.clock ?? null,
        bills: null,
      });
      return data;
    } catch {
      setState({ status: "unauthenticated", user: null, wallet: null, clock: null, bills: null });
      return null;
    }
  }, []);

  /* Re-read the balance *and* run the economy sync, which is what advances the
     simulated clock and collects autopay. Every economy route does this anyway;
     this is for the shell, so a payday lands without opening a page. */
  const refreshWallet = useCallback(async () => {
    try {
      const data = await fetchWallet();
      setState((current) =>
        current.status === "authenticated"
          ? {
              ...current,
              wallet: data.wallet,
              clock: data.clock ?? current.clock,
              // The shell badges the Expenses link from this, so the count has
              // to live in the context rather than in one page's local state.
              bills: data.bills ?? current.bills,
            }
          : current,
      );
      return data;
    } catch {
      return null;
    }
  }, []);

  const applyWallet = useCallback((wallet, clock) => {
    if (!wallet) return;
    setState((current) =>
      current.status === "authenticated"
        ? { ...current, wallet, clock: clock ?? current.clock }
        : current,
    );
  }, []);

  /* Used by the income and store pages, which award XP and can promote the
     career: those changes are on the user, not the wallet. */
  const applyUser = useCallback((patch) => {
    if (!patch) return;
    setState((current) =>
      current.status === "authenticated" && current.user
        ? { ...current, user: { ...current.user, ...patch } }
        : current,
    );
  }, []);

  const logout = useCallback(async () => {
    await apiLogout().catch(() => {});
    setState({ status: "unauthenticated", user: null, wallet: null, clock: null, bills: null });
  }, []);

  /* Spelled out rather than delegating to `refresh`, so the session write lands
     in a promise callback instead of synchronously in the effect body — the
     latter cascades a second render before the first commits. */
  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((data) => {
        if (cancelled) return;
        setState({
          status: "authenticated",
          user: data.user,
          wallet: data.wallet,
          clock: data.clock ?? null,
          bills: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        // A 401 means signed out; anything else (the API being down) is also
        // treated as no session, because every protected route re-checks.
        if (err instanceof ApiError || err instanceof Error) {
          setState({
            status: "unauthenticated",
            user: null,
            wallet: null,
            clock: null,
            bills: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ ...state, refresh, refreshWallet, applyWallet, applyUser, logout }),
    [state, refresh, refreshWallet, applyWallet, applyUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
