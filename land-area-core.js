/* Parcel area matching: sanitized public records only; exact decimal arithmetic. */
(function (root) {
  "use strict";
  const C =
    root.PSCore ||
    (typeof require === "function" ? require("./core.js") : null);
  const norm = C.norm,
    own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function area(value) {
    let s = norm(value);
    if (/^\d{1,3}(,\d{3})+(\.\d{1,6})?$/.test(s)) s = s.replace(/,/g, "");
    if (!/^\d{1,12}(\.\d{1,6})?$/.test(s)) return null;
    let [a, b = ""] = s.split(".");
    a = String(BigInt(a));
    b = b.replace(/0+$/, "");
    return a + (b ? "." + b : "");
  }
  function sum(values) {
    let total = 0n;
    for (const value of values) {
      const s = area(value);
      if (s === null) throw Error("無效登記面積");
      const [a, b = ""] = s.split(".");
      total += BigInt(a) * 1000000n + BigInt(b.padEnd(6, "0"));
    }
    const fraction = (total % 1000000n)
      .toString()
      .padStart(6, "0")
      .replace(/0+$/, "");
    return (total / 1000000n).toString() + (fraction ? "." + fraction : "");
  }
  function signature(t) {
    const codes = C.sectionCatalog([t], new Map(), []);
    return JSON.stringify(
      t.parcels.map((p) => [
        norm(p.county || "屏東縣"),
        norm(p.district),
        norm(p.section),
        C.lot(p.lot),
        C.parcelCode(t, p, codes),
      ]),
    );
  }
  function catalog(input) {
    if (
      input?.schemaVersion !== 1 ||
      input.unit !== "㎡" ||
      !Array.isArray(input.sections) ||
      input.sections.length > 5000
    )
      throw Error("地籍面積索引格式錯誤");
    const seen = new Set();
    return input.sections.map((s) => {
      if (
        !s ||
        !C.sectionCode(s.code) ||
        C.sectionCode(s.code) !== s.code ||
        typeof s.county !== "string" ||
        !s.county ||
        typeof s.district !== "string" ||
        !s.district ||
        typeof s.section !== "string" ||
        !s.section ||
        s.file !== s.code + ".json" ||
        !Number.isInteger(s.records) ||
        s.records < 0 ||
        s.records > 1000000
      )
        throw Error("地籍面積索引欄位錯誤");
      const key = norm(s.county) + "|" + s.code;
      if (seen.has(key)) throw Error("地籍面積索引代碼重複");
      seen.add(key);
      return {
        code: s.code,
        county: norm(s.county),
        district: norm(s.district),
        section: norm(s.section),
        file: s.file,
        records: s.records,
      };
    });
  }
  function section(input, entry) {
    if (
      input?.schemaVersion !== 1 ||
      input.unit !== "㎡" ||
      input.code !== entry.code ||
      norm(input.county) !== entry.county ||
      norm(input.district) !== entry.district ||
      norm(input.section) !== entry.section ||
      !Array.isArray(input.parcels) ||
      input.parcels.length !== entry.records
    )
      throw Error("地段面積檔與索引不一致");
    const seen = new Set();
    return input.parcels.map((p) => {
      if (
        !p ||
        typeof p.lot !== "string" ||
        !C.lot(p.lot) ||
        C.lot(p.lot) !== p.lot ||
        !(
          p.area === null ||
          (typeof p.area === "string" && area(p.area) !== null)
        ) ||
        !Array.isArray(p.issues) ||
        p.issues.some((s) => !["invalid-area", "conflicting-area"].includes(s))
      )
        throw Error("地號面積紀錄錯誤");
      if (seen.has(p.lot)) throw Error("地段檔有重複地號");
      seen.add(p.lot);
      return {
        county: entry.county,
        district: entry.district,
        section: entry.section,
        sectionCode: entry.code,
        lot: p.lot,
        area: p.area === null ? null : area(p.area),
        issues: [...p.issues],
        source: entry.file,
      };
    });
  }
  function requests(tasks, entries, sectionCatalog) {
    const needed = new Map(),
      perTask = [];
    for (const t of tasks) {
      const parcels = t.parcels.map((p) => {
        const county = norm(p.county || "屏東縣"),
          district = norm(p.district),
          name = norm(p.section),
          code = C.parcelCode(t, p, sectionCatalog),
          lot = C.lot(p.lot);
        if (!district || !name || !lot)
          return { parcel: p, status: "地籍欄位不完整", candidates: [] };
        const candidates = entries.filter(
          (e) =>
            e.county === county &&
            e.district === district &&
            e.section === name &&
            (!code || e.code === code),
        );
        candidates.forEach((e) => needed.set(e.county + "|" + e.code, e));
        return {
          parcel: p,
          county,
          district,
          section: name,
          code,
          lot,
          candidates,
          status: candidates.length
            ? ""
            : code &&
                entries.some((e) => e.county === county && e.code === code)
              ? "段代碼與鄉鎮／地段不一致，請核對"
              : "線上尚無此地段資料",
        };
      });
      perTask.push({ taskId: t.id, signature: signature(t), parcels });
    }
    return { needed: [...needed.values()], tasks: perTask };
  }
  function analyze(requested, records, failures = {}) {
    const index = new Map();
    for (const r of records) {
      const key = r.county + "|" + r.sectionCode + "|" + r.lot;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(r);
    }
    return requested.tasks.map((t) => {
      const seen = new Set(),
        parcels = [];
      for (const q of t.parcels) {
        let status = q.status || "",
          record = null;
        if (!status) {
          const loaded = q.candidates.filter(
            (e) => !own(failures, e.county + "|" + e.code),
          );
          const hits = loaded
            .flatMap(
              (e) => index.get(e.county + "|" + e.code + "|" + q.lot) || [],
            )
            .filter((r) => r.district === q.district);
          const codes = new Set(hits.map((r) => r.sectionCode));
          if (loaded.length !== q.candidates.length)
            status = "地段檔讀取失敗，請重試";
          else if (!hits.length) status = "XML 無此地號";
          else if (codes.size !== 1)
            status = "同名地段有多個可能配對，請補段代碼";
          else if (
            hits.some((r) => r.issues.length || r.area === null) ||
            new Set(hits.map((r) => r.area)).size !== 1
          )
            status = "登記面積缺漏或衝突";
          else record = hits[0];
        }
        const key = record
          ? record.county + "|" + record.sectionCode + "|" + record.lot
          : C.key(q.parcel);
        if (seen.has(key)) continue;
        seen.add(key);
        parcels.push({
          parcel: {
            county: q.parcel.county || "屏東縣",
            district: q.parcel.district,
            section: q.parcel.section,
            lot: q.parcel.lot,
          },
          status: status || "已配對",
          ...(record
            ? {
                area: record.area,
                sectionCode: record.sectionCode,
                source: record.source,
              }
            : {}),
        });
      }
      const matched = parcels.filter((p) => p.status === "已配對"),
        complete = parcels.length > 0 && matched.length === parcels.length;
      return {
        taskId: t.taskId,
        signature: t.signature,
        parcels,
        complete,
        matched: matched.length,
        total: complete ? sum(matched.map((p) => p.area)) : null,
        subtotal: sum(matched.map((p) => p.area)),
      };
    });
  }
  function stale(t) {
    return (
      !!t.landArea &&
      (t.landArea.stale === true || t.landArea.signature !== signature(t))
    );
  }
  function cleanTask(t) {
    return stale(t)
      ? { ...t, area: "", landArea: { ...t.landArea, stale: true } }
      : t;
  }
  function apply(tasks, results, ids, checkedAt) {
    if (!ids.length || new Set(ids).size !== ids.length)
      throw Error("請勾選完整配對的任務");
    const updates = new Map();
    for (const id of ids) {
      const result = results.find((r) => r.taskId === id),
        task = tasks.find((t) => t.id === id);
      if (
        !task ||
        !result?.complete ||
        result.total === null ||
        result.signature !== signature(task)
      )
        throw Error("任務地號已變更或配對不完整，請重新配對");
      if (sum(result.parcels.map((p) => p.area)) !== result.total)
        throw Error("面積結果不一致");
      updates.set(id, {
        ...task,
        originalArea: task.originalArea ?? task.area ?? "",
        area: result.total,
        landArea: {
          schemaVersion: 1,
          unit: "㎡",
          total: result.total,
          signature: result.signature,
          checkedAt,
          stale: false,
          parcels: result.parcels.map((p) => ({
            ...p.parcel,
            sectionCode: p.sectionCode,
            area: p.area,
            source: p.source,
          })),
        },
      });
    }
    return tasks.map((t) => updates.get(t.id) || t);
  }
  const api = {
    area,
    sum,
    signature,
    catalog,
    section,
    requests,
    analyze,
    stale,
    cleanTask,
    apply,
  };
  root.LandAreaCore = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
