export const prerender = true;

export function GET(context: { site?: URL }) {
	const baseUrl =
		context.site?.toString().replace(/\/$/, "") ?? "https://glyphformac.com";
	const body = `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;

	return new Response(body, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}
