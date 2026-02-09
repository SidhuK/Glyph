import { forwardRef } from "react";
import { createPortal } from "react-dom";

interface DialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: React.ReactNode;
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDialogElement> {
	children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
	if (!open) return null;

	return createPortal(
		<div
			className="commandPaletteBackdrop"
			onClick={() => onOpenChange(false)}
			onKeyDown={(e) => {
				if (e.key !== "Escape" && e.key !== "Enter" && e.key !== " ") return;
				e.preventDefault();
				e.stopPropagation();
				onOpenChange(false);
			}}
		>
			{children}
		</div>,
		document.body,
	);
}

export const DialogContent = forwardRef<HTMLDialogElement, DialogContentProps>(
	({ children, ...props }, ref) => {
		return (
			<dialog ref={ref} open onClick={(e) => e.stopPropagation()} {...props}>
				{children}
			</dialog>
		);
	},
);

DialogContent.displayName = "DialogContent";
