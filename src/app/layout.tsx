import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Execution Agent",
  description: "Tell it your goal. It runs the job hunt.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
