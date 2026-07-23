import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Photo Drop',
  description: 'Upload photos for approval before they sync to Google Photos',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#f8f9fa] text-gray-800 antialiased">{children}</body>
    </html>
  );
}
