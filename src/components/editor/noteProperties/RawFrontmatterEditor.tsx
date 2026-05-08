import { useEffect, useState } from "react";

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
	const [draft, setDraft] = useState(value);

	useEffect(() => {
		setDraft(value);
	}, [value]);

	const commitDraft = () => {
		if (readOnly || draft === value) return;
		onChange(draft.trim().length ? draft : null, draft);
	};

	return (
		<textarea
			className="frontmatterEditor"
			value={draft}
			rows={Math.max(6, draft.split("\n").length + 1)}
			onChange={(event) => {
				setDraft(event.target.value);
			}}
			onBlur={commitDraft}
			onKeyDown={(event) => {
				if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
				event.preventDefault();
				commitDraft();
			}}
			placeholder="---\ntitle: Untitled\n---"
			aria-label="Raw frontmatter"
			spellCheck={false}
			readOnly={readOnly}
		/>
	);
}
