import { useEffect, useState } from "react";
import { Linking } from "react-native";

export interface CheckInDeepLinkPrefill {
  category?: string;
  complaint?: string;
  consentForDataAccess?: boolean;
  source?: string;
  rawUrl: string;
  receivedAt: number;
}

const parseBoolean = (value: string | null): boolean | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return undefined;
};

const parseCheckInDeepLink = (urlText: string | null): CheckInDeepLinkPrefill | null => {
  if (!urlText) {
    return null;
  }

  try {
    const url = new URL(urlText);
    const host = (url.host || "").toLowerCase();
    const path = (url.pathname || "").toLowerCase();
    const target = (url.searchParams.get("target") || "").toLowerCase();
    const checkinQuery = (url.searchParams.get("checkin") || "").toLowerCase();
    const isCheckIn =
      host === "checkin" ||
      path.includes("/checkin") ||
      target === "checkin" ||
      checkinQuery === "1" ||
      checkinQuery === "true";

    if (!isCheckIn) {
      return null;
    }

    const category = url.searchParams.get("category") || undefined;
    const complaint = url.searchParams.get("complaint") || undefined;
    const consent = parseBoolean(url.searchParams.get("consent"));
    const source = url.searchParams.get("source") || "qr";

    return {
      category,
      complaint,
      consentForDataAccess: consent,
      source,
      rawUrl: urlText,
      receivedAt: Date.now()
    };
  } catch {
    return null;
  }
};

export function useCheckInDeepLink() {
  const [prefill, setPrefill] = useState<CheckInDeepLinkPrefill | null>(null);

  useEffect(() => {
    const handleUrl = (urlText: string | null) => {
      const parsed = parseCheckInDeepLink(urlText);
      if (parsed) {
        setPrefill(parsed);
      }
    };

    Linking.getInitialURL().then(handleUrl).catch(() => {
      // Ignore malformed startup deep-link errors.
    });

    const subscription = Linking.addEventListener("url", (event) => handleUrl(event.url));
    return () => {
      subscription.remove();
    };
  }, []);

  return prefill;
}
