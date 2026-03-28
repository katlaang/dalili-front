import { AppState, Platform } from "react-native";
import { useCallback, useEffect, useRef } from "react";

interface UseClientIdleLogoutOptions {
  enabled: boolean;
  timeoutMs?: number;
  onTimeout: () => void | Promise<void>;
}

export function useClientIdleLogout({
  enabled,
  timeoutMs = 300_000,
  onTimeout,
}: UseClientIdleLogoutOptions) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timingOutRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const clearIdleTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const scheduleIdleTimer = useCallback(() => {
    if (!enabled || timingOutRef.current) {
      return;
    }

    clearIdleTimer();
    timeoutRef.current = setTimeout(() => {
      timingOutRef.current = true;
      clearIdleTimer();
      Promise.resolve(onTimeoutRef.current()).finally(() => {
        timingOutRef.current = false;
      });
    }, timeoutMs);
  }, [clearIdleTimer, enabled, timeoutMs]);

  const markActive = useCallback(() => {
    if (!enabled || timingOutRef.current) {
      return;
    }
    scheduleIdleTimer();
  }, [enabled, scheduleIdleTimer]);

  useEffect(() => {
    if (!enabled) {
      clearIdleTimer();
      timingOutRef.current = false;
      return;
    }

    markActive();

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        markActive();
      }
    });

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "focus", "touchstart"];
      events.forEach((eventName) => window.addEventListener(eventName, markActive));

      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          markActive();
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        clearIdleTimer();
        appStateSubscription.remove();
        events.forEach((eventName) => window.removeEventListener(eventName, markActive));
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    }

    return () => {
      clearIdleTimer();
      appStateSubscription.remove();
    };
  }, [clearIdleTimer, enabled, markActive]);

  return markActive;
}
