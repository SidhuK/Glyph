import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ensureDatabaseColumn } from "../../lib/database/columns";
import type { DatabaseColumn, DatabaseConfig } from "../../lib/database/types";
import type { DatabaseGalleryCardSize, DatabaseGalleryCover } from "../../lib/tauri";

const GALLERY_CARD_SIZES = [
	"small",
	"medium",
	"large",
] as const satisfies DatabaseGalleryCardSize[];

function calendarDateColumns(columns: DatabaseColumn[]): DatabaseColumn[] {
	return columns.filter(
		(column) =>
			column.type === "property" && column.property_key && column.property_kind === "date",
	);
}

function galleryCoverColumns(columns: DatabaseColumn[]): DatabaseColumn[] {
	return columns.filter(
		(column) =>
			column.type === "property" &&
			column.property_key &&
			(column.property_kind === "text" || column.property_kind === "url"),
	);
}

function parseGalleryCover(value: string): DatabaseGalleryCover {
	if (value === "none") return "none";
	if (value.startsWith("property:")) return `property:${value.slice("property:".length)}`;
	return null;
}

function isGalleryCardSize(value: string): value is DatabaseGalleryCardSize {
	return GALLERY_CARD_SIZES.some((size) => size === value);
}

export function layoutSettingsLabel(
	t: TFunction<"shell">,
	config: DatabaseConfig,
	columns: DatabaseColumn[],
): string {
	const labelFor = (id: string | null | undefined) =>
		columns.find((column) => column.id === id)?.label ?? null;
	if (config.view.layout === "calendar") {
		return labelFor(config.view.calendar_date_column) ?? t("collections.calendar.chooseDate");
	}
	const cover = config.view.gallery_cover ?? null;
	if (cover === null) return t("collections.gallery.coverFirstImage");
	if (cover === "none") return t("collections.gallery.coverNone");
	return t("collections.gallery.coverProperty", {
		field: labelFor(cover.slice("property:".length)) ?? cover,
	});
}

interface LayoutPanelProps {
	config: DatabaseConfig;
	columns: DatabaseColumn[];
	updateConfig: (config: DatabaseConfig) => Promise<boolean>;
}

/** Selecting a column that only exists in note frontmatter adds it to the view first. */
function withColumns(
	current: DatabaseColumn[],
	candidates: DatabaseColumn[],
	ids: Array<string | null>,
): DatabaseColumn[] {
	return ids.reduce((acc, id) => {
		const column = id ? candidates.find((entry) => entry.id === id) : null;
		return column ? ensureDatabaseColumn(acc, column) : acc;
	}, current);
}

export function CalendarSettingsPanel({ config, columns, updateConfig }: LayoutPanelProps) {
	const { t } = useTranslation("shell");
	const dateColumns = calendarDateColumns(columns);
	const startId = config.view.calendar_date_column ?? "";
	const endId = config.view.calendar_end_date_column ?? "";

	const save = (patch: { start?: string | null; end?: string | null }) => {
		const start = patch.start !== undefined ? patch.start : startId || null;
		const end = patch.end !== undefined ? patch.end : endId || null;
		void updateConfig({
			...config,
			columns: withColumns(config.columns, columns, [start, end]),
			view: {
				...config.view,
				calendar_date_column: start,
				calendar_end_date_column: end && end !== start ? end : null,
			},
		});
	};

	return (
		<section className="databaseViewOptionsPanel" aria-label={t("collections.calendar.settings")}>
			<div className="databaseViewPanelHeader">
				<span>{t("collections.calendar.settings")}</span>
			</div>
			<label className="databaseViewLayoutField">
				<span>{t("collections.calendar.dateColumn")}</span>
				<select
					className="databaseViewLayoutSelect"
					value={startId}
					onChange={(event) => save({ start: event.target.value || null })}
				>
					<option value="">{t("collections.calendar.chooseDate")}</option>
					{dateColumns.map((column) => (
						<option key={column.id} value={column.id}>
							{column.label}
						</option>
					))}
				</select>
			</label>
			<label className="databaseViewLayoutField">
				<span>{t("collections.calendar.endDateColumn")}</span>
				<select
					className="databaseViewLayoutSelect"
					value={endId}
					disabled={!startId}
					onChange={(event) => save({ end: event.target.value || null })}
				>
					<option value="">{t("collections.calendar.noEndDate")}</option>
					{dateColumns
						.filter((column) => column.id !== startId)
						.map((column) => (
							<option key={column.id} value={column.id}>
								{column.label}
							</option>
						))}
				</select>
			</label>
			{dateColumns.length === 0 ? (
				<div className="databaseViewPanelHint">{t("collections.calendar.emptyText")}</div>
			) : null}
		</section>
	);
}

export function GallerySettingsPanel({ config, columns, updateConfig }: LayoutPanelProps) {
	const { t } = useTranslation("shell");
	const coverColumns = galleryCoverColumns(columns);
	const cover = config.view.gallery_cover ?? "first_image";
	const size = config.view.gallery_card_size ?? "medium";

	return (
		<section className="databaseViewOptionsPanel" aria-label={t("collections.gallery.settings")}>
			<div className="databaseViewPanelHeader">
				<span>{t("collections.gallery.settings")}</span>
			</div>
			<label className="databaseViewLayoutField">
				<span>{t("collections.gallery.cover")}</span>
				<select
					className="databaseViewLayoutSelect"
					value={cover}
					onChange={(event) => {
						const next = parseGalleryCover(event.target.value);
						const columnId = next?.startsWith("property:") ? next.slice("property:".length) : null;
						void updateConfig({
							...config,
							columns: withColumns(config.columns, columns, [columnId]),
							view: { ...config.view, gallery_cover: next },
						});
					}}
				>
					<option value="first_image">{t("collections.gallery.coverFirstImage")}</option>
					<option value="none">{t("collections.gallery.coverNone")}</option>
					{coverColumns.map((column) => (
						<option key={column.id} value={`property:${column.id}`}>
							{t("collections.gallery.coverProperty", { field: column.label })}
						</option>
					))}
				</select>
			</label>
			<label className="databaseViewLayoutField">
				<span>{t("collections.gallery.cardSize")}</span>
				<select
					className="databaseViewLayoutSelect"
					value={size}
					onChange={(event) => {
						const next = event.target.value;
						if (!isGalleryCardSize(next)) return;
						void updateConfig({ ...config, view: { ...config.view, gallery_card_size: next } });
					}}
				>
					{GALLERY_CARD_SIZES.map((entry) => (
						<option key={entry} value={entry}>
							{t(`collections.gallery.size.${entry}`)}
						</option>
					))}
				</select>
			</label>
		</section>
	);
}
