import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { AttachmentEntry } from "../../../lib/tauri";
import { AttachmentRow } from "./AttachmentRow";
import type { AttachmentFileAction } from "./useAttachmentScan";

const ATTACHMENT_ROW_HEIGHT = 60;

interface AttachmentListProps {
	entries: readonly AttachmentEntry[];
	selectedPaths: ReadonlySet<string>;
	showStatus: boolean;
	onToggle: (path: string) => void;
	onFileAction: (action: AttachmentFileAction) => void;
}

export function AttachmentList({
	entries,
	selectedPaths,
	showStatus,
	onToggle,
	onFileAction,
}: AttachmentListProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer({
		count: entries.length,
		estimateSize: () => ATTACHMENT_ROW_HEIGHT,
		getItemKey: (index) => entries[index]?.rel_path ?? index,
		getScrollElement: () => scrollRef.current,
		overscan: 8,
	});

	return (
		<div ref={scrollRef} className="attachmentList">
			<div className="attachmentListInner" style={{ height: virtualizer.getTotalSize() }}>
				{virtualizer.getVirtualItems().map((item) => {
					const entry = entries[item.index];
					if (!entry) return null;
					return (
						<div
							key={item.key}
							className="attachmentListItem"
							style={{ height: item.size, transform: `translateY(${item.start}px)` }}
						>
							<AttachmentRow
								entry={entry}
								selected={selectedPaths.has(entry.rel_path)}
								showStatus={showStatus}
								onToggle={onToggle}
								onFileAction={onFileAction}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}
