import { Platform } from "react-native";

export const colors = {
  bg: "#f1ece4",
  surface: "#fff8ef",
  surfaceMuted: "#f5ede2",
  primary: "#0f5f73",
  secondary: "#c66f2d",
  text: "#1f2933",
  textMuted: "#5d6b79",
  success: "#1f8b78",
  danger: "#b0362e",
  border: "#dbcfc0"
} as const;

export const typography = {
  headingFamily:
    Platform.OS === "ios" ? "AvenirNext-DemiBold" : Platform.OS === "android" ? "serif" : "Georgia",
  bodyFamily: Platform.OS === "ios" ? "AvenirNext-Regular" : Platform.OS === "android" ? "sans-serif" : "Trebuchet MS"
} as const;
