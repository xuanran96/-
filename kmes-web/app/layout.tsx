import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '尚泷 KMES · 仓储位置管理',
  description: '服装仓储库位查询、扫码登记、移位与取出追溯工作台',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
