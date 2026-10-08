// Calls the app's real /api/profile/avatar routes (running in dev on 3124) against the stand-in Supabase (4012).
import fs from "node:fs";
const S = process.argv[2], API = "http://localhost:3124/api", MOCK = "http://localhost:4012";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const TOKEN = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "11111111-1111-4111-8111-111111111111", email: "me@example.com", role: "authenticated", exp: 9999999999 })}.sig`;
const UID = "11111111-1111-4111-8111-111111111111";
const out = [];
const check = (name, cond, extra = "") => { out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`); };
const state = async () => (await fetch(MOCK + "/__state")).json();
const post = (body, type = "image/jpeg") => fetch(API + "/profile/avatar", { method: "POST", headers: { Authorization: "Bearer " + TOKEN, ...(type ? { "Content-Type": type } : {}) }, body });
const del = () => fetch(API + "/profile/avatar", { method: "DELETE", headers: { Authorization: "Bearer " + TOKEN } });
const get = () => fetch(API + "/profile", { headers: { Authorization: "Bearer " + TOKEN } }).then((r) => r.json());
const jpeg = fs.readFileSync(S + "/photo-exif6.jpg");
await fetch(MOCK + "/__reset");

// signed out
check("no token → 401", (await fetch(API + "/profile/avatar", { method: "POST", body: jpeg })).status === 401);

// first upload
let r = await post(jpeg); let j = await r.json(); let st = await state();
const files1 = Object.keys(st.files);
check("upload answers 200 with the profile", r.status === 200 && j.id === UID, `status ${r.status}`);
check("answer has avatar_url in your folder, not the raw avatar_path", typeof j.avatar_url === "string" && j.avatar_url.startsWith(`${MOCK}/storage/v1/object/public/avatars/${UID}/`) && j.avatar_url.endsWith(".jpg") && !("avatar_path" in j), j.avatar_url);
check("file was stored once, as image/jpeg, cached for a year, no upsert", files1.length === 1 && st.files[files1[0]].type === "image/jpeg" && /31536000/.test(st.files[files1[0]].cache) && st.files[files1[0]].upsert === "false", JSON.stringify(st.files[files1[0]]));
check("profile now points at the stored file", st.avatar_path === files1[0], st.avatar_path);
check("GET /profile shows avatar_url", (await get()).avatar_url === j.avatar_url);

// replace: new random name, old file removed
r = await post(jpeg); j = await r.json(); st = await state();
const files2 = Object.keys(st.files);
check("replacing keeps exactly one file", files2.length === 1 && files2[0] !== files1[0], files2.join());
check("the old file was removed", st.calls.some((c) => c.startsWith("DELETE /storage/v1/object/avatars") && c.includes(files1[0])));
check("new avatar_url differs (so no cache shows the old picture)", j.avatar_url.includes(files2[0]));

// what the server refuses
r = await post(Buffer.from("just some text"), "image/jpeg"); j = await r.json();
check("text posing as a JPEG → 400", r.status === 400 && /not a JPG, PNG or WebP/.test(j.error.message), j.error?.message);
r = await post(Buffer.alloc(0), "image/jpeg");
check("empty body → 400", r.status === 400, `${r.status} ${(await r.json()).error?.message}`);
r = await post(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600 * 1024)]), "image/jpeg");
check("over 512 KB → 413", r.status === 413, `${r.status} ${(await r.json()).error?.message}`);
r = await post(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "image/svg+xml");
check("SVG → 400", r.status === 400);
st = await state();
check("refused uploads stored nothing and changed nothing", Object.keys(st.files).length === 1 && st.avatar_path === files2[0]);

// the type comes from the bytes, not the header
const png = fs.readFileSync(S + "/photo-transparent.png"); const webp = fs.readFileSync(S + "/small.webp");
r = await post(png, "text/plain"); j = await r.json();
check("a PNG sent with the wrong Content-Type is stored as PNG", r.status === 200 && j.avatar_url.endsWith(".png"), j.avatar_url);
r = await post(webp, ""); j = await r.json();
check("a WebP with no Content-Type is stored as WebP", r.status === 200 && j.avatar_url.endsWith(".webp"), `${r.status} ${j.avatar_url}`);
st = await state();
check("still exactly one file after several replacements", Object.keys(st.files).length === 1);

// storage failure → nothing changes
const before = (await state()).avatar_path;
await fetch(MOCK + "/__fail?what=upload&times=1");
r = await post(jpeg); j = await r.json(); st = await state();
check("storage refusing the file → 502 with a friendly message", r.status === 502 && /could not be saved/.test(j.error.message), `${r.status} ${j.error?.message}`);
check("…and the profile still shows the old photo", st.avatar_path === before && Object.keys(st.files).length === 1);

// profile update failure → the new file is cleaned up
await fetch(MOCK + "/__fail?what=profile&times=1");
r = await post(jpeg); st = await state();
check("profile update failing → error answer", r.status >= 400, String(r.status));
check("…and the file just uploaded was removed again", Object.keys(st.files).length === 1 && st.avatar_path === before, Object.keys(st.files).join());

// removal failing must not fail the upload
await fetch(MOCK + "/__fail?what=remove&times=1");
r = await post(jpeg); j = await r.json(); st = await state();
check("old file cannot be removed → upload still succeeds", r.status === 200, String(r.status));
check("(that leaves one extra harmless file)", Object.keys(st.files).length === 2, Object.keys(st.files).length + " files");

// remove the photo
await fetch(MOCK + "/__reset"); await post(jpeg);
r = await del(); j = await r.json(); st = await state();
check("DELETE → avatar_url null", r.status === 200 && j.avatar_url === null, `${r.status} ${j.avatar_url}`);
check("…the profile forgot it and the file is gone", st.avatar_path === null && Object.keys(st.files).length === 0);
r = await del();
check("DELETE with no photo is fine too", r.status === 200 && (await r.json()).avatar_url === null);

// PATCH /profile cannot set the photo path directly
r = await fetch(API + "/profile", { method: "PATCH", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" }, body: JSON.stringify({ avatar_path: `${UID}/evil.jpg` }) });
check("PATCH /profile refuses avatar_path", r.status === 400, String(r.status));
r = await fetch(API + "/profile", { method: "PATCH", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" }, body: JSON.stringify({ avatar_url: "https://evil.example/x.png" }) });
check("PATCH /profile refuses avatar_url", r.status === 400, String(r.status));

// someone else's folder in the profile row is never turned into a URL
console.log(out.join("\n")); console.log(out.some((l) => l.startsWith("FAIL")) ? "\nSOME FAILED" : `\nALL ${out.length} PASSED`);
