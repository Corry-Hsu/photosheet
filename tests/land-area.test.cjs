const assert = require("node:assert/strict"),
  { test } = require("node:test"),
  fs = require("fs"),
  path = require("path");
const C = require("../core.js"),
  A = require("../land-area-core.js");
const cat = A.catalog(
  JSON.parse(
    fs.readFileSync(path.join(__dirname, "../data/land-area/catalog.json")),
  ),
);
function task(id = "job", lots = ["24", "24-1", "24-2"], extra = {}) {
  return {
    id,
    type: "雜草垃圾",
    caseNo: id,
    district: "東港鎮",
    section: "關帝段",
    sectionCode: "0582",
    parcels: lots.map((lot) => ({
      county: "屏東縣",
      district: "東港鎮",
      section: "關帝段",
      lot,
    })),
    items: [],
    area: "999",
    assignee: "p2",
    resultDate: "2026-11-11",
    due: "",
    navigation: { point: [120.5, 22.5], source: "manual", confirmed: true },
    ...extra,
  };
}
function preview(tasks, entries = cat, failures = {}) {
  const catalog = C.sectionCatalog(tasks, new Map(), []),
    r = A.requests(tasks, entries, catalog),
    records = r.needed.flatMap((e) =>
      A.section(
        JSON.parse(
          fs.readFileSync(path.join(__dirname, "../data/land-area", e.file)),
        ),
        e,
      ),
    );
  return A.analyze(r, records, failures);
}
test("exact decimals, zero, grouping, no binary rounding, large sums", () => {
  assert.equal(A.sum(["0.1", "0.2"]), "0.3");
  assert.equal(A.sum(["354.4", "7.98", "7.29"]), "369.67");
  assert.equal(A.area("1,234.500"), "1234.5");
  assert.equal(A.sum(["999999999999", "999999999999"]), "1999999999998");
  assert.equal(A.area("0"), "0");
  for (const x of ["", "-1", "1e2", "NaN", "1,23", "1.1234567"])
    assert.equal(A.area(x), null);
});
test("actual 0582 sample, complete sum, duplicates counted once, task and navigation preserved", () => {
  const t = task("job", ["24", "24-1", "24-2", "24-1"]),
    before = structuredClone(t),
    p = preview([t]);
  assert.equal(p[0].total, "369.67");
  assert.equal(p[0].parcels.length, 3);
  const after = A.apply([t], p, ["job"], "2026-11-11T00:00:00Z")[0];
  assert.equal(after.originalArea, "999");
  assert.equal(after.area, "369.67");
  assert.deepEqual(after.navigation, t.navigation);
  assert.deepEqual(t, before);
  assert.deepEqual(after.parcels, t.parcels);
  assert.equal(A.stale(after), false);
});
test("partial result never becomes total or overwrites existing area", () => {
  const t = task("missing", ["24", "999999"]);
  const p = preview([t]);
  assert.equal(p[0].total, null);
  assert.equal(p[0].subtotal, "354.4");
  assert.throws(() => A.apply([t], p, ["missing"], "now"), /不完整/);
  assert.equal(t.area, "999");
});
test("known code with wrong town or name is not accepted", () => {
  const t = task();
  t.parcels[0].sectionCode = "0582";
  t.parcels[0].district = "恆春鎮";
  let p = preview([t]);
  assert.equal(p[0].complete, false);
  assert.match(p[0].parcels[0].status, /不一致/);
  t.parcels[0].district = "東港鎮";
  t.parcels[0].section = "別段";
  p = preview([t]);
  assert.equal(p[0].complete, false);
});
test("failed section read blocks all affected parcels, not unrelated jobs", () => {
  const p = preview([task()], cat, { "屏東縣|0582": "offline" });
  assert.equal(p[0].complete, false);
  assert.equal(p[0].matched, 0);
});
test("same-name sections require unambiguous code and conflicting areas are not guessed", () => {
  const entries = [
      {
        county: "屏東縣",
        district: "東港鎮",
        section: "同名段",
        code: "0001",
        file: "0001.json",
        records: 1,
      },
      {
        county: "屏東縣",
        district: "東港鎮",
        section: "同名段",
        code: "0002",
        file: "0002.json",
        records: 1,
      },
    ],
    t = task("ambiguous", ["1"], { section: "同名段", sectionCode: "" });
  t.parcels[0].section = "同名段";
  const r = A.requests([t], entries, new Map()),
    records = entries.map((e) => ({
      ...e,
      sectionCode: e.code,
      lot: "1",
      area: "10",
      issues: [],
      source: e.file,
    }));
  let p = A.analyze(r, records);
  assert.equal(p[0].complete, false);
  assert.match(p[0].parcels[0].status, /多個/);
  t.parcels[0].sectionCode = "0001";
  const r2 = A.requests([t], entries, new Map());
  p = A.analyze(r2, [
    { ...records[0], area: null, issues: ["conflicting-area"] },
  ]);
  assert.equal(p[0].complete, false);
});
test("task changes after preview reject entire selected batch; changing a parcel invalidates prior total", () => {
  const tasks = [task("one"), task("two")],
    p = preview(tasks),
    before = structuredClone(tasks);
  tasks[1].parcels.push({ ...tasks[1].parcels[0], lot: "100" });
  assert.throws(() => A.apply(tasks, p, ["one", "two"], "now"), /已變更/);
  assert.equal(tasks[0].area, "999");
  const t = A.apply([before[0]], p, ["one"], "now")[0];
  t.parcels.push({ ...t.parcels[0], lot: "100" });
  assert.equal(A.stale(t), true);
  const clean = A.cleanTask(t);
  assert.equal(clean.area, "");
  assert.equal(clean.landArea.total, "369.67");
  assert.equal(clean.landArea.stale, true);
});
test("catalog traversal, duplicate codes and duplicate parcels are rejected", () => {
  const source = {
    schemaVersion: 1,
    unit: "㎡",
    sections: [{ ...cat[0], file: "../secret.json" }],
  };
  assert.throws(() => A.catalog(source));
  assert.throws(() => A.catalog({ ...source, sections: [cat[0], cat[0]] }));
  const e = cat.find((e) => e.code === "0582"),
    raw = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../data/land-area", e.file)),
    );
  raw.parcels[1] = raw.parcels[0];
  assert.throws(() => A.section(raw, e), /重複/);
});
test("all 907 sections validate and only whitelisted public fields are present", () => {
  let n = 0;
  assert.equal(cat.length, 907);
  for (const e of cat) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../data/land-area", e.file)),
    );
    assert.deepEqual(
      Object.keys(raw).sort(),
      [
        "schemaVersion",
        "unit",
        "county",
        "district",
        "section",
        "code",
        "parcels",
      ].sort(),
    );
    for (const p of raw.parcels)
      assert.deepEqual(Object.keys(p).sort(), ["lot", "area", "issues"].sort());
    n += A.section(raw, e).length;
  }
  assert.equal(n, 182597);
});
test("dispatch merge clears a derived total when only parcels are changed", () => {
  const P = require("../dispatch-plan.js");
  const t = A.apply([task()], preview([task()]), ["job"], "now")[0],
    base = {
      schemaVersion: 1,
      batch: "x",
      person: { id: "p2", name: "人員二" },
      settings: {},
      tasks: [t],
      features: [],
    },
    entry = P.create(base);
  entry.incoming = structuredClone(base);
  entry.incoming.tasks[0].parcels.push({ ...t.parcels[0], lot: "100" });
  P.approve(
    entry,
    P.plan(entry).conflicts.find((c) => c.field === "parcels"),
  );
  const result = P.plan(entry).result.tasks[0];
  assert.equal(result.area, "");
  assert.equal(result.landArea.stale, true);
});

test("equivalent formatting and inherited section code do not invalidate a computed area", () => {
  const t = task(),
    after = A.apply([t], preview([t]), [t.id], "now")[0];
  after.parcels = after.parcels.map((p) => ({
    ...p,
    sectionCode: "0582",
    lot: p.lot === "24" ? "0024" : p.lot,
    note: "metadata only",
  }));
  assert.equal(A.stale(after), false);
});
