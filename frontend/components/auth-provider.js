"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { fetchMe, logout as apiLogout } from "../lib/auth";

const AuthContext = createContext({
  status: "loading",
  user: null,
  wallet: null,
  refresh: async () => null,
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    status: "loading",
    user: null,
    wallet: null,
  });

  // Re-reads the session from the API (the source of truth). Returns the
  // session or null. Call it after login/signup and before pushing to a
  // protected route so the context is never stale behind the cookie.
  const refresh = useCallback(async () => {
    try {
      const data = await fetchMe();
      setState({ status: "authenticated", user: data.user, wallet: data.wallet });
      return data;
    } catch {
      setState({ status: "unauthenticated", user: null, wallet: null });
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    await apiLogout().catch(() => {});
    setState({ status: "unauthenticated", user: null, wallet: null });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ ...state, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
