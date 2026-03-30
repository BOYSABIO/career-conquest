import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Conquest — The Job Search Campaign",
  description:
    "An interactive battle map visualizing a job search campaign. Watch the siege unfold in real time.",
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
