import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TaskRecord } from "@/lib/tauri";
import { useTasks } from "../TasksContext";
import { isImeComposing } from "@/lib/imeComposition";

interface TitleDraft {
	base: string;
	value: string;
	committing: string | null;
}

function focusAtEnd(node: HTMLInputElement | null) {
	if (!node) return;
	node.focus({ preventScroll: true });
	node.setSelectionRange(node.value.length, node.value.length);
}

export function TaskTitleEditor({ record }: { record: TaskRecord }) {
	const { t } = useTranslation("shell");
	const { setTitle, collapse } = useTasks();
	const initial = { base: record.title, value: record.title, committing: null };
	const [draft, setDraft] = useState<TitleDraft>(initial);
	if (draft.base !== record.title) setDraft(initial);

	const revert = () => setDraft(initial);

	const commit = async (value: string) => {
		const next = value.trim();
		if (next === draft.committing) return;
		if (!next || next === record.title.trim()) {
			revert();
			return;
		}
		setDraft({ base: record.title, value, committing: next });
		const saved = await setTitle(record, next);
		if (!saved) revert();
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (isImeComposing(event)) return;
		if (event.key === "Enter") {
			event.preventDefault();
			void commit(event.currentTarget.value);
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			event.currentTarget.value = record.title;
			revert();
			collapse({ restoreFocus: true });
		}
	};

	return (
		<input
			ref={focusAtEnd}
			className="tasksTitleInput"
			type="text"
			aria-label={t("tasks.properties.title")}
			value={draft.value}
			spellCheck
			onChange={(event) =>
				setDraft({ base: record.title, value: event.target.value, committing: draft.committing })
			}
			onKeyDown={handleKeyDown}
			onBlur={(event) => void commit(event.currentTarget.value)}
		/>
	);
}
