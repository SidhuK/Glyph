import { memo, useCallback } from "react";
import type { TagCount } from "../lib/tauri";

interface TagsPaneProps {
	tags: TagCount[];
	onSelectTag: (tag: string) => void;
	onRefresh: () => void;
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

	return (
		<section className="tagsPane">
			<div className="tagsHeader">
				<div className="tagsTitle">Tags</div>
				<button
					type="button"
					className="iconBtn"
					onClick={onRefresh}
					title="Refresh tags"
				>
					↻
				</button>
			</div>
			{tags.length ? (
				<ul className="tagsList">
					{tags.map((t) => (
						<li key={t.tag} className="tagsItem">
							<button
								type="button"
								className="tagsButton"
								onClick={() => onClick(t.tag)}
								title={`${t.count}`}
							>
								<span className="tagsName">#{t.tag}</span>
								<span className="tagsCount mono">{t.count}</span>
							</button>
						</li>
					))}
				</ul>
			) : (
				<div className="tagsEmpty">No tags found.</div>
			)}
		</section>
	);
});
