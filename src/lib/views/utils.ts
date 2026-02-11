import type { ViewKind, ViewRef } from "./types";

export function basename(relPath: string): string {
	const parts = relPath.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? relPath;
}

export function viewId(view: ViewRef): {
	id: string;
	kind: ViewKind;
	selector: string;
	title: string;
} {
	switch (view.kind) {
		case "global":
			return { id: "global", kind: "global", selector: "", title: "Vault" };
		case "folder": {
			const dir = view.dir
				.trim()
				.replace(/\\/g, "/")
				.replace(/^\/+|\/+$/g, "");
			const title = dir ? basename(dir) : "Vault";
			return { id: `folder:${dir}`, kind: "folder", selector: dir, title };
		}
		case "tag":
			return {
				id: `tag:${view.tag}`,
				kind: "tag",
				selector: view.tag,
				title: view.tag.startsWith("#") ? view.tag : `#${view.tag}`,
			};
		case "search":
			return {
				id: `search:${view.query}`,
				kind: "search",
				selector: view.query,
				title: "Search",
			};
	}
}

export async function sha256Hex(input: string): Promise<string> {
	const bytes = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export async function viewDocPath(view: ViewRef): Promise<string> {
	const v = viewId(view);
	if (v.kind === "global") return "views/global.json";
	const hash = await sha256Hex(v.id);
	return `views/${v.kind}/${hash}.json`;
}
