// The assistant's list of endpoints (catalog.ts) must match what its router (router.ts) can really reach. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(new URL(`../lib/server/assistant/${file}`, import.meta.url), "utf8");

test("every endpoint the assistant is told about has a route in its router", () => {
  // Parameter names may differ (":monday" in the catalog, ":start" in the router): only the shape of the path matters.
  const shape = (path: string) => path.replace(/:[a-z_]+/g, ":*");
  const catalog = [...read("catalog.ts").matchAll(/^\s*\["(GET|POST|PUT|PATCH|DELETE)", "([^"]+)"/gm)].map((m) => ({ method: m[1], path: shape(m[2].split("?")[0]) }));
  const router = new Set([...read("router.ts").matchAll(/\["(\/[^"]*)", [A-Za-z]+\]/g)].map((m) => shape(m[1])));
  assert.ok(catalog.length > 40, `found only ${catalog.length} catalog entries`);
  assert.ok(router.size > 40, `found only ${router.size} routes`);
  const missing = [...new Set(catalog.map((c) => c.path))].filter((path) => !router.has(path));
  assert.deepEqual(missing, [], `advertised to the assistant but not routed: ${missing.join(", ")}`);
});

test("the library endpoints are routed", () => {
  const router = read("router.ts");
  for (const path of ["/resources", "/resources/:id", "/resources/:id/practice"]) assert.ok(router.includes(`"${path}"`), path);
});
