/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bili: {
          pink: '#FB7299',
          pinkHover: '#fc8bab',
          blue: '#00AEEC',
          blueHover: '#00b5e5',
          bg: '#FFFFFF',
          grayBg: '#F1F2F3',
          grayHover: '#E3E5E7',
          border: '#E3E5E7',
          text: '#18191C',
          textLight: '#61666D',
          textMuted: '#9499A0',
        }
      }
    },
  },
  plugins: [],
}

