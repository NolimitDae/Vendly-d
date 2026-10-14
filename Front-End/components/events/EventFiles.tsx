"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileImage, FileSpreadsheet, FileText, File as FileIcon, FolderOpen, Loader2, Trash2, Upload } from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { toast } from "react-toastify";
import { EventToolsService, fileSize, type EventFile, type EventRole } from "@/service/events/eventTools.service";
import { errorMessage } from "@/service/rentals/rentals.service";

dayjs.extend(relativeTime);

const Icon = ({ mime }: { mime: string }) =>
  mime.startsWith("image/") ? <FileImage className="w-5 h-5" /> : mime === "application/pdf" ? <FileText className="w-5 h-5" /> : /sheet|excel|csv/.test(mime) ? <FileSpreadsheet className="w-5 h-5" /> : <FileIcon className="w-5 h-5" />;

/** Files shared on the event. Planner and booked vendors upload; everyone on the event downloads. */
export default function EventFiles({ eventId, role }: { eventId: string; role: EventRole }) {
  const [files, setFiles] = useState<EventFile[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    EventToolsService.files(eventId)
      .then((r) => setFiles(r.data?.data ?? []))
      .catch(() => setFiles([]));
  }, [eventId]);

  useEffect(load, [load]);

  const upload = async (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    const big = picked.find((f) => f.size > 20 * 1024 * 1024);
    if (big) return toast.error(`${big.name} is over 20 MB`);
    setUploading(true);
    try {
      await EventToolsService.upload(eventId, picked.slice(0, 10));
      toast.success(picked.length > 1 ? "Files shared" : "File shared");
      load();
    } catch (e) {
      toast.error(errorMessage(e, "Upload failed"));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (f: EventFile) => {
    if (!confirm(`Remove ${f.name}?`)) return;
    try {
      await EventToolsService.deleteFile(eventId, f.id);
      load();
    } catch (e) {
      toast.error(errorMessage(e, "Could not remove"));
    }
  };

  // links expire after 10 minutes, so fetch a fresh one when opening
  const open = async (f: EventFile) => {
    try {
      const r = await EventToolsService.files(eventId);
      const fresh = (r.data?.data as EventFile[] | undefined)?.find((x) => x.id === f.id);
      window.open(fresh?.url ?? f.url, "_blank", "noopener");
    } catch {
      window.open(f.url, "_blank", "noopener");
    }
  };

  if (!files) return <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto my-8" />;

  return (
    <div className="space-y-3">
      {role !== "client" && (
        <>
          <input ref={input} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} aria-label="Choose files to share" />
          <button onClick={() => input.current?.click()} disabled={uploading} className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-primary text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary/5">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Uploading…" : "Share files (up to 20 MB each)"}
          </button>
        </>
      )}
      {files.length === 0 ? (
        <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
          <FolderOpen className="w-10 h-10 mx-auto text-primary mb-2" />
          <p className="font-semibold text-gray-900 dark:text-white">No files yet</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Floor plans, shot lists, menus: everything the team needs on the day.</p>
        </div>
      ) : (
        <ul className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 p-3">
              <span className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><Icon mime={f.mime} /></span>
              <button onClick={() => open(f)} className="flex-1 min-w-0 text-left">
                <span className="block text-sm font-medium text-gray-900 dark:text-white truncate hover:text-primary">{f.name}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{fileSize(f.size)} · {f.uploader.name} · {dayjs(f.created_at).fromNow()}</span>
              </button>
              {(f.can_delete || role === "planner") && (
                <button onClick={() => remove(f)} aria-label={`Remove ${f.name}`} className="p-1.5 text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
