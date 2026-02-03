function titleForFile(relPath: string): string {
	const name =
		relPath.split("/").filter(Boolean).pop() ??
		relPath.split("/").pop() ??
		relPath;
	return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

export function parseNotePreview(
	relPath: string,
	text: string,
): { title: string; content: string } {
	// Extract title from frontmatter or first heading
	let title = titleForFile(relPath);
	// Check for YAML frontmatter title
	const fmMatch = text.match(
		/^---\n[\s\S]*?title:\s*["']?([^\n"']+)["']?[\s\S]*?\n---/,
	);
	if (fmMatch?.[1]) {
		title = fmMatch[1].trim();
	} else {
		// Check for first # heading
		const headingMatch = text.match(/^#\s+(.+)$/m);
		if (headingMatch?.[1]) {
			title = headingMatch[1].trim();
		}
	}
	// Strip frontmatter from content for display
	let content = text;
	if (text.startsWith("---\n")) {
		const endIdx = text.indexOf("\n---\n", 4);
		if (endIdx !== -1) {
			content = text.slice(endIdx + 5).trim();
		}
	}
	// Limit to first 20 lines for performance
	const lines = content.split("\n");
	if (lines.length > 20) {
		content = `${lines.slice(0, 20).join("\n")}\n…`;
	}
	return { title, content };
}

export { titleForFile };
