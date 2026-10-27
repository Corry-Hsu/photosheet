const assert = require("node:assert/strict");
global.sax = require("../vendor/sax.js");
const C = require("../core.js");
let passed = 0;
function test(name, f) {
  f();
  passed++;
  console.log("PASS", name);
}
test("八碼及母子號", () => {
  assert.equal(C.xmlLot("07520008"), "752-8");
  assert.equal(C.xmlLot("00020000"), "2");
  assert.equal(C.lot("０５０９之１號"), "509-1");
  assert.equal(C.lot("1abc"), "");
});
test("有效日期與民國日期", () => {
  assert.equal(C.date("115/10/14"), "2026-10-14");
  assert.equal(C.date("2026-02-30"), "");
  assert.equal(C.date("115年9月24日"), "2026-09-24");
  assert.equal(C.roc("2026-09-24"), "115年9月24日");
});
test("臺灣月初與跨年", () => {
  const now = new Date("2026-12-31T16:01:00Z");
  assert.equal(C.today(now), "2027-01-01");
  assert.throws(() =>
    C.assign({ resultDate: "2026-12-31", assignee: "" }, "p1", now),
  );
  assert.equal(
    C.assign({ resultDate: "2026-12-31", assignee: "p1" }, "p1", now).assignee,
    "p1",
  );
  assert.throws(() =>
    C.assign({ resultDate: "2026-12-31", assignee: "p1" }, "p2", now),
  );
});
test("舊案不可透過改日期重新開啟", () => {
  let t = C.monthPolicy(
    { resultDate: "2026-09-01", assignee: "" },
    new Date("2026-10-26T00:00:00Z"),
  );
  t.resultDate = "2026-10-26";
  assert.throws(() => C.assign(t, "p1", new Date("2026-10-26T00:00:00Z")));
  let old = C.assign(
    { resultDate: "2026-09-01", assignee: "p1" },
    "",
    new Date("2026-10-26T00:00:00Z"),
  );
  old.resultDate = "2026-10-26";
  assert.throws(() => C.assign(old, "p1", new Date("2026-10-26T00:00:00Z")));
});
test("多地號與跨鄉鎮整列", () => {
  let ps = C.parseParcels(
    ["752-8、752-9", "長治鄉長治段204-7"],
    "屏東市",
    "香揚段",
  );
  assert.equal(ps.length, 3);
  assert.equal(ps[2].district, "長治鄉");
  assert.throws(() => C.parseParcels(["123錯字"], "屏東市", "香揚段"));
});
test("精確配對及市字正規化", () => {
  const f = {
      id: "1",
      lands: [
        {
          county: "屏東縣",
          district: "屏東巿",
          section: "香揚段",
          lot: "752-8",
        },
      ],
    },
    m = C.makeIndex([f]);
  assert.equal(
    C.match({ district: "屏東市", section: "香揚段", lot: "752-8" }, m).length,
    1,
  );
  assert.equal(
    C.match({ district: "長治鄉", section: "香揚段", lot: "752-8" }, m).length,
    0,
  );
  assert.equal(
    C.match({ district: "", section: "香揚段", lot: "752-8" }, m).length,
    0,
  );
});
test("凹形帶洞與多面導航點", () => {
  const a = [
      [
        [0, 0],
        [8, 0],
        [8, 8],
        [0, 8],
        [0, 0],
      ],
      [
        [2, 2],
        [6, 2],
        [6, 6],
        [2, 6],
        [2, 2],
      ],
    ],
    b = [
      [
        [10, 0],
        [11, 0],
        [11, 1],
        [10, 1],
        [10, 0],
      ],
    ];
  let p = C.point([a, b]);
  assert(C.inside(p, [a]));
  assert(!C.insideRing(p, a[1]));
  let concave = [
    [
      [
        [0, 0],
        [4, 0],
        [4, 1],
        [1, 1],
        [1, 4],
        [0, 4],
        [0, 0],
      ],
    ],
  ];
  assert(C.inside(C.point(concave), concave));
});
test("導航順序與無效座標", () => {
  assert(C.navURL([120.5, 22.6]).includes("22.6%2C120.5"));
  assert.throws(() => C.navURL([190, 30]));
  assert.throws(() => C.navURL([NaN, 22]));
});
test("XML僅抽必要地籍資料", () => {
  const r = C.parseLandXML(
    "<Lands><國有><土地標示部><縣市>屏東縣</縣市><鄉鎮市區>屏東巿</鄉鎮市區><段代碼>0058</段代碼><段小段>香揚段</段小段><地號>07520008</地號><所有權人><統一編號>SECRET</統一編號></所有權人></土地標示部></國有></Lands>",
    "a.xml",
  );
  assert.equal(r[0].lot, "752-8");
  assert.equal(r[0].ownership, "國有");
  assert(!JSON.stringify(r).includes("SECRET"));
  assert.throws(() => C.parseLandXML("<!DOCTYPE x><Lands/>"));
  assert.throws(() => C.parseLandXML("<Lands><x></Lands>"));
});
test("KML面狀識別及壞座標", () => {
  let text =
    '<kml><Placemark><ExtendedData><SchemaData><SimpleData name="SECTNO">0058</SimpleData><SimpleData name="PARCELNO">752-8</SimpleData></SchemaData></ExtendedData><Polygon><outerBoundaryIs><LinearRing><coordinates>120,22 121,22 121,23 120,22</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>';
  let r = C.parseKML(text, "a.kml");
  assert.equal(r.features.length, 1);
  assert.equal(r.features[0].lot, "752-8");
  assert.equal(
    C.parseKML(text.replace("120,22", "999,22"), "a.kml").features.length,
    0,
  );
});
test("文字轉義", () => assert(!C.esc('<img onerror="x">').includes("<img")));

