import type { Metadata } from 'next';
import { Providers } from '@/components/shell/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bocardo Console',
  description: 'Operations, finance and support console for Bocardo',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
