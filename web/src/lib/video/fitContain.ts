// Where a video is actually drawn inside its <video> box with object-fit: contain.
// No imports, so it also runs directly under `node --test`.

export type DisplayRect = {
  // Offset of the picture inside the box (letterbox / pillarbox bars), in CSS px.
  left: number;
  top: number;
  width: number;
  height: number;
};

export function fitContain(boxWidth: number, boxHeight: number, videoWidth: number, videoHeight: number): DisplayRect {
  if (boxWidth <= 0 || boxHeight <= 0 || videoWidth <= 0 || videoHeight <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  // Scale so the whole video fits, keeping its aspect ratio; center the leftover space.
  const scale = Math.min(boxWidth / videoWidth, boxHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return { left: (boxWidth - width) / 2, top: (boxHeight - height) / 2, width, height };
}
