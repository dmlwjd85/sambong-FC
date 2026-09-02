/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Noto Sans KR', 'sans-serif'],
        display: ['Black Han Sans', 'sans-serif'],
        oswald: ['Oswald', 'sans-serif'],
        bebas: ['Bebas Neue', 'Oswald', 'sans-serif'],
      },
      colors: {
        'pitch-bg': '#0a1912',
        'pitch-panel': '#11291d',
        'fut-gold': '#e8c271',
        'fut-gold-dark': '#b08d41',
        'fut-rare': '#38ff8e',
        'locker-bg': '#1a1a24',
      },
    },
  },
  plugins: [],
};
