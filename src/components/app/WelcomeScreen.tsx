import { onWindowDragMouseDown } from "../../utils/window";
import { FolderOpen, FolderPlus } from "../Icons";

interface WelcomeScreenProps {
	appName: string | null;
	lastSpacePath: string | null;
	recentSpaces: string[];
	onOpenSpace: () => void;
	onCreateSpace: () => void;
	onContinueLastSpace: () => void;
	onSelectRecentSpace: (path: string) => Promise<void>;
}

export function WelcomeScreen({
	appName,
	lastSpacePath,
	recentSpaces,
	onOpenSpace,
	onCreateSpace,
	onContinueLastSpace,
	onSelectRecentSpace,
}: WelcomeScreenProps) {
	const lastSpaceName = lastSpacePath?.split("/").pop() ?? null;
	const otherRecents = recentSpaces.filter((path) => path !== lastSpacePath);

	return (
		<>
			<div className="mainToolbar" data-tauri-drag-region>
				<div
					aria-hidden="true"
					className="mainToolbarDragLayer"
					data-tauri-drag-region
					onMouseDown={onWindowDragMouseDown}
				/>
				<div className="mainToolbarLeft">
					<span className="canvasTitle">{appName ?? "Glyph"}</span>
				</div>
			</div>
			<div className="welcomeScreen">
				<div className="welcomeSurface">
					<div className="welcomeLauncher">
						<section className="welcomePanel">
							<div className="welcomeSectionTitle">Open a folder</div>
							<p className="welcomeSectionBody">
								Use an existing folder of markdown files or create a new one for
								this space.
							</p>
							<div className="welcomeActionList">
								{lastSpacePath && (
									<button
										type="button"
										className="welcomeActionButton welcomeActionButtonPrimary"
										onClick={() => void onContinueLastSpace()}
									>
										<div className="welcomeActionContent">
											<div className="welcomeActionLabel">
												<FolderOpen size={16} strokeWidth={1.8} />
												<span>Continue {lastSpaceName}</span>
											</div>
											<div className="welcomeActionHint">{lastSpacePath}</div>
										</div>
									</button>
								)}
								<button
									type="button"
									className="welcomeActionButton"
									onClick={onOpenSpace}
								>
									<div className="welcomeActionContent">
										<div className="welcomeActionLabel">
											<FolderOpen size={16} strokeWidth={1.8} />
											<span>Open folder</span>
										</div>
										<div className="welcomeActionHint">
											Work with notes you already have.
										</div>
									</div>
								</button>
								<button
									type="button"
									className="welcomeActionButton"
									onClick={onCreateSpace}
								>
									<div className="welcomeActionContent">
										<div className="welcomeActionLabel">
											<FolderPlus size={16} strokeWidth={1.8} />
											<span>Create space</span>
										</div>
										<div className="welcomeActionHint">
											Start a new folder and keep everything local.
										</div>
									</div>
								</button>
							</div>
						</section>

						<section className="welcomePanel">
							<div className="welcomeSectionTitle">What Glyph uses</div>
							<ul className="welcomeBulletList">
								<li>Local folders on your computer</li>
								<li>Plain markdown files for notes</li>
								<li>
									Search, daily notes, and optional AI once a space is open
								</li>
							</ul>

							<div className="welcomeSectionTitle welcomeSectionTitleCompact">
								Recent spaces
							</div>
							{otherRecents.length > 0 ? (
								<div className="welcomeRecentList">
									{otherRecents.slice(0, 6).map((path) => (
										<button
											key={path}
											type="button"
											className="welcomeRecentItem"
											onClick={() => void onSelectRecentSpace(path)}
										>
											<span className="welcomeRecentName">
												{path.split("/").pop() ?? path}
											</span>
											<span className="welcomeRecentPath mono">{path}</span>
										</button>
									))}
								</div>
							) : (
								<p className="welcomeEmptyText">
									Your recent spaces will show up here.
								</p>
							)}
						</section>
					</div>
				</div>
			</div>
		</>
	);
}
