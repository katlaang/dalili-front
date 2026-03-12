import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle
} from "react-native";
import { colors, typography } from "../../constants/theme";

interface AppShellProps {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ title, subtitle, rightAction, children }: AppShellProps) {
  return (
    <View style={styles.page}>
      <LinearGradient colors={["#0f5f73", "#14414f"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroTextBlock}>
            <Text style={styles.heroTitle}>{title}</Text>
            {subtitle ? <Text style={styles.heroSubtitle}>{subtitle}</Text> : null}
          </View>
          {rightAction}
        </View>
      </LinearGradient>
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </View>
  );
}

export function Card({
  title,
  children,
  style
}: {
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, style]}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

interface InputProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  onSubmitEditing?: () => void;
}

export function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  multiline,
  onSubmitEditing
}: InputProps) {
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        onSubmitEditing={onSubmitEditing ? () => onSubmitEditing() : undefined}
        style={[styles.input, multiline ? styles.inputMultiline : null]}
      />
    </View>
  );
}

export function ToggleField({
  label,
  value,
  onChange
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable style={styles.toggleRow} onPress={() => onChange(!value)}>
      <View style={[styles.toggleBox, value ? styles.toggleBoxOn : null]} />
      <Text style={styles.toggleText}>{label}</Text>
    </Pressable>
  );
}

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
}

export function ActionButton({ label, onPress, disabled, variant = "primary" }: ActionButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        variant === "primary" ? styles.buttonPrimary : null,
        variant === "secondary" ? styles.buttonSecondary : null,
        variant === "danger" ? styles.buttonDanger : null,
        variant === "ghost" ? styles.buttonGhost : null,
        disabled ? styles.buttonDisabled : null
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === "ghost" ? styles.buttonTextGhost : null,
          disabled ? styles.buttonTextDisabled : null
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function InlineActions({ children }: { children: React.ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

export function ChoiceChips({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <View style={styles.choiceWrap}>
        {options.map((option) => (
          <Pressable
            key={option}
            style={[styles.choiceChip, option === value ? styles.choiceChipActive : null]}
            onPress={() => onChange(option)}
          >
            <Text style={[styles.choiceText, option === value ? styles.choiceTextActive : null]}>
              {option.replaceAll("_", " ")}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function SectionTabs({
  tabs,
  value,
  onChange
}: {
  tabs: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.tabs}>
      {tabs.map((tab) => (
        <Pressable key={tab} onPress={() => onChange(tab)} style={[styles.tab, value === tab ? styles.tabActive : null]}>
          <Text style={[styles.tabText, value === tab ? styles.tabTextActive : null]}>{tab}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function MessageBanner({
  message,
  tone = "info"
}: {
  message: string | null;
  tone?: "info" | "error" | "success";
}) {
  if (!message) {
    return null;
  }
  return (
    <View
      style={[
        styles.banner,
        tone === "error" ? styles.bannerError : null,
        tone === "success" ? styles.bannerSuccess : null
      ]}
    >
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

export function JsonPanel({ value }: { value: unknown }) {
  return (
    <View style={styles.jsonBox}>
      <Text style={styles.jsonText}>{JSON.stringify(value, null, 2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 24
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  heroTextBlock: {
    flex: 1
  },
  heroTitle: {
    color: "#f4f5f1",
    fontSize: 28,
    fontFamily: typography.headingFamily,
    letterSpacing: 0.5
  },
  heroSubtitle: {
    color: "#d4e9ee",
    marginTop: 6,
    fontSize: 14,
    fontFamily: typography.bodyFamily
  },
  content: {
    padding: 16,
    gap: 16,
    maxWidth: 1100,
    width: "100%",
    alignSelf: "center"
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    gap: 12
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontFamily: typography.headingFamily
  },
  label: {
    color: colors.text,
    marginBottom: 4,
    fontFamily: typography.bodyFamily,
    fontSize: 13
  },
  field: {
    gap: 4
  },
  input: {
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: typography.bodyFamily
  },
  inputMultiline: {
    minHeight: 86,
    textAlignVertical: "top"
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  toggleBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff"
  },
  toggleBoxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  toggleText: {
    color: colors.text,
    fontFamily: typography.bodyFamily
  },
  button: {
    minHeight: 42,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonPrimary: {
    backgroundColor: colors.primary
  },
  buttonSecondary: {
    backgroundColor: colors.secondary
  },
  buttonDanger: {
    backgroundColor: colors.danger
  },
  buttonGhost: {
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: "#fff"
  },
  buttonDisabled: {
    opacity: 0.55
  },
  buttonText: {
    color: "#fff8ef",
    fontSize: 14,
    fontFamily: typography.bodyFamily
  },
  buttonTextGhost: {
    color: colors.text
  },
  buttonTextDisabled: {
    color: "#f0ebe4"
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  choiceWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  choiceChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff"
  },
  choiceChipActive: {
    backgroundColor: "#104f5f",
    borderColor: "#104f5f"
  },
  choiceText: {
    color: colors.text,
    fontFamily: typography.bodyFamily,
    fontSize: 12
  },
  choiceTextActive: {
    color: "#f7f5f1"
  },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "#efe4d6"
  },
  tab: {
    paddingVertical: 9,
    paddingHorizontal: 13
  },
  tabActive: {
    backgroundColor: colors.primary
  },
  tabText: {
    color: colors.text,
    fontFamily: typography.bodyFamily,
    textTransform: "capitalize"
  },
  tabTextActive: {
    color: "#f2ece4"
  },
  banner: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#8a7d6c",
    backgroundColor: "#f8efd8",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  bannerError: {
    borderColor: "#a1423f",
    backgroundColor: "#f8dfdc"
  },
  bannerSuccess: {
    borderColor: "#2c7768",
    backgroundColor: "#ddf2ea"
  },
  bannerText: {
    color: colors.text,
    fontFamily: typography.bodyFamily
  },
  jsonBox: {
    backgroundColor: "#1f2933",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#202a35",
    padding: 10
  },
  jsonText: {
    color: "#f5f7f9",
    fontFamily: "Courier New",
    fontSize: 12
  }
});
