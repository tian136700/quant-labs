"use client";

import type { ReactNode } from "react";
import { EtrAuthProvider } from "@/contexts/EtrAuthProvider";
import { I18nProvider } from "@/i18n/I18nProvider";
import { AppShell } from "./AppShell";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <EtrAuthProvider>
        <AppShell>{children}</AppShell>
      </EtrAuthProvider>
    </I18nProvider>
  );
}
