"use client";

import type { ReactNode } from "react";
import { AppDeployVersionProvider } from "@/contexts/AppDeployVersionProvider";
import { EtrAuthProvider } from "@/contexts/EtrAuthProvider";
import { NavPreferencesProvider } from "@/contexts/NavPreferencesProvider";
import { PageFontScaleProvider } from "@/contexts/PageFontScaleProvider";
import { I18nProvider } from "@/i18n/I18nProvider";
import type { Locale } from "@/i18n/messages";
import { ActivityTracker } from "./ActivityTracker";
import { AppShell } from "./AppShell";
import { Worker1102ClientGuard } from "./Worker1102ClientGuard";

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
        <NavPreferencesProvider>
          <AppDeployVersionProvider>
            <PageFontScaleProvider>
              <ActivityTracker />
              <Worker1102ClientGuard />
              <AppShell>{children}</AppShell>
            </PageFontScaleProvider>
          </AppDeployVersionProvider>
        </NavPreferencesProvider>
      </EtrAuthProvider>
    </I18nProvider>
  );
}
