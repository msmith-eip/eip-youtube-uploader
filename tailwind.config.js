/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── EIP Patriotic Palette ──────────────────────────────────────────────
        // Old Glory Blue — primary chrome, headers, nav, main accents
        brand: {
          50:  '#eef0f8',
          100: '#d5d8ef',
          200: '#aab1de',
          300: '#7f8acd',
          400: '#5f6bbf',
          500: '#4a58b0',
          600: '#3C3B6E',   // Old Glory Blue (primary)
          700: '#322f5c',
          800: '#28244a',
          900: '#1e1a38',
          950: '#130f26',
        },
        // Old Glory Red — CTAs, critical status, start-batch button
        danger: {
          50:  '#fdf2f4',
          100: '#fce7ea',
          200: '#f8c9d0',
          300: '#f29dab',
          400: '#e96a7e',
          500: '#d94057',
          600: '#B22234',   // Old Glory Red (primary)
          700: '#951c2b',
          800: '#7c1825',
          900: '#671621',
          950: '#3d0b13',
        },
        // Warm Gold — caution states, premium accents
        gold: {
          50:  '#fdf9ed',
          100: '#faf0d0',
          200: '#f5df9d',
          300: '#efc965',
          400: '#e8b43a',
          500: '#C9A961',   // EIP Gold (primary)
          600: '#b08a3a',
          700: '#8d6b2c',
          800: '#735524',
          900: '#5f451e',
          950: '#35250e',
        },
        // Surfaces — white, cream, near-black ink
        surface: {
          white:  '#FFFFFF',
          cream:  '#FAF6EE',
          divider:'#D4CFC4',
          ink:    '#1C1C1C',
          muted:  '#6B6B6B',
          subtle: '#9B9B9B',
        },
        // Dark surfaces for depth (kept for compatibility)
        dark: {
          50:  '#f6f5f3',
          100: '#e8e5df',
          200: '#d4cfc4',
          300: '#b5ae9f',
          400: '#8c8476',
          500: '#6b6358',
          600: '#524b41',
          700: '#3d3830',
          800: '#2a2620',
          900: '#1c1914',
          950: '#0f0d0a',
        },
        // Status / accent colors mapped to brand palette
        accent: {
          red:    '#B22234',   // Old Glory Red
          orange: '#d97706',
          green:  '#16a34a',
          yellow: '#C9A961',   // EIP Gold for caution
          gold:   '#C9A961',
          blue:   '#3C3B6E',
          cyan:   '#0891b2',
        }
      },
      fontFamily: {
        sans:    ['Inter', 'Helvetica Neue', 'system-ui', 'sans-serif'],
        serif:   ['Georgia', 'Times New Roman', 'serif'],
        mono:    ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-slow':  'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up':    'slideUp 0.3s ease-out',
        'fade-in':     'fadeIn 0.2s ease-out',
        'shimmer':     'shimmer 2s linear infinite',
      },
      keyframes: {
        slideUp: {
          '0%':   { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      boxShadow: {
        'glow':       '0 0 20px rgba(60, 59, 110, 0.35)',
        'glow-sm':    '0 0 10px rgba(60, 59, 110, 0.2)',
        'glow-red':   '0 0 16px rgba(178, 34, 52, 0.3)',
        'glow-gold':  '0 0 16px rgba(201, 169, 97, 0.3)',
        'card':       '0 2px 12px rgba(28, 25, 20, 0.12)',
        'card-hover': '0 6px 28px rgba(28, 25, 20, 0.18)',
        'card-inset': 'inset 0 1px 0 rgba(255,255,255,0.6)',
      },
    },
  },
  plugins: [],
}
