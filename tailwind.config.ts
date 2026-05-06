import type { Config } from 'tailwindcss';
import containerQueries from '@tailwindcss/container-queries';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        display: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', '"Inter Tight"', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: {
          DEFAULT: '#0A0E1A',
          elev: '#101522',
          map: '#0B1020',
        },
        ink: {
          DEFAULT: '#F7F8FB',
          dim: '#A8B0C2',
          mute: '#6B7488',
        },
        amber: {
          400: '#FFE4A0',
          500: '#FFD470',
          600: '#E8B040',
        },
        line: '#1B2235',
      },
      letterSpacing: {
        display: '-0.035em',
        caps: '0.06em',
      },
      transitionTimingFunction: {
        camera: 'cubic-bezier(0.22, 1, 0.36, 1)',
        arrival: 'cubic-bezier(0.16, 1, 0.3, 1)',
        ui: 'cubic-bezier(0.4, 0, 0.2, 1)',
        exit: 'cubic-bezier(0.4, 0, 1, 1)',
      },
    },
  },
  plugins: [containerQueries],
} satisfies Config;
