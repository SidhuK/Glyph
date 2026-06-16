import type { GitCommitDiff } from "../../lib/tauri";

interface GitDiffViewProps {
	diff: GitCommitDiff;
	onBack: () => void;
}

type DiffLineKind = "add" | "delete" | "hunk" | "meta" | "context";

interface DiffLineDisplay {
	kind: DiffLineKind;
	marker: string;
	text: string;
}

function diffLineKind(line: string): DiffLineKind {
	if (line.startsWith("@@")) return "hunk";
	if (line.startsWith("+") && !line.startsWith("+++")) return "add";
	if (line.startsWith("-") && !line.startsWith("---")) return "delete";
	if (
		line.startsWith("diff --git") ||
		line.startsWith("index ") ||
		line.startsWith("---") ||
		line.startsWith("+++") ||
		line.startsWith("new file mode") ||
		line.startsWith("deleted file mode") ||
		line.startsWith("similarity index") ||
		line.startsWith("rename from") ||
		line.startsWith("rename to")
	) {
		return "meta";
	}
	return "context";
}

function diffLineDisplay(line: string): DiffLineDisplay {
	const kind = diffLineKind(line);
	if (kind === "add") {
		return { kind, marker: "+", text: line.slice(1) || " " };
	}
	if (kind === "delete") {
		return { kind, marker: "-", text: line.slice(1) || " " };
	}
	if (kind === "hunk") {
		return { kind, marker: "@@", text: line.replace(/^@@\s?/, "") || line };
	}
	return { kind, marker: "", text: line || " " };
}

function formatCommitDate(timestampMs: number): string {
	if (!timestampMs) return "";
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(timestampMs));
}

export function GitDiffView({ diff, onBack }: GitDiffViewProps) {
	const lines = diff.diff.length ? diff.diff.trimEnd().split("\n") : [];
	const dateLabel = formatCommitDate(diff.commit.timestamp_ms);

	return (
		<div className="gitDiffView">
			<header className="gitDiffHeader">
				<button type="button" className="gitDiffBackButton" onClick={onBack}>
					Back to editor
				</button>
				<div className="gitDiffCommitMeta">
					<strong>{diff.commit.subject || "Untitled commit"}</strong>
					<span>
						{diff.commit.short_hash}
						{dateLabel ? ` - ${dateLabel}` : ""}
					</span>
				</div>
			</header>
			<div className="gitDiffBody" role="region" aria-label="Commit diff">
				{lines.length ? (
					lines.map((line, index) => {
						const display = diffLineDisplay(line);
						return (
							<div
								key={`${index}:${line}`}
								className="gitDiffLine"
								data-kind={display.kind}
							>
								<div className="gitDiffLineInner">
									<span className="gitDiffMarker" aria-hidden="true">
										{display.marker}
									</span>
									<code className="gitDiffCode">{display.text}</code>
								</div>
							</div>
						);
					})
				) : (
					<div className="gitDiffEmpty">
						This commit did not change the current note.
					</div>
				)}
			</div>
		</div>
	);
}
