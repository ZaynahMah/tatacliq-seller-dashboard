import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Royal blue family (primary brand)
        royal: {
          50: '#eef2ff',
          100: '#dde6ff',
          200: '#bccdff',
          300: '#8fa9ff',
          400: '#6383ff',
          500: '#3d5dff',
          600: '#2540f0',
          700: '#1d31cc',
          800: '#1c2da3',
          900: '#1d2c80',
        },
        // Pastel blue
        sky: {
          50: '#f0f7ff',
          100: '#e0efff',
          200: '#bcdfff',
          300: '#8cc7ff',
          400: '#5aa9ff',
        },
        // Bright pink accent
        magenta: {
          50: '#fff0f7',
          100: '#ffe1ef',
          200: '#ffc2df',
          300: '#ff97c8',
          400: '#ff5fa6',
          500: '#ff2e85',
          600: '#ed1370',
          700: '#c8055a',
        },
        // Soft pastel pink
        blush: {
          50: '#fef6f8',
          100: '#fdebf0',
          200: '#fbd5e0',
          300: '#f8b7c8',
        },
        // Light beige
        sand: {
          50: '#fdfaf6',
          100: '#f9f2e8',
          200: '#f1e5d2',
          300: '#e6d3b5',
        },
        // Neutral grays - cleaner than default
        ink: {
          50: '#fafafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'soft': '0 2px 8px -2px rgb(0 0 0 / 0.04), 0 4px 16px -4px rgb(0 0 0 / 0.06)',
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'lift': '0 8px 24px -8px rgb(37 64 240 / 0.18), 0 4px 12px -4px rgb(37 64 240 / 0.08)',
        'pink': '0 8px 24px -8px rgb(237 19 112 / 0.22)',
      },
      backgroundImage: {
        'mesh-1': 'radial-gradient(at 0% 0%, rgb(221 230 255) 0%, transparent 50%), radial-gradient(at 100% 0%, rgb(255 225 239) 0%, transparent 50%), radial-gradient(at 100% 100%, rgb(240 247 255) 0%, transparent 50%)',
        'mesh-royal': 'linear-gradient(135deg, rgb(61 93 255) 0%, rgb(29 49 204) 100%)',
        'mesh-pink': 'linear-gradient(135deg, rgb(255 95 166) 0%, rgb(237 19 112) 100%)',
      },
      animation: {
        'fade-up': 'fadeUp 0.5s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-dot': 'pulseDot 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% 0' },
          to: { backgroundPosition: '200% 0' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(0.9)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
