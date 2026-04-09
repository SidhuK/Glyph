import { Folder03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";

interface WelcomeScreenProps {
	onOpenSpace: () => Promise<void> | void;
}

export function WelcomeScreen({ onOpenSpace }: WelcomeScreenProps) {
	const [isOpening, setIsOpening] = useState(false);
	const timeoutRef = useRef<number | null>(null);
	const isOpeningRef = useRef(false);
	const isMountedRef = useRef(true);

	useEffect(
		() => () => {
			isMountedRef.current = false;
			isOpeningRef.current = false;
			if (timeoutRef.current === null) return;
			window.clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		},
		[],
	);

	const handleOpen = useCallback(() => {
		if (isOpeningRef.current) return;
		isOpeningRef.current = true;
		setIsOpening(true);
		if (timeoutRef.current !== null) {
			window.clearTimeout(timeoutRef.current);
		}
		timeoutRef.current = window.setTimeout(() => {
			timeoutRef.current = null;
			void Promise.resolve(onOpenSpace()).finally(() => {
				isOpeningRef.current = false;
				if (isMountedRef.current) {
					setIsOpening(false);
				}
			});
		}, 400);
	}, [onOpenSpace]);

	return (
		<div className={`welcomeEmptyState${isOpening ? " is-opening" : ""}`}>
			<div className="welcomeFolderScene">
				{/* Folder Back */}
				<svg
					className="welcomeFolderBack"
					viewBox="0 0 140 95"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<title>Folder</title>
					<path
						d="M5 0 H 45 C 50 0 53 3 55 6 L 60 16 C 62 19 65 21 68 21 H 135 C 137.7 21 140 23.2 140 26 V 90 C 140 92.7 137.7 95 135 95 H 5 C 2.2 95 0 92.7 0 90 V 5 C 0 2.2 2.2 0 5 0 Z"
						fill="currentColor"
					/>
					<path
						d="M5 1 H 45 C 49.5 1 52.2 3.7 54.1 6.5 L 59.1 16.5 C 61.3 19.8 64.5 22 68 22 H 135 C 137.2 22 139 23.8 139 26"
						stroke="rgba(255,255,255,0.2)"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
				</svg>

				{/* File 1: Graph/Data Bars */}
				<div className="welcomeFile welcomeFile1">
					<svg viewBox="0 0 60 80">
						<title>Data chart</title>
						<rect
							x="5"
							y="10"
							width="15"
							height="4"
							rx="2"
							fill="rgba(255,255,255,0.9)"
						/>
						<rect
							x="5"
							y="25"
							width="8"
							height="35"
							rx="3"
							fill="rgba(255,255,255,0.7)"
						/>
						<rect
							x="18"
							y="40"
							width="8"
							height="20"
							rx="3"
							fill="rgba(255,255,255,0.5)"
						/>
						<rect
							x="31"
							y="15"
							width="8"
							height="45"
							rx="3"
							fill="rgba(255,255,255,0.8)"
						/>
						<rect
							x="44"
							y="30"
							width="8"
							height="30"
							rx="3"
							fill="rgba(255,255,255,0.6)"
						/>
					</svg>
				</div>

				{/* File 2: Checklist */}
				<div className="welcomeFile welcomeFile2">
					<svg viewBox="0 0 60 80">
						<title>Checklist</title>
						<rect
							x="5"
							y="10"
							width="30"
							height="5"
							rx="2.5"
							fill="rgba(0,0,0,0.3)"
						/>
						<circle cx="8" cy="28" r="3" fill="rgba(0,0,0,0.4)" />
						<rect
							x="15"
							y="26"
							width="35"
							height="4"
							rx="2"
							fill="rgba(0,0,0,0.2)"
						/>
						<circle cx="8" cy="40" r="3" fill="rgba(0,0,0,0.4)" />
						<rect
							x="15"
							y="38"
							width="25"
							height="4"
							rx="2"
							fill="rgba(0,0,0,0.2)"
						/>
						<circle cx="8" cy="52" r="3" fill="rgba(0,0,0,0.4)" />
						<rect
							x="15"
							y="50"
							width="40"
							height="4"
							rx="2"
							fill="rgba(0,0,0,0.2)"
						/>
						<circle cx="8" cy="64" r="3" fill="rgba(0,0,0,0.4)" />
						<rect
							x="15"
							y="62"
							width="20"
							height="4"
							rx="2"
							fill="rgba(0,0,0,0.2)"
						/>
					</svg>
				</div>

				{/* File 3: Wavy Notes */}
				<div className="welcomeFile welcomeFile3">
					<svg
						viewBox="0 0 60 80"
						fill="none"
						stroke="rgba(0,0,0,0.3)"
						strokeWidth="2"
						strokeLinecap="round"
					>
						<title>Notes</title>
						<rect
							x="5"
							y="10"
							width="20"
							height="5"
							rx="2.5"
							fill="rgba(0,0,0,0.3)"
							stroke="none"
						/>
						<path d="M 5 30 Q 10 26, 15 30 T 25 30 T 35 30 T 45 30 T 55 30" />
						<path d="M 5 45 Q 10 41, 15 45 T 25 45 T 35 45 T 45 45 T 50 45" />
						<path d="M 5 60 Q 10 56, 15 60 T 25 60 T 35 60 T 40 60" />
					</svg>
				</div>

				{/* File 4: Standard Document */}
				<div className="welcomeFile welcomeFile4">
					<svg viewBox="0 0 60 80">
						<title>Document</title>
						<rect x="5" y="10" width="40" height="6" rx="3" fill="#cbd5e1" />
						<rect x="5" y="25" width="50" height="3" rx="1.5" fill="#e2e8f0" />
						<rect x="5" y="33" width="45" height="3" rx="1.5" fill="#e2e8f0" />
						<rect x="5" y="41" width="50" height="3" rx="1.5" fill="#e2e8f0" />
						<rect x="5" y="49" width="30" height="3" rx="1.5" fill="#e2e8f0" />
						<rect x="5" y="62" width="20" height="8" rx="4" fill="#94a3b8" />
					</svg>
				</div>

				{/* Folder Front */}
				<div className="welcomeFolderFront" />
			</div>

			<div className="welcomeTextContent">
				<h1 className="welcomeHeading">Give your thoughts a home</h1>
				<p className="welcomeSubtext">
					Your notes, your files, your machine. Glyph works best with your
					existing folders of Markdown notes, or a new folder if you want a
					clean start.
				</p>
			</div>

			<button type="button" className="welcomeActionBtn" onClick={handleOpen}>
				<HugeiconsIcon icon={Folder03Icon} size={16} strokeWidth={0.9} />
				Open Folder
			</button>
		</div>
	);
}
