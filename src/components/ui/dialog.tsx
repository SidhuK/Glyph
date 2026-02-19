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

export function Dialog({
	open,
	onOpenChange: _onOpenChange,
	children,
}: DialogProps) {
	if (!open) return null;

	return createPortal(
		<div className="commandPaletteBackdrop">{children}</div>,
		document.body,
	);
}

export const DialogContent = forwardRef<HTMLDialogElement, DialogContentProps>(
	({ children, ...props }, ref) => {
		return (
			<dialog ref={ref} open {...props}>
				{children}
			</dialog>
		);
	},
);

DialogContent.displayName = "DialogContent";
