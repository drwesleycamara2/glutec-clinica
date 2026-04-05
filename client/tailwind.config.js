/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
          950: '#451A03',
        },
        primary: '#F59E0B', // Um tom de dourado para a cor primária
        secondary: '#FDE68A', // Um tom mais claro para a cor secundária
        accent: '#D97706', // Um tom mais escuro para detalhes
        foreground: '#1F2937', // Cor de texto padrão (quase preto)
        'muted-foreground': '#6B7280', // Cor de texto secundária (cinza escuro)
      },
    },
  },
  plugins: [],
};
