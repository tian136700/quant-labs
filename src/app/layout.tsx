import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { LS_LOCALE } from "@/i18n/messages";
import { defaultMetadata } from "@/lib/seo";
import "./globals.css";
import "./mobile.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = defaultMetadata;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k=${JSON.stringify(LS_LOCALE)};var l=localStorage.getItem(k);var c=document.cookie.match(new RegExp("(?:^|; )"+k+"=([^;]*)"));var cv=c?decodeURIComponent(c[1]):"";var p=location.pathname;var z=l==="zh"||cv==="zh"||p==="/zh"||p.indexOf("/zh/")===0;if(z)document.documentElement.lang="zh-CN";}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
