export type ActionMenuIconKey = "table" | "board" | "edit" | "trash" | "library" | "plus";

export type ActionMenuItem =
	| { type: "separator" }
	| { type: "label"; label: string; key?: string }
	| {
			type: "item";
			label: string;
			key?: string;
			onClick: () => void;
			checked?: boolean;
			enabled?: boolean;
			destructive?: boolean;
			iconKey?: ActionMenuIconKey;
	  };
