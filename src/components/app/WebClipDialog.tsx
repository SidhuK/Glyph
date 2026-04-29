import { Dialog, DialogContent, DialogTitle } from "../ui/shadcn/dialog";

interface WebClipDialogProps {
	loading: boolean;
	open: boolean;
	url: string;
	onOpenChange: (open: boolean) => void;
	onSubmit: () => void;
	onUrlChange: (url: string) => void;
}

export function WebClipDialog({
	loading,
	open,
	url,
	onOpenChange,
	onSubmit,
	onUrlChange,
}: WebClipDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="webClipDialog"
				showCloseButton={false}
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					const target = event.currentTarget as HTMLElement | null;
					target
						?.querySelector<HTMLInputElement>(".webClipDialogInput")
						?.focus();
				}}
			>
				<DialogTitle className="webClipDialogTitle">Save web page</DialogTitle>
				<form
					className="webClipDialogForm"
					onSubmit={(event) => {
						event.preventDefault();
						onSubmit();
					}}
				>
					<label className="sr-only" htmlFor="web-clip-url-input">
						URL to fetch and save as Markdown
					</label>
					<input
						id="web-clip-url-input"
						className="webClipDialogInput"
						placeholder="https://example.com/article"
						value={url}
						onChange={(event) => onUrlChange(event.target.value)}
						disabled={loading}
					/>
				</form>
				<p className="webClipDialogHint">
					Press Enter to fetch and save as Markdown
				</p>
			</DialogContent>
		</Dialog>
	);
}
