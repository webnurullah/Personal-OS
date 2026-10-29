import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { filesByNote } from "@/lib/server/note-files";
import { NoteFields } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

export const GET = handle(async ({ db, user, today }) => {
  const [notes, files] = await Promise.all([
    db.from("notes").select("*").order("pinned", { ascending: false }).order("updated_at", { ascending: false }).then(must),
    filesByNote(db, user.id),
  ]);
  return { today: await today(), items: notes.map((note) => ({ ...note, files: files.get(note.id) ?? [] })) };
});

export const POST = handle(async ({ db, body }) => {
  const input = parse(NoteFields, await body());
  return must(await db.from("notes").insert(input).select().single());
}, { status: 201 });
