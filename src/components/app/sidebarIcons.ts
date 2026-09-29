import {
	AiBrain04Icon,
	Archive03Icon,
	Calendar03Icon,
	CalendarAdd01Icon,
	ChartRelationshipIcon,
	InboxIcon as InboxOutlineIcon,
	Layout01Icon,
	LibraryIcon,
	NoteIcon,
	PaintBoardIcon,
	Refresh04Icon,
	SearchIcon as SearchOutlineIcon,
	StickyNote03Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

// Body positions are audited against the pinned Hugeicons 4.2.2 definitions.
// On upgrades, inspect each selected shape and check filled icons in both themes.
// Fill layers paint before every original stroke, so details never disappear
// behind a later body path. CSS hides these layers when colorful mode is off.
function filled(icon: IconSvgElement, bodies: readonly number[]): IconSvgElement {
	return [
		...icon.flatMap(([tag, attributes], index): IconSvgElement =>
			bodies.includes(index)
				? [[tag, { ...attributes, key: `fill-${index}`, className: "sidebarIconFill" }]]
				: [],
		),
		...icon,
	];
}

export const InboxIcon = filled(InboxOutlineIcon, [0]);
export const ArchiveIcon = filled(Archive03Icon, [0, 1]);
export const AllNotesIcon = filled(NoteIcon, [0]);
export const QuickNoteIcon = filled(StickyNote03Icon, [1]);
export const TemplatesIcon = filled(Layout01Icon, [0]);
export const CollectionsIcon = filled(LibraryIcon, [0, 4]);
export const CalendarIcon = filled(Calendar03Icon, [1]);
export const ConnectionsIcon = filled(ChartRelationshipIcon, [3, 4, 5, 6]);
export const CanvasIcon = filled(PaintBoardIcon, [0]);
export const SearchIcon = filled(SearchOutlineIcon, [1]);

// The brain outline contains open folds, so its fill needs a closed silhouette.
export const AgentIcon: IconSvgElement = [
	[
		"path",
		{
			key: "brain-fill",
			className: "sidebarIconFill",
			d: "M7 4.5C5.343 4.5 4 5.843 4 7.5C4 8.069 4.158 8.6 4.433 9.054C3.047 9.319 2 10.537 2 12C2 13.463 3.047 14.681 4.433 14.947C4.158 15.4 4 15.931 4 16.5C4 18.157 5.343 19.5 7 19.5C7 20.881 8.119 22 9.5 22C10.881 22 12 20.881 12 19.5V4.5C12 3.119 10.881 2 9.5 2C8.119 2 7 3.119 7 4.5Z",
		},
	],
	...AiBrain04Icon,
];

// Close the calendar around its lower-right cutout, leaving the plus uncovered.
export const PeriodNoteIcon: IconSvgElement = [
	[
		"path",
		{
			key: "calendar-fill",
			className: "sidebarIconFill",
			d: "M21 14V12C21 8.22876 21 6.34315 19.8284 5.17157C18.6569 4 16.7712 4 13 4H11C7.22876 4 5.34315 4 4.17157 5.17157C3 6.34315 3 8.22876 3 12V14C3 17.7712 3 19.6569 4.17157 20.8284C5.34315 22 7.22876 22 11 22H13V14Z",
		},
	],
	...CalendarAdd01Icon,
];

// Color bands give the two sync arrows weight without filling their open arcs.
export const SyncIcon: IconSvgElement = [
	...Refresh04Icon.map(([tag, attributes]): IconSvgElement[number] => [
		tag,
		{ ...attributes, key: `band-${attributes.key}`, className: "sidebarIconBand" },
	]),
	...Refresh04Icon,
];
