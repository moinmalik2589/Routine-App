import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths let the same build work on GitHub Pages
  // and on a normal domain without changing the repository name.
  base: './',
});
