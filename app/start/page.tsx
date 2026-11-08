import type { Metadata } from "next";
import { BRAND } from "../../lib/brand";
import StartForm from "./start-form";

export const metadata: Metadata = { title: `Get started · ${BRAND}` };

export default function StartPage() {
  return <StartForm />;
}
