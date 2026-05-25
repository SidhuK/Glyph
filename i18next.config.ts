import { defineConfig } from "i18next-cli";

export default defineConfig({
	locales: ["en", "es", "de", "fr", "pt-BR", "ja", "ko"],
	extract: {
		input: ["src/**/*.{ts,tsx}"],
		output: "src/i18n/locales/{{language}}/{{namespace}}.json",
	},
});
