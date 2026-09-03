/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#052659',
      },
      fontFamily: {
        alice: ['Alice', 'serif'],
        sans: ['Inter', 'Noto Sans Lao', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
