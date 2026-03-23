/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.html"],
  theme: {
    extend: {
      colors: {
        primary: '#ef4444',
        foreground: '#fafafa',
        'muted-foreground': '#a1a1aa',
        border: '#2d2d4a',
        card: '#1a1a2e',
        'card-foreground': '#fafafa',
      },
      fontFamily: {
        display: ['system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
