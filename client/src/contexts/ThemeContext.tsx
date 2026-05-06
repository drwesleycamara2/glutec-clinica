import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme?: (theme: Theme) => void;
  toggleTheme?: () => void;
  setStorageScope?: (scope: string | null) => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

const LEGACY_THEME_KEY = "theme";
const SCOPED_THEME_PREFIX = "theme:";

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

function readStoredTheme(key: string): Theme | null {
  try {
    const value = localStorage.getItem(key);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(key: string, theme: Theme) {
  try {
    localStorage.setItem(key, theme);
  } catch {
    // Ignore storage failures; the visual theme still applies for the session.
  }
}

function storageKeyForScope(scope: string | null) {
  return scope ? `${SCOPED_THEME_PREFIX}${scope}` : LEGACY_THEME_KEY;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [storageScope, setStorageScope] = useState<string | null>(null);
  const storageKey = storageKeyForScope(storageScope);
  const [theme, setThemeState] = useState<Theme>(() => {
    if (!switchable) return defaultTheme;
    return readStoredTheme(LEGACY_THEME_KEY) ?? defaultTheme;
  });

  useEffect(() => {
    if (!switchable) return;
    const scopedTheme = readStoredTheme(storageKey);
    const fallbackTheme = storageScope ? readStoredTheme(LEGACY_THEME_KEY) : null;
    setThemeState(scopedTheme ?? fallbackTheme ?? defaultTheme);
  }, [defaultTheme, storageKey, storageScope, switchable]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    if (switchable) {
      writeStoredTheme(storageKey, theme);
    }
  }, [storageKey, theme, switchable]);

  const setTheme = switchable ? (nextTheme: Theme) => setThemeState(nextTheme) : undefined;
  const toggleTheme = switchable
    ? () => {
        setThemeState(prev => (prev === "light" ? "dark" : "light"));
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, setStorageScope, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
