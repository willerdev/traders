import type { Metadata } from "next";
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
  title: "TraderRank Pro — Trader Talent Discovery Platform",
  description:
    "Compete by submitting trading setups, earn rankings, payouts, and account scaling based on performance.",
  keywords: ["trading", "prop firm", "signals", "leaderboard", "funded account"],
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
