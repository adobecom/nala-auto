
// eslint-disable-next-line no-undef
const daisyui = require('daisyui')

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'custom-white': '#ffffff !important',
        'custom-black': '#000000 !important',
      },
    },
  },
  plugins: [daisyui],
  darkMode: 'class',
}