test("KML標示0582/1198可獨立配對，不需要XML", () => {
  const kml =
    "<kml><Document><name>不是地籍識別</name><Placemark><name>0582/1198</name><Polygon><outerBoundaryIs><LinearRing><coordinates>120,22 121,22 121,23 120,22</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>";
  const f = C.parseKML(kml, "only.kml").features;
  assert.equal(f.length, 1);
  assert.equal(f[0].code, "0582");
  assert.equal(f[0].lot, "1198");
  f[0].lands = [];
  const task = {
      district: "東港鎮",
      section: "關帝段",
      sectionCode: 582,
      parcels: [
        {
          county: "屏東縣",
          district: "東港鎮",
          section: "關帝段",
          lot: "1198",
        },
      ],
    },
    i = C.makeIndex(f),
    catalog = C.sectionCatalog([task]);
  const p = task.parcels[0];
  assert.equal(C.parcelCode(task, p, catalog), "0582");
  assert.equal(
    C.match({ ...p, sectionCode: C.parcelCode(task, p, catalog) }, i).length,
    1,
  );
  assert.equal(C.match({ ...p, sectionCode: "0583" }, i).length, 0);
});
test("KML代碼標示母子號與欄位矛盾", () => {
  const shape =
    "<Polygon><outerBoundaryIs><LinearRing><coordinates>120,22 121,22 121,23 120,22</coordinates></LinearRing></outerBoundaryIs></Polygon>";
  assert.equal(
    C.parseKML(
      "<kml><Placemark><name>０５８２／００１１９８－００１</name>" +
        shape +
        "</Placemark></kml>",
      "a",
    ).features[0].lot,
    "1198-1",
  );
  const bad =
    '<kml><Placemark><name>0582/1198</name><ExtendedData><Data name="SECTNO"><value>0583</value></Data><Data name="PARCELNO"><value>1198</value></Data></ExtendedData>' +
    shape +
    "</Placemark></kml>";
  assert.equal(C.parseKML(bad, "a").features.length, 0);
});
test("跨地段不能套用主地段代碼；有對照才帶入", () => {
  const p1 = {
      county: "屏東縣",
      district: "東港鎮",
      section: "關帝段",
      lot: "1198",
    },
    p2 = {
      county: "屏東縣",
      district: "潮州鎮",
      section: "延平段",
      lot: "167",
    };
  const a = {
      district: "東港鎮",
      section: "關帝段",
      sectionCode: "0582",
      parcels: [p1, p2],
    },
    b = {
      district: "潮州鎮",
      section: "延平段",
      sectionCode: "0492",
      parcels: [p2],
    };
  assert.equal(C.parcelCode(a, p2, C.sectionCatalog([a])), "");
  assert.equal(C.parcelCode(a, p2, C.sectionCatalog([a, b])), "0492");
});

