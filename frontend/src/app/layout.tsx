import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar, MainContent } from "@/components/layout/navbar";
import { AuthHydrator } from "@/components/auth-hydrator";
import { PresenceTracker } from "@/components/presence-tracker";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tradeguard — Smart Invest",
  description:
    "Put capital to work with Smart Invest: daily yield, clear fees, and USDT wallet withdrawals after KYC.",
  keywords: ["investing", "smart invest", "daily yield", "USDT", "tradeguard"],
};

/** Lock zoom/pinch-resize on phones so the trading UI stays fixed. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#121a2e" },
    { media: "(prefers-color-scheme: light)", color: "#F1F5F9" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider />
        <AuthHydrator />
        <PresenceTracker />
        <Navbar />
        <MainContent>{children}</MainContent>
      </body>
    </html>
  );
}
