import { handle } from "@/lib/server/api";
import { HttpError, must } from "@/lib/server/http";
import { classifyProjectFile, cleanProjectFileName, PROJECT_FILE_BUCKET, PROJECT_FILE_MAX_BYTES, PROJECT_FILES_PER_PROJECT, presentProjectFiles, projectFilePath, projectFileTooLarge, removeProjectFiles, tooManyProjectFiles } from "@/lib/server/project-files";
import { parse, s } from "@/lib/server/validate";

/**
 * Keeps a file with a project. The body is the file itself (a picture as it is, or shrunk to a JPEG when it is big), not JSON; the
 * name you knew it by comes in `?name=`. What the file is (picture, PDF or other) is read from its own first bytes. It is stored in
 * your own folder under a new random name, and only then does the project list it; if listing fails the stored file is removed again.
 */
export const POST = handle<{ id: string }>(async ({ db, user, params, req, query }) => {
  const projectId = parse(s.id, params.id);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > PROJECT_FILE_MAX_BYTES) throw new HttpError(413, projectFileTooLarge);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) throw new HttpError(400, "Choose a file first.");
  if (bytes.length > PROJECT_FILE_MAX_BYTES) throw new HttpError(413, projectFileTooLarge);
  const found = classifyProjectFile(bytes, query.name);

  // The project is yours (another person's project is simply not found) and has room for one more file.
  must(await db.from("projects").select("id").eq("id", projectId).single());
  const have = await db.from("project_files").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  if (have.error) {
    // The database step for files has not been run yet.
    if (have.error.code === "PGRST205" || have.error.code === "42P01") throw new HttpError(503, "Files in projects are not set up in the database yet. Run the newest database step (20261113000000_project_files.sql), then try again.");
    must(have);
  }
  if ((have.count ?? 0) >= PROJECT_FILES_PER_PROJECT) throw new HttpError(409, tooManyProjectFiles);

  const path = projectFilePath(user.id, found.ext, crypto.randomUUID());
  const stored = await db.storage.from(PROJECT_FILE_BUCKET).upload(path, bytes, { contentType: found.type, cacheControl: "31536000", upsert: false });
  if (stored.error) {
    console.error("Project file upload failed", stored.error);
    throw new HttpError(502, "The file could not be saved. Please try again.", stored.error.message);
  }
  let row;
  try {
    row = must(await db.from("project_files").insert({ project_id: projectId, kind: found.kind, name: cleanProjectFileName(query.name), path, size_bytes: bytes.length }).select("id, project_id, kind, name, path, size_bytes, created_at").single());
  } catch (error) {
    await removeProjectFiles(db, user.id, [path]);
    throw error;
  }
  const [file] = await presentProjectFiles(db, user.id, [row]);
  return file;
}, { status: 201 });
