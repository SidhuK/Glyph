import { Tag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m } from "motion/react";
import { type CSSProperties, memo, useCallback, useState } from "react";
import type { PersonCount, TagCount } from "../lib/tauri";
import { ChevronDown, ChevronRight } from "./Icons";
import { springPresets } from "./ui/animations";
import { Button } from "./ui/shadcn/button";

interface TagsPaneProps {
	tags: TagCount[];
	people: PersonCount[];
	onSelectTag: (tag: string) => void;
	onSelectPerson: (handle: string) => void;
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

export interface PeopleRow {
	handle: string;
	count: number;
}

export function buildTagTreeRows(tags: TagCount[]): TagTreeRow[] {
	const isAncestorTag = (ancestor: string, descendant: string): boolean =>
		descendant.startsWith(`${ancestor}/`);

	return [...tags]
		.sort((left, right) => {
			if (isAncestorTag(left.tag, right.tag)) {
				return -1;
			}
			if (isAncestorTag(right.tag, left.tag)) {
				return 1;
			}

			if (right.total_count !== left.total_count) {
				return right.total_count - left.total_count;
			}

			return left.tag.localeCompare(right.tag);
		})
		.map((tag) => ({
			tag: tag.tag,
			label: tag.tag.split("/").pop() ?? tag.tag,
			totalCount: tag.total_count,
			depth: tag.depth,
			isExplicit: tag.is_explicit,
		}));
}

export function buildPeopleRows(people: PersonCount[]): PeopleRow[] {
	return [...people].sort((left, right) =>
		left.handle.localeCompare(right.handle),
	);
}

export const TagsPane = memo(function TagsPane({
	tags,
	people,
	onSelectTag,
	onSelectPerson,
	onRefresh,
}: TagsPaneProps) {
	const onClick = useCallback(
		(tag: string) => onSelectTag(tag.startsWith("#") ? tag : `#${tag}`),
		[onSelectTag],
	);
	const onPersonClick = useCallback(
		(handle: string) =>
			onSelectPerson(handle.startsWith("@") ? handle : `@${handle}`),
		[onSelectPerson],
	);
	const [tagsExpanded, setTagsExpanded] = useState(false);
	const [sectionExpanded, setSectionExpanded] = useState(true);
	const rows = buildTagTreeRows(tags);
	const peopleRows = buildPeopleRows(people);

	const TAG_LIMIT = 5;
	const hasMoreTags = rows.length > TAG_LIMIT;
	const visibleRows = tagsExpanded ? rows : rows.slice(0, TAG_LIMIT);

	return (
		<m.section
			className="tagsPane"
			data-sidebar-list="tags"
			initial={{ y: 10 }}
			animate={{ y: 0 }}
			transition={springTransition}
		>
			<div className="tagsHeader">
				<button
					type="button"
					className="tagsHeaderTitle tagsHeaderToggle"
					onClick={() => setSectionExpanded((v) => !v)}
					aria-expanded={sectionExpanded}
					aria-label={sectionExpanded ? "Collapse Tags" : "Expand Tags"}
				>
					<span>Tags</span>
					{sectionExpanded ? (
						<ChevronDown size={10} className="tagsHeaderChevron" />
					) : (
						<ChevronRight size={10} className="tagsHeaderChevron" />
					)}
				</button>
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
			{!sectionExpanded ? null : rows.length ? (
				<>
					<m.ul
						className="tagsList"
						initial="hidden"
						animate="visible"
						variants={{
							visible: { transition: { staggerChildren: 0.02 } },
							hidden: {},
						}}
					>
						{visibleRows.map((tag, index) => {
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
											<HugeiconsIcon
												icon={Tag01Icon}
												size={12}
												strokeWidth={0.9}
											/>
											<span className="tagsName">{tag.label}</span>
										</span>
										<span className="tagsCount">{tag.totalCount}</span>
									</m.button>
								</m.li>
							);
						})}
					</m.ul>
					{hasMoreTags ? (
						<button
							type="button"
							className="tagsToggle"
							onClick={() => setTagsExpanded((v) => !v)}
						>
							{tagsExpanded
								? "Show less"
								: `Show ${rows.length - TAG_LIMIT} more`}
						</button>
					) : null}
					{peopleRows.length ? (
						<>
							<div className="tagsHeader tagsSubheader">
								<div className="tagsHeaderTitle">People</div>
							</div>
							<ul className="tagsList">
								{peopleRows.map((person) => (
									<li key={person.handle} className="tagsItem">
										<button
											type="button"
											className="tagsButton"
											data-explicit="true"
											onClick={() => onPersonClick(person.handle)}
											title={`@${person.handle} · ${person.count} note${
												person.count === 1 ? "" : "s"
											}`}
										>
											<span className="tagsNameWrap">
												<span className="tagsName">@{person.handle}</span>
											</span>
											<span className="tagsCount">{person.count}</span>
										</button>
									</li>
								))}
							</ul>
						</>
					) : null}
				</>
			) : peopleRows.length ? (
				<>
					<div className="tagsHeader tagsSubheader">
						<div className="tagsHeaderTitle">People</div>
					</div>
					<ul className="tagsList">
						{peopleRows.map((person) => (
							<li key={person.handle} className="tagsItem">
								<button
									type="button"
									className="tagsButton"
									data-explicit="true"
									onClick={() => onPersonClick(person.handle)}
									title={`@${person.handle} · ${person.count} note${
										person.count === 1 ? "" : "s"
									}`}
								>
									<span className="tagsNameWrap">
										<span className="tagsName">@{person.handle}</span>
									</span>
									<span className="tagsCount">{person.count}</span>
								</button>
							</li>
						))}
					</ul>
				</>
			) : (
				<div className="tagsEmpty">No tags found.</div>
			)}
		</m.section>
	);
});
