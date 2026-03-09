module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'kano-blue': '#20416A',
        'kano-gold': '#D4AF37',
        'kano-ink': '#101820',
      },
      fontFamily: {
        'montserrat': ['Montserrat', 'sans-serif'],
        'poppins': ['Poppins', 'sans-serif'],
      },
      animation: {
        'fade-in-up': 'fadeIn 0.35s ease-out',
        'slide-in-bottom': 'slideInBottom 0.3s ease forwards',
      },
    },
  },
  plugins: [],
}
