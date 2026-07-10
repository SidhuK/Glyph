import { Tag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m } from "motion/react";
import {
	type CSSProperties,
	memo,
	useCallback,
	useMemo,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	type TagIconOverrides,
	tagIconOverridesFromAppearance,
} from "../lib/tagIcons";
import type { PersonCount, TagAppearance, TagCount } from "../lib/tauri";
import { ChevronDown, ChevronRight } from "./Icons";
import { TagIconPicker } from "./TagIconPicker";
import { springPresets } from "./ui/animations";

interface TagsPaneProps {
	tags: TagCount[];
	people: PersonCount[];
	onSelectTag: (tag: string) => void;
	onSelectPerson: (handle: string) => void;
	beautifulTags?: boolean;
	tagAppearance?: Record<string, TagAppearance>;
	onChangeTagIcon?: (tag: string, iconName: string | null) => Promise<void>;
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
	beautifulTags = false,
	tagAppearance = {},
	onChangeTagIcon,
}: TagsPaneProps) {
	const { t } = useTranslation("shell");
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
	const [sectionExpanded, setSectionExpanded] = useState(false);
	const rows = buildTagTreeRows(tags);
	const peopleRows = buildPeopleRows(people);
	const tagIconOverrides = useMemo(
		() => tagIconOverridesFromAppearance(tagAppearance),
		[tagAppearance],
	);

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
					aria-label={sectionExpanded ? t("tags.collapse") : t("tags.expand")}
				>
					<span>{t("tags.header")}</span>
					{sectionExpanded ? (
						<ChevronDown size="var(--icon-xs)" className="tagsHeaderChevron" />
					) : (
						<ChevronRight size="var(--icon-xs)" className="tagsHeaderChevron" />
					)}
				</button>
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
						{visibleRows.map((tag) => {
							return (
								<m.li key={tag.tag} className="tagsItem">
									<m.div
										className="tagsButton"
										data-explicit={tag.isExplicit ? "true" : "false"}
										style={
											{
												paddingInlineStart: `${8 + tag.depth * 16}px`,
											} as CSSProperties
										}
										title={`#${tag.tag} · ${tag.totalCount} note${
											tag.totalCount === 1 ? "" : "s"
										}`}
										transition={springTransition}
									>
										<TagRowIcon
											tag={tag.tag}
											beautifulTags={beautifulTags}
											overrides={tagIconOverrides}
											onChangeTagIcon={onChangeTagIcon}
										/>
										<button
											type="button"
											className="tagsMainButton"
											onClick={() => onClick(tag.tag)}
										>
											<span className="tagsName">{tag.label}</span>
											<span className="tagsCount">{tag.totalCount}</span>
										</button>
									</m.div>
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
								? t("tags.showLess")
								: t("tags.showMore", { count: rows.length - TAG_LIMIT })}
						</button>
					) : null}
					{peopleRows.length ? (
						<>
							<div className="tagsHeader tagsSubheader">
								<div className="tagsHeaderTitle">{t("tags.people")}</div>
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
						<div className="tagsHeaderTitle">{t("tags.people")}</div>
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

function TagRowIcon({
	tag,
	beautifulTags,
	overrides,
	onChangeTagIcon,
}: {
	tag: string;
	beautifulTags: boolean;
	overrides: TagIconOverrides;
	onChangeTagIcon?: (tag: string, iconName: string | null) => Promise<void>;
}) {
	if (beautifulTags) {
		return (
			<TagIconPicker
				tag={tag}
				overrides={overrides}
				beautifulTagsEnabled={beautifulTags}
				className="tagsIconPicker"
				onChange={(iconName) => {
					if (!onChangeTagIcon) return;
					void onChangeTagIcon(tag, iconName).catch((error: unknown) => {
						console.error("Failed to change tag icon", error);
					});
				}}
			/>
		);
	}

	return (
		<HugeiconsIcon
			icon={Tag01Icon}
			className="tagsIcon"
			size="var(--icon-sm)"
			strokeWidth={0.9}
		/>
	);
}
