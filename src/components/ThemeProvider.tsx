"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";
type ResolvedTheme = Exclude<Theme, "system">;

interface ThemeContextValue {
  theme: Theme;
  systemTheme: ResolvedTheme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeInitScript({ html }: { html: string }) {
  return (
    <script
      id="theme-init"
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem("theme");
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function readSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme, systemTheme: ResolvedTheme) {
  const resolvedTheme = theme === "system" ? systemTheme : theme;
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = resolvedTheme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(readSystemTheme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = (event: MediaQueryListEvent | MediaQueryList) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    updateSystemTheme(media);
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    applyTheme(theme, systemTheme);
  }, [systemTheme, theme]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "theme") return;
      setThemeState(isTheme(event.newValue) ? event.newValue : "system");
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
    try {
      window.localStorage.setItem("theme", nextTheme);
    } catch {
      // Theme switching still works for this page view when storage is unavailable.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    systemTheme,
    resolvedTheme: theme === "system" ? systemTheme : theme,
    setTheme,
  }), [setTheme, systemTheme, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
