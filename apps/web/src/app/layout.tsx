import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Splity',
  description: 'Real-time bill splitting',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
