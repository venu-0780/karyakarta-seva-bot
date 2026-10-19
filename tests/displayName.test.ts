import assert from "node:assert/strict";
import { test } from "node:test";

import { usableDisplayName } from "../src/services/displayName.js";

test("keeps a WhatsApp profile name", () => {
  assert.equal(usableDisplayName("Ravi Kumar"), "Ravi Kumar");
});

test("drops a phone-number fallback", () => {
  assert.equal(usableDisplayName("919876543210"), undefined);
  assert.equal(usableDisplayName("+91 98765 43210"), undefined);
});
