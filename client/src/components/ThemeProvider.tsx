import React, { useEffect, ReactNode } from 'react';
import { useTheme } from '@/_core/hooks/useTheme';

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Componente Provider que aplica tema globalmente
 * Deve envolver toda a aplicação
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const { mounted } = useTheme();

  // Evitar flash de conteúdo não-estilizado
  if (!mounted) {
    return <>{children}</>;
  }

  return <>{children}</>;
}

export default ThemeProvider;
