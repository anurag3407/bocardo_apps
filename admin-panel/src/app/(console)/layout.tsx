import { Suspense } from 'react';
import { Sidebar } from '@/components/shell/sidebar';

export default function ConsoleLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* the nav reads the current URL, so it streams in after the static shell */}
      <Suspense fallback={<aside className="w-full border-b border-border bg-surface md:min-h-screen md:w-56 md:border-r" />}>
        <Sidebar />
      </Suspense>
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
