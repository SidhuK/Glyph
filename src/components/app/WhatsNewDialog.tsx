import { ArrowRight01Icon, Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReleaseNotesManifest } from "../../lib/releaseNotes";
import { Button } from "../ui/shadcn/button";
import { Dialog, DialogContent, DialogTitle } from "../ui/shadcn/dialog";

interface WhatsNewDialogProps {
	open: boolean;
	releaseNotes: ReleaseNotesManifest;
	publicChangelogUrl: string;
	onClose: () => void;
}

function formatPublishedDate(value: string | null): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(date);
}

function getSectionItemKeys(items: string[]): string[] {
	const seen = new Map<string, number>();
	return items.map((item) => {
		const occurrence = seen.get(item) ?? 0;
		seen.set(item, occurrence + 1);
		return `${item}:${occurrence}`;
	});
}

export function WhatsNewDialog({
	open,
	releaseNotes,
	publicChangelogUrl,
	onClose,
}: WhatsNewDialogProps) {
	const publishedDate = formatPublishedDate(releaseNotes.publishedAt);
	const updateCount = releaseNotes.sections.reduce(
		(total, section) => total + section.items.length,
		0,
	);

	const handleOpenChangelog = () => {
		void openUrl(publicChangelogUrl).catch((error) => {
			console.error("Failed to open changelog URL", error);
		});
	};

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent
				className="commandPalette whatsNewDialog top-[46%] gap-0 border-none bg-transparent p-0 shadow-none sm:max-w-[620px]"
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">What&apos;s New</DialogTitle>

				<div className="commandPaletteHeader whatsNewHeader">
					<div className="whatsNewHeadingRow">
						<div>
							<div className="whatsNewEyebrow">What&apos;s New</div>
							<div className="whatsNewTitleRow">
								<h2 className="whatsNewTitle">Glyph v{releaseNotes.version}</h2>
								<span className="settingsPill settingsPillInfo">
									{updateCount} update{updateCount === 1 ? "" : "s"}
								</span>
							</div>
						</div>
						{publishedDate ? (
							<div className="whatsNewMeta">
								<HugeiconsIcon icon={Calendar03Icon} size={14} />
								<span>{publishedDate}</span>
							</div>
						) : null}
					</div>
					<p className="whatsNewSummary">
						Recent improvements in this build, styled to match the rest of
						Glyph.
					</p>
				</div>

				<div className="commandPaletteBody whatsNewBody">
					<div className="commandPaletteList whatsNewList">
						{releaseNotes.sections
							.filter(
								(section) =>
									Array.isArray(section.items) && section.items.length > 0,
							)
							.map((section) => {
								const itemKeys = getSectionItemKeys(section.items);
								return (
									<div key={section.category} className="whatsNewSection">
										<div className="commandPaletteSectionLabel">
											{section.category}
										</div>
										{section.items.map((item, itemIndex) => (
											<div
												key={`${section.category}:${itemKeys[itemIndex]}`}
												className="commandPaletteItem commandPaletteResultItem whatsNewItem"
												data-selected="false"
											>
												<div className="commandPaletteResultContent">
													<div className="commandPaletteResultTitle">
														{item}
													</div>
												</div>
											</div>
										))}
									</div>
								);
							})}
					</div>
				</div>

				<div className="whatsNewFooter">
					<Button type="button" variant="outline" onClick={handleOpenChangelog}>
						See full changelog
						<HugeiconsIcon icon={ArrowRight01Icon} size={14} />
					</Button>
					<Button type="button" onClick={onClose}>
						Continue
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
