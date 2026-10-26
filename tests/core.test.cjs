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
console.log(`${passed} tests passed`);
