import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Railway container spinner",
  description: "Spin containers up and down with Railway's GraphQL API.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
