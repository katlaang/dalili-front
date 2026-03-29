import { Platform } from "react-native";

// ─── BASE TOKENS ──────────────────────────────────────────────────────────────
// Dark and light variants.  Existing screens that import `colors` continue
// to work unchanged — the alias below points to the dark defaults.

export const colorsDark = {
  bg:          "#0b1623",
  bgDeep:      "#071220",
  surface:     "#0f1e2e",
  surfaceAlt:  "#132333",
  border:      "#1a3045",
  borderLight: "#0f2035",
  text:        "#d4e8f5",
  textMid:     "#7aaccb",
  textMuted:   "#3a6080",
  primary:     "#2DD4BF",   // teal
  secondary:   "#0891b2",
  success:     "#22c55e",
  danger:      "#ef4444",
  warning:     "#f97316",
} as const;

export const colorsLight = {
  bg:          "#f0f7fc",
  bgDeep:      "#e4f0f8",
  surface:     "#ffffff",
  surfaceAlt:  "#f5fafd",
  border:      "#c8dfe9",
  borderLight: "#daeaf2",
  text:        "#0f2d42",
  textMid:     "#2e6b88",
  textMuted:   "#7aacbf",
  primary:     "#0d9488",   // deeper teal for legibility on white
  secondary:   "#0891b2",
  success:     "#16a34a",
  danger:      "#dc2626",
  warning:     "#ea580c",
} as const;

// Legacy alias — imported by existing screens as `colors.*`
export const colors = {
  bg:          colorsDark.bgDeep,
  surface:     colorsDark.surface,
  surfaceMuted:colorsDark.surfaceAlt,
  primary:     colorsDark.primary,
  secondary:   colorsDark.secondary,
  text:        colorsDark.text,
  textMuted:   colorsDark.textMuted,
  success:     colorsDark.success,
  danger:      colorsDark.danger,
  border:      colorsDark.border,
} as const;

// ─── TRIAGE LEVEL PALETTE ─────────────────────────────────────────────────────
export const triagePalette = {
  RED:    { bgDark:"#7f1d1d", bgLight:"#fef2f2", border:"#ef4444", borderLight:"#fca5a5", textDark:"#fca5a5", textLight:"#991b1b", dot:"#ef4444", label:"IMMEDIATE"   },
  ORANGE: { bgDark:"#7c2d12", bgLight:"#fff7ed", border:"#f97316", borderLight:"#fdba74", textDark:"#fdba74", textLight:"#9a3412", dot:"#f97316", label:"URGENT"       },
  YELLOW: { bgDark:"#713f12", bgLight:"#fefce8", border:"#eab308", borderLight:"#fde047", textDark:"#fde047", textLight:"#854d0e", dot:"#eab308", label:"LESS URGENT"  },
  GREEN:  { bgDark:"#14532d", bgLight:"#f0fdf4", border:"#22c55e", borderLight:"#86efac", textDark:"#86efac", textLight:"#166534", dot:"#22c55e", label:"NON-URGENT"   },
  BLUE:   { bgDark:"#1e3a5f", bgLight:"#eff6ff", border:"#3b82f6", borderLight:"#93c5fd", textDark:"#93c5fd", textLight:"#1e40af", dot:"#3b82f6", label:"DEFERRED"     },
} as const;

export const vulnerabilityPalette = {
  base: "#8B2C5E",
  soft: "#F7E8EF",
  border: "#D9A5BC",
  elderly: "#74214F",
  expectant: "#9C3E70",
  newborn: "#B85A88",
} as const;

// ─── TYPOGRAPHY ───────────────────────────────────────────────────────────────
export const typography = {
  headingFamily:
    Platform.OS === "ios"     ? "AvenirNext-DemiBold"
    : Platform.OS === "android" ? "serif"
    : "Georgia",
  bodyFamily:
    Platform.OS === "ios"     ? "AvenirNext-Regular"
    : Platform.OS === "android" ? "sans-serif"
    : "Trebuchet MS",
} as const;
