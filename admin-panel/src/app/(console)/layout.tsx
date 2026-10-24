import { Suspense } from 'react';
import { Sidebar } from '@/components/shell/sidebar';

export default function ConsoleLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* the nav reads the current URL, so it streams in after the static shell */}
      <Suspense fallback={<aside className="h-16 w-full bg-sidebar md:h-screen md:w-64" />}>
        <Sidebar />
      </Suspense>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
