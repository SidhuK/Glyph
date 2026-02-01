import { motion } from "motion/react";
import { memo, useCallback } from "react";
import type { TagCount } from "../lib/tauri";
import { MotionIconButton } from "./MotionUI";

interface TagsPaneProps {
	tags: TagCount[];
	onSelectTag: (tag: string) => void;
	onRefresh: () => void;
}

const springTransition = { type: "spring", stiffness: 400, damping: 25 } as const;

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
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={springTransition}
		>
			<div className="tagsHeader">
				<div className="tagsTitle">Tags</div>
				<MotionIconButton
					type="button"
					onClick={onRefresh}
					title="Refresh tags"
				>
					<motion.span
						whileHover={{ rotate: 180 }}
						transition={{ duration: 0.3 }}
					>
						↻
					</motion.span>
				</MotionIconButton>
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
					{tags.map((t, index) => (
						<motion.li
							key={t.tag}
							className="tagsItem"
							variants={{
								hidden: { opacity: 0, scale: 0.9 },
								visible: { opacity: 1, scale: 1 },
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
								<span className="tagsName">#{t.tag}</span>
								<motion.span
									className="tagsCount mono"
									initial={{ opacity: 0.5 }}
									whileHover={{ opacity: 1 }}
								>
									{t.count}
								</motion.span>
							</motion.button>
						</motion.li>
					))}
				</motion.ul>
			) : (
				<motion.div
					className="tagsEmpty"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.2 }}
				>
					No tags found.
				</motion.div>
			)}
		</motion.section>
	);
});
