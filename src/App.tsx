import React from "react";
import { AuthenticatedRoot } from "./app/AuthenticatedRoot";
import { SessionProvider } from "./state/session";

export default function App() {
  return (
    <SessionProvider>
      <AuthenticatedRoot />
    </SessionProvider>
  );
}
