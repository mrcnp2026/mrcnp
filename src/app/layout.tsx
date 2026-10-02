import type { Metadata } from 'next';
import './globals.css';

// 게이트 1 뼈대. 글꼴(Noto Sans·Noto Sans Thai)과 언어(lang)는 게이트 3 다국어에서 정한다 (7-11).
export const metadata: Metadata = {
  title: 'Attendance',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
