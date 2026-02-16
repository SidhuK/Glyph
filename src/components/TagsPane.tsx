import { Tag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import { memo, useCallback } from "react";
import type { TagCount } from "../lib/tauri";
import { springPresets } from "./ui/animations";
import { Button } from "./ui/shadcn/button";

interface TagsPaneProps {
	tags: TagCount[];
	onSelectTag: (tag: string) => void;
	onRefresh: () => void;
}

const springTransition = springPresets.bouncy;

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
		<motion.section
			className="tagsPane"
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
					<motion.span
						whileHover={{ rotate: 180 }}
						transition={{ duration: 0.3 }}
					>
						↻
					</motion.span>
				</Button>
			</div>
			{tags.length ? (
				<motion.ul
					className="tagsList"
					initial="hidden"
					animate="visible"
					variants={{
						visible: { transition: { staggerChildren: 0.02 } },
						hidden: {},
					}}
				>
					{tags.map((t, index) => {
						const displayTag = t.tag.startsWith("#") ? t.tag.slice(1) : t.tag;
						return (
						<motion.li
							key={t.tag}
							className="tagsItem"
							variants={{
								hidden: { scale: 0.9 },
								visible: { scale: 1 },
							}}
							transition={{ ...springTransition, delay: index * 0.015 }}
						>
							<motion.button
								type="button"
								className="tagsButton"
								onClick={() => onClick(t.tag)}
								title={`${t.count}`}
								whileHover={{
									scale: 1.02,
									y: -1,
									backgroundColor: "var(--bg-hover)",
								}}
								whileTap={{ scale: 0.98 }}
								transition={springTransition}
							>
								<span className="tagsNameWrap">
									<HugeiconsIcon icon={Tag01Icon} size={12} />
									<span className="tagsName">{displayTag}</span>
								</span>
								<span className="tagsCount mono">{t.count}</span>
							</motion.button>
						</motion.li>
						);
					})}
				</motion.ul>
			) : (
				<div className="tagsEmpty">No tags found.</div>
			)}
		</motion.section>
	);
});
