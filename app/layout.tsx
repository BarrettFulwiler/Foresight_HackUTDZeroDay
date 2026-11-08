import type { Metadata } from "next";
import { BRAND, SLOGAN } from "../lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: `${BRAND} · ${SLOGAN}`,
  description: "Every account, every bank, one picture of where your money is headed.",
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
