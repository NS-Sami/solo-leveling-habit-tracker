/** @type {import('tailwindcss').Config} */

/**
 * "System" blue — the holographic HUD blue of the Solo Leveling-style System windows.
 * We override Tailwind's `cyan` scale with it, so every `cyan-*` utility in the app
 * automatically speaks the System's colour.
 */
const systemBlue = {
  50: '#EEF7FF',
  100: '#D9EEFF',
  200: '#B8DEFF',
  300: '#8ACBFF',
  400: '#5CB4FF',
  500: '#3B9EFF',
  600: '#2280F0',
  700: '#1A64C8',
  800: '#1A50A0',
  900: '#1A417D',
  950: '#10264B',
};

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cyan: systemBlue,
        void: { 950: '#03060D', 900: '#060B16', 800: '#0A1222', 700: '#0F1A30', 600: '#16243F' },
        system: { DEFAULT: '#3B9EFF', glow: '#5CC8FF', dim: '#1A64C8' },
        wk1: '#00D2FF',
        wk2: '#A855F7',
        wk3: '#F59E0B',
        wk4: '#EF4444',
        gold: '#FBBF24',
      },
      fontFamily: {
        display: ['"Exo 2"', 'Rajdhani', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
        sans: ['Rajdhani', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 18px rgba(92, 180, 255, 0.22), inset 0 0 22px rgba(59, 158, 255, 0.08)',
        'glow-lg': '0 0 34px rgba(92, 180, 255, 0.45)',
        gold: '0 0 22px rgba(251, 191, 36, 0.45)',
        crimson: '0 0 24px rgba(239, 68, 68, 0.45)',
      },
      keyframes: {
        beam: { '0%,100%': { opacity: '0.55' }, '50%': { opacity: '1' } },
        flicker: { '0%,100%': { opacity: '1' }, '45%': { opacity: '0.85' }, '50%': { opacity: '0.6' }, '55%': { opacity: '0.9' } },
        scan: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(100%)' } },
        drift: { '0%': { transform: 'translateY(0)', opacity: '0' }, '10%': { opacity: '0.9' }, '100%': { transform: 'translateY(-110vh)', opacity: '0' } },
        shimmer: { '0%': { transform: 'translateX(-120%)' }, '100%': { transform: 'translateX(220%)' } },
      },
      animation: {
        beam: 'beam 2.4s ease-in-out infinite',
        flicker: 'flicker 3s linear infinite',
        scan: 'scan 6s linear infinite',
        shimmer: 'shimmer 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
