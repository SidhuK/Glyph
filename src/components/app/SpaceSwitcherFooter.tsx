import { useCallback, useRef } from "react";
import { useSpace } from "../../contexts/SpaceContext";

const SWIPE_THRESHOLD = 48;
const SWIPE_COOLDOWN_MS = 300;

interface SpaceSwitcherFooterProps {
	onSwitch: (path: string) => void;
	onSwitchNext?: () => void;
	onSwitchPrevious?: () => void;
	reducedMotion?: boolean | null;
}

export function SpaceSwitcherFooter({
	onSwitch,
	onSwitchNext,
	onSwitchPrevious,
	reducedMotion,
}: SpaceSwitcherFooterProps) {
	const { activeSpaceIndex, openSpaces } = useSpace();
	const wheelDeltaRef = useRef(0);
	const cooldownRef = useRef(false);

	const handleWheel = useCallback(
		(event: React.WheelEvent<HTMLDivElement>) => {
			if (reducedMotion || openSpaces.length < 2) return;
			if (!onSwitchNext || !onSwitchPrevious) return;
			if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;

			event.preventDefault();
			if (cooldownRef.current) return;

			wheelDeltaRef.current += event.deltaX;
			if (Math.abs(wheelDeltaRef.current) < SWIPE_THRESHOLD) return;

			const goNext = wheelDeltaRef.current > 0;
			wheelDeltaRef.current = 0;
			cooldownRef.current = true;
			window.setTimeout(() => {
				cooldownRef.current = false;
			}, SWIPE_COOLDOWN_MS);

			if (goNext) {
				onSwitchNext();
			} else {
				onSwitchPrevious();
			}
		},
		[onSwitchNext, onSwitchPrevious, openSpaces.length, reducedMotion],
	);

	if (openSpaces.length <= 1) return null;

	return (
		<div
			className="spaceSwitcher"
			role="toolbar"
			aria-label="Open spaces"
			onWheel={handleWheel}
		>
			<div className="spaceSwitcherDots">
				{openSpaces.map((space, index) => {
					const isActive = index === activeSpaceIndex;
					return (
						<button
							key={space.path}
							type="button"
							className="spaceSwitcherDot"
							data-active={isActive ? "true" : "false"}
							aria-label={`Switch to ${space.label}`}
							aria-current={isActive ? "true" : undefined}
							title={`${space.label}\n${space.path}`}
							disabled={isActive}
							onClick={() => onSwitch(space.path)}
						/>
					);
				})}
			</div>
		</div>
	);
}
