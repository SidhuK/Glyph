import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

type DateFilter =
	| { kind: "any" | "today" | "this-month" }
	| { kind: "range"; start: string; end: string };
type PropertyCondition = { kind: "equals"; value: string } | { kind: "has" | "missing" };
type GroupOperator = "AND" | "OR";

function quote(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function SearchFilters({
	query,
	folders,
	onChange,
}: {
	query: string;
	folders: readonly string[];
	onChange: (query: string) => void;
}) {
	const { t } = useTranslation("shell");
	const [folder, setFolder] = useState("");
	const folderListId = useId();
	const [dateField, setDateField] = useState<"created" | "updated">("created");
	const [date, setDate] = useState<DateFilter>({ kind: "any" });
	const [property, setProperty] = useState("");
	const [condition, setCondition] = useState<PropertyCondition>({ kind: "equals", value: "" });
	const [operator, setOperator] = useState<GroupOperator>("AND");
	const [join, setJoin] = useState<GroupOperator>("AND");
	const terms: string[] = [];
	if (folder) terms.push(`folder:${quote(folder)}`);
	if (date.kind === "range") {
		const bounds: string[] = [];
		if (date.start) bounds.push(`${dateField}:>=${date.start}`);
		if (date.end) bounds.push(`${dateField}:<=${date.end}`);
		if (bounds.length) terms.push(`(${bounds.join(" AND ")})`);
	} else if (date.kind !== "any") terms.push(`${dateField}:${date.kind}`);
	if (property.trim()) {
		terms.push(
			condition.kind === "equals"
				? `property:${quote(`${property.trim()}=${condition.value}`)}`
				: `${condition.kind}:${quote(property.trim())}`,
		);
	}
	const invalidRange =
		date.kind === "range" && Boolean(date.start && date.end && date.start > date.end);
	const missingDateBounds = date.kind === "range" && !date.start && !date.end;
	return (
		<details className="commandSearchFilters">
			<summary>{t("commandPalette.filters")}</summary>
			<div className="commandSearchFilterFields">
				<label>
					{t("commandPalette.filterFolder")}
					<input
						value={folder}
						onChange={(event) => setFolder(event.target.value)}
						list={folderListId}
					/>
					<datalist id={folderListId}>
						{folders.map((path) => (
							<option key={path} value={path} />
						))}
					</datalist>
				</label>
				<label>
					{t("commandPalette.filterDate")}
					<select
						value={dateField}
						onChange={(event) => {
							const value = event.target.value;
							if (value === "created" || value === "updated") setDateField(value);
						}}
					>
						<option value="created">{t("commandPalette.createdDate")}</option>
						<option value="updated">{t("commandPalette.updatedDate")}</option>
					</select>
				</label>
				<label>
					{t("commandPalette.datePeriod")}
					<select
						value={date.kind}
						onChange={(event) => {
							const kind = event.target.value;
							if (kind === "range") setDate({ kind, start: "", end: "" });
							else if (kind === "any" || kind === "today" || kind === "this-month")
								setDate({ kind });
						}}
					>
						<option value="any">{t("commandPalette.anyDate")}</option>
						<option value="today">{t("commandPalette.today")}</option>
						<option value="this-month">{t("commandPalette.thisMonth")}</option>
						<option value="range">{t("commandPalette.dateRange")}</option>
					</select>
				</label>
				{date.kind === "range" ? (
					<>
						<label>
							{t("commandPalette.dateFrom")}
							<input
								type="date"
								value={date.start}
								onChange={(event) => {
									const start = event.target.value;
									setDate((previous) =>
										previous.kind === "range" ? { ...previous, start } : previous,
									);
								}}
							/>
						</label>
						<label>
							{t("commandPalette.dateTo")}
							<input
								type="date"
								value={date.end}
								min={date.start || undefined}
								onChange={(event) => {
									const end = event.target.value;
									setDate((previous) =>
										previous.kind === "range" ? { ...previous, end } : previous,
									);
								}}
							/>
						</label>
					</>
				) : null}
				<label>
					{t("commandPalette.filterProperty")}
					<input value={property} onChange={(event) => setProperty(event.target.value)} />
				</label>
				<label>
					{t("commandPalette.propertyCondition")}
					<select
						value={condition.kind}
						onChange={(event) => {
							const kind = event.target.value;
							if (kind === "equals") setCondition({ kind, value: "" });
							else if (kind === "has" || kind === "missing") setCondition({ kind });
						}}
					>
						<option value="equals">{t("commandPalette.propertyEquals")}</option>
						<option value="has">{t("commandPalette.propertyExists")}</option>
						<option value="missing">{t("commandPalette.propertyMissing")}</option>
					</select>
				</label>
				{condition.kind === "equals" ? (
					<label>
						{t("commandPalette.propertyValue")}
						<input
							value={condition.value}
							onChange={(event) => setCondition({ kind: "equals", value: event.target.value })}
						/>
					</label>
				) : null}
				<label>
					{t("commandPalette.groupMatch")}
					<select
						value={operator}
						onChange={(event) => {
							const value = event.target.value;
							if (value === "AND" || value === "OR") setOperator(value);
						}}
					>
						<option value="AND">{t("commandPalette.matchAll")}</option>
						<option value="OR">{t("commandPalette.matchAny")}</option>
					</select>
				</label>
				{query.trim() ? (
					<label>
						{t("commandPalette.joinGroup")}
						<select
							value={join}
							onChange={(event) => {
								const value = event.target.value;
								if (value === "AND" || value === "OR") setJoin(value);
							}}
						>
							<option value="AND">{t("commandPalette.matchAll")}</option>
							<option value="OR">{t("commandPalette.matchAny")}</option>
						</select>
					</label>
				) : null}
			</div>
			<p>{t("commandPalette.searchSyntaxHelp")}</p>
			{invalidRange ? <p role="alert">{t("commandPalette.invalidDateRange")}</p> : null}
			<div className="commandSearchFilterButtons">
				<button
					type="button"
					disabled={!terms.length || invalidRange || missingDateBounds}
					onClick={() => {
						const group = `(${terms.join(` ${operator} `)})`;
						onChange(query.trim() ? `(${query.trim()}) ${join} ${group}` : group);
					}}
				>
					{t("commandPalette.addFilterGroup")}
				</button>
				<button
					type="button"
					onClick={() => onChange("folder:research property:status=unprocessed created:this-month")}
				>
					{t("commandPalette.researchExample")}
				</button>
			</div>
		</details>
	);
}
