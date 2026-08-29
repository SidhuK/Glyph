import type { AnimationEvent, KeyboardEvent, MouseEvent } from "react";
import { useState } from "react";
import styles from "./GlyphBloom.module.css";

interface GlyphBloomProps {
	iconUrl: string;
}

export function GlyphBloom({ iconUrl }: GlyphBloomProps) {
	const [bloomId, setBloomId] = useState<number | null>(null);

	const triggerBloom = () => {
		setBloomId((currentId) => (currentId ?? 0) + 1);
	};

	const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
		if (event.detail === 3) {
			triggerBloom();
		}
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === "Enter" || event.key === " ") {
			triggerBloom();
		}
	};

	const handleBloomAnimationEnd = (event: AnimationEvent<HTMLSpanElement>) => {
		if (event.target === event.currentTarget) {
			setBloomId(null);
		}
	};

	return (
		<button
			type="button"
			className={styles.trigger}
			aria-label="Glyph"
			onClick={handleClick}
			onKeyDown={handleKeyDown}
		>
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
		</button>
	);
}
