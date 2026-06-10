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

interface CardFieldsPanelProps {
	fields: string[] | undefined;
	onChange: (fields: string[]) => void;
}

export function CardFieldsPanel({ fields, onChange }: CardFieldsPanelProps) {
	const active = new Set(
		fields && fields.length > 0 ? fields : CARD_FIELDS.map((field) => field.id),
	);

	const toggleField = (fieldId: string, enabled: boolean) => {
		const next = new Set(active);
		if (enabled) {
			next.add(fieldId);
		} else {
			next.delete(fieldId);
		}
		onChange(Array.from(next));
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
