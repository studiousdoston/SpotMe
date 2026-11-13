// Saves any JSON-serializable value as a file download, entirely in the browser.
export function downloadJson(data: unknown, fileName: string): void {
  const jsonBlob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const downloadUrl = URL.createObjectURL(jsonBlob);

  // A temporary link triggers the browser's normal download behavior.
  const downloadLink = document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = fileName;
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();

  // Free the blob once the click has been handled.
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
}
