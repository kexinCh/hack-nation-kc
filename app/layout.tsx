import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Renter Readiness Copilot",
  description: "Browser-local affordable-housing application preparation demo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
