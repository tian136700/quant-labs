"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useJapaneseRecognitionSubdomain } from "@/hooks/useJapaneseRecognitionSubdomain";
import { isJapaneseRecognitionPath } from "@/lib/japanese-recognition-host";
import { LangSwitch } from "./LangSwitch";
import { SiteNav } from "./SiteNav";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const onJaSubdomain = useJapaneseRecognitionSubdomain();
  const standalone =
    onJaSubdomain || isJapaneseRecognitionPath(pathname);

  if (standalone) {
    return <>{children}</>;
  }

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
