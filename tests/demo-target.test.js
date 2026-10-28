const { test } = require("node:test");
const assert = require("node:assert/strict");
const { DEMO_URI, assertDemoTarget } = require("../lib/demo-target");
test("demo seeding refuses remote, differently named and production databases", () => {
  assert.doesNotThrow(() => assertDemoTarget(DEMO_URI, "development"));
  for (const uri of [undefined, "mongodb+srv://example.invalid/demo", "mongodb://127.0.0.1:27018/company", "mongodb://localhost:27017/apexcari_demo"])
    assert.throws(() => assertDemoTarget(uri, "development"));
  assert.throws(() => assertDemoTarget(DEMO_URI, "production"));
});
