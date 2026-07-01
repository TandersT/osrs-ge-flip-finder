/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // OSRS-flavoured dark palette
        parchment: '#e2dbc8',
        gold: '#ffb83f',
        'osrs-yellow': '#ffff00',
        'osrs-green': '#00ff80',
        'osrs-red': '#ff6b6b',
        panel: '#1e1b16',
        'panel-light': '#2a251d',
        'panel-border': '#3d362a',
        ink: '#13110d',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
