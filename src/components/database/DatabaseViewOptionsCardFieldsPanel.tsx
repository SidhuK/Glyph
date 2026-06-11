import { Toggle } from "../base/toggle/toggle";

interface CardFieldEntry {
	id: string;
	label: string;
}

const CARD_FIELDS: CardFieldEntry[] = [
	{ id: "date", label: "Date" },
	{ id: "task_progress", label: "Task progress" },
	{ id: "status", label: "Status" },
	{ id: "priority", label: "Priority" },
	{ id: "tags", label: "Tags" },
];

const CARD_FIELD_IDS = new Set(CARD_FIELDS.map((field) => field.id));
const TITLE_ONLY_CARD_FIELDS = ["__glyph_title_only__"];

export function visibleCardFieldCount(
	fields: string[] | undefined,
): number | null {
	if (!fields || fields.length === 0) return null;
	return fields.filter((field) => CARD_FIELD_IDS.has(field)).length;
}

interface CardFieldsPanelProps {
	fields: string[] | undefined;
	onChange: (fields: string[]) => void;
}

export function CardFieldsPanel({ fields, onChange }: CardFieldsPanelProps) {
	const active = new Set(
		fields && fields.length > 0
			? fields.filter((field) => CARD_FIELD_IDS.has(field))
			: CARD_FIELDS.map((field) => field.id),
	);

	const toggleField = (fieldId: string, enabled: boolean) => {
		const next = new Set(active);
		if (enabled) {
			next.add(fieldId);
		} else {
			next.delete(fieldId);
		}
		onChange(next.size === 0 ? TITLE_ONLY_CARD_FIELDS : Array.from(next));
	};

	return (
		<section className="databaseViewOptionsPanel" aria-label="Card fields">
			<div className="databaseViewPanelHeader">
				<span>Card fields</span>
			</div>
			<div className="databaseViewColumnsList">
				{CARD_FIELDS.map((field) => (
					<div key={field.id} className="databaseViewColumnRow">
						<span className="databaseViewColumnLabel">{field.label}</span>
						<span className="databaseViewColumnToggle">
							<Toggle
								size="sm"
								checked={active.has(field.id)}
								ariaLabel={`${active.has(field.id) ? "Hide" : "Show"} ${field.label} on cards`}
								onCheckedChange={(checked) => toggleField(field.id, checked)}
							/>
						</span>
					</div>
				))}
			</div>
			<div className="databaseViewPanelDivider" />
			<button
				type="button"
				className="databaseViewColumnRow databaseViewColumnUtility"
				onClick={() => onChange(CARD_FIELDS.map((field) => field.id))}
			>
				<span>Show all fields</span>
			</button>
		</section>
	);
}
