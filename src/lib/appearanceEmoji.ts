export interface AppearanceEmojiGroup {
	id: string;
	options: { id: string; label: string }[];
}

// Emoji 15.0 renders natively in Apple Color Emoji from macOS 13.3 onward;
// newer sequences would show as missing glyphs on older supported releases.
const MAX_EMOJI_VERSION = 15;

const EMOJI_PATTERN = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u;

/** Appearance icons are either built-in icon ids (ASCII kebab-case) or a literal emoji. */
export function isAppearanceEmoji(value: string | null | undefined): value is string {
	return Boolean(value && EMOJI_PATTERN.test(value));
}

function emojiLabel(name: string): string {
	return name.charAt(0).toUpperCase() + name.slice(1);
}

export async function loadAppearanceEmojiGroups(): Promise<AppearanceEmojiGroup[]> {
	const { default: groups } = await import("unicode-emoji-json/data-by-group.json");
	return groups.map((group) => ({
		id: group.slug,
		options: group.emojis
			.filter((emoji) => Number(emoji.emoji_version) <= MAX_EMOJI_VERSION)
			.map((emoji) => ({ id: emoji.emoji, label: emojiLabel(emoji.name) })),
	}));
}
