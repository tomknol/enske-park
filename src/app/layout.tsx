import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "EnsKe Park – Parkeertarieven Enschede",
  description:
    "Wat kost parkeren waar je nu bent in Enschede? Live zonekaart, tarieven en garagebezetting.",
  applicationName: "EnsKe Park",
  metadataBase: new URL("https://enske-park.vercel.app"),
  openGraph: {
    title: "EnsKe Park – Parkeertarieven Enschede",
    description:
      "Mobiele parkeerutility voor Enschede: zone, tarief en garagebezetting op de kaart.",
    type: "website",
    locale: "nl_NL",
    siteName: "EnsKe Park",
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
  themeColor: "#f8fafc",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nl" className={`${dmSans.variable} h-full`}>
      <body className="h-full overflow-hidden bg-slate-100 font-sans antialiased text-slate-900">
        {children}
      </body>
    </html>
  );
}
