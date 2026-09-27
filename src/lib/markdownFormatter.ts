interface FormatterOptions {
	readonly version: 1;
	readonly arguments: readonly string[];
	readonly configFile: string;
}

type ExecutablePath = `/${string}`;

export type MarkdownFormatterSettings = FormatterOptions &
	(
		| { readonly enabled: false; readonly executable: ExecutablePath | "" }
		| { readonly enabled: true; readonly executable: ExecutablePath }
	);

export const DEFAULT_MARKDOWN_FORMATTER: MarkdownFormatterSettings = {
	version: 1,
	enabled: false,
	executable: "",
	arguments: ["-"],
	configFile: ".mdformat.toml",
};

export function isMarkdownFormatterSettings(value: unknown): value is MarkdownFormatterSettings {
	return (
		typeof value === "object" &&
		value !== null &&
		"version" in value &&
		value.version === 1 &&
		"enabled" in value &&
		typeof value.enabled === "boolean" &&
		"executable" in value &&
		typeof value.executable === "string" &&
		(value.executable === "" || value.executable.startsWith("/")) &&
		!value.executable.includes("\0") &&
		(!value.enabled || value.executable.length > 0) &&
		"arguments" in value &&
		Array.isArray(value.arguments) &&
		value.arguments.every((arg: unknown) => typeof arg === "string" && !arg.includes("\0")) &&
		"configFile" in value &&
		typeof value.configFile === "string" &&
		value.configFile.length > 0 &&
		!/[\\/\0]/.test(value.configFile) &&
		value.configFile !== "." &&
		value.configFile !== ".."
	);
}

export function normalizeMarkdownFormatter(value: unknown): MarkdownFormatterSettings {
	return isMarkdownFormatterSettings(value) ? value : DEFAULT_MARKDOWN_FORMATTER;
}
