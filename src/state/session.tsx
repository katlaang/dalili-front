import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_API_BASE_URL, STORAGE_KEYS } from "../config/env";
import type { ApiContext, SessionActor } from "../api/types";

interface SessionState {
  bootstrapped: boolean;
  token: string | null;
  actor: SessionActor | null;
  role: string | null;
  username: string | null;
  baseUrl: string;
}

interface SessionActions {
  signIn: (payload: { token: string; actor: SessionActor; username: string; role?: string | null }) => Promise<void>;
  signOut: () => Promise<void>;
  setBaseUrl: (value: string) => Promise<void>;
  setRole: (value: string | null) => Promise<void>;
}

type SessionContextValue = SessionState &
  SessionActions & {
    apiContext: ApiContext | null;
  };

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({
    bootstrapped: false,
    token: null,
    actor: null,
    role: null,
    username: null,
    baseUrl: DEFAULT_API_BASE_URL
  });

  useEffect(() => {
    const bootstrap = async () => {
      const values = await AsyncStorage.multiGet([
        STORAGE_KEYS.token,
        STORAGE_KEYS.actor,
        STORAGE_KEYS.role,
        STORAGE_KEYS.username,
        STORAGE_KEYS.baseUrl
      ]);

      const map = Object.fromEntries(values);
      const token = map[STORAGE_KEYS.token] || null;
      const actorRaw = map[STORAGE_KEYS.actor] as SessionActor | null;
      const actor: SessionActor | null =
        actorRaw === "STAFF" || actorRaw === "PATIENT" || actorRaw === "KIOSK" ? actorRaw : null;

      setState({
        bootstrapped: true,
        token,
        actor,
        role: map[STORAGE_KEYS.role] || null,
        username: map[STORAGE_KEYS.username] || null,
        baseUrl: map[STORAGE_KEYS.baseUrl] || DEFAULT_API_BASE_URL
      });
    };

    bootstrap().catch(() => {
      setState((previous) => ({ ...previous, bootstrapped: true }));
    });
  }, []);

  const signIn = useCallback(async (payload: { token: string; actor: SessionActor; username: string; role?: string | null }) => {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.token, payload.token],
      [STORAGE_KEYS.actor, payload.actor],
      [STORAGE_KEYS.role, payload.role || ""],
      [STORAGE_KEYS.username, payload.username]
    ]);

    setState((previous) => ({
      ...previous,
      token: payload.token,
      actor: payload.actor,
      role: payload.role || null,
      username: payload.username
    }));
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.multiRemove([STORAGE_KEYS.token, STORAGE_KEYS.actor, STORAGE_KEYS.role, STORAGE_KEYS.username]);
    setState((previous) => ({
      ...previous,
      token: null,
      actor: null,
      role: null,
      username: null
    }));
  }, []);

  const setBaseUrl = useCallback(async (value: string) => {
    const trimmed = value.trim();
    await AsyncStorage.setItem(STORAGE_KEYS.baseUrl, trimmed);
    setState((previous) => ({
      ...previous,
      baseUrl: trimmed
    }));
  }, []);

  const setRole = useCallback(async (value: string | null) => {
    const normalized = value?.trim() || "";
    await AsyncStorage.setItem(STORAGE_KEYS.role, normalized);
    setState((previous) => ({
      ...previous,
      role: normalized || null
    }));
  }, []);

  const apiContext: ApiContext | null = useMemo(() => {
    if (!state.token) {
      return null;
    }
    return {
      baseUrl: state.baseUrl,
      token: state.token
    };
  }, [state.baseUrl, state.token]);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...state,
      signIn,
      signOut,
      setBaseUrl,
      setRole,
      apiContext
    }),
    [apiContext, setBaseUrl, setRole, signIn, signOut, state]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return context;
}
