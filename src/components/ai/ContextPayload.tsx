import type { ContextManifest } from "./types";

interface ContextPayloadProps {
	charBudget: number;
	setCharBudget: React.Dispatch<React.SetStateAction<number>>;
	neighborDepth: 0 | 1 | 2;
	setNeighborDepth: React.Dispatch<React.SetStateAction<0 | 1 | 2>>;
	includeActiveNote: boolean;
	setIncludeActiveNote: React.Dispatch<React.SetStateAction<boolean>>;
	includeSelectedNodes: boolean;
	setIncludeSelectedNodes: React.Dispatch<React.SetStateAction<boolean>>;
	includeNoteContents: boolean;
	setIncludeNoteContents: React.Dispatch<React.SetStateAction<boolean>>;
	includeLinkPreviewText: boolean;
	setIncludeLinkPreviewText: React.Dispatch<React.SetStateAction<boolean>>;
	selectedNodesCount: number;
	streaming: boolean;
	payloadApproved: boolean;
	setPayloadApproved: React.Dispatch<React.SetStateAction<boolean>>;
	payloadManifest: ContextManifest | null;
	payloadPreview: string;
	payloadError: string;
	buildPayload: () => Promise<void>;
}

export function ContextPayload({
	charBudget,
	setCharBudget,
	neighborDepth,
	setNeighborDepth,
	includeActiveNote,
	setIncludeActiveNote,
	includeSelectedNodes,
	setIncludeSelectedNodes,
	includeNoteContents,
	setIncludeNoteContents,
	includeLinkPreviewText,
	setIncludeLinkPreviewText,
	selectedNodesCount,
	streaming,
	payloadApproved,
	setPayloadApproved,
	payloadManifest,
	payloadPreview,
	payloadError,
	buildPayload,
}: ContextPayloadProps) {
	return (
		<details className="aiContext" open>
			<summary>Context payload</summary>
			<div className="aiRow">
				<label className="aiLabel" htmlFor="aiBudget">
					Budget
				</label>
				<input
					id="aiBudget"
					type="number"
					min={200}
					max={200000}
					value={charBudget}
					onChange={(e) => setCharBudget(Number(e.target.value))}
				/>
				<label className="aiLabel" htmlFor="aiDepth">
					Neighbors
				</label>
				<select
					id="aiDepth"
					value={neighborDepth}
					onChange={(e) =>
						setNeighborDepth(Number(e.target.value) as 0 | 1 | 2)
					}
				>
					<option value={0}>0</option>
					<option value={1}>1</option>
					<option value={2}>2</option>
				</select>
			</div>
			<div className="aiRow">
				<label className="aiToggle">
					<input
						type="checkbox"
						checked={includeActiveNote}
						onChange={() => setIncludeActiveNote((v) => !v)}
					/>
					Active note
				</label>
				<label className="aiToggle">
					<input
						type="checkbox"
						checked={includeSelectedNodes}
						onChange={() => setIncludeSelectedNodes((v) => !v)}
					/>
					Selected nodes ({selectedNodesCount})
				</label>
				<label className="aiToggle">
					<input
						type="checkbox"
						checked={includeNoteContents}
						onChange={() => setIncludeNoteContents((v) => !v)}
					/>
					Note contents
				</label>
				<label className="aiToggle">
					<input
						type="checkbox"
						checked={includeLinkPreviewText}
						onChange={() => setIncludeLinkPreviewText((v) => !v)}
					/>
					Link preview text
				</label>
			</div>
			<div className="aiRow">
				<button type="button" onClick={buildPayload} disabled={streaming}>
					Build payload
				</button>
				<label className="aiToggle">
					<input
						type="checkbox"
						checked={payloadApproved}
						onChange={() => setPayloadApproved((v) => !v)}
					/>
					Approve payload
				</label>
				<div className="aiMeta">
					{payloadManifest
						? `${payloadManifest.totalChars.toLocaleString()} chars • ~${payloadManifest.estTokens.toLocaleString()} tokens`
						: ""}
				</div>
			</div>
			{payloadError ? <div className="aiError">{payloadError}</div> : null}
			<textarea
				className="aiContextPreview mono"
				readOnly
				value={payloadPreview}
			/>
			{payloadManifest?.items.length ? (
				<ul className="aiManifest">
					{payloadManifest.items.map((it, idx) => (
						<li key={`${it.kind}-${idx}`}>
							<span className="mono">
								{it.kind} • {it.chars}c • ~{it.estTokens}t
								{it.truncated ? " • truncated" : ""}
							</span>
							{" — "}
							{it.label}
						</li>
					))}
				</ul>
			) : null}
		</details>
	);
}
