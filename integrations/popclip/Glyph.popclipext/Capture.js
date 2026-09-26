const space = popclip.options.space;
if (typeof space !== "string" || !space.trim().startsWith("/")) {
	// PopClip recognizes this message and opens the extension's preferences.
	throw new Error("settings error");
}

// Encode each value separately so &, #, +, newlines and Unicode stay content.
// A JavaScript action also avoids URL actions' Option-key quoting behavior.
await popclip.openUrl(
	`glyph://create/note?space=${encodeURIComponent(space.trim())}&text=${encodeURIComponent(popclip.input.text)}`,
);
