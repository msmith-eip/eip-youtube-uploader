/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c7d7fe',
          300: '#a5bbfc',
          400: '#8196f8',
          500: '#6272f1',
          600: '#4f52e5',
          700: '#4140ca',
          800: '#3636a3',
          900: '#313281',
          950: '#1e1d4c',
        },
        dark: {
          50: '#f6f6f7',
          100: '#e1e3e8',
          200: '#c3c7d1',
          300: '#9aa1b1',
          400: '#6b748a',
          500: '#505870',
          600: '#3d4459',
          700: '#2e3347',
          800: '#1e2235',
          900: '#141828',
          950: '#0c0e1a',
        },
        accent: {
          red: '#ff4757',
          orange: '#ff6b35',
          green: '#2ed573',
          yellow: '#ffd32a',
          purple: '#a55eea',
          cyan: '#00d2d3',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      boxShadow: {
        'glow': '0 0 20px rgba(98, 114, 241, 0.3)',
        'glow-sm': '0 0 10px rgba(98, 114, 241, 0.2)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.3)',
        'card-hover': '0 8px 40px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [],
}

