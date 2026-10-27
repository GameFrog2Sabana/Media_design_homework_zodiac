import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "星座アトリエ | Constellation Atelier",
  description:
    "星を動かし、線を引く。AIがその形を読み、この世にひとつだけの星座名と神話を生み出すWebGLゲーム。",
  applicationName: "星座アトリエ",
  keywords: [
    "星座",
    "WebGL",
    "生成AI",
    "Gemini",
    "インタラクション",
    "HCI",
  ],
  authors: [{ name: "Constellation Atelier" }],
  openGraph: {
    title: "星座アトリエ",
    description:
      "星を動かし、線を引く。AIが架空の星座と神話を生み出す、静かなWebGLゲーム。",
    type: "website",
    locale: "ja_JP",
    siteName: "星座アトリエ",
  },
  twitter: {
    card: "summary_large_image",
    title: "星座アトリエ",
    description:
      "星を動かし、線を引く。AIが架空の星座と神話を生み出す、静かなWebGLゲーム。",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#070c18",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
