import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./components/providers";

const iconPath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`;

export const metadata: Metadata = {
  title: "Proof of Vibe — 成都链上签到",
  description:
    "来过成都，留个链上印记。连接 Solana Devnet 钱包，把你的昵称和一句话写进可验证的链上签到记录。",
  icons: {
    icon: iconPath,
    shortcut: iconPath,
    apple: iconPath,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
