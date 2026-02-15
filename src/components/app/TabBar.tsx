import { useCallback } from "react";

interface TabBarProps {
	openTabs: string[];
	activeTabPath: string | null;
	dirtyByPath: Record<string, boolean>;
	dragTabPath: string | null;
	onSelectTab: (path: string) => void;
	onCloseTab: (path: string) => void;
	onDragStart: (path: string) => void;
	onDragEnd: () => void;
	onReorder: (fromPath: string, toPath: string) => void;
}

export function TabBar({
	openTabs,
	activeTabPath,
	dirtyByPath,
	dragTabPath,
	onSelectTab,
	onCloseTab,
	onDragStart,
	onDragEnd,
	onReorder,
}: TabBarProps) {
	const fileName = useCallback((path: string) => {
		const parts = path.split("/").filter(Boolean);
		return parts[parts.length - 1] ?? path;
	}, []);

	return (
		<div className="mainTabsBar">
			<div className="mainTabsSide" />
			<div className="mainTabsCenter">
				<div className="mainTabsStrip">
					{openTabs.map((path) => {
						const isActive = path === activeTabPath;
						const isDirty = Boolean(dirtyByPath[path]);
						return (
							<button
								key={path}
								type="button"
								className={`mainTab ${isActive ? "is-active" : ""}`}
								onClick={() => onSelectTab(path)}
								title={path}
								draggable
								onDragStart={() => onDragStart(path)}
								onDragEnd={onDragEnd}
								onDragOver={(event) => event.preventDefault()}
								onDrop={(event) => {
									event.preventDefault();
									if (dragTabPath) onReorder(dragTabPath, path);
									onDragEnd();
								}}
							>
								{isDirty ? (
									<span className="mainTabDirty" aria-hidden />
								) : null}
								<span className="mainTabLabel">{fileName(path)}</span>
								<button
									type="button"
									className="mainTabClose"
									onClick={(event) => {
										event.stopPropagation();
										onCloseTab(path);
									}}
									aria-label={`Close ${fileName(path)}`}
								>
									<span className="mainTabCloseGlyph" aria-hidden>
										×
									</span>
								</button>
							</button>
						);
					})}
				</div>
			</div>
			<div className="mainTabsSide" />
		</div>
	);
}
