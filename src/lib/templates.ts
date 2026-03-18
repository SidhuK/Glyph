import { invoke } from "./tauri";

export interface TemplateEntry {
	relPath: string;
	name: string;
}

export interface TemplateRenderContext {
	destinationPath: string;
	spaceRootPath?: string | null;
	date?: Date;
}

const TEMPLATE_TOKEN_RE = /\{\{\s*([a-zA-Z0-9._-]+)\s*\}\}/g;

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

function getMonthNames() {
	return {
		long: [
			"January",
			"February",
			"March",
			"April",
			"May",
			"June",
			"July",
			"August",
			"September",
			"October",
			"November",
			"December",
		],
		short: [
			"Jan",
			"Feb",
			"Mar",
			"Apr",
			"May",
			"Jun",
			"Jul",
			"Aug",
			"Sep",
			"Oct",
			"Nov",
			"Dec",
		],
	};
}

function getWeekdayNames() {
	return {
		long: [
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		],
		short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
	};
}

function basename(relPath: string): string {
	const parts = relPath.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? relPath;
}

function parentDir(relPath: string): string {
	const index = relPath.lastIndexOf("/");
	return index === -1 ? "" : relPath.slice(0, index);
}

function stem(fileName: string): string {
	return fileName.toLowerCase().endsWith(".md")
		? fileName.slice(0, -3)
		: fileName.replace(/\.[^.]+$/, "");
}

function titleFromStem(fileStem: string): string {
	const normalized = fileStem.replace(/[-_]+/g, " ").trim();
	if (!normalized) return "Untitled";
	return normalized.replace(/\s+/g, " ");
}

function slugifyTitle(value: string): string {
	return (
		value
			.normalize("NFKD")
			.replace(/\p{M}+/gu, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "untitled"
	);
}

function getIsoWeek(date: Date): number {
	const utcDate = new Date(
		Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
	);
	const day = utcDate.getUTCDay() || 7;
	utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
	const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
	return Math.ceil(
		((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
	);
}

function getSpaceName(spaceRootPath: string | null | undefined): string {
	if (!spaceRootPath) return "";
	const normalized = spaceRootPath.replace(/\\/g, "/").replace(/\/+$/g, "");
	const parts = normalized.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? "";
}

export function listTemplates(folder: string): Promise<TemplateEntry[]> {
	return invoke("space_list_markdown_files", {
		dir: folder,
		recursive: true,
	}).then((entries) =>
		entries.map((entry) => ({
			relPath: entry.rel_path,
			name: entry.name,
		})),
	);
}

export function buildTemplateVariables(
	context: TemplateRenderContext,
): Record<string, string> {
	const now = context.date ? new Date(context.date) : new Date();
	const monthNames = getMonthNames();
	const weekdayNames = getWeekdayNames();
	const fileName = basename(context.destinationPath);
	const fileStem = stem(fileName);
	const title = titleFromStem(fileStem);
	const isoDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
	const secondTime = `${time}:${pad(now.getSeconds())}`;
	const monthIndex = now.getMonth();
	const weekdayIndex = now.getDay();

	return {
		title,
		title_slug: slugifyTitle(title),
		file_name: fileName,
		file_stem: fileStem,
		destination_path: context.destinationPath,
		destination_dir: parentDir(context.destinationPath),
		space_name: getSpaceName(context.spaceRootPath),
		date: isoDate,
		date_iso: isoDate,
		time,
		datetime: `${isoDate} ${secondTime}`,
		timestamp: String(now.getTime()),
		year: String(now.getFullYear()),
		month: pad(monthIndex + 1),
		month_name: monthNames.long[monthIndex] ?? "",
		month_short: monthNames.short[monthIndex] ?? "",
		day: pad(now.getDate()),
		weekday: weekdayNames.long[weekdayIndex] ?? "",
		weekday_short: weekdayNames.short[weekdayIndex] ?? "",
		hour: pad(now.getHours()),
		minute: pad(now.getMinutes()),
		second: pad(now.getSeconds()),
		iso_week: String(getIsoWeek(now)).padStart(2, "0"),
		quarter: String(Math.floor(monthIndex / 3) + 1),
	};
}

export function renderTemplate(
	markdown: string,
	context: TemplateRenderContext,
): string {
	const variables = buildTemplateVariables(context);
	return markdown.replace(TEMPLATE_TOKEN_RE, (match, token) => {
		const normalizedToken =
			typeof token === "string" ? token.trim().toLowerCase() : "";
		return variables[normalizedToken] ?? match;
	});
}
