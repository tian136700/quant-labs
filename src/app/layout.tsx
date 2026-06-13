import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Providers } from "@/components/Providers";
import { LS_LOCALE } from "@/i18n/messages";
import type { Locale } from "@/i18n/messages";
import {
  LOCALE_HEADER,
  localeDocumentLang,
  parseLocale,
} from "@/lib/locale-detect";
import { defaultMetadata } from "@/lib/seo";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = defaultMetadata;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const serverLocale: Locale | null = parseLocale(headerStore.get(LOCALE_HEADER));

  return (
    <html
      lang={serverLocale ? localeDocumentLang(serverLocale) : "en"}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k=${JSON.stringify(LS_LOCALE)};var l=localStorage.getItem(k);var p=location.pathname;var z=l==="zh"||p==="/zh"||p.indexOf("/zh/")===0;if(z)document.documentElement.lang="zh-CN";}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <Providers serverLocale={serverLocale}>{children}</Providers>
      </body>
    </html>
  );
}
