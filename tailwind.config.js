/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#f7f4ee',
          card: '#fffdf8',
          border: '#e4ddce',
          inset: '#fbf8f1',
          'inset-border': '#efe9db',
        },
        ink: {
          DEFAULT: '#26221b',
          muted: '#9c927e',
          'muted-2': '#6e6553',
          faint: '#b3a88f',
        },
        sienna: {
          DEFAULT: '#8a3d22',
          dark: '#d98c5f',
        },
        charcoal: {
          DEFAULT: '#1d1a15',
          card: '#242019',
          border: '#373126',
          inset: '#201c16',
          'inset-border': '#2e2921',
        },
        cream: {
          DEFAULT: '#e9e2d2',
          muted: '#7d745f',
          faint: '#6b6350',
        },
      },
      fontFamily: {
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
        sans: ['"Libre Franklin"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
