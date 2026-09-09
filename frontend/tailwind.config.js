/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        pitch: '#0d3b24',
        stadium: '#0a1220',
        gold: '#f5b301',
        crimson: '#e02f4e',
      },
    },
  },
  plugins: [],
};
