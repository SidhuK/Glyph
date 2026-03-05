import { getDocUrl, orderedDocSlugs } from "../lib/docs";

export const prerender = true;

type SitemapEntry = {
	path: string;
	changefreq: "daily" | "weekly" | "monthly";
	priority: string;
};

function toAbsoluteUrl(path: string, site?: URL): string {
	const base = site ?? new URL("https://glyphformac.com");
	return new URL(path, base).toString();
}

export function GET(context: { site?: URL }) {
	const staticEntries: SitemapEntry[] = [
		{ path: "/", changefreq: "weekly", priority: "1.0" },
		{ path: "/docs", changefreq: "weekly", priority: "0.9" },
		{ path: "/docs/introduction", changefreq: "weekly", priority: "0.9" },
		{ path: "/legal", changefreq: "monthly", priority: "0.4" },
		{ path: "/privacy", changefreq: "monthly", priority: "0.4" },
		{ path: "/terms", changefreq: "monthly", priority: "0.4" },
	];

	const docEntries: SitemapEntry[] = orderedDocSlugs.map((slug) => ({
		path: getDocUrl(slug),
		changefreq: "weekly",
		priority: "0.7",
	}));

	const allEntries = [...staticEntries, ...docEntries];
	const deduped = Array.from(
		new Map(allEntries.map((entry) => [entry.path, entry])).values(),
	);
	const lastmod = new Date().toISOString();

	const urlset = deduped
		.map((entry) => {
			return `<url><loc>${toAbsoluteUrl(entry.path, context.site)}</loc><lastmod>${lastmod}</lastmod><changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`;
		})
		.join("");

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlset}</urlset>`;

	return new Response(body, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
		},
	});
}
