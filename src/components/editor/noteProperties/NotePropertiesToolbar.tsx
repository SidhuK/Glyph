import { m } from "motion/react";
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
	return (
		<div className="notePropertiesToolbar">
			<div className="notePropertiesToolbarLabel">Frontmatter</div>
			<div
				className="notePropertiesModeSwitch"
				role="tablist"
				aria-label="Frontmatter mode"
			>
				<m.button
					type="button"
					layout
					className="notePropertiesModePill"
					data-active={mode === "properties"}
					onClick={() => onModeChange("properties")}
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
					type="button"
					layout
					className="notePropertiesModePill"
					data-active={mode === "raw"}
					onClick={() => onModeChange("raw")}
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
