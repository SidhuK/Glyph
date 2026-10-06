import type { DatabaseViewLayout } from "../../lib/tauri";
import { Calendar, Gallery, type IconProps, Kanban, Table } from "../Icons";

export function DatabaseLayoutIcon({
	layout,
	...props
}: IconProps & { layout: DatabaseViewLayout }) {
	switch (layout) {
		case "table":
			return <Table {...props} />;
		case "board":
			return <Kanban {...props} />;
		case "calendar":
			return <Calendar {...props} />;
		case "gallery":
			return <Gallery {...props} />;
		default: {
			const _exhaustive: never = layout;
			return _exhaustive;
		}
	}
}
