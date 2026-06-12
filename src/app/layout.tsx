import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Strategy Compare — DCA vs RSI | US Stock Monitor",
  description:
    "Compare daily dollar-cost averaging vs RSI(6) threshold buying for US stocks and ETFs. Historical backtest with cached market data.",
  keywords: [
    "DCA",
    "RSI",
    "stock investing",
    "SPY",
    "QQQ",
    "backtest",
    "dollar cost averaging",
  ],
  openGraph: {
    title: "Strategy Compare — DCA vs RSI",
    description:
      "Backtest daily DCA against RSI-triggered buying for any US ticker.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
