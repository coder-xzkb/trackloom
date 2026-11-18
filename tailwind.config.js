/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{ts,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1d57bf',
        'primary-dark': '#164292',
        'primary-soft': '#eaf2ff',
        gray: {
          50: '#f5f8fd', 100: '#edf3fc', 200: '#dce7f7', 300: '#becfe7',
          400: '#637896', 500: '#49617f', 600: '#394f6c', 700: '#2b4260',
          800: '#1d3351', 900: '#13263e',
        },
      },
    },
  },
  plugins: [],
}
