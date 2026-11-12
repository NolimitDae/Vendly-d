/**
 * Show a file (photo, PDF, video or document) in the pop-up over the page instead of a new tab. The
 * pop-up (FileViewerHost) is mounted in the site and admin layouts; without it, the file opens in a
 * new tab as before.
 */
export interface OpenFile {
  url: string;
  name: string;
  mime?: string | null;
  /** false for private documents: no share button */
  share?: boolean;
}

export const OPEN_FILE_EVENT = "vendly:open-file";
let hostMounted = 0;
export const markFileHost = (on: boolean) => (hostMounted += on ? 1 : -1);

export function openFile(file: OpenFile) {
  if (typeof window === "undefined") return;
  if (hostMounted > 0) window.dispatchEvent(new CustomEvent<OpenFile>(OPEN_FILE_EVENT, { detail: file }));
  else window.open(file.url, "_blank", "noopener,noreferrer");
}
