import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Providers } from "@/components/Providers";
import { LS_LOCALE } from "@/i18n/messages";
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
  const headerList = await headers();
  const serverLocale = parseLocale(headerList.get(LOCALE_HEADER)) ?? "en";

  return (
    <html lang={localeDocumentLang(serverLocale)} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k=${JSON.stringify(LS_LOCALE)};var l=localStorage.getItem(k);var c=document.cookie.match(new RegExp("(?:^|; )"+k+"=([^;]*)"));var cv=c?decodeURIComponent(c[1]):"";var p=location.pathname;var z=l==="zh"||cv==="zh"||p==="/zh"||p.indexOf("/zh/")===0;if(z)document.documentElement.lang="zh-CN";}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <Providers serverLocale={serverLocale}>{children}</Providers>
      </body>
    </html>
  );
}
