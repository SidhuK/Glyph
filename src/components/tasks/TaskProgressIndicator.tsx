import type { NoteTaskSummary } from "../../lib/tauri";

interface TaskProgressIndicatorProps {
	summary: NoteTaskSummary;
	className?: string;
}

const COLOR_STOPS = [
	{ t: 0.0, rgb: [251, 75, 75] },
	{ t: 0.25, rgb: [255, 168, 121] },
	{ t: 0.5, rgb: [255, 193, 99] },
	{ t: 0.75, rgb: [254, 255, 92] },
	{ t: 0.9, rgb: [74, 222, 128] },
	{ t: 1.0, rgb: [59, 130, 246] },
];

function getProgressColor(ratio: number): string {
	for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
		if (ratio >= COLOR_STOPS[i].t && ratio <= COLOR_STOPS[i + 1].t) {
			const local =
				(ratio - COLOR_STOPS[i].t) / (COLOR_STOPS[i + 1].t - COLOR_STOPS[i].t);
			const r = Math.round(
				COLOR_STOPS[i].rgb[0] +
					(COLOR_STOPS[i + 1].rgb[0] - COLOR_STOPS[i].rgb[0]) * local,
			);
			const g = Math.round(
				COLOR_STOPS[i].rgb[1] +
					(COLOR_STOPS[i + 1].rgb[1] - COLOR_STOPS[i].rgb[1]) * local,
			);
			const b = Math.round(
				COLOR_STOPS[i].rgb[2] +
					(COLOR_STOPS[i + 1].rgb[2] - COLOR_STOPS[i].rgb[2]) * local,
			);
			return `rgb(${r}, ${g}, ${b})`;
		}
	}
	const last = COLOR_STOPS[COLOR_STOPS.length - 1];
	return `rgb(${last.rgb.join(", ")})`;
}

function buildGradient(
	completed: number,
	total: number,
	color: string,
): string {
	const muted = `color-mix(in srgb, ${color} 20%, transparent)`;
	if (total === 0) {
		return `conic-gradient(${muted} 0deg 360deg)`;
	}

	if (total <= 12) {
		const slice = 360 / total;
		const stops: string[] = [];
		for (let i = 0; i < total; i++) {
			const start = i * slice;
			const end = (i + 1) * slice;
			stops.push(`${i < completed ? color : muted} ${start}deg ${end}deg`);
		}
		return `conic-gradient(${stops.join(", ")})`;
	}

	const completedDeg = (completed / total) * 360;
	if (completedDeg <= 0) {
		return `conic-gradient(${muted} 0deg 360deg)`;
	}
	if (completedDeg >= 360) {
		return `conic-gradient(${color} 0deg 360deg)`;
	}
	return `conic-gradient(${color} 0deg ${completedDeg}deg, ${muted} ${completedDeg}deg 360deg)`;
}

export function TaskProgressIndicator({
	summary,
	className = "",
}: TaskProgressIndicatorProps) {
	const { completed_count, total_count } = summary;
	const ratio = total_count > 0 ? completed_count / total_count : 0;
	const color = getProgressColor(ratio);

	return (
		<div
			className={["markdownEditorTaskProgress", className]
				.filter(Boolean)
				.join(" ")}
			title={`${completed_count}/${total_count} tasks completed`}
			aria-label={`${completed_count} of ${total_count} tasks completed`}
			style={{ "--task-progress-color": color } as React.CSSProperties}
		>
			<div
				className="markdownEditorTaskProgressDonut"
				style={{
					background: buildGradient(completed_count, total_count, color),
				}}
			/>
		</div>
	);
}
