import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        htb: {
          black: '#0c0c0c',
          dark: '#101214',
          green: '#9be65e',
          neon: '#66ff66',
          gray: '#1a1d1f',
          accent: '#3cff64'
        }
      },
      boxShadow: {
        glow: '0 0 24px rgba(102, 255, 102, 0.25)'
      }
    },
  },
  plugins: [],
}
export default config
