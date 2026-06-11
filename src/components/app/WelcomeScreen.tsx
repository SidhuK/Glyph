import { useCallback, useRef, useState } from "react";
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

	return (
		<div className="welcomeScreen">
			<div className="welcomeScreenBody">
				<img
					className="welcomeScreenIcon"
					src={glyphIconUrl}
					alt=""
					aria-hidden="true"
				/>
				<h1 className="welcomeScreenTitle">
					Glyph
					<span className="welcomeScreenTitleSub">Write. Reflect. Discover.</span>
				</h1>
				<p className="welcomeScreenSub">
					Open your current notes folder or create a new workspace.
				</p>
				<button
					type="button"
					className="welcomeScreenBtn"
					onClick={handleOpen}
					disabled={isOpening}
					aria-busy={isOpening}
				>
					{isOpening ? "Opening..." : "Open Folder"}
				</button>
				<p className="welcomeScreenKicker">Plain Markdown. Local files.</p>
			</div>
		</div>
	);
}
