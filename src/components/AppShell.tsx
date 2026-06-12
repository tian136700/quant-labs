"use client";

import type { ReactNode } from "react";
import { LangSwitch } from "./LangSwitch";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="page-header">
        <LangSwitch />
      </header>
      {children}
    </>
  );
}
