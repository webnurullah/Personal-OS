// Job Apply → Company list: names and links. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { companyKey, linkLabel, readLink, shortLink, tidyName } from "../lib/companies.ts";
import { CompanyFields } from "../lib/server/schemas.ts";

test("names: spaces are tidied, and capital letters and extra spaces do not make a second company", () => {
  assert.equal(tidyName("  Markopolo   AI  INC "), "Markopolo AI INC");
  assert.equal(companyKey("Markopolo AI INC"), companyKey("  markopolo ai   inc "));
  assert.equal(companyKey(""), "");
  assert.equal(companyKey(undefined), "");
  assert.notEqual(companyKey("Markopolo"), companyKey("Markopolo AI"));
});

test("links: a bare address gets https://, a full link is kept, empty is fine", () => {
  assert.deepEqual(readLink("website", "markopolo.ai"), { link: "https://markopolo.ai" });
  assert.deepEqual(readLink("website", "  www.markopolo.ai/careers "), { link: "https://www.markopolo.ai/careers" });
  assert.deepEqual(readLink("website", "http://example.com/a?b=1"), { link: "http://example.com/a?b=1" });
  assert.deepEqual(readLink("website", "HTTPS://Example.com"), { link: "HTTPS://Example.com" });
  assert.deepEqual(readLink("website", ""), { link: "" });
  assert.deepEqual(readLink("website", "   "), { link: "" });
  assert.deepEqual(readLink("website", "example.com:8080/x"), { link: "https://example.com:8080/x" }, "a port is not a scheme");
});

test("links: only web links, with a real host, and no spaces", () => {
  for (const bad of ["javascript:alert(1)", "mailto:a@b.com", "ftp://example.com", "data:text/html,x", "file:///etc/passwd", "localhost", "my company site", "http://", "https://.", "abc", "http://a b.com"]) {
    assert.ok("problem" in readLink("website", bad), `${bad} should be refused`);
  }
  assert.ok("problem" in readLink("website", "https://example.com/" + "a".repeat(500)), "over 500 letters");
});

test("links: a Facebook box only takes Facebook, a LinkedIn box only LinkedIn (also their short and country forms)", () => {
  assert.deepEqual(readLink("facebook", "facebook.com/markopolo"), { link: "https://facebook.com/markopolo" });
  assert.deepEqual(readLink("facebook", "https://www.facebook.com/markopolo"), { link: "https://www.facebook.com/markopolo" });
  assert.deepEqual(readLink("facebook", "fb.com/markopolo"), { link: "https://fb.com/markopolo" });
  assert.deepEqual(readLink("facebook", "https://m.facebook.com/markopolo"), { link: "https://m.facebook.com/markopolo" });
  assert.deepEqual(readLink("linkedin", "https://bd.linkedin.com/company/markopolo"), { link: "https://bd.linkedin.com/company/markopolo" });
  assert.deepEqual(readLink("linkedin", "lnkd.in/abc"), { link: "https://lnkd.in/abc" });
  assert.deepEqual(readLink("facebook", "linkedin.com/company/x"), { problem: "That does not look like a Facebook link." });
  assert.deepEqual(readLink("linkedin", "facebook.com/x"), { problem: "That does not look like a LinkedIn link." });
  assert.ok("problem" in readLink("linkedin", "notlinkedin.com/x"), "a host that only ends in the same letters is not LinkedIn");
  assert.ok("problem" in readLink("facebook", "https://evil.com/facebook.com"), "the network name in the path does not count");
  assert.equal(linkLabel("website"), "Website");
  assert.equal(linkLabel("facebook"), "Facebook");
});

test("showing a link short", () => {
  assert.equal(shortLink("https://www.linkedin.com/company/markopolo/"), "linkedin.com/company/markopolo");
  assert.equal(shortLink("http://example.com"), "example.com");
});

test("the company form: name tidied, links read, strict, partial for a change", () => {
  const ok = CompanyFields.parse({ name: "  Markopolo   AI INC ", website: "markopolo.ai", facebook: "", linkedin: "linkedin.com/company/markopolo", note: " Dhaka office " });
  assert.deepEqual(ok, { name: "Markopolo AI INC", website: "https://markopolo.ai", facebook: "", linkedin: "https://linkedin.com/company/markopolo", note: "Dhaka office" });
  assert.deepEqual(CompanyFields.parse({ name: "A" }), { name: "A" }, "the links are optional");
  assert.equal(CompanyFields.safeParse({ name: "   " }).success, false, "a name is needed");
  assert.equal(CompanyFields.safeParse({ name: "x".repeat(201) }).success, false);
  assert.equal(CompanyFields.safeParse({ name: "A", extra: 1 }).success, false);
  assert.equal(CompanyFields.safeParse({ name: "A", note: "x".repeat(1001) }).success, false);
  const wrong = CompanyFields.safeParse({ name: "A", facebook: "linkedin.com/company/a" });
  assert.equal(wrong.success, false);
  assert.match(JSON.stringify(wrong.error?.issues), /does not look like a Facebook link/);
  assert.equal(CompanyFields.partial().strict().safeParse({ linkedin: "lnkd.in/x" }).success, true);
  assert.equal(CompanyFields.partial().strict().safeParse({}).success, true);
});
