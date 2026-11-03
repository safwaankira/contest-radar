import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, findDeadline } from "../lib/dates.js";

const now = new Date("2026-11-03T12:00:00Z");
test("parses the deadline formats seen on poidh and X", () => {
  assert.equal(findDeadline("Rules... Deadline: November 30, 2026 ", now), "2026-11-30");
  assert.equal(findDeadline("deadline to submit a claim is Sunday, November 8th @ 11:59pm PST", now), "2026-11-08");
  assert.equal(findDeadline("One claim per person.\n- Deadline: 15-11-2026\n\nJUDGING", now), "2026-11-15");
  assert.equal(findDeadline("Submissions close 2026-11-12.", now), "2026-11-12");
  assert.equal(findDeadline("ends 30 Nov", now), "2026-11-30");
  assert.equal(findDeadline("Submit by Jan 5th", now), "2027-01-05");
});
test("ignores dates that are not deadlines", () => {
  assert.equal(findDeadline("Launched on November 1, 2026. Prize $50.", now), null);
  assert.equal(parseDate("nothing here", now), null);
});
