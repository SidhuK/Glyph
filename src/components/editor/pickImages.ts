import type { Editor } from "@tiptap/core";
import { i18n } from "../../i18n";
import { extractErrorMessage } from "../../lib/errorUtils";
import { invoke, spaceAssetUrl } from "../../lib/tauri";
import { toast } from "../../lib/toast";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "tif", "tiff"];

interface PickImagesOptions {
	editor: Editor;
	sourcePath: string;
	targetDir: string;
	isCurrent: () => boolean;
}

async function importPickedImages({ editor, sourcePath, targetDir, isCurrent }: PickImagesOptions) {
	const { open } = await import("@tauri-apps/plugin-dialog");
	const picked = await open({
		multiple: true,
		directory: false,
		filters: [{ name: i18n.t("editor:ribbon.imageFilter"), extensions: IMAGE_EXTENSIONS }],
	});
	if (!picked?.length || editor.isDestroyed || !isCurrent()) return;
	const saved = await invoke("space_import_images", {
		source_path: sourcePath,
		target_dir: targetDir,
		file_paths: picked,
	});
	if (editor.isDestroyed || !isCurrent()) return;
	editor
		.chain()
		.focus(null, { scrollIntoView: false })
		.insertContent(
			saved.map((image) => ({
				type: "image",
				attrs: {
					src: spaceAssetUrl(image.asset_rel_path),
					alt: image.asset_rel_path.split("/").pop() ?? "",
					title: "",
					originSrc: image.href,
				},
			})),
		)
		.run();
}

export function pickImages(options: PickImagesOptions): void {
	void importPickedImages(options).catch((error: unknown) => {
		toast.error(i18n.t("editor:ribbon.imageFailed"), {
			description: extractErrorMessage(error),
		});
	});
}
