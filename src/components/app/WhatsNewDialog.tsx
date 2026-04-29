import {
	AddCircleIcon,
	CheckmarkCircle02Icon,
	Delete02Icon,
	PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";
import type { VersionReleaseNotes } from "../../data/releaseNotes";
import type { ReleaseNoteCategory } from "../../lib/releaseNotes";
import { Button } from "../ui/shadcn/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/shadcn/dialog";

const CATEGORY_ICONS: Record<
	ReleaseNoteCategory,
	ComponentProps<typeof HugeiconsIcon>["icon"]
> = {
	Added: AddCircleIcon,
	Improved: PencilEdit02Icon,
	Fixed: CheckmarkCircle02Icon,
	Removed: Delete02Icon,
};

interface WhatsNewDialogProps {
	version: VersionReleaseNotes | null;
	open: boolean;
	onClose: () => void;
}

function formatPublishedDate(value: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return value;
	const [, yearValue, monthValue, dayValue] = match;
	const year = Number(yearValue);
	const month = Number(monthValue);
	const day = Number(dayValue);
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		Number.isNaN(date.getTime()) ||
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	)
		return value;
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	}).format(date);
}

export function WhatsNewDialog({
	version,
	open,
	onClose,
}: WhatsNewDialogProps) {
	const publishedDate = version ? formatPublishedDate(version.publishedAt) : "";
	const sections =
		version?.sections.filter(
			(section) => Array.isArray(section.items) && section.items.length > 0,
		) ?? [];

	return (
		<Dialog
			open={open && version !== null}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) onClose();
			}}
		>
			<DialogContent className="whatsNewDialog">
				<DialogHeader className="whatsNewHeader">
					<div className="whatsNewIdentity">
						<img
							src={`/glyph-app-icon.png?v=${version?.version ?? "dev"}`}
							alt=""
							className="whatsNewIcon"
							aria-hidden="true"
						/>
						<div className="whatsNewTitleBlock">
							<div className="whatsNewEyebrow">What’s New</div>
							<DialogTitle>Glyph v{version?.version}</DialogTitle>
						</div>
					</div>
					<div className="whatsNewMeta">
						<DialogDescription>
							{publishedDate ? `Released ${publishedDate}` : "Latest release"}
						</DialogDescription>
					</div>
				</DialogHeader>
				<div className="whatsNewBody">
					{sections.map((section) => (
						<section
							key={section.category}
							className="whatsNewSection"
							data-category={section.category}
						>
							<div className="whatsNewCategory">
								<span className="whatsNewCategoryIcon" aria-hidden="true">
									<HugeiconsIcon
										icon={CATEGORY_ICONS[section.category]}
										size={14}
										strokeWidth={1.1}
									/>
								</span>
								<span>{section.category}</span>
							</div>
							<ul className="whatsNewList">
								{section.items.map((item, index) => (
									<li key={`${section.category}-${index}`}>
										<span className="whatsNewItemMarker" aria-hidden="true" />
										<span>{item}</span>
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
				<DialogFooter className="whatsNewFooter">
					<Button type="button" size="sm" onClick={onClose}>
						Got it
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
