import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "고이프라임 영정사진 | AI 영정사진 서비스",
  description: "AI로 만드는 나만의 영정사진. 미래 모습을 예측하고 추모사를 작성해 드립니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
