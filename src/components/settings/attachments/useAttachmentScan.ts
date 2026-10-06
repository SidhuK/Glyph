import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openPath } from "@tauri-apps/plugin-opener";
import { useSpace } from "../../../contexts";
import { invoke } from "../../../lib/tauri";

export type AttachmentFileAction = { kind: "open" | "reveal"; path: string };

export function useAttachmentScan() {
	const { spacePath } = useSpace();
	const queryClient = useQueryClient();
	const queryKey = ["space-attachments", spacePath] as const;

	const scan = useQuery({
		queryKey,
		queryFn: () => invoke("space_scan_attachments"),
		enabled: spacePath !== null,
		// Rescan whenever the tab opens, but not on every window focus: a scan
		// reads every note in the space.
		staleTime: 0,
		refetchOnWindowFocus: false,
	});

	const trash = useMutation({
		mutationFn: (relPaths: string[]) =>
			invoke("space_trash_unused_attachments", { rel_paths: relPaths }),
		onSettled: () => queryClient.invalidateQueries({ queryKey }),
	});

	const fileAction = useMutation({
		mutationFn: async (action: AttachmentFileAction) => {
			switch (action.kind) {
				case "reveal":
					return invoke("space_reveal_path", { path: action.path });
				case "open":
					return openPath(await invoke("space_resolve_abs_path", { path: action.path }));
				default: {
					const _exhaustive: never = action.kind;
					return _exhaustive;
				}
			}
		},
	});

	return { spacePath, scan, trash, fileAction };
}
