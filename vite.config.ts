import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
	fmt: {
		ignorePatterns: [
			".agents/**",
			".amp/**",
			".claude/**",
			".pi/**",
			".pnpm-store/**",
			".sc/**",
			"dist/**",
			"Glyph.icon/icon.json",
			"src-tauri/gen/**",
			"src-tauri/target/**",
		],
		useTabs: true,
	},
	lint: {
		ignorePatterns: [
			".agents/**",
			".amp/**",
			".claude/**",
			".pi/**",
			".pnpm-store/**",
			".sc/**",
			"dist/**",
			"src-tauri/gen/**",
			"src-tauri/target/**",
		],
		options: {
			typeAware: true,
			typeCheck: true,
		},
		overrides: [
			{
				files: ["integrations/popclip/**/*.js"],
				globals: { popclip: "readonly" as const },
			},
			{
				files: ["**/*.test.ts", "**/*.test.tsx"],
				rules: {
					"typescript/restrict-template-expressions": "off" as const,
					"typescript/unbound-method": "off" as const,
				},
			},
		],
	},
	plugins: lazyPlugins(() => [react(), tailwindcss()]),
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},

	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	//
	// 1. prevent Vite from obscuring rust errors
	clearScreen: false,
	// 2. tauri expects a fixed port, fail if that port is not available
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host
			? {
					protocol: "ws",
					host,
					port: 1421,
				}
			: undefined,
		watch: {
			// 3. tell Vite to ignore watching `src-tauri`
			ignored: ["**/src-tauri/**"],
		},
	},
	test: {
		setupFiles: ["./src/test/setup.ts"],
	},
}));
