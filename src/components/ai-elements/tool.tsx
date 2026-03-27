"use client";

import { Badge } from "@/components/ui/shadcn/badge";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { ChevronDown } from "../Icons";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "../ui/shadcn/collapsible";

export type ToolState = "running" | "done" | "error";

export type ToolProps = ComponentProps<typeof Collapsible>;

export function Tool({ className, ...props }: ToolProps) {
	return (
		<Collapsible
			className={cn(
				"group not-prose w-full rounded-lg border border-border/70 bg-muted/20",
				className,
			)}
			{...props}
		/>
	);
}

const toolStateClasses: Record<ToolState, string> = {
	running:
		"border-[color:color-mix(in_srgb,var(--interactive-accent)_26%,transparent)] bg-[var(--selection-bg-muted)] text-[var(--interactive-accent)]",
	done: "border-[color:var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
	error:
		"border-[color:var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
};

const toolStateLabels: Record<ToolState, string> = {
	running: "Running",
	done: "Completed",
	error: "Error",
};

export type ToolHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
	title: string;
	state: ToolState;
	meta?: string;
};

export function ToolHeader({
	className,
	title,
	state,
	meta,
	...props
}: ToolHeaderProps) {
	return (
		<CollapsibleTrigger
			className={cn(
				"flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/35",
				className,
			)}
			{...props}
		>
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<span
					className={cn(
						"size-2 shrink-0 rounded-full",
						state === "done" && "bg-[var(--status-success-fg)]",
						state === "error" && "bg-[var(--status-danger-fg)]",
						state === "running" && "bg-[var(--interactive-accent)]",
					)}
					aria-hidden
				/>
				<span className="truncate text-sm font-medium text-foreground">
					{title}
				</span>
				<Badge
					variant="outline"
					className={cn(
						"rounded-full border px-2 py-0.5 text-[10px] font-medium",
						toolStateClasses[state],
					)}
				>
					{toolStateLabels[state]}
				</Badge>
			</div>
			{meta ? (
				<span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
			) : null}
			<span
				className="shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
				aria-hidden
			>
				<ChevronDown size={12} />
			</span>
		</CollapsibleTrigger>
	);
}

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export function ToolContent({ className, ...props }: ToolContentProps) {
	return (
		<CollapsibleContent
			className={cn(
				"space-y-3 px-3 pb-3 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2",
				className,
			)}
			{...props}
		/>
	);
}

function stringifyValue(value: unknown): string {
	if (value == null) return "";
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function ToolBlock({
	label,
	value,
	tone = "default",
}: {
	label: string;
	value: unknown;
	tone?: "default" | "error";
}) {
	const text = stringifyValue(value).trim();
	if (!text) return null;

	return (
		<div className="space-y-2">
			<div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
				{label}
			</div>
			<pre
				className={cn(
					"overflow-x-auto rounded-md border px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre-wrap break-words",
					tone === "error"
						? "border-[color:var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]"
						: "border-border/70 bg-background/80 text-muted-foreground",
				)}
			>
				{text}
			</pre>
		</div>
	);
}

export function ToolInput({
	input,
	className,
}: {
	input: unknown;
	className?: string;
}) {
	return (
		<div className={className}>
			<ToolBlock label="Input" value={input} />
		</div>
	);
}

export function ToolOutput({
	output,
	errorText,
	className,
}: {
	output: unknown;
	errorText?: string;
	className?: string;
}) {
	return (
		<div className={className}>
			{errorText ? (
				<ToolBlock label="Error" value={errorText} tone="error" />
			) : (
				<ToolBlock label="Output" value={output} />
			)}
		</div>
	);
}
