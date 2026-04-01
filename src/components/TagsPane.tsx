import { Tag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m } from "motion/react";
import { type CSSProperties, memo, useCallback } from "react";
import type { TagCount } from "../lib/tauri";
import { springPresets } from "./ui/animations";
import { Button } from "./ui/shadcn/button";

interface TagsPaneProps {
	tags: TagCount[];
	onSelectTag: (tag: string) => void;
	onRefresh: () => void;
}

const springTransition = springPresets.bouncy;

export interface TagTreeRow {
	tag: string;
	label: string;
	totalCount: number;
	depth: number;
	isExplicit: boolean;
}

export function buildTagTreeRows(tags: TagCount[]): TagTreeRow[] {
	return [...tags]
		.sort((left, right) => left.tag.localeCompare(right.tag))
		.map((tag) => ({
			tag: tag.tag,
			label: tag.tag.split("/").pop() ?? tag.tag,
			totalCount: tag.total_count,
			depth: tag.depth,
			isExplicit: tag.is_explicit,
		}));
}

export const TagsPane = memo(function TagsPane({
	tags,
	onSelectTag,
	onRefresh,
}: TagsPaneProps) {
	const onClick = useCallback(
		(tag: string) => onSelectTag(tag.startsWith("#") ? tag : `#${tag}`),
		[onSelectTag],
	);
	const rows = buildTagTreeRows(tags);

	return (
		<m.section
			className="tagsPane"
			data-sidebar-list="tags"
			initial={{ y: 10 }}
			animate={{ y: 0 }}
			transition={springTransition}
		>
			<div className="tagsHeader">
				<div className="tagsHeaderTitle">TAGS</div>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={onRefresh}
					title="Refresh tags"
				>
					<m.span whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }}>
						↻
					</m.span>
				</Button>
			</div>
			{rows.length ? (
				<m.ul
					className="tagsList"
					initial="hidden"
					animate="visible"
					variants={{
						visible: { transition: { staggerChildren: 0.02 } },
						hidden: {},
					}}
				>
					{rows.map((tag, index) => {
						return (
							<m.li
								key={tag.tag}
								className="tagsItem"
								variants={{
									hidden: { scale: 0.9 },
									visible: { scale: 1 },
								}}
								transition={{ ...springTransition, delay: index * 0.015 }}
							>
								<m.button
									type="button"
									className="tagsButton"
									data-explicit={tag.isExplicit ? "true" : "false"}
									onClick={() => onClick(tag.tag)}
									style={
										{
											paddingInlineStart: `${8 + tag.depth * 16}px`,
										} as CSSProperties
									}
									title={`#${tag.tag} · ${tag.totalCount} note${
										tag.totalCount === 1 ? "" : "s"
									}`}
									whileHover={{
										backgroundColor: "var(--bg-hover)",
									}}
									transition={springTransition}
								>
									<span className="tagsNameWrap">
										<HugeiconsIcon icon={Tag01Icon} size={12} />
										<span className="tagsName">{tag.label}</span>
									</span>
									<span className="tagsCount mono">{tag.totalCount}</span>
								</m.button>
							</m.li>
						);
					})}
				</m.ul>
			) : (
				<div className="tagsEmpty">No tags found.</div>
			)}
		</m.section>
	);
});
