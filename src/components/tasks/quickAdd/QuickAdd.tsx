import { parseISO } from "date-fns";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/shadcn/button";
import { type QuickAddToken, parseQuickAdd } from "@/lib/taskFields/quickAdd";
import { useTaskCreate } from "../data/useTaskCreate";
import { TaskStatusGlyph } from "../row/TaskStatusGlyph";
import { useTasks } from "../TasksContext";
import { QuickAddChips } from "./QuickAddChips";
import { QuickAddInput } from "./QuickAddInput";
import { QuickAddTargetPicker } from "./QuickAddTargetPicker";

function withoutToken(value: string, token: QuickAddToken): string {
	return `${value.slice(0, token.start)}${value.slice(token.end)}`
		.replace(/\s{2,}/g, " ")
		.trimStart();
}

export function QuickAdd({ due }: { due: string | null }) {
	const { t } = useTranslation("shell");
	const { today, quickAddTarget, closeQuickAdd } = useTasks();
	const { createTask, isCreating } = useTaskCreate(today);
	const [value, setValue] = useState("");
	const [presetDue, setPresetDue] = useState(due);
	const parsed = parseQuickAdd(value, parseISO(today));
	const title = parsed.title.trim();
	const canAdd = title.length > 0 && quickAddTarget !== null && !isCreating;

	const submit = async () => {
		if (!canAdd || quickAddTarget === null) return;
		const added = await createTask({
			target: quickAddTarget,
			title,
			due: parsed.due ?? presetDue,
			priority: parsed.priority,
		});
		if (added) setValue("");
	};

	return (
		<div
			className="tasksQuickAdd"
			role="group"
			aria-label={t("tasks.quickAdd.label")}
			onKeyDown={(event) => {
				if (event.key !== "Escape" || !(event.target instanceof Node)) return;
				if (!event.currentTarget.contains(event.target)) return;
				event.preventDefault();
				closeQuickAdd();
			}}
		>
			<div className="tasksQuickAddField">
				<span className="tasksQuickAddGlyph" aria-hidden="true">
					<TaskStatusGlyph status="todo" />
				</span>
				<QuickAddInput
					value={value}
					tokens={parsed.tokens}
					label={t("tasks.quickAdd.inputLabel")}
					placeholder={t("tasks.quickAdd.placeholder")}
					onChange={setValue}
					onSubmit={() => void submit()}
					onCancel={closeQuickAdd}
				/>
			</div>
			<QuickAddChips
				parsed={parsed}
				presetDue={presetDue}
				onRemoveToken={(token) => setValue(withoutToken(value, token))}
				onRemovePreset={() => setPresetDue(null)}
			/>
			<div className="tasksQuickAddFooter">
				<QuickAddTargetPicker />
				<span className="tasksQuickAddHint">{t("tasks.quickAdd.hint")}</span>
				<Button type="button" variant="ghost" size="xs" onClick={closeQuickAdd}>
					{t("tasks.quickAdd.cancel")}
				</Button>
				<Button type="button" size="xs" disabled={!canAdd} onClick={() => void submit()}>
					{t("tasks.quickAdd.add")}
				</Button>
			</div>
		</div>
	);
}
