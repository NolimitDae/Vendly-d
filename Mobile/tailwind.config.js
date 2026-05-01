/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#7B2FF7',
        'primary-dark': '#5a20c4',
        'primary-light': '#9b5ef9',
        'primary-bg': '#f3ecfe',
      },
    },
  },
  plugins: [],
};
