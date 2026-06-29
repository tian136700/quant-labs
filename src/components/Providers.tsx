"use client";

import type { ReactNode } from "react";
import { EtrAuthProvider } from "@/contexts/EtrAuthProvider";
import { I18nProvider } from "@/i18n/I18nProvider";
import type { Locale } from "@/i18n/messages";
import { ActivityTracker } from "./ActivityTracker";
import { AppShell } from "./AppShell";

export function Providers({
  children,
  serverLocale = null,
}: {
  children: ReactNode;
  serverLocale?: Locale | null;
}) {
  return (
    <I18nProvider serverLocale={serverLocale}>
      <EtrAuthProvider>
        <ActivityTracker />
        <AppShell>{children}</AppShell>
      </EtrAuthProvider>
    </I18nProvider>
  );
}
