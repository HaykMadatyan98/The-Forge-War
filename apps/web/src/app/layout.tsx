import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Forge War',
  description: 'Forge the steel. Command the line.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;650;700&family=Source+Serif+4:opsz,wght@8..60,400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
