import { Link } from 'react-router-dom';
import { tools } from '../lib/tools';

export default function Hub() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Image Hub</h1>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400">
          A free toolbox for batch image work — no per-image clicking, no uploads to a server, no
          credits. Pick a tool below.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => {
          const card = (
            <div
              className={`h-full rounded-xl border p-5 transition ${
                tool.status === 'live'
                  ? 'border-neutral-200 bg-white hover:border-violet-400 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900'
                  : 'border-dashed border-neutral-200 bg-neutral-50 opacity-70 dark:border-neutral-800 dark:bg-neutral-900/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-medium">{tool.name}</h2>
                {tool.status === 'soon' && (
                  <span className="text-xs rounded-full bg-neutral-200 px-2 py-0.5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                    Coming soon
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                {tool.description}
              </p>
            </div>
          );

          return tool.status === 'live' ? (
            <Link key={tool.id} to={tool.path}>
              {card}
            </Link>
          ) : (
            <div key={tool.id} aria-disabled>
              {card}
            </div>
          );
        })}
      </div>
    </div>
  );
}