test("段對照修正舊快取代碼，原始任務不變", () => {
  const refs = C.parseSectionRows([
    ["段", "小段", "代碼", "備註", "所區碼", "鄉鎮名稱"],
    ["公園", "二", "0019", null, "TA", "屏東市"],
  ]);
  assert.equal(refs[0].section, "公園段二小段");
  const p = {
      county: "屏東縣",
      district: "屏東市",
      section: "公園段二小段",
      lot: "5-234",
    },
    t = {
      district: p.district,
      section: p.section,
      sectionCode: "0018",
      parcels: [p],
    };
  assert.equal(
    C.parcelCode(t, p, C.sectionCatalog([t], undefined, refs)),
    "0019",
  );
  assert.equal(t.sectionCode, "0018");
  const geometry = C.makeIndex([
    { id: "geom", code: "0019", lot: "5-234", lands: [{ ...p, code: "0019" }] },
  ]);
  assert.equal(
    C.parcelCode(t, p, C.sectionCatalog([t], geometry.sectionCodes)),
    "0019",
  );
});
test("管理清單只顯示今年本月起，臺灣跨年正確", () => {
  const now = new Date("2026-10-27T00:00:00Z");
  for (const date of ["2025-12-31", "2026-09-30", "2027-01-01", ""])
    assert.equal(C.adminVisible({ resultDate: date }, now), false);
  for (const date of ["2026-10-01", "2026-12-31"])
    assert.equal(C.adminVisible({ resultDate: date }, now), true);
  assert(
    C.adminVisible(
      { resultDate: "2027-01-01" },
      new Date("2026-12-31T16:00:00Z"),
    ),
  );
});
test("完成註記可取消，已完成不能重新分派", () => {
  const t = C.markComplete(
    { resultDate: "2026-10-27", assignee: "p1" },
    true,
    new Date("2026-10-27T01:00:00Z"),
  );
  assert.equal(t.completed, true);
  assert.equal(t.completedAt, "2026-10-27T01:00:00.000Z");
  assert.throws(() => C.assign(t, "p2", new Date("2026-10-27T00:00:00Z")));
  const restored = C.markComplete(t, false);
  assert.equal(restored.completed, false);
  assert.equal(
    C.assign(restored, "p2", new Date("2026-10-27T00:00:00Z")).assignee,
    "p2",
  );
});
test("依鄉鎮自動分派，保留第三人與已完成／舊案", () => {
  const now = new Date("2026-10-27T00:00:00Z"),
    base = { resultDate: "2026-10-27", assignee: "", parcels: [] };
  for (const district of C.selfDistricts) {
    assert.equal(C.autoAssign({ ...base, district }, now).assignee, "p1");
    assert.equal(
      C.autoAssign({ ...base, district: "屏東縣" + district }, now).assignee,
      "p1",
    );
  }
  assert.equal(
    C.autoAssign({ ...base, district: "東港鎮", assignee: "p1" }, now).assignee,
    "p2",
  );
  for (const patch of [
    { assignee: "p3" },
    { completed: true },
    { resultDate: "2026-09-30" },
    { resultDate: "2027-01-01" },
    { assignmentClosed: true },
    { assignmentLockedTo: "p2" },
    { district: "" },
  ]) {
    const t = { ...base, district: "屏東市", ...patch };
    assert.equal(C.autoAssign(t, now), t);
  }
  const t = { ...base, district: "", parcels: [{ district: "內埔鄉" }] };
  assert.equal(C.autoAssign(t, now).assignee, "p1");
  assert.equal(t.assignee, "");
  const mixed = {
    ...base,
    district: "",
    parcels: [{ district: "內埔鄉" }, { district: "東港鎮" }],
  };
  assert.equal(C.autoAssign(mixed, now), mixed);
});
console.log("FINAL TOTAL", passed, "tests passed");
