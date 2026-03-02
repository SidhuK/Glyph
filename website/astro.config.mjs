// @ts-check
import { defineConfig } from 'astro/config';
import critters from 'astro-critters';
import compress from '@playform/compress';

// https://astro.build/config
export default defineConfig({
  integrations: [
    critters(),
    compress({
      CSS: true,
      HTML: true,
      JavaScript: true,
      Image: false,
      SVG: false,
    }),
  ],
});
