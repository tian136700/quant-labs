import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Providers } from "@/components/Providers";
import { LS_LOCALE, type Locale } from "@/i18n/messages";
import {
  LOCALE_HEADER,
  localeDocumentLang,
  parseLocale,
} from "@/lib/locale-detect";
import { isZhForcedHost } from "@/lib/zh-forced-host";
import { defaultMetadata } from "@/lib/seo";
import "./globals.css";
import "./mobile.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = defaultMetadata;

function resolveLayoutLocale(
  host: string | null,
  headerLocale: string | null
): Locale {
  if (isZhForcedHost(host)) return "zh";
  return parseLocale(headerLocale) ?? "en";
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers();
  const serverLocale = resolveLayoutLocale(
    h.get("host"),
    h.get(LOCALE_HEADER)
  );

  return (
    <html lang={localeDocumentLang(serverLocale)} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k=${JSON.stringify(LS_LOCALE)};var h=location.hostname.toLowerCase();var forced=h==="finance.info-quests.com"||h==="japanese.info-quests.com";var l=localStorage.getItem(k);var c=document.cookie.match(new RegExp("(?:^|; )"+k+"=([^;]*)"));var cv=c?decodeURIComponent(c[1]):"";var p=location.pathname;var jp=p.indexOf("/jp-lesson")===0||p.indexOf("/jp-vocab")===0||p.indexOf("/jp-review")===0||p.indexOf("/admin/jp-lesson-teachers")===0||p.indexOf("/zh/admin/jp-lesson-teachers")===0;var en=p.indexOf("/en-lesson")===0||p.indexOf("/en-vocab")===0||p.indexOf("/admin/en-lesson-teachers")===0||p.indexOf("/zh/admin/en-lesson-teachers")===0;var z=forced||l==="zh"||cv==="zh"||p==="/zh"||p.indexOf("/zh/")===0||jp||en;if(z)document.documentElement.lang="zh-CN";}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <Providers serverLocale={serverLocale}>{children}</Providers>
      </body>
    </html>
  );
}
