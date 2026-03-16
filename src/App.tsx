// ── App.tsx ──────────────────────────────────────────────────────────────────
import React from "react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { AuthenticatedRoot } from "./app/AuthenticatedRoot";
import { ThemeProvider } from "./components/ui";
import { SessionProvider } from "./state/session";

export default function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <AuthenticatedRoot />
        <SpeedInsights />
      </SessionProvider>
    </ThemeProvider>
  );
}
