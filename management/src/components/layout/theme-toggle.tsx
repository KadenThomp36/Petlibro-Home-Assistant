import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '#/components/ui/button';

export type ColorTheme = 'light' | 'dark';

const STORAGE_KEY = 'petlibro-management-theme';
const THEME_EVENT = 'petlibro-management-theme-change';

export function ThemeToggle({
  compact = false,
}: {
  readonly compact?: boolean;
}) {
  const [theme, setThemeState] = useState<ColorTheme>('light');

  useEffect(() => {
    const applyStoredTheme = () => setThemeState(readTheme());
    applyStoredTheme();
    window.addEventListener('storage', applyStoredTheme);
    window.addEventListener(THEME_EVENT, applyStoredTheme);
    return () => {
      window.removeEventListener('storage', applyStoredTheme);
      window.removeEventListener(THEME_EVENT, applyStoredTheme);
    };
  }, []);

  const nextTheme = theme === 'light' ? 'dark' : 'light';
  return (
    <Button
      className="theme-toggle"
      variant="ghost"
      size={compact ? 'icon-sm' : 'sm'}
      type="button"
      aria-label={`Use ${nextTheme} theme`}
      title={`Use ${nextTheme} theme`}
      onClick={() => setTheme(nextTheme)}
    >
      {theme === 'light' ? (
        <Moon aria-hidden="true" />
      ) : (
        <Sun aria-hidden="true" />
      )}
      {compact ? null : (
        <span>{theme === 'light' ? 'Dark' : 'Light'} theme</span>
      )}
    </Button>
  );
}

function readTheme(): ColorTheme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') {
    applyTheme(stored);
    return stored;
  }
  const preferred = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
  applyTheme(preferred);
  return preferred;
}

function setTheme(theme: ColorTheme) {
  window.localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new Event(THEME_EVENT));
}

function applyTheme(theme: ColorTheme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}
