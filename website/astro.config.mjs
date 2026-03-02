import compress from "@playform/compress";
import critters from "astro-critters";
// @ts-check
import { defineConfig } from "astro/config";

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
