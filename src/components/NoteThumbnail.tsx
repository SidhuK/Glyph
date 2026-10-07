import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	extractFirstImageRef,
	noteLinkedImageQueryOptions,
	noteScanTextQueryOptions,
} from "../lib/noteThumbnail";

interface NoteThumbnailProps {
	notePath: string;
	preview: string;
	className: string;
}

export function NoteThumbnail({ notePath, preview, className }: NoteThumbnailProps) {
	const previewImageRef = useMemo(() => extractFirstImageRef(preview), [preview]);
	const { data: scanText } = useQuery({
		...noteScanTextQueryOptions(notePath),
		enabled: previewImageRef === null,
	});
	const imageRef = useMemo(
		() => previewImageRef ?? (scanText === undefined ? null : extractFirstImageRef(scanText)),
		[previewImageRef, scanText],
	);
	const linkedImageRef = imageRef?.kind === "direct" ? null : imageRef;
	const { data: linkedSrc } = useQuery(noteLinkedImageQueryOptions(notePath, linkedImageRef));
	const src = imageRef?.kind === "direct" ? imageRef.src : linkedSrc;
	if (!src) return null;
	return (
		<span className={className} aria-hidden="true">
			<img src={src} alt="" loading="lazy" decoding="async" draggable={false} />
		</span>
	);
}
