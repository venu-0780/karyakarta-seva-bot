import assert from "node:assert/strict";
import { test } from "node:test";

import { MemorySubscriberStore, toWaId } from "../src/services/subscribers.js";

test("toWaId extracts the user's number from a Chat SDK thread id", () => {
  assert.equal(toWaId("whatsapp:1234567890:919940450062"), "919940450062");
  assert.equal(toWaId("919940450062"), "919940450062");
  assert.equal(toWaId("+91 99404 50062"), "919940450062");
  assert.equal(toWaId(""), undefined);
  assert.equal(toWaId("test-user"), undefined);
});

test("MemorySubscriberStore records each sender once", async () => {
  const store = new MemorySubscriberStore();
  await store.add("whatsapp:1234567890:919940450062");
  await store.add("919940450062");
  await store.add("whatsapp:1234567890:919876543210");
  await store.add("not-a-number");
  assert.deepEqual((await store.all()).sort(), ["919876543210", "919940450062"]);
});
