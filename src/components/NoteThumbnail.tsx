import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
	extractFirstImageRef,
	noteLinkedImageQueryOptions,
	noteScanQueryOptions,
} from "../lib/noteThumbnail";

interface NoteThumbnailProps {
	notePath: string;
	preview: string;
	className: string;
}

export function NoteThumbnail({ notePath, preview, className }: NoteThumbnailProps) {
	const previewImageRef = useMemo(() => extractFirstImageRef(preview), [preview]);
	const { data: scan } = useQuery({
		...noteScanQueryOptions(notePath),
		enabled: previewImageRef === null,
	});
	const imageRef = previewImageRef ?? scan?.imageRef ?? null;
	const linkedImageRef = imageRef?.kind === "direct" ? null : imageRef;
	const { data: linkedSrc } = useQuery(noteLinkedImageQueryOptions(notePath, linkedImageRef));
	const [failedSrc, setFailedSrc] = useState<string | null>(null);
	const src = imageRef?.kind === "direct" ? imageRef.src : linkedSrc;
	if (!src || (src === failedSrc && src === linkedSrc)) return null;
	return (
		<span className={className} aria-hidden="true">
			<img
				src={src}
				alt=""
				loading="lazy"
				decoding="async"
				draggable={false}
				onError={() => setFailedSrc(src)}
			/>
		</span>
	);
}
