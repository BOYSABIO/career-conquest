import test from "node:test";
import assert from "node:assert/strict";
import { parseMasterListContent, parseStatusTag } from "./parse-applications";

test("parseStatusTag maps known statuses and defaults to applied", () => {
  assert.equal(parseStatusTag("#reject"), "reject");
  assert.equal(parseStatusTag("Interview Scheduled"), "interview");
  assert.equal(parseStatusTag("Offer received"), "offer");
  assert.equal(parseStatusTag("waiting"), "applied");
});

test("parseMasterListContent handles wikilinks with aliases and pipes", () => {
  const content = [
    "| Company | Position | Status |",
    "| [[Companies/Cloudflare|Cloudflare]] | [[AI Engineer]] [[Data Engineer]] | #interview |",
    "| [[IBM]] | [[Entry Level AI-First Transformation - Strategy Consultant]] | #applied |",
  ].join("\n");

  const map = parseMasterListContent(content);
  assert.equal(map.get("AI Engineer")?.company, "Cloudflare");
  assert.equal(map.get("AI Engineer")?.masterStatus, "#interview");
  assert.equal(map.get("Data Engineer")?.company, "Cloudflare");
  assert.equal(
    map.get("Entry Level AI-First Transformation - Strategy Consultant")?.company,
    "IBM"
  );
});
