import {
	basename,
	isMarkdownPath,
	normalizeRelPath,
	parentDir,
} from "../utils/path";
import { isoWeekFromDate } from "./periodNotes";
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

export type NativeTemplateSelection =
	| { kind: "cancelled" }
	| { kind: "empty" }
	| { kind: "invalid" }
	| { kind: "selected"; template: TemplateEntry };

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

export async function selectTemplateFile({
	spaceRootPath,
	templateFolder,
	title,
}: {
	spaceRootPath: string;
	templateFolder: string;
	title: string;
}): Promise<NativeTemplateSelection> {
	const templates = await listTemplates(templateFolder);
	if (!templates.length) return { kind: "empty" };

	const [{ join }, { open }] = await Promise.all([
		import("@tauri-apps/api/path"),
		import("@tauri-apps/plugin-dialog"),
	]);
	const defaultPath = await join(spaceRootPath, templateFolder);
	const canonicalFolder = normalizeRelPath(
		await invoke("space_relativize_path", { abs_path: defaultPath }),
	);
	const selection = await open({
		title,
		defaultPath,
		filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
		multiple: false,
		directory: false,
		canCreateDirectories: false,
		fileAccessMode: "scoped",
	});
	if (typeof selection !== "string") return { kind: "cancelled" };

	let selectedPath: string;
	try {
		selectedPath = await invoke("space_relativize_path", {
			abs_path: selection,
		});
	} catch {
		return { kind: "invalid" };
	}
	const relPath = normalizeRelPath(selectedPath);
	if (
		!isMarkdownPath(relPath) ||
		(canonicalFolder.length > 0 && !relPath.startsWith(`${canonicalFolder}/`))
	) {
		return { kind: "invalid" };
	}
	return {
		kind: "selected",
		template: { relPath, name: basename(relPath) },
	};
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
		iso_week: String(isoWeekFromDate(now).week).padStart(2, "0"),
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
