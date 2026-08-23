import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Semester Navigator",
  description: "A student operating system for the semester.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
