import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import glyphIconUrl from "../../../src-tauri/icons/icon.png";

interface WelcomeScreenProps {
	onOpenSpace: () => Promise<void> | void;
}

export function WelcomeScreen({ onOpenSpace }: WelcomeScreenProps) {
	const [isOpening, setIsOpening] = useState(false);
	const isOpeningRef = useRef(false);

	const handleOpen = useCallback(async () => {
		if (isOpeningRef.current) return;
		isOpeningRef.current = true;
		setIsOpening(true);
		try {
			await onOpenSpace();
		} catch (error) {
			console.error("Failed to open space", error);
		} finally {
			isOpeningRef.current = false;
			setIsOpening(false);
		}
	}, [onOpenSpace]);

	const handleBrandContentKeyDown = useCallback(
		(event: KeyboardEvent<HTMLElement>) => {
			const scrollAmounts: Partial<Record<string, number>> = {
				ArrowUp: -40,
				ArrowDown: 40,
				PageUp: -event.currentTarget.clientHeight,
				PageDown: event.currentTarget.clientHeight,
			};
			const amount = scrollAmounts[event.key];

			if (amount !== undefined) {
				event.preventDefault();
				event.currentTarget.scrollBy({ top: amount, behavior: "smooth" });
				return;
			}

			if (event.key === "Home") {
				event.preventDefault();
				event.currentTarget.scrollTo({ top: 0, behavior: "smooth" });
				return;
			}

			if (event.key === "End") {
				event.preventDefault();
				event.currentTarget.scrollTo({
					top: event.currentTarget.scrollHeight,
					behavior: "smooth",
				});
			}
		},
		[],
	);

	return (
		<div className={`welcomeEmptyState${isOpening ? " is-opening" : ""}`}>
			<section className="welcomeBrandPane" aria-labelledby="welcome-title">
				<section
					className="welcomeBrandContent"
					aria-label="Welcome information"
					/* biome-ignore lint/a11y/noNoninteractiveTabindex: This scroll region must be focusable for keyboard scrolling. */
					tabIndex={0}
					onKeyDown={handleBrandContentKeyDown}
				>
					<img
						className="welcomeCornerGlyph"
						src={glyphIconUrl}
						alt=""
						aria-hidden="true"
					/>
					<p className="welcomeKicker">Plain Markdown. Local files.</p>
					<h1 id="welcome-title" className="welcomeHeading">
						Start using Glyph
					</h1>
					<div className="welcomeFeatureList">
						<div className="welcomeFeature">
							<span className="welcomeFeatureMark" aria-hidden="true" />
							<div>
								<h2>Pick a folder.</h2>
								<p>Open existing Markdown notes or create a clean workspace.</p>
							</div>
						</div>
						<div className="welcomeFeature">
							<span className="welcomeFeatureMark" aria-hidden="true" />
							<div>
								<h2>Keep files local.</h2>
								<p>Glyph stores notes on your machine.</p>
							</div>
						</div>
						<div className="welcomeFeature">
							<span className="welcomeFeatureMark" aria-hidden="true" />
							<div>
								<h2>Work in one place.</h2>
								<p>Write notes, track tasks, and bring AI the right context.</p>
							</div>
						</div>
					</div>
					<div className="welcomeDivider" aria-hidden="true" />
				</section>
			</section>
			<div className="welcomeActionPane">
				<div className="welcomeActionHint" aria-hidden="true">
					<span>click this to begin</span>
					<svg
						className="welcomeActionScribble"
						viewBox="0 0 640 1280"
						xmlns="http://www.w3.org/2000/svg"
						aria-hidden="true"
						focusable="false"
					>
						<path
							d="M448.6 3c-3.4 8.2-11.2 48.7-18.5 96.5-16.1 105-57.1 388.1-74 511-1.7 12.1-7.6 54.6-13 94.5-23.9 173.4-40.1 302.4-44.6 354.4l-.7 7.9-6.2-.7c-10.9-1.1-32.3-5.5-57.1-11.8-13.2-3.4-26.5-6.2-29.6-6.4-4.2-.2-6.8-1-10.4-3.3-2.7-1.7-6-3.1-7.3-3.1-2.3 0-2.4.3-2 4.3.5 4.2 4.7 13.1 22 46.7 8.6 16.7 18.8 38.8 24.8 54 11.3 28.3 17.4 47.9 30 96.5 4.6 17.5 6.3 22.6 9.3 26.8 1 1.5 2.3 4.3 2.8 6.2 1.3 4.4 2.9 4.4 6.8-.1 4.1-4.6 6-7.7 21.1-33.9 32.7-56.5 53.2-84.6 96.9-132.4 26.3-28.9 30.4-34.2 28.5-37.2-1.1-1.8-9.4-.5-15.8 2.4l-5.8 2.7 1.6-2.5c.9-1.3 1.6-3.3 1.6-4.4 0-4.7-6.9-5.5-32-3.7-22.3 1.6-35 2-53.4 1.8-10.8-.2-11.8-.4-11.3-2 6.3-21.4 12.9-50.9 18.7-83.2 9.5-53.6 22.8-139.6 38-245.5 3.8-26.4 7.6-52.7 8.4-58.5.9-5.8 5.2-36.3 9.6-67.8 4.4-31.4 11.6-82.7 16-114 23.3-165.9 38.8-285.4 45.4-351.2 5.2-51.2 6-63.7 6-96.5.1-33.6-.7-46.1-2.9-49.2-1.3-1.7-1.5-1.6-2.9 1.7zM238.1 1088.4c15.5 8.2 34.4 14.7 53.2 18.3 14.4 2.8 46.9 2.5 60.3-.5 8.8-1.9 18.5-4.9 25.9-7.8 1.1-.4-1.6 2.1-6 5.7-21.7 17.5-45.6 45.3-62.7 72.9-9.6 15.5-22.9 43.6-27 57-.3.8-1-4.5-1.7-11.8-4.2-46.4-20.2-92-45.3-129.5-3.2-4.8-5.7-8.7-5.4-8.7.2 0 4.1 2 8.7 4.4z"
							fill="currentColor"
						/>
					</svg>
				</div>
				<button
					type="button"
					className="welcomeActionBtn"
					onClick={handleOpen}
					disabled={isOpening}
					aria-busy={isOpening}
				>
					{isOpening ? "Opening..." : "Open Folder"}
				</button>
			</div>
		</div>
	);
}
