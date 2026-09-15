import { Link, Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold text-lg">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white">
              IH
            </span>
            Image Hub
          </Link>
          <span className="text-sm text-neutral-500">Free &amp; runs in your browser</span>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-neutral-200 dark:border-neutral-800 py-6">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 text-sm text-neutral-500">
          No uploads, no accounts, no credits. Every conversion happens locally on your device.
        </div>
      </footer>
    </div>
  );
}
