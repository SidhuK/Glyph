import type { ComponentType } from "react";
import type { IconProps } from "../Icons";
import {
	Archive,
	Cpu,
	Database,
	File,
	FileCode,
	FileCss,
	FileDoc,
	FileHtml,
	FileJson,
	FilePdf,
	FilePpt,
	FileSpreadsheet,
	FileText,
	FileTxt,
	FileXml,
	Film,
	Hash,
	Image,
	Music,
	Palette,
} from "../Icons";

interface FileTypeInfo {
	Icon: ComponentType<IconProps>;
	color: string;
	label: string;
}

export function getFileTypeInfo(
	relPath: string,
	isMarkdown: boolean,
): FileTypeInfo {
	const ext = relPath.split(".").pop()?.toLowerCase() ?? "";

	if (isMarkdown) {
		return { Icon: FileText, color: "var(--text-accent)", label: "markdown" };
	}
	if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(ext)) {
		return { Icon: Image, color: "var(--color-green-500)", label: "image" };
	}
	if (["mp4", "avi", "mov", "webm", "mkv"].includes(ext)) {
		return { Icon: Film, color: "var(--color-purple-500)", label: "video" };
	}
	if (["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) {
		return { Icon: Music, color: "var(--color-yellow-500)", label: "audio" };
	}
	if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) {
		return {
			Icon: Archive,
			color: "var(--color-yellow-500)",
			label: "archive",
		};
	}
	if (["js", "jsx", "ts", "tsx", "vue", "svelte"].includes(ext)) {
		return { Icon: FileCode, color: "var(--color-yellow-500)", label: "code" };
	}
	if (["json"].includes(ext)) {
		return { Icon: FileJson, color: "var(--text-tertiary)", label: "json" };
	}
	if (["csv", "xlsx", "xls"].includes(ext)) {
		return {
			Icon: FileSpreadsheet,
			color: "var(--color-green-500)",
			label: "spreadsheet",
		};
	}
	if (["ppt", "pptx", "key"].includes(ext)) {
		return {
			Icon: FilePpt,
			color: "var(--color-purple-500)",
			label: "presentation",
		};
	}
	if (["html", "htm"].includes(ext)) {
		return { Icon: FileHtml, color: "var(--color-yellow-500)", label: "html" };
	}
	if (["css", "scss", "less"].includes(ext)) {
		return { Icon: FileCss, color: "var(--color-yellow-500)", label: "styles" };
	}
	if (["xml"].includes(ext)) {
		return { Icon: FileXml, color: "var(--text-tertiary)", label: "xml" };
	}
	if (["sql", "db", "sqlite"].includes(ext)) {
		return { Icon: Database, color: "var(--text-accent)", label: "database" };
	}
	if (["exe", "bin", "app", "deb", "rpm"].includes(ext)) {
		return { Icon: Cpu, color: "var(--color-purple-500)", label: "executable" };
	}
	if (["psd", "ai", "sketch", "fig"].includes(ext)) {
		return { Icon: Palette, color: "var(--color-purple-500)", label: "design" };
	}
	if (["lock", "key", "pem", "crt", "p12"].includes(ext)) {
		return { Icon: Hash, color: "var(--text-error)", label: "security" };
	}
	if (["md", "mdx", "markdown"].includes(ext)) {
		return { Icon: FileText, color: "var(--text-accent)", label: "markdown" };
	}
	if (["yaml", "yml", "toml", "ini", "env"].includes(ext)) {
		return { Icon: FileJson, color: "var(--text-tertiary)", label: "config" };
	}
	if (["txt", "log", "readme"].includes(ext)) {
		return { Icon: FileTxt, color: "var(--text-secondary)", label: "text" };
	}
	if (["pdf"].includes(ext)) {
		return { Icon: FilePdf, color: "var(--text-error)", label: "pdf" };
	}
	if (["doc", "docx", "rtf"].includes(ext)) {
		return { Icon: FileDoc, color: "var(--color-blue-500)", label: "document" };
	}
	return { Icon: File, color: "var(--text-tertiary)", label: "file" };
}

export function basename(relPath: string): string {
	if (!relPath) return "";
	const parts = relPath.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? relPath;
}
