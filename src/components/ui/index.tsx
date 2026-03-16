import { LinearGradient } from "expo-linear-gradient";
import React, { createContext, useContext, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { typography } from "../../constants/theme";

// ─── THEME SYSTEM ─────────────────────────────────────────────────────────────

export type ColorScheme = "dark" | "light";

export interface ThemeTokens {
  scheme:      ColorScheme;
  bg:          string;
  bgDeep:      string;
  surface:     string;
  surfaceAlt:  string;
  border:      string;
  borderLight: string;
  text:        string;
  textMid:     string;
  textMuted:   string;
  teal:        string;
  tealGlow:    string;
  inputBg:     string;
  headerGrad:  readonly [string, string];
  navActive:   string;
  success:     string;
  danger:      string;
  warning:     string;
}

const DARK: ThemeTokens = {
  scheme:      "dark",
  bg:          "#0b1623",
  bgDeep:      "#071220",
  surface:     "#0f1e2e",
  surfaceAlt:  "#132333",
  border:      "#1a3045",
  borderLight: "#0f2035",
  text:        "#d4e8f5",
  textMid:     "#7aaccb",
  textMuted:   "#3a6080",
  teal:        "#2DD4BF",
  tealGlow:    "rgba(45,212,191,0.15)",
  inputBg:     "#0b1623",
  headerGrad:  ["#0d3a50", "#0a2535"],
  navActive:   "#1a3a52",
  success:     "#22c55e",
  danger:      "#ef4444",
  warning:     "#f97316",
};

const LIGHT: ThemeTokens = {
  scheme:      "light",
  bg:          "#f0f7fc",
  bgDeep:      "#e4f0f8",
  surface:     "#ffffff",
  surfaceAlt:  "#f5fafd",
  border:      "#c8dfe9",
  borderLight: "#daeaf2",
  text:        "#0f2d42",
  textMid:     "#2e6b88",
  textMuted:   "#7aacbf",
  teal:        "#0d9488",
  tealGlow:    "rgba(13,148,136,0.10)",
  inputBg:     "#f5fafd",
  headerGrad:  ["#0d9488", "#0f766e"],
  navActive:   "#e0f2f1",
  success:     "#16a34a",
  danger:      "#dc2626",
  warning:     "#ea580c",
};

interface ThemeContextValue {
  theme:     ThemeTokens;
  setScheme: (s: ColorScheme) => void;
  toggle:    () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme:     DARK,
  setScheme: () => undefined,
  toggle:    () => undefined,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [scheme, setSchemeState] = useState<ColorScheme>("dark");
  const theme    = scheme === "dark" ? DARK : LIGHT;
  const setScheme = (s: ColorScheme) => setSchemeState(s);
  const toggle    = () => setSchemeState(s => s === "dark" ? "light" : "dark");
  return (
    <ThemeContext.Provider value={{ theme, setScheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

// ─── THEME TOGGLE BUTTON ──────────────────────────────────────────────────────
export function ThemeToggleButton() {
  const { theme: T, toggle } = useTheme();
  return (
    <Pressable
      onPress={toggle}
      style={[ui.themeBtn, { borderColor: T.border, backgroundColor: T.surfaceAlt }]}
    >
      <Text style={[ui.themeBtnText, { color: T.textMid }]}>
        {T.scheme === "dark" ? "☀ Light" : "◑ Dark"}
      </Text>
    </Pressable>
  );
}

// ─── SATIN WATERMARK (web only) ───────────────────────────────────────────────
function WatermarkBg({ scheme }: { scheme: ColorScheme }) {
  if (typeof document === "undefined") return null;
  const teal   = scheme === "dark" ? "#2DD4BF" : "#0d9488";
  const waveOp = scheme === "dark" ? 0.14 : 0.08;
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* @ts-ignore */}
      <svg width="100%" height="100%" viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", inset: 0, opacity: waveOp }}>
        <defs>
          <linearGradient id="uw1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#2DD4BF" stopOpacity="0.8"/>
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.4"/>
          </linearGradient>
          <linearGradient id="uw2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#0d9488" stopOpacity="0.6"/>
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.7"/>
          </linearGradient>
        </defs>
        <path d="M-200 170 C220 80,580 240,920 130 S1340 50,1700 200"  stroke="url(#uw1)" strokeWidth="85" fill="none" opacity="0.6"/>
        <path d="M-80  430 C340 330,720 480,1060 360 S1470 280,1780 430" stroke="url(#uw2)" strokeWidth="65" fill="none" opacity="0.5"/>
        <path d="M20   660 C400 550,780 700,1120 580 S1520 500,1820 650" stroke="url(#uw1)" strokeWidth="75" fill="none" opacity="0.42"/>
        <path d="M-100 880 C300 770,680 910,1020 800 S1420 720,1740 870" stroke="url(#uw2)" strokeWidth="55" fill="none" opacity="0.48"/>
      </svg>
      {/* @ts-ignore */}
      <svg width="100%" height="100%" viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0 }}>
        <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle"
          fontSize="200" fontWeight="900" letterSpacing="26"
          fill={teal} opacity="0.04"
          fontFamily="'Outfit','Trebuchet MS',sans-serif">
          DALILI
        </text>
      </svg>
    </View>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────
interface AppShellProps {
  title:        string;
  subtitle?:    string;
  rightAction?: React.ReactNode;
  children:     React.ReactNode;
}

export function AppShell({ title, subtitle, rightAction, children }: AppShellProps) {
  const { theme: T } = useTheme();
  return (
    <View style={[ui.page, { backgroundColor: T.bg }]}>
      <WatermarkBg scheme={T.scheme} />
      <LinearGradient
        colors={T.headerGrad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={ui.hero}
      >
        <View style={ui.heroTop}>
          <View style={ui.heroTextBlock}>
            <Text style={ui.heroTitle}>{title}</Text>
            {subtitle ? <Text style={ui.heroSubtitle}>{subtitle}</Text> : null}
          </View>
          {rightAction}
        </View>
      </LinearGradient>
      <ScrollView contentContainerStyle={ui.content}>{children}</ScrollView>
    </View>
  );
}

// ─── CARD ─────────────────────────────────────────────────────────────────────
export function Card({
  title, children, style,
}: {
  title?: string; children: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const { theme: T } = useTheme();
  return (
    <View style={[ui.card, { backgroundColor: T.surface, borderColor: T.border }, style]}>
      {title ? <Text style={[ui.cardTitle, { color: T.text }]}>{title}</Text> : null}
      {children}
    </View>
  );
}

// ─── LABEL ────────────────────────────────────────────────────────────────────
export function Label({ children }: { children: React.ReactNode }) {
  const { theme: T } = useTheme();
  return <Text style={[ui.label, { color: T.text }]}>{children}</Text>;
}

// ─── INPUT FIELD ─────────────────────────────────────────────────────────────
export function InputField({
  label, value, onChangeText, placeholder,
  secureTextEntry, multiline, onSubmitEditing,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; secureTextEntry?: boolean;
  multiline?: boolean; onSubmitEditing?: () => void;
}) {
  const { theme: T } = useTheme();
  return (
    <View style={ui.field}>
      <Label>{label}</Label>
      <TextInput
        value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={T.textMuted}
        secureTextEntry={secureTextEntry} multiline={multiline}
        onSubmitEditing={onSubmitEditing ? () => onSubmitEditing() : undefined}
        style={[ui.input, { backgroundColor: T.inputBg, borderColor: T.border, color: T.text },
          multiline && ui.inputMultiline]}
      />
    </View>
  );
}

// ─── TOGGLE FIELD ─────────────────────────────────────────────────────────────
export function ToggleField({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { theme: T } = useTheme();
  return (
    <Pressable style={ui.toggleRow} onPress={() => onChange(!value)}>
      <View style={[ui.toggleBox, { borderColor: T.border },
        value ? { backgroundColor: T.teal, borderColor: T.teal } : { backgroundColor: T.surface }
      ]} />
      <Text style={[ui.toggleText, { color: T.text }]}>{label}</Text>
    </Pressable>
  );
}

// ─── ACTION BUTTON ────────────────────────────────────────────────────────────
export function ActionButton({
  label, onPress, disabled, variant = "primary",
}: {
  label: string; onPress: () => void;
  disabled?: boolean; variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const { theme: T } = useTheme();
  const bg = () => {
    if (disabled) return T.border;
    if (variant === "primary")   return T.teal;
    if (variant === "secondary") return T.scheme === "dark" ? "#1a4a6a" : "#e0f2f1";
    if (variant === "danger")    return T.danger;
    return "transparent";
  };
  const fg = () => {
    if (disabled) return T.textMuted;
    if (variant === "ghost")     return T.text;
    if (variant === "secondary") return T.scheme === "dark" ? "#7aaccb" : T.teal;
    return T.scheme === "dark" && variant === "primary" ? "#0b1623" : "#fff";
  };
  return (
    <Pressable disabled={disabled} onPress={onPress}
      style={[ui.button, { backgroundColor: bg() },
        variant === "ghost" && { borderWidth: 1, borderColor: T.border },
        disabled && ui.buttonDisabled]}>
      <Text style={[ui.buttonText, { color: fg() }]}>{label}</Text>
    </Pressable>
  );
}

// ─── INLINE ACTIONS ───────────────────────────────────────────────────────────
export function InlineActions({ children }: { children: React.ReactNode }) {
  return <View style={ui.actions}>{children}</View>;
}

// ─── CHOICE CHIPS ────────────────────────────────────────────────────────────
export function ChoiceChips({
  label, options, value, onChange,
}: { label: string; options: readonly string[]; value: string; onChange: (v: string) => void }) {
  const { theme: T } = useTheme();
  return (
    <View style={ui.field}>
      <Label>{label}</Label>
      <View style={ui.choiceWrap}>
        {options.map(opt => (
          <Pressable key={opt}
            style={[ui.choiceChip, { borderColor: T.border, backgroundColor: T.surface },
              opt === value && { backgroundColor: T.teal, borderColor: T.teal }]}
            onPress={() => onChange(opt)}>
            <Text style={[ui.choiceText, { color: opt === value ? "#fff" : T.textMid }]}>
              {opt.replaceAll("_", " ")}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── SECTION TABS ────────────────────────────────────────────────────────────
export function SectionTabs({
  tabs, value, onChange,
}: { tabs: readonly string[]; value: string; onChange: (v: string) => void }) {
  const { theme: T } = useTheme();
  return (
    <View style={[ui.tabs, { borderColor: T.border, backgroundColor: T.surfaceAlt }]}>
      {tabs.map(t => (
        <Pressable key={t} onPress={() => onChange(t)}
          style={[ui.tab, t === value && { backgroundColor: T.teal }]}>
          <Text style={[ui.tabText, { color: t === value ? "#fff" : T.textMid }]}>{t}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── MESSAGE BANNER ───────────────────────────────────────────────────────────
export function MessageBanner({
  message, tone = "info",
}: { message: string | null; tone?: "info" | "error" | "success" }) {
  const { theme: T } = useTheme();
  if (!message) return null;
  const cfg = {
    info:    { bg: T.surfaceAlt,                                                          border: T.border,            fg: T.textMid  },
    error:   { bg: T.scheme === "dark" ? "#2a0a0a" : "#fef2f2",                          border: T.danger  + "80",    fg: T.danger   },
    success: { bg: T.scheme === "dark" ? "#0a2a1a" : "#f0fdf4",                          border: T.success + "80",    fg: T.success  },
  }[tone];
  return (
    <View style={[ui.banner, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Text style={[ui.bannerText, { color: cfg.fg }]}>{message}</Text>
    </View>
  );
}

// ─── JSON PANEL ───────────────────────────────────────────────────────────────
export function JsonPanel({ value }: { value: unknown }) {
  return (
    <View style={ui.jsonBox}>
      <Text style={ui.jsonText}>{JSON.stringify(value, null, 2)}</Text>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const ui = StyleSheet.create({
  page:           { flex: 1 },
  hero:           { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 },
  heroTop:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  heroTextBlock:  { flex: 1 },
  heroTitle:      { color: "#f0f9ff", fontSize: 26, fontFamily: typography.headingFamily, letterSpacing: 0.4 },
  heroSubtitle:   { color: "rgba(208,240,255,0.8)", marginTop: 5, fontSize: 13, fontFamily: typography.bodyFamily },
  content:        { padding: 16, gap: 16, maxWidth: 1100, width: "100%", alignSelf: "center" },
  card:           { borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  cardTitle:      { fontSize: 17, fontFamily: typography.headingFamily },
  label:          { marginBottom: 4, fontFamily: typography.bodyFamily, fontSize: 13 },
  field:          { gap: 4 },
  input:          { borderWidth: 1, borderRadius: 10, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, fontFamily: typography.bodyFamily },
  inputMultiline: { minHeight: 86, textAlignVertical: "top" },
  toggleRow:      { flexDirection: "row", alignItems: "center", gap: 10 },
  toggleBox:      { width: 18, height: 18, borderRadius: 4, borderWidth: 1 },
  toggleText:     { fontFamily: typography.bodyFamily },
  button:         { minHeight: 42, borderRadius: 10, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  buttonDisabled: { opacity: 0.55 },
  buttonText:     { fontSize: 14, fontFamily: typography.bodyFamily, fontWeight: "600" },
  actions:        { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceWrap:     { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  choiceChip:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  choiceText:     { fontFamily: typography.bodyFamily, fontSize: 12 },
  tabs:           { flexDirection: "row", flexWrap: "wrap", borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  tab:            { paddingVertical: 9, paddingHorizontal: 13 },
  tabText:        { fontFamily: typography.bodyFamily, textTransform: "capitalize" },
  banner:         { borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  bannerText:     { fontFamily: typography.bodyFamily, fontSize: 13 },
  jsonBox:        { backgroundColor: "#0f1c28", borderRadius: 10, borderWidth: 1, borderColor: "#1a2f42", padding: 10 },
  jsonText:       { color: "#a8d4ea", fontFamily: "Courier New", fontSize: 12 },
  themeBtn:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  themeBtnText:   { fontSize: 12, fontWeight: "600" },
});
