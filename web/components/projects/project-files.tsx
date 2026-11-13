"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { Download, Eye, File as FileIcon, FileArchive, FileSpreadsheet, FileText, Loader2, Paperclip, Presentation, Trash2 } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { fileSizeText } from "@/lib/note-files";
import { fileEnding, fileKindLabel, PROJECT_FILE_MAX_BYTES, PROJECT_FILES_PER_PROJECT } from "@/lib/project-files";
import { PictureError, prepareProjectFile } from "@/lib/project-upload";
import type { ProjectFile } from "@/lib/types";
import { FileThumb, FileViewer } from "@/components/files/file-viewer";
import { useFeedback } from "@/components/ui/feedback";

const projectPath = (file: ProjectFile) => `/projects/${file.project_id}/files/${file.id}`;

/** The small picture of a file that is not a picture: by its kind or its ending. */
function iconOf(file: ProjectFile): ReactNode {
  const ending = fileEnding(file.name).toLowerCase();
  if (file.kind === "pdf") return <FileText className="size-5 text-rose-500" aria-hidden />;
  if (["zip", "rar", "7z", "gz", "tar"].includes(ending)) return <FileArchive className="size-5 text-amber-600" aria-hidden />;
  if (["xls", "xlsx", "csv", "ods"].includes(ending)) return <FileSpreadsheet className="size-5 text-emerald-600" aria-hidden />;
  if (["ppt", "pptx", "key", "odp"].includes(ending)) return <Presentation className="size-5 text-orange-500" aria-hidden />;
  if (["doc", "docx", "txt", "md", "rtf", "odt"].includes(ending)) return <FileText className="size-5 text-blue-600" aria-hidden />;
  return <FileIcon className="size-5 text-slate-500" aria-hidden />;
}

/**
 * The files of a project: upload any file (a picture or PDF is previewed in the app, every file can be downloaded), see them in a list,
 * delete one. Files can be chosen with the button or dropped on the box. `readOnly` (an archived project) only views and downloads.
 */
