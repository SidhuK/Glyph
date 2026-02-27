import { Button } from "../../ui/shadcn/button";

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
			<div className="notePropertiesToolbarLabel">Properties</div>
			<div className="notePropertiesToolbarActions">
				<Button
					type="button"
					size="xs"
					variant={mode === "properties" ? "outline" : "ghost"}
					onClick={() => onModeChange("properties")}
					disabled={!canShowProperties}
				>
					Properties
				</Button>
				<Button
					type="button"
					size="xs"
					variant={mode === "raw" ? "outline" : "ghost"}
					onClick={() => onModeChange("raw")}
				>
					Raw
				</Button>
			</div>
		</div>
	);
}
