"use client";

import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/I18nProvider";
import { AppShell } from "./AppShell";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <AppShell>{children}</AppShell>
    </I18nProvider>
  );
}
