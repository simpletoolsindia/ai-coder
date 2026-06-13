/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        // Notion-inspired palette
        ink: {
          50:  '#f7f7f5',
          100: '#efefec',
          200: '#e3e3e0',
          300: '#cfcec9',
          400: '#9b9a93',
          500: '#78776f',
          600: '#5a5953',
          700: '#373632',
          800: '#26251f',
          900: '#19181a',
        },
        brand: {
          50: '#f4f1ff',
          100: '#ebe5ff',
          200: '#d9ccff',
          300: '#bda7ff',
          400: '#9b7bff',
          500: '#7c5cff',
          600: '#6942eb',
          700: '#5832c2',
          800: '#48299c',
          900: '#3c247f',
        },
        accent: {
          red:    '#e03e3e',
          orange: '#d97330',
          yellow: '#dfab01',
          green:  '#0f7b6c',
          blue:   '#0b6e99',
          purple: '#6942eb',
          pink:   '#ad1a72',
          brown:  '#64473a',
        },
      },
      boxShadow: {
        notion: 'rgba(15, 15, 15, 0.05) 0px 0px 0px 1px, rgba(15, 15, 15, 0.1) 0px 3px 6px, rgba(15, 15, 15, 0.2) 0px 9px 24px',
        'notion-sm': 'rgba(15, 15, 15, 0.05) 0px 0px 0px 1px, rgba(15, 15, 15, 0.05) 0px 2px 4px',
        'notion-hover': 'rgba(15, 15, 15, 0.08) 0px 0px 0px 1px, rgba(15, 15, 15, 0.1) 0px 4px 8px',
      },
      borderRadius: {
        notion: '4px',
      },
      typography: () => ({
        DEFAULT: {
          css: {
            maxWidth: 'none',
          },
        },
      }),
    },
  },
  plugins: [],
};
