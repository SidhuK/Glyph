import docsConfig from "../../docs/docs.json";

type DocsJson = {
	navigation?: {
		tabs?: Array<{
			tab: string;
			groups: Array<{
				group: string;
				pages: string[];
			}>;
		}>;
	};
};

export type DocsTab = NonNullable<DocsJson["navigation"]>["tabs"][number];

export type DocLocation = {
	tab: string;
	group: string;
	tabIndex: number;
	groupIndex: number;
	pageIndex: number;
};

type MdxModule = {
	default: unknown;
	frontmatter?: {
		title?: string;
		description?: string;
	};
};

const typedDocsConfig = docsConfig as DocsJson;
export const docsTabs = typedDocsConfig.navigation?.tabs ?? [];

const docModules = import.meta.glob("../../docs/**/*.mdx");
const rawDocModules = import.meta.glob("../../docs/**/*.mdx", {
	query: "?raw",
	import: "default",
});

export const orderedDocSlugs = docsTabs.flatMap((tab) =>
	tab.groups.flatMap((group) => group.pages),
);

const docsSlugSet = new Set(orderedDocSlugs);

export function getDocUrl(slug: string): string {
	return `/docs/${normalizeDocSlug(slug)}`;
}

export function normalizeDocSlug(slug: string): string {
	return slug.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function getDocLocation(slug: string): DocLocation | null {
	const normalizedSlug = normalizeDocSlug(slug);

	for (const [tabIndex, tab] of docsTabs.entries()) {
		for (const [groupIndex, group] of tab.groups.entries()) {
			const pageIndex = group.pages.findIndex(
				(page) => page === normalizedSlug,
			);
			if (pageIndex !== -1) {
				return {
					tab: tab.tab,
					group: group.group,
					tabIndex,
					groupIndex,
					pageIndex,
				};
			}
		}
	}

	return null;
}

export function getDocNeighbors(slug: string): {
	previous: string | null;
	next: string | null;
} {
	const normalizedSlug = normalizeDocSlug(slug);
	const index = orderedDocSlugs.findIndex((entry) => entry === normalizedSlug);

	return {
		previous: index > 0 ? orderedDocSlugs[index - 1] : null,
		next:
			index >= 0 && index < orderedDocSlugs.length - 1
				? orderedDocSlugs[index + 1]
				: null,
	};
}

export function rewriteDocsHref(href?: string): string | undefined {
	if (!href) {
		return href;
	}

	if (
		href.startsWith("http://") ||
		href.startsWith("https://") ||
		href.startsWith("mailto:") ||
		href.startsWith("tel:") ||
		href.startsWith("#") ||
		href.startsWith("/docs/")
	) {
		return href;
	}

	if (!href.startsWith("/")) {
		return href;
	}

	const [rawPath, rawHash] = href.split("#");
	const normalizedPath = normalizeDocSlug(rawPath);

	if (!docsSlugSet.has(normalizedPath)) {
		return href;
	}

	const hash = rawHash ? `#${rawHash}` : "";
	return `${getDocUrl(normalizedPath)}${hash}`;
}

export async function getDocsStaticPaths(): Promise<
	Array<{ params: { slug: string } }>
> {
	return orderedDocSlugs.map((slug) => ({
		params: { slug },
	}));
}

export async function getDocBySlug(slug: string): Promise<{
	slug: string;
	Content: MdxModule["default"];
	frontmatter: NonNullable<MdxModule["frontmatter"]>;
	hasVisibleHeading: boolean;
} | null> {
	const normalizedSlug = normalizeDocSlug(slug);
	const modulePath = `../../docs/${normalizedSlug}.mdx`;
	const loader = docModules[modulePath];
	const rawLoader = rawDocModules[modulePath];

	if (!loader || !rawLoader) {
		return null;
	}

	const mod = (await loader()) as MdxModule;
	const rawSource = (await rawLoader()) as string;
	const body = rawSource.replace(/^---[\s\S]*?---\s*/, "").trimStart();

	return {
		slug: normalizedSlug,
		Content: mod.default,
		frontmatter: mod.frontmatter ?? {},
		hasVisibleHeading: body.startsWith("# "),
	};
}
