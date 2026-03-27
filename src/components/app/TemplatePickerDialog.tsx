import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/shadcn/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
			<DialogContent className="templatePickerDialog sm:max-w-2xl">
				<DialogHeader className="templatePickerHeader">
					<DialogTitle>Create From Template</DialogTitle>
					<DialogDescription>
						Choose a markdown template from your template library.
					</DialogDescription>
				</DialogHeader>
				<div className="templatePickerSearchWrap">
					<Input
						className="templatePickerSearchInput"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search templates"
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
										{template.label}
									</span>
									<span className="templatePickerItemMeta">Markdown</span>
								</button>
							))
						) : (
							<div className="templatePickerEmpty">No templates found.</div>
						)}
					</div>
				</ScrollArea>
				<div className="templatePickerFooter">
					<Button type="button" variant="outline" onClick={onOpenSettings}>
						Open Template Settings
					</Button>
					<Button type="button" variant="ghost" onClick={handleClose}>
						Cancel
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
