import appCss from "../App.css?inline";
import exportCss from "../components/export/exportDocument.css?inline";

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function buildStandaloneExportHtml(
	title: string,
	bodyHtml: string,
	kind: "html" | "pdf",
): string {
	const pageTitle = escapeHtml(title.trim() || "Untitled");

	return [
		"<!doctype html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="utf-8" />',
		'<meta name="viewport" content="width=device-width, initial-scale=1" />',
		`<title>${pageTitle}</title>`,
		"<style>",
		appCss,
		exportCss,
		"</style>",
		"</head>",
		`<body class="noteExportStandalone" data-export-kind="${escapeHtml(kind)}">`,
		bodyHtml,
		"</body>",
		"</html>",
	].join("\n");
}
