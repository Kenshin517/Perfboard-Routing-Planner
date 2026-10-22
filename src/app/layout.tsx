import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Perfboard Routing Planner",
  description: "Plan wiring on dot perfboard (PCB bolong) and minimise jumpers.",
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
