import { forgetProfile, handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { removeAllJobImages } from "@/lib/server/job-image";
import { parse, z } from "@/lib/server/validate";

// Delete every task, note, transaction … (the account and profile stay).
export const POST = handle(async ({ db, body, user }) => {
  parse(z.object({ confirm: z.literal("DELETE", { message: "Type DELETE to confirm" }) }).strict(), await body());
  // Saved jobs first (Row Level Security limits this to your own rows), then everything else.
  must(await db.from("job_applications").delete().not("id", "is", null));
  // Their pictures (a leftover file is harmless, so a failure is only logged).
  await removeAllJobImages(db, user.id);
  // The company list.
  must(await db.from("companies").delete().not("id", "is", null));
  // The Learning library (certificates, playlists …); deleting courses only unlinks it, so it is removed here.
  must(await db.from("learning_resources").delete().not("id", "is", null));
  // Projects too (their tasks go with them).
  must(await db.from("projects").delete().not("id", "is", null));
  // The Archive too: "delete all" means all.
  must(await db.from("archive_items").delete().not("id", "is", null));
  must(await db.rpc("delete_my_data"));
  forgetProfile(user.id);
  return ok;
});
