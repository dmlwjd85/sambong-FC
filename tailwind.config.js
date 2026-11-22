/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-body)'],
        display: ['var(--font-title)'],
        oswald: ['var(--font-num)'],
        bebas: ['var(--font-num)'],
      },
      colors: {
        'pitch-bg': '#0b1220',
        'pitch-panel': '#111b2e',
        'fut-gold': '#e8c271',
        'fut-gold-dark': '#b08d41',
        'fut-rare': '#38ff8e',
        'locker-bg': '#1a1a24',
      },
    },
  },
  plugins: [],
};
