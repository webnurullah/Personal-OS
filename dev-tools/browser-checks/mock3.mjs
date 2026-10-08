// A stand-in for Supabase (auth, profiles table, Storage) with real state, so the app's real API routes can be tested.
import http from "node:http";
const UID = "11111111-1111-4111-8111-111111111111";
const state = { avatar_path: null, files: {}, calls: [], fail: {} };
const profile = () => ({ id: UID, full_name: "Nurullah", tagline: "Every Day", city: "", timezone: "Asia/Dhaka", currency: "BDT", week_start: 1, time_format: "12h", hide_amounts: false, weekly_study_goal: 8, step_goal: 10000, sleep_goal_minutes: 480, water_goal: 8, notify: {}, notifications_read_at: null, skills: [], created_at: "", updated_at: "", avatar_path: state.avatar_path });
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const url = new URL(req.url, "http://x");
  const send = (code, obj, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(obj)); };
  const single = (req.headers.accept || "").includes("vnd.pgrst.object");
  const log = (what) => state.calls.push(`${req.method} ${url.pathname}${url.search} ${what ?? ""}`.trim());
  if (url.pathname === "/__state") return send(200, { ...state, files: Object.fromEntries(Object.entries(state.files).map(([k, v]) => [k, { bytes: v.bytes, type: v.type, cache: v.cache, upsert: v.upsert }])) });
  if (url.pathname === "/__reset") { state.avatar_path = null; state.files = {}; state.calls = []; state.fail = {}; return send(200, {}); }
  if (url.pathname === "/__fail") { state.fail[url.searchParams.get("what")] = Number(url.searchParams.get("times") ?? 1); return send(200, state.fail); }
  const failing = (what) => (state.fail[what] > 0 ? (state.fail[what]--, true) : false);
  if (url.pathname === "/auth/v1/user") return send(200, { id: UID, aud: "authenticated", role: "authenticated", email: "me@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" });
  if (url.pathname === "/rest/v1/rpc/ensure_profile") { log(); return send(200, profile()); }
  if (url.pathname === "/rest/v1/profiles") {
    if (req.method === "GET") { log(url.search); return send(200, single ? { avatar_path: state.avatar_path } : [{ avatar_path: state.avatar_path }]); }
    if (req.method === "PATCH") {
      const patch = JSON.parse(body.toString() || "{}");
      log(JSON.stringify(patch));
      if (failing("profile")) return send(500, { code: "XX000", message: "boom" });
      if ("avatar_path" in patch) state.avatar_path = patch.avatar_path;
      return send(200, single ? profile() : [profile()]);
    }
  }
  const up = url.pathname.match(/^\/storage\/v1\/object\/avatars\/(.+)$/);
  if (up && req.method === "POST") {
    log(`type=${req.headers["content-type"]} cache=${req.headers["cache-control"]} upsert=${req.headers["x-upsert"]} bytes=${body.length}`);
    if (failing("upload")) return send(403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
    state.files[up[1]] = { data: body, bytes: body.length, type: req.headers["content-type"], cache: req.headers["cache-control"], upsert: req.headers["x-upsert"] };
    return send(200, { Id: "id-" + up[1], Key: "avatars/" + up[1] });
  }
  if (url.pathname === "/storage/v1/object/avatars" && req.method === "DELETE") {
    const { prefixes } = JSON.parse(body.toString());
    log(JSON.stringify(prefixes));
    if (failing("remove")) return send(500, { statusCode: "500", error: "x", message: "storage down" });
    for (const p of prefixes) delete state.files[p];
    return send(200, prefixes.map((name) => ({ name })));
  }
  const pub = url.pathname.match(/^\/storage\/v1\/object\/public\/avatars\/(.+)$/);
  if (pub) { const f = state.files[pub[1]]; if (!f) return send(404, { message: "Object not found" }); res.writeHead(200, { "content-type": f.type || "image/jpeg", "cache-control": "max-age=3600" }); return res.end(f.data); }
  send(404, { message: "mock: " + url.pathname });
}).listen(4012, () => console.log("mock3 on 4012"));
