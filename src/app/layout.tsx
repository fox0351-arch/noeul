import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PwaProvider from "@/components/PwaProvider";
import WakeLockProvider from "@/components/WakeLockProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "노을 - 시니어 걷기 내비",
  applicationName: "노을 - 시니어 걷기 내비",
  description: "갈맷길·제주올레길·둘레길을 안전하게 따라가는 시니어 전용 걷기 내비게이션",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "노을",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/icon-192.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#d97706",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaProvider>
          <WakeLockProvider>{children}</WakeLockProvider>
        </PwaProvider>
      </body>
    </html>
  );
}
