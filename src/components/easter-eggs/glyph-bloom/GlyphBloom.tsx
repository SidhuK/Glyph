import type { AnimationEvent, MouseEvent } from "react";
import { useState } from "react";
import styles from "./GlyphBloom.module.css";

interface GlyphBloomProps {
	iconUrl: string;
}

export function GlyphBloom({ iconUrl }: GlyphBloomProps) {
	const [bloomId, setBloomId] = useState<number | null>(null);

	const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
		if (event.detail !== 3) return;
		setBloomId((currentId) => (currentId ?? 0) + 1);
	};

	const handleBloomAnimationEnd = (event: AnimationEvent<HTMLSpanElement>) => {
		if (event.target === event.currentTarget) {
			setBloomId(null);
		}
	};

	return (
		<div className={styles.trigger} onMouseDown={handleMouseDown}>
			<img
				className={`${styles.icon} welcomeScreenIcon`}
				src={iconUrl}
				alt=""
				aria-hidden="true"
			/>
			{bloomId !== null ? (
				<span
					key={bloomId}
					className={styles.bloom}
					aria-hidden="true"
					onAnimationEnd={handleBloomAnimationEnd}
				>
					<span className={styles.spark} />
				</span>
			) : null}
		</div>
	);
}
