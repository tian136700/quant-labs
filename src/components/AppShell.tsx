"use client";

import type { ReactNode } from "react";
import { AdminNav } from "./AdminNav";
import { LangSwitch } from "./LangSwitch";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="page-wrap">
      <header className="page-header">
        <AdminNav />
        <LangSwitch />
      </header>
      <main>{children}</main>
    </div>
  );
}
