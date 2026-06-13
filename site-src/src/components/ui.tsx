export function CopyButton({ text }: { text: string }) {
  return (
    <button
      onClick={() => {
        try {
          navigator.clipboard?.writeText(text);
        } catch {}
      }}
      className="absolute top-2 right-2 text-xs px-2 py-1 rounded border border-ink-200 dark:border-ink-700 bg-white/80 dark:bg-ink-800/80 text-ink-500 dark:text-ink-300 hover:bg-white dark:hover:bg-ink-800"
    >
      Copy
    </button>
  );
}

export function Code({ children, lang }: { children: string; lang?: string }) {
  return (
    <div className="relative group">
      <pre className="not-prose bg-ink-50 dark:bg-ink-800/80 border border-ink-200 dark:border-ink-700 rounded-notion p-4 overflow-x-auto text-[13px] leading-relaxed">
        <code className={`language-${lang ?? 'bash'} font-mono`}>{children}</code>
      </pre>
      <CopyButton text={children} />
    </div>
  );
}

export function Pill({ children, color = 'default' }: { children: React.ReactNode; color?: 'default' | 'green' | 'blue' | 'purple' | 'red' | 'yellow' }) {
  const map: Record<string, string> = {
    default: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    blue: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
    purple: 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200',
    red: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
    yellow: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  };
  return <span className={`notion-pill ${map[color]}`}>{children}</span>;
}

export function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="notion-h1 mt-2 mb-6">{children}</h1>;
}

export function H2({ children, eyebrow }: { children: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mt-14 mb-4">
      {eyebrow ? <div className="notion-eyebrow mb-2">{eyebrow}</div> : null}
      <h2 className="notion-h2">{children}</h2>
    </div>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-ink-700 dark:text-ink-300 leading-relaxed">{children}</p>;
}

export function Callout({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' | 'success' }) {
  const map: Record<string, string> = {
    info: 'bg-brand-50 dark:bg-brand-900/20 border-brand-100 dark:border-brand-800 text-brand-900 dark:text-brand-100',
    warn: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100',
    success: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100',
  };
  return <div className={`notion-callout ${map[tone]}`}>{children}</div>;
}

export function Card({ children, title, icon }: { children: React.ReactNode; title?: string; icon?: React.ReactNode }) {
  return (
    <div className="notion-card p-5">
      {title ? (
        <div className="flex items-center gap-2 mb-2">
          {icon ? <span className="text-xl">{icon}</span> : null}
          <h3 className="font-semibold text-ink-900 dark:text-ink-50">{title}</h3>
        </div>
      ) : null}
      <div className="text-sm text-ink-600 dark:text-ink-300 leading-relaxed">{children}</div>
    </div>
  );
}

export function Grid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const cls =
    cols === 2
      ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
      : cols === 4
      ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'
      : 'grid grid-cols-1 md:grid-cols-3 gap-4';
  return <div className={cls}>{children}</div>;
}

export function Table({ rows }: { rows: { feature: string; supported: string | boolean }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-500 dark:text-ink-400">
            <th className="font-medium py-2 pr-4">Feature</th>
            <th className="font-medium py-2">Support</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-ink-100 dark:border-ink-800">
              <td className="py-2 pr-4 text-ink-800 dark:text-ink-100">{r.feature}</td>
              <td className="py-2 text-ink-600 dark:text-ink-300">
                {typeof r.supported === 'boolean' ? (r.supported ? '✓' : '—') : r.supported}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
