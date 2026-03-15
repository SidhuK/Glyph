import { Fragment, type ReactNode, memo } from "react";
import { splitYamlFrontmatter } from "../../lib/notePreview";

interface InstantMarkdownPreviewProps {
	markdown: string;
}

function parseInline(text: string): ReactNode[] {
	const nodes: ReactNode[] = [];
	const pattern =
		/`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s<]+)|\[\[([^[\]\n|#]+)(?:\|([^[\]\n]+))?\]\]/g;
	let lastIndex = 0;
	let match = pattern.exec(text);

	while (match !== null) {
		if (match.index > lastIndex) {
			nodes.push(text.slice(lastIndex, match.index));
		}
		if (match[1]) {
			nodes.push(<code key={`code-${match.index}`}>{match[1]}</code>);
		} else if (match[2] && match[3]) {
			nodes.push(
				<a
					key={`link-${match.index}`}
					href={match[3]}
					target="_blank"
					rel="noreferrer"
				>
					{match[2]}
				</a>,
			);
		} else if (match[4]) {
			nodes.push(
				<a
					key={`url-${match.index}`}
					href={match[4]}
					target="_blank"
					rel="noreferrer"
				>
					{match[4]}
				</a>,
			);
		} else {
			nodes.push(
				<span
					key={`wiki-${match.index}`}
					className="instantMarkdownWikiLink"
					data-wikilink="true"
				>
					{match[5] ? (match[6] ?? match[5]) : match[0]}
				</span>,
			);
		}
		lastIndex = pattern.lastIndex;
		match = pattern.exec(text);
	}

	if (lastIndex < text.length) {
		nodes.push(text.slice(lastIndex));
	}

	return nodes;
}

function renderParagraph(text: string, key: string) {
	return <p key={key}>{parseInline(text)}</p>;
}

function renderList(
	lines: string[],
	startIndex: number,
	ordered: boolean,
): { node: React.ReactNode; nextIndex: number } {
	const items: ReactNode[] = [];
	let index = startIndex;
	const pattern = ordered ? /^\d+\.\s+(.*)$/ : /^[-*+]\s+(.*)$/;

	while (index < lines.length) {
		const line = lines[index].trim();
		const match = line.match(pattern);
		if (!match) break;
		items.push(<li key={`item-${index}`}>{parseInline(match[1] ?? "")}</li>);
		index += 1;
	}

	return {
		node: ordered ? (
			<ol key={`list-${startIndex}`}>{items}</ol>
		) : (
			<ul key={`list-${startIndex}`}>{items}</ul>
		),
		nextIndex: index,
	};
}

function renderBlocks(body: string): ReactNode[] {
	const lines = body.replace(/\r\n?/g, "\n").split("\n");
	const blocks: ReactNode[] = [];
	let index = 0;

	while (index < lines.length) {
		const rawLine = lines[index];
		const line = rawLine.trim();

		if (!line) {
			index += 1;
			continue;
		}

		const fenceMatch = rawLine.match(/^```(\S+)?\s*$/);
		if (fenceMatch) {
			const language = fenceMatch[1] ?? "";
			const codeLines: string[] = [];
			index += 1;
			while (index < lines.length && !lines[index].match(/^```\s*$/)) {
				codeLines.push(lines[index]);
				index += 1;
			}
			if (index < lines.length) index += 1;
			blocks.push(
				<pre key={`code-${index}`}>
					<code data-language={language || undefined}>
						{codeLines.join("\n")}
					</code>
				</pre>,
			);
			continue;
		}

		const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
		if (headingMatch) {
			const level = headingMatch[1].length;
			const content = parseInline(headingMatch[2] ?? "");
			switch (level) {
				case 1:
					blocks.push(<h1 key={`heading-${index}`}>{content}</h1>);
					break;
				case 2:
					blocks.push(<h2 key={`heading-${index}`}>{content}</h2>);
					break;
				case 3:
					blocks.push(<h3 key={`heading-${index}`}>{content}</h3>);
					break;
				case 4:
					blocks.push(<h4 key={`heading-${index}`}>{content}</h4>);
					break;
				case 5:
					blocks.push(<h5 key={`heading-${index}`}>{content}</h5>);
					break;
				default:
					blocks.push(<h6 key={`heading-${index}`}>{content}</h6>);
					break;
			}
			index += 1;
			continue;
		}

		if (/^([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
			blocks.push(<hr key={`hr-${index}`} />);
			index += 1;
			continue;
		}

		if (/^>\s?/.test(line)) {
			const quoteLines: string[] = [];
			while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
				quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
				index += 1;
			}
			blocks.push(
				<blockquote key={`quote-${index}`}>
					{quoteLines.map((quoteLine) => (
						<Fragment key={`quote-line-${quoteLine}`}>
							{quoteLines[0] !== quoteLine ? <br /> : null}
							{parseInline(quoteLine)}
						</Fragment>
					))}
				</blockquote>,
			);
			continue;
		}

		if (/^[-*+]\s+/.test(line)) {
			const { node, nextIndex } = renderList(lines, index, false);
			blocks.push(node);
			index = nextIndex;
			continue;
		}

		if (/^\d+\.\s+/.test(line)) {
			const { node, nextIndex } = renderList(lines, index, true);
			blocks.push(node);
			index = nextIndex;
			continue;
		}

		const paragraphLines = [line];
		index += 1;
		while (index < lines.length) {
			const nextLine = lines[index].trim();
			if (
				!nextLine ||
				/^```/.test(nextLine) ||
				/^(#{1,6})\s+/.test(nextLine) ||
				/^>\s?/.test(nextLine) ||
				/^[-*+]\s+/.test(nextLine) ||
				/^\d+\.\s+/.test(nextLine) ||
				/^([-*_])(?:\s*\1){2,}\s*$/.test(nextLine)
			) {
				break;
			}
			paragraphLines.push(nextLine);
			index += 1;
		}
		blocks.push(
			renderParagraph(paragraphLines.join(" "), `paragraph-${index}`),
		);
	}

	return blocks;
}

export const InstantMarkdownPreview = memo(function InstantMarkdownPreview({
	markdown,
}: InstantMarkdownPreviewProps) {
	const { frontmatter, body } = splitYamlFrontmatter(markdown);

	return (
		<div className="rfNodeNoteEditor nodrag nopan instantMarkdownPreview">
			<div className="rfNodeNoteEditorBody nodrag nopan nowheel">
				{frontmatter ? (
					<div className="frontmatterPreview mono">
						<pre>{frontmatter.trimEnd()}</pre>
					</div>
				) : null}
				<div
					className="tiptapHostInline is-preview nodrag nopan nowheel"
					aria-hidden="true"
				>
					<div className="tiptapContentInline">{renderBlocks(body)}</div>
				</div>
			</div>
		</div>
	);
});
