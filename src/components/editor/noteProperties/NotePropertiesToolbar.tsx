import { m } from "motion/react";
import type { KeyboardEvent } from "react";
import { useCallback, useRef } from "react";
import { Code, List } from "../../Icons";
import { springPresets } from "../../ui/animations";

interface NotePropertiesToolbarProps {
	mode: "properties" | "raw";
	canShowProperties: boolean;
	onModeChange: (mode: "properties" | "raw") => void;
}

export function NotePropertiesToolbar({
	mode,
	canShowProperties,
	onModeChange,
}: NotePropertiesToolbarProps) {
	const propertiesButtonRef = useRef<HTMLButtonElement | null>(null);
	const rawButtonRef = useRef<HTMLButtonElement | null>(null);

	const moveFocusToMode = useCallback(
		(nextMode: "properties" | "raw") => {
			if (nextMode === "properties" && !canShowProperties) {
				rawButtonRef.current?.focus();
				onModeChange("raw");
				return;
			}
			if (nextMode === "properties") {
				propertiesButtonRef.current?.focus();
			} else {
				rawButtonRef.current?.focus();
			}
			onModeChange(nextMode);
		},
		[canShowProperties, onModeChange],
	);

	const handleTabKeyDown = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>) => {
			if (event.key === "ArrowRight") {
				event.preventDefault();
				moveFocusToMode(mode === "properties" ? "raw" : "properties");
				return;
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				moveFocusToMode(mode === "raw" ? "properties" : "raw");
				return;
			}
			if (event.key === "Home") {
				event.preventDefault();
				moveFocusToMode(canShowProperties ? "properties" : "raw");
				return;
			}
			if (event.key === "End") {
				event.preventDefault();
				moveFocusToMode("raw");
			}
		},
		[canShowProperties, mode, moveFocusToMode],
	);

	return (
		<div className="notePropertiesToolbar">
			<div className="notePropertiesToolbarLabel">Frontmatter</div>
			<div
				className="notePropertiesModeSwitch"
				role="tablist"
				aria-label="Frontmatter mode"
			>
				<m.button
					ref={propertiesButtonRef}
					type="button"
					layout
					className="notePropertiesModePill"
					role="tab"
					aria-selected={mode === "properties"}
					tabIndex={mode === "properties" ? 0 : -1}
					data-active={mode === "properties"}
					onClick={() => onModeChange("properties")}
					onKeyDown={handleTabKeyDown}
					disabled={!canShowProperties}
					title="Properties view"
					aria-label="Properties view"
					whileTap={{ scale: 0.94 }}
					transition={springPresets.gentle}
				>
					{mode === "properties" ? (
						<m.span
							className="notePropertiesModePillBg"
							layoutId="notePropertiesModeActive"
							transition={springPresets.gentle}
						/>
					) : null}
					<List size={14} className="notePropertiesModePillIcon" />
				</m.button>
				<m.button
					ref={rawButtonRef}
					type="button"
					layout
					className="notePropertiesModePill"
					role="tab"
					aria-selected={mode === "raw"}
					tabIndex={mode === "raw" ? 0 : -1}
					data-active={mode === "raw"}
					onClick={() => onModeChange("raw")}
					onKeyDown={handleTabKeyDown}
					title="Raw view"
					aria-label="Raw view"
					whileTap={{ scale: 0.94 }}
					transition={springPresets.gentle}
				>
					{mode === "raw" ? (
						<m.span
							className="notePropertiesModePillBg"
							layoutId="notePropertiesModeActive"
							transition={springPresets.gentle}
						/>
					) : null}
					<Code size={14} className="notePropertiesModePillIcon" />
				</m.button>
			</div>
		</div>
	);
}
