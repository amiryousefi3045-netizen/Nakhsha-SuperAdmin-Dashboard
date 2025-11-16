/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f0f5f9",
          100: "#d4e3f1",
          200: "#b8d1e9",
          300: "#6b9ec3",
          400: "#3a7da6",
          500: "#1A5F7A" /* Primary brand color */,
          600: "#15496d",
          700: "#0d2e44",
          800: "#0a1f2e",
          900: "#061420",
        },
        accent: {
          50: "#fefcf8",
          100: "#fdf3e5",
          200: "#fbe9ce",
          300: "#f7d9a6",
          400: "#f0c26f",
          500: "#D9A441" /* Gold Accent */,
          600: "#c89032",
          700: "#a87028",
          800: "#7d5220",
          900: "#5c3d17",
        },
        "nakhsha-bg": "#FAFAF7" /* Marble White */,
        "nakhsha-text": "#2E2E2E" /* Deep Slate */,
        "nakhsha-border": "#C7CCD8" /* Cool Gray */,
      },
      borderColor: {
        DEFAULT: "#C7CCD8",
      },
    },
  },
  plugins: [],
};
