import { Platform } from "react-native";

const defaultWebUrl = "http://localhost:8181";
const defaultNativeUrl = "http://10.0.2.2:8181";
const defaultKioskDeviceId = "kiosk-front-desk-1";
const defaultKioskDeviceSecret = "kiosk-secret-change-me";
const browserWebUrl =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8181`
    : defaultWebUrl;

export const DEFAULT_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (Platform.OS === "web" ? browserWebUrl : defaultNativeUrl);

export const DEFAULT_KIOSK_DEVICE_ID =
  process.env.EXPO_PUBLIC_KIOSK_DEVICE_ID || defaultKioskDeviceId;

export const DEFAULT_KIOSK_DEVICE_SECRET =
  process.env.EXPO_PUBLIC_KIOSK_DEVICE_SECRET || defaultKioskDeviceSecret;

export const STORAGE_KEYS = {
  token: "dalili.session.token",
  actor: "dalili.session.actor",
  username: "dalili.session.username",
  role: "dalili.session.role",
  baseUrl: "dalili.config.baseUrl"
} as const;
