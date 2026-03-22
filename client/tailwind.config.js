/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      typography: {
        invert: {
          css: {
            '--tw-prose-body': 'rgb(214 211 209)',
            '--tw-prose-headings': 'rgb(254 243 199)',
            '--tw-prose-bold': 'rgb(254 243 199)',
            '--tw-prose-bullets': 'rgb(180 83 9)',
            '--tw-prose-counters': 'rgb(180 83 9)',
            '--tw-prose-links': 'rgb(251 191 36)',
            '--tw-prose-code': 'rgb(254 243 199)',
          },
        },
      },
    },
  },
  plugins: [],
};
