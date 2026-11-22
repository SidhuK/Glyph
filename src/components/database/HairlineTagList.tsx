import { splitTagPath, tagColorFromName } from "../editor/noteProperties/utils";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";

interface HairlineTagListProps {
	tags: string[];
	limit: number;
	iconNameForTag?: ((tag: string) => string) | null;
	titleForTag?: (tag: string) => string;
	className?: string;
}

function HairlineTag({
	tag,
	iconName,
	title,
}: {
	tag: string;
	iconName: string | null;
	title: string | undefined;
}) {
	const { parent, leaf } = splitTagPath(tag);
	return (
		<span className="hairlineTag" data-chip-tone={tagColorFromName(tag)} title={title}>
			{iconName ? (
				<DatabaseColumnIcon iconName={iconName} className="hairlineTagIcon" size="var(--icon-xs)" />
			) : null}
			<span className="hairlineTagLabel">
				{parent ? <span className="hairlineTagParent">{parent}</span> : null}
				{leaf}
			</span>
		</span>
	);
}

export function HairlineTagList({
	tags,
	limit,
	iconNameForTag,
	titleForTag,
	className,
}: HairlineTagListProps) {
	const shown = tags.slice(0, limit);
	const hiddenCount = tags.length - shown.length;
	return (
		<span className={className ? `hairlineTagList ${className}` : "hairlineTagList"}>
			{shown.map((tag) => (
				<HairlineTag
					key={tag}
					tag={tag}
					iconName={iconNameForTag ? iconNameForTag(tag) : null}
					title={titleForTag?.(tag)}
				/>
			))}
			{hiddenCount > 0 ? <span className="hairlineTagCount">+{hiddenCount}</span> : null}
		</span>
	);
}
