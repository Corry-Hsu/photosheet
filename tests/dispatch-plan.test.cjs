const { test } = require("node:test"),
  assert = require("node:assert/strict");
const P = require("../dispatch-plan.js");
function task(id = "job1", lot = "249", extra = {}) {
  return {
    id,
    type: "圍籬",
    caseNo: id,
    parcels: [
      {
        county: "屏東縣",
        district: "恆春鎮",
        section: "城南段",
        sectionCode: "0582",
        lot,
      },
    ],
    items: [],
    resultDate: "2026-11-15",
    due: "",
    assignee: "p2",
    navigation: { point: [120.5, 22.5], source: "manual", confirmed: true },
    ...extra,
  };
}
function feature(lot = "249", id = "f" + lot) {
  return {
    id,
    code: "0582",
    lot,
    lands: [{ county: "屏東縣", district: "恆春鎮", section: "城南段", lot }],
    polygons: [
      [
        [
          [120.5, 22.5],
          [120.51, 22.5],
          [120.51, 22.51],
          [120.5, 22.5],
        ],
      ],
    ],
    bbox: [120.5, 22.5, 120.51, 22.51],
  };
}
function pack(tasks = [task()], features = [feature()], id = "p2") {
  return {
    schemaVersion: 1,
    batch: "kept-batch",
    generatedAt: "2026-11-01T00:00:00Z",
    person: { id, name: "人員二" },
    ...(id === "v3" ? { vendorType: "圍籬" } : {}),
    settings: { board: "kept" },
    tasks,
    features,
  };
}
function conflict(e, field) {
  return P.plan(e).conflicts.find((c) => c.field === field);
}
test("additive import is immutable, deduplicates IDs, preserves existing navigation, settings and metadata", () => {
  const base = pack(),
    before = P.copy(base),
    e = P.create(base);
  e.incoming = pack(
    [task("job1", "249", { navigation: null }), task("job2", "240")],
    [feature(), feature("240")],
  );
  e.incoming.batch = "incoming";
  e.incoming.settings.board = "incoming";
  let p = P.plan(e);
  assert.equal(p.tasks.added.length, 1);
  assert.equal(p.features.added.length, 1);
  assert.equal(p.result.tasks[0].navigation.confirmed, true);
  assert.equal(p.result.batch, "kept-batch");
  assert.equal(p.result.settings.board, "kept");
  assert.deepEqual(base, before);
  assert.deepEqual(e.base, before);
  P.approve(e, conflict(e, "navigation"));
  p = P.plan(e);
  assert.equal(p.result.tasks[0].navigation, null);
  assert.equal(p.result.settings.board, "kept");
  P.approve(e, conflict(e, "navigation"), false);
  assert.deepEqual(
    P.plan(e).result.tasks[0].navigation,
    before.tasks[0].navigation,
  );
});
test("same identity under new ID is deduplicated; same parcel in another case remains a separate task", () => {
  const e = P.create(pack());
  e.incoming = pack(
    [task("different-id", "249", { caseNo: "job1" }), task("different-case")],
    [feature()],
  );
  let p = P.plan(e);
  assert.equal(p.result.tasks.length, 2);
  assert.equal(p.result.tasks[0].id, "job1");
  assert.equal(p.aliases[0].incomingId, "different-id");
  const exact = pack([task(), task()], [feature(), feature()]);
  assert.equal(P.normalize(exact).tasks.length, 1);
  exact.tasks[1].due = "changed";
  assert.throws(() => P.normalize(exact), /同ID/);
});
test("one selected parcel correction retains other fields and replaces only unshared geometry", () => {
  const e = P.create(pack([task(), task("shared")], [feature()]));
  e.incoming = pack(
    [task("job1", "240", { navigation: null, resultDate: "2026-12-01" })],
    [feature("240")],
  );
  P.approve(e, conflict(e, "parcels"));
  let p = P.plan(e);
  assert.deepEqual(p.result.features.map((f) => f.lot).sort(), ["240", "249"]);
  assert.equal(p.result.tasks[0].resultDate, "2026-11-15");
  assert.equal(p.result.tasks[0].navigation.confirmed, true);
  P.remove(e, p.result.tasks[1]);
  p = P.plan(e);
  assert.deepEqual(
    p.result.features.map((f) => f.lot),
    ["240"],
  );
  assert.equal(p.features.removed.length, 1);
});
test("shared KML is retained for remaining tasks; removal never changes a different entry", () => {
  const base = pack([task(), task("shared")]),
    e = P.create(base),
    other = P.create(base);
  P.remove(e, P.plan(e).result.tasks[0]);
  assert.equal(P.plan(e).result.features.length, 1);
  assert.equal(P.plan(other).result.tasks.length, 2);
  P.remove(e, P.plan(e).result.tasks[0]);
  const p = P.plan(e);
  assert.equal(p.result.tasks.length, 0);
  assert.equal(p.result.features.length, 0);
  assert.equal(base.tasks.length, 2);
});
test("rebase invalidates approval and suspends stale removals without losing remote additions", () => {
  const e = P.create(pack());
  e.incoming = pack([task("job1", "240")], [feature("240")]);
  P.approve(e, conflict(e, "parcels"));
  P.remove(e, P.plan(e).result.tasks[0]);
  e.base = pack(
    [task("job1", "241"), task("remote", "242")],
    [feature("241"), feature("242")],
  );
  const p = P.plan(e);
  assert.equal(p.result.tasks.length, 2);
  assert.equal(p.result.tasks[0].parcels[0].lot, "241");
  assert.equal(p.conflicts.find((c) => c.field === "parcels").stale, true);
  assert.deepEqual(p.suspended, ["job1"]);
  assert.equal(p.result.tasks[1].id, "remote");
});
test("sync overrides require approval and matching preimages; unrelated imported fields remain original", () => {
  const e = P.create(pack());
  e.extra = [
    {
      kind: "task",
      id: "job1",
      field: "parcels",
      value: task("job1", "240").parcels,
    },
  ];
  e.extraFeatures = [feature("240")];
  let p = P.plan(e);
  assert.equal(p.result.tasks[0].parcels[0].lot, "249");
  P.approve(e, p.conflicts[0]);
  p = P.plan(e);
  assert.equal(p.result.tasks[0].parcels[0].lot, "240");
  assert.equal(p.result.tasks[0].navigation.confirmed, true);
  assert.deepEqual(
    p.result.features.map((f) => f.lot),
    ["240"],
  );
});
test("vendor scopes, malformed tasks and geometry, unsafe keys are rejected atomically", () => {
  assert.throws(
    () => P.normalize(pack([task("job1", "249", { assignee: "p1" })])),
    /分派/,
  );
  assert.throws(
    () =>
      P.normalize({
        ...pack([], [], "v3"),
        tasks: [task("wrong", "249", { type: "砍樹" })],
      }),
    /標籤/,
  );
  assert.throws(
    () =>
      P.normalize(
        pack([task("bad", "249", { navigation: { point: [999, 22] } })]),
      ),
    /導航/,
  );
  assert.throws(
    () => P.normalize(pack([task("bad", "249", { resultDate: "2026-02-30" })])),
    /任務/,
  );
  const invalid = feature();
  invalid.polygons[0][0][0] = [999, 22];
  assert.throws(() => P.normalize(pack([], [invalid])), /圖形/);
  assert.throws(
    () => P.normalize(JSON.parse('{"__proto__":{},"schemaVersion":1}')),
    /不允許/,
  );
});
test("unused incoming features are dropped but preexisting unrelated features remain", () => {
  const e = P.create(pack([task()], [feature(), feature("300")]));
  e.incoming = pack([task()], [feature(), feature("400")]);
  const p = P.plan(e);
  assert.deepEqual(
    p.result.features.map((f) => f.lot),
    ["249", "300"],
  );
  assert.equal(p.changed, false);
  assert.equal(p.skippedUnusedGeometry, 1);
});
test("all current public packages validate and a no-op plan preserves every field", () => {
  const fs = require("fs");
  for (const r of P.recipients) {
    const base = JSON.parse(
      fs.readFileSync(require("path").join(__dirname, "../data", r.file)),
    );
    const p = P.plan(P.create(base));
    assert.deepEqual(p.result, base);
    assert.equal(p.changed, false);
  }
});
