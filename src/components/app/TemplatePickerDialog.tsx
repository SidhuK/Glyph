import { useEffect, useMemo, useState } from "react";
import { Settings, X } from "../Icons";
import { Button } from "../ui/shadcn/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "../ui/shadcn/dialog";
import { Input } from "../ui/shadcn/input";
import { ScrollArea } from "../ui/shadcn/scroll-area";

export interface TemplatePickerItem {
	relPath: string;
	label: string;
}

interface TemplatePickerDialogProps {
	open: boolean;
	templates: TemplatePickerItem[];
	onClose: () => void;
	onPick: (template: TemplatePickerItem) => void;
	onOpenSettings: () => void;
}

export function TemplatePickerDialog({
	open,
	templates,
	onClose,
	onPick,
	onOpenSettings,
}: TemplatePickerDialogProps) {
	const [query, setQuery] = useState("");

	useEffect(() => {
		if (!open) {
			setQuery("");
		}
	}, [open]);

	const handleClose = () => {
		onClose();
	};

	const filteredTemplates = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return templates;
		return templates.filter((template) =>
			template.label.toLowerCase().includes(normalized),
		);
	}, [query, templates]);

	return (
		<Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
			<DialogContent className="templatePickerDialog" showCloseButton={false}>
				<DialogHeader className="templatePickerHeader">
					<DialogTitle>Create From Template</DialogTitle>
				</DialogHeader>
				<div className="templatePickerSearchWrap">
					<Input
						className="templatePickerSearchInput"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search templates…"
					/>
				</div>
				<ScrollArea className="templatePickerListWrap">
					<div className="templatePickerList">
						{filteredTemplates.length ? (
							filteredTemplates.map((template) => (
								<button
									key={template.relPath}
									type="button"
									className="templatePickerItem"
									onClick={() => onPick(template)}
								>
									<span className="templatePickerItemLabel">
										{template.label.replace(/\.md$/i, "")}
									</span>
								</button>
							))
						) : (
							<div className="templatePickerEmpty">No templates found.</div>
						)}
					</div>
				</ScrollArea>
				<div className="templatePickerFooter">
						<Button type="button" variant="ghost" size="icon" onClick={onOpenSettings} title="Template settings" aria-label="Template settings">
							<Settings size={15} />
						</Button>
						<Button type="button" variant="ghost" size="icon" onClick={handleClose} title="Cancel" aria-label="Cancel">
							<X size={15} />
						</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
