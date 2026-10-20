import { cn } from "@/lib/utils";
import { Select, type SelectProps } from "../ui/shadcn/select";

/** Settings-sized select: a full-width filled button with a trailing chevron. */
export function SettingsSelect<Value>({ className, ...props }: SelectProps<Value>) {
	return <Select {...props} className={cn("settingsSelectTrigger", className)} />;
}
