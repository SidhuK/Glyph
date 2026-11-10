import { useState } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { priorityOptionFromValue } from "../../lib/priorityProperties";
import type { EditorTextColor } from "../editor/textColors";
import { PropertyOptionPicker } from "../status/PropertyOptionPicker";
import { priorityDisplayLabel, statusDisplayLabel } from "../status/propertyOptionLabels";

interface DatabaseOptionCellProps {
	kind: "status" | "priority";
	value: string;
	valueOptions: string[];
	statusColors: Record<string, EditorTextColor>;
	onStatusColorChange?: (status: string, color: EditorTextColor | null) => void;
	onSelectRow: () => void;
	onChange: (value: string) => Promise<void>;
}

const TRIGGER_CLASS =
	"databaseCellButton is-pill-list notePropertyStatusTrigger databaseStatusTrigger";

/**
 * A status or priority cell: the value opens its picker. An unset status, and an unset or "No"
 * priority, stay blank at rest and show faintly on row hover so they can still be set.
 */
export function DatabaseOptionCell({
	kind,
	value,
	valueOptions,
	statusColors,
	onStatusColorChange,
	onSelectRow,
	onChange,
}: DatabaseOptionCellProps) {
	const { t } = useTranslation("shell");
	const [saveError, setSaveError] = useState("");
	const handleChange = (next: string) => {
		setSaveError("");
		return onChange(next);
	};
	const handleError = (error: unknown) => setSaveError(extractErrorMessage(error));
	const isSet = value.trim().length > 0;

	const isEmptyPriority = !isSet || priorityOptionFromValue(value)?.id === "no";
	const label =
		kind === "status"
			? isSet
				? statusDisplayLabel(value, t)
				: t("collections.changeStatus")
			: isEmptyPriority
				? t("collections.priority.no")
				: priorityDisplayLabel(value, t);
	const picker =
		kind === "status" ? (
			<PropertyOptionPicker
				kind="status"
				value={value}
				valueOptions={valueOptions}
				colors={statusColors}
				triggerClassName={`${TRIGGER_CLASS}${isSet ? "" : " is-empty-status"}`}
				triggerTitle={label}
				triggerAriaLabel={label}
				stopTriggerClickPropagation
				onTriggerClick={onSelectRow}
				onChange={handleChange}
				onError={handleError}
				onColorChange={onStatusColorChange}
			/>
		) : (
			<PropertyOptionPicker
				kind="priority"
				value={value}
				valueOptions={valueOptions}
				triggerClassName={`${TRIGGER_CLASS}${isEmptyPriority ? " is-empty-priority" : ""}`}
				triggerTitle={label}
				triggerAriaLabel={t("collections.cell.changePriority")}
				stopTriggerClickPropagation
				onTriggerClick={onSelectRow}
				onChange={handleChange}
				onError={handleError}
			/>
		);

	return (
		<div className="databaseTagEditor">
			{picker}
			{saveError ? <div className="databaseCellError">{saveError}</div> : null}
		</div>
	);
}
