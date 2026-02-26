import "./globals.css";
import type { Metadata } from "next";
import { Prompt } from "next/font/google";

const prompt = Prompt({
  weight: ['400', '500', '600', '700'],
  subsets: ['thai', 'latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: "RSU Shuttle Bus Tracker",
  description: "Real-time shuttle bus tracking for Rangsit University",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className={prompt.className}>{children}</body>
    </html>
  );
}