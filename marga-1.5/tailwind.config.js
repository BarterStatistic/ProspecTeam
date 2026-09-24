/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Deep navy backgrounds
        navy: {
          900: '#0A1428',
          800: '#0B1E3B',
          700: '#12213F',
          600: '#1B2E52',
          500: '#25406C',
        },
        // Vibrant yellow — used to highlight key data/values
        gold: {
          DEFAULT: '#FFD11A',
          light: '#FFE066',
          dark: '#E6B800',
        },
        // Sky / light blue — secondary accent
        sky2: {
          DEFAULT: '#38BDF8',
          light: '#7DD3FC',
          dark: '#0EA5E9',
        },
        ink: {
          DEFAULT: '#F8FAFC',
          muted: '#94A3B8',
          faint: '#64748B',
        },
        state: {
          success: '#4ADE80',
          danger: '#F87171',
          warning: '#FBBF24',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
        // Tipografías del cotizador original (Urbanist titulares, DM Mono cifras).
        head: ['Urbanist', 'system-ui', 'sans-serif'],
        cifra: ['"DM Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 4px 24px -8px rgba(0, 0, 0, 0.5)',
        glow: '0 0 0 1px rgba(56, 189, 248, 0.15)',
      },
      keyframes: {
        drift: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(6%, -4%) scale(1.08)' },
          '66%': { transform: 'translate(-5%, 5%) scale(0.94)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        drift: 'drift 26s ease-in-out infinite',
        fadeIn: 'fadeIn 0.25s ease-out both',
      },
    },
  },
  plugins: [],
};
