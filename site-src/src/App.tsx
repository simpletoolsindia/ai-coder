import { useEffect } from 'react';
import { Routes, Route, Link, NavLink, useLocation } from 'react-router-dom';
import { useTheme } from './hooks/useTheme';
import { Home } from './pages/Home';
import { Install } from './pages/Install';
import { Features } from './pages/Features';
import { Commands } from './pages/Commands';
import { Plugins } from './pages/Plugins';
import { Providers } from './pages/Providers';
import { Architecture } from './pages/Architecture';
import { Changelog } from './pages/Changelog';

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55v-1.93c-3.2.69-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.68 1.25 3.34.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.47.11-3.06 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.89-.39s1.97.13 2.89.39c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.77.12 3.06.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.66.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid place-items-center w-7 h-7 rounded-md bg-brand-600 text-white text-sm">🤖</span>
      <span className="text-ink-900 dark:text-ink-50">AI By</span>
    </Link>
  );
}

function Nav() {
  const items = [
    { to: '/', label: 'Home' },
    { to: '/install', label: 'Install' },
    { to: '/features', label: 'Features' },
    { to: '/commands', label: 'Commands' },
    { to: '/plugins', label: 'Plugins' },
    { to: '/providers', label: 'Providers' },
    { to: '/architecture', label: 'Architecture' },
    { to: '/changelog', label: 'Changelog' },
  ];
  return (
    <nav className="hidden md:flex items-center gap-1 text-sm">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.to === '/'}
          className={({ isActive }) =>
            `px-2.5 py-1.5 rounded-notion transition-colors ${
              isActive
                ? 'bg-ink-100 dark:bg-ink-800 text-ink-900 dark:text-ink-50'
                : 'text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-800/50'
            }`
          }
        >
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="p-1.5 rounded-notion text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-white/80 dark:bg-ink-900/80 border-b border-ink-100 dark:border-ink-800">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
        <Logo />
        <Nav />
        <div className="ml-auto flex items-center gap-1">
          <a
            href="https://github.com/simpletoolsindia/ai-coder"
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded-notion text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800"
            aria-label="GitHub"
          >
            <GitHubIcon />
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-ink-100 dark:border-ink-800 mt-24">
      <div className="max-w-6xl mx-auto px-4 py-10 text-sm text-ink-500 dark:text-ink-400 flex flex-wrap gap-4 items-center justify-between">
        <div>
          <p>© 2026 AI By · MIT License</p>
          <p className="mt-1">Built with ❤ for non-technical users who want real code agents.</p>
        </div>
        <div className="flex gap-3">
          <a className="notion-link" href="https://github.com/simpletoolsindia/ai-coder" target="_blank" rel="noreferrer">GitHub</a>
          <a className="notion-link" href="https://www.npmjs.com/package/ai-by" target="_blank" rel="noreferrer">npm</a>
          <a className="notion-link" href="https://github.com/simpletoolsindia/ai-coder/issues" target="_blank" rel="noreferrer">Issues</a>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [loc.pathname]);
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/install" element={<Install />} />
          <Route path="/features" element={<Features />} />
          <Route path="/commands" element={<Commands />} />
          <Route path="/plugins" element={<Plugins />} />
          <Route path="/providers" element={<Providers />} />
          <Route path="/architecture" element={<Architecture />} />
          <Route path="/changelog" element={<Changelog />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
