import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "VynDC - VynOps Suite",
  description: "Intelligent datacenter monitoring, incident management, and AI-powered operations for modern infrastructure.",
  icons: { icon: '/favicon-circle.png', shortcut: '/favicon-circle.png', apple: '/favicon-circle.png' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-slate-950 text-white antialiased">{children}</body>
    </html>
  );
}
