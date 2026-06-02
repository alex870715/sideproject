/**
 * @type {import('tailwindcss').Config}
 * Tailwind 前綴與內容腳本樣式隔離；wvp 為早期代號，與對外品牌「綁手手神器」無需一致。
 */
export default {
  prefix: "wvp-",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Helvetica Neue", "Arial"],
      },
      boxShadow: {
        chip: "0 4px 18px rgb(15 23 42 / 16%)",
      },
    },
  },
  plugins: [],
};
