import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Splity',
  description: 'Real-time bill splitting',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="crav-shell">
          <header className="crav-header">
            <Link href="/" className="crav-logo">
              Splity
            </Link>
            <span className="crav-tagline">Smashed &amp; split</span>
            <nav className="crav-nav">
              <Link href="/" className="crav-pill crav-pill--red">
                New bill
              </Link>
              <Link href="/" className="crav-pill crav-pill--ghost">
                Menu
              </Link>
            </nav>
          </header>

          <div className="crav-canvas">{children}</div>

          <footer className="crav-footer">
            <span className="crav-logo">Splity</span>
            <div>Snap · Tap · Split · Pay with Bit</div>
          </footer>
        </div>
      </body>
    </html>
  );
}
