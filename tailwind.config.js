/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Navy Blue — primary background, sidebar, chrome ───────────────────
        // True patriotic navy (not purple)
        navy: {
          50:  '#e8edf5',
          100: '#c5d0e6',
          200: '#9db1d5',
          300: '#7491c4',
          400: '#4f73b3',
          500: '#2d5a9e',   // medium navy
          600: '#1a4480',   // deep navy
          700: '#0f2f61',   // dark navy
          800: '#0a2050',   // darker navy
          900: '#061540',   // very dark navy — main bg
          950: '#030d2b',   // deepest navy — sidebar bg
        },
        // ── Red — CTAs, danger, accents ───────────────────────────────────────
        red: {
          50:  '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#B22234',   // Old Glory Red
          900: '#881337',
          950: '#4c0519',
        },
        // ── Gold — premium accents, caution states ────────────────────────────
        gold: {
          50:  '#fdf9ed',
          100: '#faf0d0',
          200: '#f5df9d',
          300: '#efc965',
          400: '#e8b43a',
          500: '#C9A961',   // EIP Gold
          600: '#b08a3a',
          700: '#8d6b2c',
          800: '#735524',
          900: '#5f451e',
          950: '#35250e',
        },
        // ── White / light surfaces ────────────────────────────────────────────
        white: '#FFFFFF',
        // ── Dark surface tokens ───────────────────────────────────────────────
        surface: {
          bg:      '#061540',   // deepest navy — page background
          sidebar: '#030d2b',   // sidebar
          card:    '#0f2f61',   // card background
          raised:  '#1a4480',   // elevated card / hover
          border:  '#2d5a9e',   // borders
          divider: '#1a3a6e',   // subtle dividers
        },
        // ── Text on dark surfaces ─────────────────────────────────────────────
        text: {
          primary:  '#FFFFFF',          // pure white — headings
          secondary:'#c5d0e6',          // light blue-white — body
          muted:    '#7491c4',          // medium blue — muted
          subtle:   '#4f73b3',          // dim blue — very muted
          red:      '#f43f5e',          // bright red — errors/accents
          gold:     '#C9A961',          // gold — caution/premium
        },
        // ── Legacy aliases (for compatibility with existing components) ────────
        brand: {
          50:  '#e8edf5',
          100: '#c5d0e6',
          200: '#9db1d5',
          300: '#7491c4',
          400: '#4f73b3',
          500: '#2d5a9e',
          600: '#1a4480',
          700: '#0f2f61',
          800: '#0a2050',
          900: '#061540',
          950: '#030d2b',
        },
        danger: {
          50:  '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#B22234',
          900: '#881337',
          950: '#4c0519',
        },
        // Dark palette — dark values for text on dark backgrounds
        dark: {
          50:  '#FFFFFF',
          100: '#e8edf5',
          200: '#c5d0e6',
          300: '#9db1d5',
          400: '#7491c4',
          500: '#4f73b3',
          600: '#2d5a9e',
          700: '#1a4480',
          800: '#0f2f61',
          900: '#061540',
          950: '#030d2b',
        },
        accent: {
          red:    '#B22234',
          orange: '#d97706',
          green:  '#22c55e',
          yellow: '#C9A961',
          gold:   '#C9A961',
          blue:   '#1a4480',
          cyan:   '#0891b2',
        }
      },
      fontFamily: {
        sans:  ['Inter', 'Helvetica Neue', 'system-ui', 'sans-serif'],
        serif: ['Georgia', 'Times New Roman', 'serif'],
        mono:  ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up':   'slideUp 0.3s ease-out',
        'fade-in':    'fadeIn 0.2s ease-out',
        'shimmer':    'shimmer 2s linear infinite',
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
        'glow':       '0 0 20px rgba(26, 68, 128, 0.5)',
        'glow-sm':    '0 0 10px rgba(26, 68, 128, 0.3)',
        'glow-red':   '0 0 16px rgba(178, 34, 52, 0.5)',
        'glow-gold':  '0 0 16px rgba(201, 169, 97, 0.4)',
        'card':       '0 2px 12px rgba(3, 13, 43, 0.4)',
        'card-hover': '0 6px 28px rgba(3, 13, 43, 0.6)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.08)',
      },
    },
  },
  plugins: [],
}
