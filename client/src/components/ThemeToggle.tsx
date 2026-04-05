import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/_core/hooks/useTheme';

/**
 * Componente para alternar entre tema claro e escuro
 * Exibe ícone de sol (claro) ou lua (escuro)
 * Estilizado com dourado metálico
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle-premium relative inline-flex items-center justify-center h-10 w-10 rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:glow-gold focus:outline-none focus:ring-2 focus:ring-gold-base focus:ring-offset-2 dark:focus:ring-offset-black-rich"
      aria-label={`Alternar para tema ${isDark ? 'claro' : 'escuro'}`}
      title={`Tema ${isDark ? 'claro' : 'escuro'}`}
    >
      {isDark ? (
        <Sun
          size={20}
          className="text-gold-base transition-transform duration-300 hover:rotate-180"
        />
      ) : (
        <Moon
          size={20}
          className="text-gold-base transition-transform duration-300 hover:rotate-180"
        />
      )}
    </button>
  );
}

export default ThemeToggle;
