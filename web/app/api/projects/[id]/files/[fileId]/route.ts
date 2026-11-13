import { handle, ok } from "@/lib/server/api";
import { HttpError, must } from "@/lib/server/http";
import { openProjectFile, removeProjectFiles } from "@/lib/server/project-files";
import { parse, s } from "@/lib/server/validate";

/** Addresses to look at a file and to save it under its own name, valid for a few minutes. */
export const GET = handle<{ id: string; fileId: string }>(async ({ db, user, params }) => {
  const projectId = parse(s.id, params.id);
  const fileId = parse(s.id, params.fileId);
  const file = must(await db.from("project_files").select("path, name").eq("id", fileId).eq("project_id", projectId).single());
  const addresses = await openProjectFile(db, user.id, file);
  if (!addresses) throw new HttpError(502, "This file could not be opened. Please try again.");
  return addresses;
});

/** Removes a file from a project, and deletes the stored file for good. */
export const DELETE = handle<{ id: string; fileId: string }>(async ({ db, user, params }) => {
  const projectId = parse(s.id, params.id);
  const fileId = parse(s.id, params.fileId);
  const file = must(await db.from("project_files").delete().eq("id", fileId).eq("project_id", projectId).select("path").single());
  await removeProjectFiles(db, user.id, [file.path]);
  return ok;
});
