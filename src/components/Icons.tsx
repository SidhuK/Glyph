import * as Icons from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";
import latticeIconUrl from "../assets/lattice.svg?url";

export type IconProps = Omit<ComponentProps<typeof HugeiconsIcon>, "icon">;

export const Plus = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Add} {...props} />
);
export const Trash2 = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Delete} {...props} />
);
export const FileText = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Document} {...props} />
);
export const Layout = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Layout} {...props} />
);
export const Search = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Search} {...props} />
);
export const Sparkles = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Sparkles} {...props} />
);
export const AiLattice = ({
	size = 16,
	alt = "",
	style,
	...props
}: Omit<ComponentProps<"img">, "src"> & { size?: number | string }) => (
	<img
		src={latticeIconUrl}
		alt={alt}
		width={size}
		height={size}
		style={{ display: "block", border: 0, ...style }}
		aria-hidden={alt ? undefined : true}
		{...props}
	/>
);

export const Bold = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Bold} {...props} />
);
export const Italic = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Italic} {...props} />
);
export const Strikethrough = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Strikethrough} {...props} />
);
export const Command = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.CommandIcon} {...props} />
);
export const Code = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Code} {...props} />
);
export const Quote = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Quote} {...props} />
);
export const List = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.List} {...props} />
);
export const ListOrdered = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.ListOrdered} {...props} />
);
export const ListChecks = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.ListChecks} {...props} />
);
export const Heading1 = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Heading1} {...props} />
);
export const Heading2 = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Heading2} {...props} />
);
export const Heading3 = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Heading3} {...props} />
);
export const Undo2 = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Undo} {...props} />
);
export const Redo2 = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Redo} {...props} />
);
export const Link2 = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Link2} {...props} />
);
export const Minus = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Minus} {...props} />
);

export const Link = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Link} {...props} />
);
export const Type = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Text} {...props} />
);
export const StickyNote = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.StickyNote} {...props} />
);
export const RefreshCw = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Refresh} {...props} />
);
export const Frame = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Frame} {...props} />
);
export const Grid3X3 = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Grid} {...props} />
);

export const AlignLeft = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.AlignLeft} {...props} />
);
export const AlignCenter = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.AlignCenter} {...props} />
);
export const AlignRight = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.AlignRight} {...props} />
);
export const AlignStartVertical = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.AlignLeft} {...props} />
);
export const AlignCenterVertical = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.AlignCenter} {...props} />
);
export const AlignEndVertical = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.AlignRight} {...props} />
);
export const AlignHorizontalSpaceAround = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.AlignLeft} {...props} />
);
export const AlignVerticalSpaceAround = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.AlignCenter} {...props} />
);

export const Paperclip = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Paperclip} {...props} />
);
export const RotateCcw = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Refresh} {...props} />
);
export const Save = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Save} {...props} />
);
export const ChevronRight = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.ArrowRight} {...props} />
);
export const ChevronDown = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.ArrowDown} {...props} />
);

export const FolderOpen = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Archive04Icon} {...props} />
);
export const FolderClosed = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.FolderLibraryIcon} {...props} />
);
export const FolderPlus = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.FolderPlus} {...props} />
);

export const Settings = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Settings} {...props} />
);
export const Zap = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Zap} {...props} />
);
export const X = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Close} {...props} />
);
export const MessageSquare = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.MessageSquare} {...props} />
);

export const PanelRightOpen = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.SidebarRightIcon} {...props} />
);
export const PanelRightClose = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.SidebarRightIcon} {...props} />
);
export const PanelLeftOpen = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.SidebarLeftIcon} {...props} />
);
export const PanelLeftClose = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.SidebarLeftIcon} {...props} />
);

export const Bot = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Bot} {...props} />
);
export const Send = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Send} {...props} />
);

export const Maximize2 = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Maximize} {...props} />
);
export const Minimize2 = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Minimize} {...props} />
);

export const File = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.File} {...props} />
);
export const FileCode = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.FileCode} {...props} />
);
export const FileImage = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.FileImage} {...props} />
);
export const FileJson = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.DocumentCodeIcon} {...props} />
);
export const FileVideo = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.File} {...props} />
);
export const FileAudio = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.File} {...props} />
);
export const FileArchive = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Archive} {...props} />
);
export const FileSpreadsheet = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Xls01Icon} {...props} />
);
export const FileBox = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.FileX} {...props} />
);
export const FilePdf = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Pdf01Icon} {...props} />
);
export const FileDoc = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Doc01Icon} {...props} />
);
export const FileTxt = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Txt01Icon} {...props} />
);
export const FileHtml = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.HtmlFile01Icon} {...props} />
);
export const FileCss = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.CssFile01Icon} {...props} />
);
export const FileXml = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Xml01Icon} {...props} />
);
export const FilePpt = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Ppt01Icon} {...props} />
);

export const Image = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Image} {...props} />
);
export const Film = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Film} {...props} />
);
export const Music = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Music} {...props} />
);
export const Archive = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Archive} {...props} />
);
export const Database = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Database} {...props} />
);
export const Globe = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Globe} {...props} />
);
export const Cpu = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Cpu} {...props} />
);
export const Palette = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Palette} {...props} />
);
export const Hash = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Hash} {...props} />
);

export const FileSymlink = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Link2} {...props} />
);
export const FileX = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.FileX} {...props} />
);
export const FileCheck = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.FileCheck} {...props} />
);

export const TriangleAlert = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Warning} {...props} />
);
export const CircleHelp = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Help} {...props} />
);
export const InformationCircle = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.InformationCircleIcon} {...props} />
);
export const Eye = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Eye} {...props} />
);
export const Edit = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Edit} {...props} />
);
export const Code2 = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Code} {...props} />
);

// Semantic aliases used in the UI.
export const Files = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Document} {...props} />
);
export const Tags = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Hash} {...props} />
);
