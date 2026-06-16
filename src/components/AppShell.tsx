"use client";

import type { ReactNode } from "react";
import { LangSwitch } from "./LangSwitch";
import { SiteNav } from "./SiteNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="page-wrap">
      <header className="page-header">
        <SiteNav />
        <LangSwitch />
      </header>
      <main>{children}</main>
    </div>
  );
}
