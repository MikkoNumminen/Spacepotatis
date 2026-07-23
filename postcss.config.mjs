const config = {
  plugins: {
    // Tailwind v4 moved the PostCSS plugin to its own package and folded
    // autoprefixer + @import handling in, so neither is listed separately.
    "@tailwindcss/postcss": {}
  }
};

export default config;
