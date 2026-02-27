interface RawFrontmatterEditorProps {
	value: string;
	readOnly: boolean;
	/**
	 * Provides both the normalized frontmatter value and the raw editor text.
	 * `value` is trimmed and becomes `null` when the editor is empty, while
	 * `rawText` preserves the original whitespace exactly as typed.
	 */
	onChange: (value: string | null, rawText: string) => void;
}

export function RawFrontmatterEditor({
	value,
	readOnly,
	onChange,
}: RawFrontmatterEditorProps) {
	return (
		<textarea
			className="frontmatterEditor"
			value={value}
			rows={Math.max(6, value.split("\n").length + 1)}
			onChange={(event) => {
				const next = event.target.value;
				onChange(next.trim().length ? next : null, next);
			}}
			placeholder="---\ntitle: Untitled\n---"
			spellCheck={false}
			readOnly={readOnly}
		/>
	);
}
