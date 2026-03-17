import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'glutec-theme-preference';

/**
 * Hook para gerenciar tema claro/escuro com persistência
 * Detecta preferência do sistema e permite alternância manual
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  // Inicializar tema na montagem do componente
  useEffect(() => {
    // Verificar preferência salva
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    
    if (savedTheme) {
      setTheme(savedTheme);
      applyTheme(savedTheme);
    } else {
      // Detectar preferência do sistema
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const systemTheme: Theme = prefersDark ? 'dark' : 'light';
      setTheme(systemTheme);
      applyTheme(systemTheme);
    }

    setMounted(true);
  }, []);

  // Aplicar tema ao documento
  const applyTheme = (newTheme: Theme) => {
    const html = document.documentElement;
    
    if (newTheme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }

    // Salvar preferência
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
  };

  // Alternar tema
  const toggleTheme = () => {
    const newTheme: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  // Definir tema específico
  const setSpecificTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  return {
    theme,
    toggleTheme,
    setTheme: setSpecificTheme,
    mounted,
    isDark: theme === 'dark',
    isLight: theme === 'light',
  };
}
