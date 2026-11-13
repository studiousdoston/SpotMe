import type { ChangeEvent } from "react";

type VideoPickerProps = {
  onVideoSelected: (videoFile: File) => void;
  disabled?: boolean;
};

// Big, thumb-friendly "choose a video" button wrapping a hidden file input.
// On phones, accept="video/*" offers both the gallery and the camera.
export function VideoPicker({ onVideoSelected, disabled = false }: VideoPickerProps) {
  function handleFileChange(changeEvent: ChangeEvent<HTMLInputElement>): void {
    const pickedFile = changeEvent.target.files?.[0];
    // Reset the input so picking the same file again still fires a change.
    changeEvent.target.value = "";
    if (pickedFile) onVideoSelected(pickedFile);
  }

  return (
    <label
      className={`flex h-16 w-full items-center justify-center rounded-xl text-lg font-semibold transition-colors ${
        disabled
          ? "cursor-not-allowed bg-neutral-800 text-neutral-500"
          : "cursor-pointer bg-accent text-neutral-950 active:brightness-90"
      }`}
    >
      Choose a workout video
      <input type="file" accept="video/*" className="sr-only" disabled={disabled} onChange={handleFileChange} />
    </label>
  );
}
