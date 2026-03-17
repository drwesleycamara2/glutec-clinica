/**
 * Design Tokens - Sistema Glutec Clínica
 * Paleta Premium: Dourado Metálico + Preto/Branco + Cinza
 * Versões: Claro (Pérola) e Escuro (Grafite)
 */

export const DESIGN_TOKENS = {
  // Cores Base - Dourado Metálico
  gold: {
    deep: '#8A6526',      // Dourado profundo (sombra)
    base: '#C9A55B',      // Dourado base (principal)
    soft: '#E8D29B',      // Dourado suave (destaque)
    light: '#F1D791',     // Dourado claro (brilho)
  },

  // Cores Base - Preto/Branco
  black: {
    rich: '#050505',      // Preto profundo (fundo escuro)
    panel: '#111214',     // Preto painel (cards escuro)
  },

  // Cores Base - Cinza
  gray: {
    dark: '#2F2F2F',      // Cinza escuro
    medium: '#6B6B6B',    // Cinza médio
    light: '#D3D3D3',     // Cinza claro
  },

  // Cores Base - Off-White/Pérola
  off: {
    white: '#F7F4EE',     // Off-white refinado (fundo claro)
    soft: '#FCFBF8',      // Branco suave (cards claro)
  },

  // Gradientes Metálicos Dourados
  gradients: {
    goldMetallic: 'linear-gradient(135deg, #8A6526 0%, #C9A55B 30%, #F1D791 50%, #B8863B 75%, #8A6526 100%)',
    goldSubtle: 'linear-gradient(135deg, #C9A55B 0%, #E8D29B 50%, #C9A55B 100%)',
    goldGlow: 'radial-gradient(circle, rgba(249, 215, 145, 0.4) 0%, rgba(201, 165, 91, 0.2) 100%)',
  },

  // Sombras Premium
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.1)',
    goldGlow: '0 0 20px rgba(201, 165, 91, 0.3)',
    goldGlowStrong: '0 0 30px rgba(201, 165, 91, 0.5)',
  },

  // Border Radius Premium
  radius: {
    sm: '0.375rem',       // 6px
    md: '0.5rem',         // 8px
    lg: '0.75rem',        // 12px
    xl: '1rem',           // 16px
    full: '9999px',
  },

  // Espaçamentos
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    xxl: '3rem',
  },

  // Tipografia
  typography: {
    fontFamily: {
      display: '"Inter", "SF Pro Display", "Manrope", sans-serif',
      body: '"Inter", "SF Pro", "Manrope", sans-serif',
    },
    fontSize: {
      xs: '0.75rem',      // 12px
      sm: '0.875rem',     // 14px
      base: '1rem',       // 16px
      lg: '1.125rem',     // 18px
      xl: '1.25rem',      // 20px
      '2xl': '1.5rem',    // 24px
      '3xl': '1.875rem',  // 30px
      '4xl': '2.25rem',   // 36px
    },
    fontWeight: {
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  },

  // Transições
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  },

  // Tema Escuro (Grafite + Dourado)
  dark: {
    background: '#050505',           // Fundo principal preto profundo
    surface: '#111214',              // Superfícies (cards, panels)
    surfaceAlt: '#1A1A1D',           // Superfícies alternativas
    border: 'rgba(201, 165, 91, 0.2)', // Bordas douradas sutis
    borderStrong: 'rgba(201, 165, 91, 0.4)', // Bordas douradas mais fortes
    text: {
      primary: '#FFFFFF',            // Texto principal branco
      secondary: '#D3D3D3',          // Texto secundário cinza claro
      tertiary: '#8B8B8B',           // Texto terciário cinza médio
      muted: '#6B6B6B',              // Texto muted cinza escuro
    },
    accent: '#C9A55B',               // Dourado base
    accentLight: '#E8D29B',          // Dourado suave
    accentDark: '#8A6526',           // Dourado profundo
    hover: 'rgba(201, 165, 91, 0.15)', // Hover background
    active: 'rgba(201, 165, 91, 0.25)', // Active background
  },

  // Tema Claro (Pérola + Dourado)
  light: {
    background: '#F7F4EE',           // Fundo principal off-white
    surface: '#FCFBF8',              // Superfícies (cards, panels)
    surfaceAlt: '#F5F2ED',           // Superfícies alternativas
    border: 'rgba(201, 165, 91, 0.25)', // Bordas douradas sutis
    borderStrong: 'rgba(201, 165, 91, 0.4)', // Bordas douradas mais fortes
    text: {
      primary: '#050505',            // Texto principal preto
      secondary: '#2F2F2F',          // Texto secundário cinza escuro
      tertiary: '#6B6B6B',           // Texto terciário cinza médio
      muted: '#8B8B8B',              // Texto muted cinza claro
    },
    accent: '#C9A55B',               // Dourado base
    accentLight: '#E8D29B',          // Dourado suave
    accentDark: '#8A6526',           // Dourado profundo
    hover: 'rgba(201, 165, 91, 0.08)', // Hover background
    active: 'rgba(201, 165, 91, 0.15)', // Active background
  },
};

// Exportar tipos para TypeScript
export type DesignTokens = typeof DESIGN_TOKENS;
export type Theme = 'light' | 'dark';
