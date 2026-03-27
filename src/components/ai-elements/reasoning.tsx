"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";
import {
	createContext,
	memo,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { ChevronDown } from "../Icons";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "../ui/shadcn/collapsible";

interface ReasoningContextValue {
	isOpen: boolean;
	isStreaming: boolean;
	setIsOpen: (open: boolean) => void;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoningContext() {
	const context = useContext(ReasoningContext);
	if (!context) {
		throw new Error("Reasoning components must be used within Reasoning.");
	}
	return context;
}

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
	isStreaming?: boolean;
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
};

const AUTO_CLOSE_DELAY_MS = 1000;

export const Reasoning = memo(function Reasoning({
	className,
	isStreaming = false,
	open,
	defaultOpen,
	onOpenChange,
	children,
	...props
}: ReasoningProps) {
	const isControlled = open !== undefined;
	const [internalOpen, setInternalOpen] = useState(defaultOpen ?? isStreaming);
	const isOpen = isControlled ? open : internalOpen;
	const hasEverStreamedRef = useRef(isStreaming);
	const hasAutoClosedRef = useRef(false);

	const setIsOpen = useCallback(
		(nextOpen: boolean) => {
			if (!isControlled) {
				setInternalOpen(nextOpen);
			}
			onOpenChange?.(nextOpen);
		},
		[isControlled, onOpenChange],
	);

	useEffect(() => {
		if (!isStreaming) return;
		hasEverStreamedRef.current = true;
		hasAutoClosedRef.current = false;
		if (!isOpen && defaultOpen !== false) {
			setIsOpen(true);
		}
	}, [defaultOpen, isOpen, isStreaming, setIsOpen]);

	useEffect(() => {
		if (!hasEverStreamedRef.current || isStreaming || !isOpen) return;
		if (hasAutoClosedRef.current) return;
		const timer = window.setTimeout(() => {
			hasAutoClosedRef.current = true;
			setIsOpen(false);
		}, AUTO_CLOSE_DELAY_MS);
		return () => window.clearTimeout(timer);
	}, [isOpen, isStreaming, setIsOpen]);

	const value = useMemo(
		() => ({ isOpen, isStreaming, setIsOpen }),
		[isOpen, isStreaming, setIsOpen],
	);

	return (
		<ReasoningContext.Provider value={value}>
			<Collapsible
				className={cn("not-prose w-full", className)}
				open={isOpen}
				onOpenChange={setIsOpen}
				{...props}
			>
				{children}
			</Collapsible>
		</ReasoningContext.Provider>
	);
});

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
	label?: ReactNode;
	meta?: ReactNode;
	indicator?: ReactNode;
};

export const ReasoningTrigger = memo(function ReasoningTrigger({
	className,
	children,
	label,
	meta,
	indicator,
	...props
}: ReasoningTriggerProps) {
	const { isOpen, isStreaming } = useReasoningContext();

	return (
		<CollapsibleTrigger
			className={cn(
				"flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm text-muted-foreground transition-colors hover:text-foreground",
				className,
			)}
			{...props}
		>
			{children ?? (
				<>
					{indicator ?? (
						<span className="inline-flex size-4 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
							{isStreaming ? "…" : "•"}
						</span>
					)}
					<span className="min-w-0 flex-1 truncate text-left">
						{label ?? (isStreaming ? "Thinking..." : "Thought process")}
					</span>
					{meta ? (
						<span className="shrink-0 text-xs text-muted-foreground">
							{meta}
						</span>
					) : null}
					<span
						className={cn(
							"shrink-0 text-muted-foreground transition-transform",
							isOpen && "rotate-180",
						)}
						aria-hidden
					>
						<ChevronDown size={12} />
					</span>
				</>
			)}
		</CollapsibleTrigger>
	);
});

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent>;

export const ReasoningContent = memo(function ReasoningContent({
	className,
	children,
	...props
}: ReasoningContentProps) {
	return (
		<CollapsibleContent
			className={cn(
				"mt-3 border-l border-border/60 pl-4 text-sm text-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2",
				className,
			)}
			{...props}
		>
			{children}
		</CollapsibleContent>
	);
});
