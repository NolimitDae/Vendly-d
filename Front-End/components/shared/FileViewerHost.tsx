"use client";

import { useEffect, useState } from "react";
import FileViewer from "./FileViewer";
import { OPEN_FILE_EVENT, markFileHost, type OpenFile } from "@/lib/openFile";

/** The one file pop-up for the page; anything can open it with openFile(). */
export default function FileViewerHost() {
  const [file, setFile] = useState<OpenFile | null>(null);
  useEffect(() => {
    markFileHost(true);
    const onOpen = (e: Event) => setFile((e as CustomEvent<OpenFile>).detail);
    window.addEventListener(OPEN_FILE_EVENT, onOpen);
    return () => {
      markFileHost(false);
      window.removeEventListener(OPEN_FILE_EVENT, onOpen);
    };
  }, []);
  if (!file) return null;
  return <FileViewer url={file.url} name={file.name} mime={file.mime} share={file.share ?? true} onClose={() => setFile(null)} />;
}
