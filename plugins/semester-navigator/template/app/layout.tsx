import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Semester Navigator",
  description: "Your classes, assignments, grades, and next steps in one place.",
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
