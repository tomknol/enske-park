import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Enske Park – Parkeertarieven Enschede",
  description:
    "Wat kost parkeren waar je nu bent in Enschede? Live zonekaart en tarieven.",
  applicationName: "Enske Park",
  metadataBase: new URL("https://enske-park.vercel.app"),
  openGraph: {
    title: "Enske Park – Parkeertarieven Enschede",
    description:
      "Mobiele parkeerutility voor Enschede: zone en tarief op de kaart.",
    type: "website",
    locale: "nl_NL",
    siteName: "Enske Park",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050608",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nl" className={`${dmSans.variable} h-full`}>
      <body className="h-full overflow-hidden bg-[var(--background)] font-sans antialiased text-[var(--foreground)]">
        {children}
      </body>
    </html>
  );
}