export function ProjectFiles({ projectId, files, readOnly }: { projectId: string; files: ProjectFile[]; readOnly: boolean }) {
  const { toast, confirm } = useFeedback();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [viewing, setViewing] = useState<ProjectFile | null>(null);
  const [busyId, setBusyId] = useState("");
  const [dragging, setDragging] = useState(false);
  const uploading = progress !== "";
  const room = PROJECT_FILES_PER_PROJECT - files.length;

  const upload = async (chosen: File[]) => {
    if (readOnly || uploading || !chosen.length) return;
    setProblems([]);
    const issues: string[] = [];
    let added = 0;
    let space = room;
    for (const [i, file] of chosen.entries()) {
      setProgress(chosen.length === 1 ? `Adding “${file.name}”…` : `Adding file ${i + 1} of ${chosen.length}…`);
      if (space <= 0) {
        issues.push(`“${file.name}” was left out: a project keeps up to ${PROJECT_FILES_PER_PROJECT} files.`);
        continue;
      }
      try {
        const prepared = await prepareProjectFile(file);
        await api(`/projects/${projectId}/files?name=${encodeURIComponent(prepared.name)}`, { method: "POST", file: prepared.blob });
        added++;
        space--;
      } catch (error) {
        const why = error instanceof PictureError ? error.message : errorMessage(error);
        issues.push(why.includes(file.name) ? why : `“${file.name}”: ${why}`);
      }
    }
    setProgress("");
    setProblems(issues);
    await refresh("/projects");
    if (added) toast(added === 1 ? "File added" : `${added} files added`);
  };

  const download = async (file: ProjectFile) => {
    setBusyId(file.id);
    try {
      const { download_url } = await api<{ url: string; download_url: string }>(projectPath(file));
      const link = document.createElement("a");
      link.href = download_url;
      link.rel = "noopener";
      document.body.append(link);
      link.click();
      link.remove();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusyId("");
    }
  };

  const remove = async (file: ProjectFile) => {
    if (!(await confirm({ title: "Delete this file?", message: `“${file.name}” will be deleted for good. This cannot be undone.`, action: "Delete file" }))) return;
    setBusyId(file.id);
    try {
      await api(projectPath(file), { method: "DELETE" });
      toast("File deleted");
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusyId("");
    }
    await refresh("/projects");
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void upload(Array.from(e.dataTransfer.files));
  };

  return (
    <section
      className={`card p-5 transition ${dragging ? "ring-2 ring-blue-400" : ""}`}
      aria-label="Project files"
      onDragOver={(e) => {
        if (readOnly || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={drop}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="card-title flex items-center gap-2.5">
          <span className="icon-tile size-8 bg-violet-50 text-violet-600">
            <Paperclip className="size-4.5" aria-hidden />
          </span>
          Files
          {files.length > 0 && <span className="badge bg-slate-100 text-slate-600">{files.length}</span>}
        </h2>
        {!readOnly && (
          <>
            <input
              ref={input}
              id="project-files-input"
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose files to add"
              disabled={uploading || room <= 0}
              onChange={(e) => {
                const chosen = Array.from(e.target.files ?? []);
                e.target.value = ""; // choosing the same file again must work too
                void upload(chosen);
              }}
            />
            <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={() => input.current?.click()} disabled={uploading || room <= 0}>
              {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Paperclip className="size-4" aria-hidden />}
              {uploading ? "Adding…" : room <= 0 ? "Full" : "Add files"}
            </button>
          </>
        )}
      </div>

      {progress && (
        <p role="status" className="mt-3 text-sm text-slate-500">
          {progress}
        </p>
      )}
      {problems.length > 0 && (
        <div role="alert" className="mt-3 space-y-1 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      )}

      {files.length ? (
        <ul className="mt-3 divide-y divide-slate-100" aria-label="Files of this project">
          {files.map((file) => {
            const previewable = file.kind !== "file";
            const busy = busyId === file.id;
            return (
              <li key={file.id} className="flex items-center gap-3 py-2.5">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => (previewable ? setViewing(file) : void download(file))}
                  aria-label={previewable ? `Preview ${file.name}` : `Download ${file.name}`}
                  disabled={busy}
                >
                  <span className="grid size-11 shrink-0 place-content-center overflow-hidden rounded-lg bg-slate-100 ring-1 ring-black/5">
                    {file.kind === "image" ? <FileThumb file={file} pathFor={projectPath} className="size-full object-cover" /> : iconOf(file)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{file.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {fileKindLabel(file.kind, file.name)} · {fileSizeText(file.size_bytes)} · {formatDate(file.created_at.slice(0, 10), "short")}
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 gap-0.5">
                  {previewable && (
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setViewing(file)} aria-label={`Preview ${file.name}`} title="Preview" disabled={busy}>
                      <Eye className="size-4" aria-hidden />
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => void download(file)} aria-label={`Download ${file.name}`} title="Download" disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
                  </button>
                  {!readOnly && (
                    <button type="button" className="btn btn-ghost btn-sm btn-icon text-rose-600 hover:bg-rose-50" onClick={() => void remove(file)} aria-label={`Delete ${file.name}`} title="Delete" disabled={busy}>
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">{readOnly ? "No files." : "No files yet. Add the brief, designs, a contract or any file you need for this project."}</p>
      )}
      {!readOnly && (
        <p className="mt-3 text-xs text-slate-400">
          Choose files or drop them here. Up to {PROJECT_FILES_PER_PROJECT} files, {fileSizeText(PROJECT_FILE_MAX_BYTES)} each; a big picture is made smaller. Do not store passwords here.
        </p>
      )}

      <FileViewer file={viewing} onClose={() => setViewing(null)} pathFor={projectPath} />
    </section>
  );
}
