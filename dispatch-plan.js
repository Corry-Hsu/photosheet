/* Pure dispatch-package planning. No network, storage, or GitHub writes. */
(function (root) {
  "use strict";
  const C =
    root.PSCore ||
    (typeof require === "function" ? require("./core.js") : null);
  const recipients = [
    { id: "p1", name: "人員一", file: "worker-1.json" },
    { id: "p2", name: "人員二", file: "worker-2.json" },
    { id: "p3", name: "人員三", file: "worker-3.json" },
    { id: "v1", name: "雜草垃圾廠商", file: "vendor-1.json", type: "雜草垃圾" },
    { id: "v2", name: "砍樹廠商", file: "vendor-2.json", type: "砍樹" },
    { id: "v3", name: "圍籬廠商", file: "vendor-3.json", type: "圍籬" },
  ];
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function stable(value) {
    if (value === undefined) return "<未提供>";
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (value && typeof value === "object")
      return (
        "{" +
        Object.keys(value)
          .filter((k) => value[k] !== undefined)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + stable(value[k]))
          .join(",") +
        "}"
      );
    return JSON.stringify(value);
  }
  const equal = (a, b) => stable(a) === stable(b);
  function safe(value, depth = 0) {
    if (depth > 40) throw Error("資料層級過深");
    if (typeof value === "number" && !Number.isFinite(value))
      throw Error("資料含無效數字");
    if (!value || typeof value !== "object") return;
    for (const k of Object.keys(value)) {
      if (["__proto__", "prototype", "constructor"].includes(k))
        throw Error("資料含不允許的欄位");
      safe(value[k], depth + 1);
    }
  }
  function validate(pack) {
    safe(pack);
    const recipient = recipients.find((r) => r.id === pack?.person?.id);
    if (
      !recipient ||
      pack.schemaVersion !== 1 ||
      typeof pack.person.name !== "string" ||
      !pack.person.name.trim() ||
      typeof pack.batch !== "string" ||
      !pack.settings ||
      Array.isArray(pack.settings) ||
      typeof pack.settings !== "object" ||
      !Array.isArray(pack.tasks) ||
      !Array.isArray(pack.features)
    )
      throw Error("派工JSON格式不正確");
    if (
      (recipient.type && pack.vendorType !== recipient.type) ||
      (!recipient.type && pack.vendorType)
    )
      throw Error("廠商標籤與入口不一致");
    if (pack.tasks.length > 30000 || pack.features.length > 150000)
      throw Error("檔案資料筆數過多");
    for (const t of pack.tasks) {
      if (
        !t ||
        typeof t.id !== "string" ||
        !t.id ||
        t.id.length > 200 ||
        !["雜草垃圾", "砍樹", "圍籬"].includes(t.type) ||
        !Array.isArray(t.parcels) ||
        !t.parcels.length ||
        !Array.isArray(t.items) ||
        typeof t.resultDate !== "string" ||
        (t.resultDate && C.date(t.resultDate) !== t.resultDate) ||
        typeof t.due !== "string" ||
        !["", "p1", "p2", "p3"].includes(t.assignee) ||
        (t.completed !== undefined && typeof t.completed !== "boolean") ||
        (t.reopenedForDispatch !== undefined &&
          typeof t.reopenedForDispatch !== "boolean")
      )
        throw Error("任務格式不正確：" + (t?.id || "缺少ID"));
      if (
        recipient.type ? t.type !== recipient.type : t.assignee !== recipient.id
      )
        throw Error("任務分派對象或廠商標籤不一致：" + t.id);
      for (const p of t.parcels)
        if (
          !p ||
          typeof p.district !== "string" ||
          typeof p.section !== "string" ||
          !p.section ||
          typeof p.lot !== "string" ||
          !C.lot(p.lot)
        )
          throw Error("地段地號格式不正確：" + t.id);
      if (t.navigation) C.navURL(t.navigation.point);
    }
    for (const f of pack.features) {
      if (
        !f ||
        typeof f.id !== "string" ||
        !f.id ||
        !Array.isArray(f.lands) ||
        f.lands.some(
          (l) =>
            !l ||
            typeof l.district !== "string" ||
            typeof l.section !== "string" ||
            typeof l.lot !== "string" ||
            !C.lot(l.lot),
        ) ||
        !Array.isArray(f.polygons) ||
        !f.polygons.length ||
        f.polygons.some(
          (p) =>
            !Array.isArray(p) ||
            !p.length ||
            p.some(
              (r) =>
                !Array.isArray(r) ||
                r.length < 4 ||
                r.some(
                  (pt) =>
                    !Array.isArray(pt) ||
                    pt.length !== 2 ||
                    !pt.every(Number.isFinite) ||
                    Math.abs(pt[0]) > 180 ||
                    Math.abs(pt[1]) > 90,
                ),
            ),
        )
      )
        throw Error("地籍圖形格式不正確：" + (f?.id || "缺少ID"));
    }
    return recipient;
  }
  function unique(rows, label) {
    const map = new Map(),
      result = [];
    for (const row of rows) {
      if (map.has(row.id)) {
        if (!equal(map.get(row.id), row))
          throw Error(label + "同ID有不同內容，請先整理：" + row.id);
        continue;
      }
      map.set(row.id, row);
      result.push(row);
    }
    return result;
  }
  function normalize(input) {
    const p = copy(input);
    validate(p);
    p.tasks = unique(p.tasks, "任務");
    p.features = unique(p.features, "地籍");
    return p;
  }
  function taskKey(t) {
    if (!String(t.caseNo || "").trim()) return null;
    return stable([
      t.type,
      C.norm(t.caseNo),
      t.resultDate,
      t.parcels
        .map((p) => [
          C.norm(p.county || "屏東縣"),
          C.norm(p.district),
          C.norm(p.section),
          C.lot(p.lot),
        ])
        .sort((a, b) => stable(a).localeCompare(stable(b))),
    ]);
  }
  function featureKey(f) {
    const code = C.sectionCode(f.code),
      lot = C.lot(f.lot),
      counties = [
        ...new Set((f.lands || []).map((l) => C.norm(l.county || "屏東縣"))),
      ].sort();
    return code && lot
      ? stable([
          counties.length ? counties : [C.norm(f.county || "屏東縣")],
          code,
          lot,
        ])
      : null;
  }
  const key = (kind, id, field) => JSON.stringify([kind, id, field]);
  function create(base) {
    return {
      base: normalize(base),
      incoming: null,
      approvals: {},
      removals: [],
      extra: [],
      extraFeatures: [],
    };
  }
  function references(tasks, features) {
    const index = C.makeIndex(features),
      catalog = C.sectionCatalog(tasks, index.sectionCodes, []),
      used = new Set(),
      missing = [];
    for (const t of tasks)
      for (const p of t.parcels) {
        const hits = C.match(
          { ...p, sectionCode: C.parcelCode(t, p, catalog) },
          index,
        );
        hits.forEach((f) => used.add(f.id));
        if (hits.length !== 1)
          missing.push({
            taskId: t.id,
            parcel: p,
            status: hits.length ? "有多筆可能配對" : "缺少KML",
          });
      }
    return { used, missing };
  }
  function plan(entry) {
    safe(entry);
    const base = entry.base;
    validate(base);
    const result = copy(base),
      conflicts = [],
      aliases = [],
      duplicates = { tasks: 0, features: 0 },
      taskMap = new Map(result.tasks.map((t) => [t.id, t])),
      featureMap = new Map(result.features.map((f) => [f.id, f])),
      taskKeys = new Map(
        result.tasks.filter((t) => taskKey(t)).map((t) => [taskKey(t), t.id]),
      ),
      featureKeys = new Map(
        result.features
          .filter((f) => featureKey(f))
          .map((f) => [featureKey(f), f.id]),
      ),
      newFeatureIds = new Set();
    const approvals = entry.approvals || {};
    function offer(kind, id, field, oldValue, newValue, apply, source) {
      if (equal(oldValue, newValue)) return;
      const k = key(kind, id, field),
        approval = approvals[k],
        applied =
          !!approval &&
          approval.before === stable(oldValue) &&
          approval.after === stable(newValue);
      conflicts.push({
        key: k,
        kind,
        id,
        field,
        oldValue,
        newValue,
        applied,
        stale: !!approval && !applied,
        source,
      });
      if (applied) apply(copy(newValue));
    }
    function mergeRows(rows, kind) {
      const map = kind === "task" ? taskMap : featureMap,
        logical = kind === "task" ? taskKeys : featureKeys,
        fingerprint = kind === "task" ? taskKey : featureKey,
        list = kind === "task" ? result.tasks : result.features;
      for (const row of rows) {
        const logicalId = fingerprint(row) && logical.get(fingerprint(row)),
          id = map.has(row.id) ? row.id : logicalId;
        if (!id) {
          const added = copy(row);
          list.push(added);
          map.set(added.id, added);
          if (fingerprint(added)) logical.set(fingerprint(added), added.id);
          if (kind === "feature") {
            added.bbox = C.bbox(added.polygons);
            newFeatureIds.add(added.id);
          }
          continue;
        }
        duplicates[kind === "task" ? "tasks" : "features"]++;
        const existing = map.get(id);
        if (id !== row.id)
          aliases.push({ kind, incomingId: row.id, existingId: id });
        for (const field of Object.keys(row)) {
          if (field === "id" || (kind === "feature" && field === "bbox"))
            continue;
          // Sync overrides are offered once, below, rather than against an already edited value.
          if (
            (entry.extra || []).some(
              (e) => e.kind === kind && e.id === id && e.field === field,
            )
          )
            continue;
          offer(
            kind,
            id,
            field,
            existing[field],
            row[field],
            (v) => {
              existing[field] = v;
              if (kind === "feature" && field === "polygons")
                existing.bbox = C.bbox(v);
            },
            "匯入檔",
          );
        }
      }
    }
    if (entry.incoming) {
      const input = normalize(entry.incoming);
      if (input.person.id !== base.person.id) throw Error("合併的入口不同");
      mergeRows(input.tasks, "task");
      mergeRows(input.features, "feature");
      const first =
        base.batch === "尚未發布" &&
        !base.tasks.length &&
        !base.features.length;
      if (first) {
        result.batch = input.batch;
        result.generatedAt = input.generatedAt;
        for (const [k, v] of Object.entries(input.settings))
          if (!(k in result.settings)) result.settings[k] = copy(v);
      }
      offer(
        "meta",
        base.person.id,
        "name",
        base.person.name,
        input.person.name,
        (v) => (result.person.name = v),
        "匯入檔",
      );
      if (!first)
        for (const [field, value] of Object.entries(input.settings))
          offer(
            "settings",
            base.person.id,
            field,
            base.settings[field],
            value,
            (v) => (result.settings[field] = v),
            "匯入檔",
          );
    }
    mergeRows(unique(entry.extraFeatures || [], "同步地籍"), "feature");
    for (const e of entry.extra || []) {
      const map = e.kind === "task" ? taskMap : featureMap,
        object = map.get(e.id);
      if (!object || e.field === "id") continue;
      offer(
        e.kind,
        e.id,
        e.field,
        object[e.field],
        e.value,
        (v) => {
          object[e.field] = v;
          if (e.kind === "feature" && e.field === "polygons")
            object.bbox = C.bbox(v);
        },
        "同步修正",
      );
    }
    const allTasks = result.tasks.slice(),
      allFeatures = result.features.slice(),
      removed = [],
      suspended = [];
    for (const r of entry.removals || []) {
      const t = taskMap.get(r.id);
      if (!t) continue;
      if (r.before !== stable(t)) {
        suspended.push(r.id);
        continue;
      }
      removed.push(t);
    }
    const removedIds = new Set(removed.map((t) => t.id));
    result.tasks = result.tasks.filter((t) => !removedIds.has(t.id));
    const keptRefs = references(result.tasks, allFeatures),
      droppedTasks = removed.concat(
        base.tasks.filter((t) => {
          const next = taskMap.get(t.id);
          return next && !equal(next.parcels, t.parcels);
        }),
      ),
      droppedRefs = references(droppedTasks, allFeatures).used;
    result.features = result.features.filter((f) => {
      if (keptRefs.used.has(f.id)) return true;
      if (newFeatureIds.has(f.id)) return false;
      if (removed.length && !result.tasks.length) return false;
      return !droppedRefs.has(f.id);
    });
    validate(result);
    if (
      new Set(result.tasks.map((t) => t.id)).size !== result.tasks.length ||
      new Set(result.features.map((f) => f.id)).size !== result.features.length
    )
      throw Error("合併後出現重複ID");
    function diff(before, after) {
      const bm = new Map(before.map((r) => [r.id, r])),
        am = new Map(after.map((r) => [r.id, r]));
      return {
        added: after.filter((r) => !bm.has(r.id)),
        removed: before.filter((r) => !am.has(r.id)),
        updated: after.filter((r) => bm.has(r.id) && !equal(bm.get(r.id), r)),
        before: bm,
      };
    }
    const tasks = diff(base.tasks, result.tasks),
      features = diff(base.features, result.features);
    const metaChanged = !equal(
      { ...base, tasks: [], features: [] },
      { ...result, tasks: [], features: [] },
    );
    return {
      result,
      conflicts,
      aliases,
      duplicates,
      tasks,
      features,
      metaChanged,
      changed: !equal(base, result),
      missing: references(result.tasks, result.features).missing,
      suspended,
      skippedUnusedGeometry: newFeatureIds.size - features.added.length,
    };
  }
  function approve(entry, conflict, on = true) {
    if (on)
      entry.approvals[conflict.key] = {
        before: stable(conflict.oldValue),
        after: stable(conflict.newValue),
      };
    else delete entry.approvals[conflict.key];
  }
  function remove(entry, task) {
    entry.removals = (entry.removals || [])
      .filter((r) => r.id !== task.id)
      .concat([{ id: task.id, before: stable(task) }]);
  }
  const api = {
    recipients,
    copy,
    stable,
    equal,
    validate,
    normalize,
    create,
    taskKey,
    featureKey,
    key,
    references,
    plan,
    approve,
    remove,
  };
  root.DispatchPlan = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
