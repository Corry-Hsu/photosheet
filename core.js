/* Shared deterministic parsers and geographic operations; no network access. */
(function (root) {
  "use strict";
  const C = {};
  const norm = (v) =>
    String(v ?? "")
      .normalize("NFKC")
      .replace(/\r\n?/g, "\n")
      .trim()
      .replace(/巿/g, "市")
      .replace(/臺/g, "台");
  C.norm = norm;
  C.checkArchive = (bytes, maxBytes, maxFiles) => {
    let size = 0,
      count = 0;
    root.fflate.unzipSync(bytes, {
      filter: (f) => {
        size += f.originalSize;
        count++;
        if (size > maxBytes || count > maxFiles)
          throw Error("壓縮檔展開後超過容量或檔案數限制");
        return false;
      },
    });
    return { size, count };
  };
  C.lot = (v) => {
    let s = norm(v)
      .replace(/地號|號/g, "")
      .replace(/之|－|–/g, "-");
    if (!/^\d+(?:-\d+)?$/.test(s)) return "";
    return s
      .split("-")
      .map((x) => String(Number(x)))
      .join("-")
      .replace(/-0$/, "");
  };
  C.sectionCode = (value) =>
    /^\d{1,4}$/.test(norm(value)) ? norm(value).padStart(4, "0") : "";
  C.codeKey = (county, code, lot) =>
    "@code|" +
    norm(county || "屏東縣") +
    "|" +
    C.sectionCode(code) +
    "|" +
    C.lot(lot);
  C.sectionKey = (p) =>
    [norm(p.county || "屏東縣"), norm(p.district), norm(p.section)].join("|");
  C.parseSectionRows = (rows) => {
    const out = [],
      seen = new Set();
    for (const row of rows.slice(1)) {
      if (!row) continue;
      const code = C.sectionCode(row[2]),
        district = norm(row[5]),
        base = norm(row[0]),
        sub = norm(row[1]);
      if (!code || !district || !base) continue;
      const section =
        (base.endsWith("段") ? base : base + "段") +
        (sub ? (sub.endsWith("小段") ? sub : sub + "小段") : "");
      const item = { county: "屏東縣", district, section, code },
        key = C.sectionKey(item) + "|" + code;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  };
  C.sectionCatalog = (tasks, existing, reference = []) => {
    const result = new Map(
      [...(existing || [])].map(([key, codes]) => [key, new Set(codes)]),
    );
    result.authoritative = new Map(
      [...(existing || [])].map(([key, codes]) => [key, new Set(codes)]),
    );
    const ref = new Map();
    for (const p of Array.isArray(reference) ? reference : []) {
      if (!p) continue;
      const code = C.sectionCode(p.code);
      if (!code || !p.district || !p.section) continue;
      const key = C.sectionKey(p);
      if (!ref.has(key)) ref.set(key, new Set());
      ref.get(key).add(code);
    }
    for (const [key, codes] of ref)
      if (!result.authoritative.has(key)) result.authoritative.set(key, codes);
    const add = (p, code) => {
      code = C.sectionCode(code);
      if (!code || !norm(p.section) || !norm(p.district)) return;
      const key = C.sectionKey(p);
      if (!result.has(key)) result.set(key, new Set());
      result.get(key).add(code);
    };
    for (const task of tasks) {
      const main = (task.parcels || []).find(
        (p) =>
          norm(p.section) === norm(task.section) &&
          norm(p.district) === norm(task.district),
      );
      add(
        {
          county: main?.county || "屏東縣",
          district: task.district,
          section: task.section,
        },
        task.sectionCode,
      );
      for (const p of task.parcels || [])
        if (p.sectionCode) add(p, p.sectionCode);
    }
    return result;
  };
  C.parcelCode = (task, parcel, catalog) => {
    if (C.sectionCode(parcel.sectionCode))
      return C.sectionCode(parcel.sectionCode);
    const official = catalog?.authoritative?.get(C.sectionKey(parcel));
    if (official) return official.size === 1 ? [...official][0] : "";
    if (
      norm(parcel.section) === norm(task.section) &&
      norm(parcel.district) === norm(task.district)
    )
      return C.sectionCode(task.sectionCode);
    const codes = catalog?.get(C.sectionKey(parcel));
    return codes?.size === 1 ? [...codes][0] : "";
  };
  C.adminVisible = (task, now) => {
    const today = typeof now === "string" ? now : C.today(now);
    return (
      !!C.date(task.resultDate) &&
      task.resultDate >= today.slice(0, 7) + "-01" &&
      task.resultDate <= today.slice(0, 4) + "-12-31"
    );
  };
  C.xmlLot = (v) =>
    /^\d{8}$/.test(norm(v))
      ? C.lot(Number(String(v).slice(0, 4)) + "-" + Number(String(v).slice(4)))
      : "";
  C.key = (p) =>
    [
      norm(p.county || "屏東縣"),
      norm(p.district),
      norm(p.section),
      C.lot(p.lot),
    ].join("|");
  C.date = (v) => {
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "number") {
      if (v <= 0 || !Number.isFinite(v)) return "";
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
      return d.toISOString().slice(0, 10);
    }
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    let a = String(v)
      .trim()
      .match(/^(\d{2,4})[年/.-](\d{1,2})[月/.-](\d{1,2})日?(?:[ T].*)?$/);
    if (!a) return "";
    let y = +a[1];
    if (y < 1911) y += 1911;
    const m = +a[2],
      d = +a[3],
      t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y &&
      t.getUTCMonth() === m - 1 &&
      t.getUTCDate() === d
      ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      : "";
  };
  C.today = (now = new Date()) =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  C.locked = (t, now) =>
    !!t.resultDate && t.resultDate < C.today(now).slice(0, 7) + "-01";
  C.monthPolicy = (t, now) => {
    if (C.locked(t, now)) {
      if (!t.assignee) t.assignmentClosed = true;
      else t.assignmentLockedTo = t.assignmentLockedTo || t.assignee;
    }
    return t;
  };
  C.assign = (t, person, now) => {
    t = C.monthPolicy({ ...t }, now);
    if (t.completed && person && person !== t.assignee)
      throw Error("已完成任務不可再分派，請先取消完成");
    if (
      person &&
      person !== t.assignee &&
      (t.assignmentClosed || t.assignmentLockedTo || C.locked(t, now))
    )
      throw Error("上個月以前案件不可新增指派或改派");
    if (!person && (t.assignmentLockedTo || C.locked(t, now)))
      t.assignmentClosed = true;
    return { ...t, assignee: person };
  };
  C.selfDistricts = Object.freeze([
    "屏東市",
    "九如鄉",
    "里港鄉",
    "高樹鄉",
    "鹽埔鄉",
    "長治鄉",
    "麟洛鄉",
    "內埔鄉",
    "三地門鄉",
    "霧台鄉",
    "瑪家鄉",
  ]);
  C.autoAssign = (task, now) => {
    if (
      task.assignee === "p3" ||
      task.completed ||
      !C.adminVisible(task, now) ||
      task.assignmentClosed ||
      task.assignmentLockedTo
    )
      return task;
    const districts = [
      ...new Set(
        (task.parcels || []).map((p) => norm(p.district)).filter(Boolean),
      ),
    ];
    const district =
      norm(task.district) || (districts.length === 1 ? districts[0] : "");
    if (!district) return task;
    const person = C.selfDistricts.includes(district.replace(/^屏東縣/, ""))
      ? "p1"
      : "p2";
    return task.assignee === person ? task : C.assign(task, person, now);
  };
  C.vendorTypes = Object.freeze({ v1: "雜草垃圾", v2: "砍樹", v3: "圍籬" });
  C.dispatchTasks = (tasks, recipient, now) => {
    const type = C.vendorTypes[recipient];
    return tasks.filter(
      (t) =>
        !t.completed &&
        (type
          ? t.type === type &&
            (C.adminVisible(t, now) || !!t.assignee) &&
            !(t.assignmentClosed && !t.assignee)
          : t.assignee === recipient),
    );
  };
  C.createManualTask = (input, id, now = new Date()) => {
    if (!id || !id.startsWith("manual:")) throw Error("手動任務識別碼錯誤");
    if (!["雜草垃圾", "砍樹", "圍籬"].includes(input.type))
      throw Error("請選擇工作類型");
    const date = C.date(input.resultDate);
    if (!date || date !== input.resultDate)
      throw Error("請填寫有效的成果指定日期");
    const due = norm(input.due);
    if (
      due &&
      (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(due) ||
        C.date(due.slice(0, 10)) !== due.slice(0, 10))
    )
      throw Error("完成期限格式錯誤");
    const parcels = [],
      seen = new Set();
    for (const row of input.parcels || []) {
      const district = norm(row.district),
        section = norm(row.section),
        code = norm(row.sectionCode);
      if (!district || !section || !norm(row.lots))
        throw Error("每列地籍都需填寫鄉鎮、地段及地號");
      if (code && !C.sectionCode(code)) throw Error("段代碼需為1至4位數字");
      for (const p of C.parseParcels([row.lots], district, section)) {
        if (code && p.district === district && p.section === section)
          p.sectionCode = C.sectionCode(code);
        const key = C.key(p);
        if (seen.has(key)) throw Error("同一任務不可重複相同地號");
        seen.add(key);
        parcels.push(p);
      }
    }
    if (!parcels.length) throw Error("請至少新增一筆地籍資料");
    const items = (input.items || [])
      .filter((i) => Object.values(i).some((v) => norm(v)))
      .map((i) => {
        if (!norm(i.name)) throw Error("工作項目需填寫名稱");
        if (
          norm(i.quantity) &&
          (!Number.isFinite(Number(i.quantity)) || Number(i.quantity) < 0)
        )
          throw Error("工作數量需為非負數字");
        return {
          name: norm(i.name),
          quantity: norm(i.quantity),
          unit: norm(i.unit),
          note: norm(i.note),
        };
      });
    let navigation = null;
    if (norm(input.latitude) || norm(input.longitude)) {
      if (!norm(input.latitude) || !norm(input.longitude))
        throw Error("入口緯度與經度需一起填寫");
      const point = [Number(input.longitude), Number(input.latitude)];
      C.navURL(point);
      navigation = { point, source: "manual", confirmed: true };
    }
    let task = {
      id,
      source: "manual",
      createdAt: now.toISOString(),
      row: 0,
      serial: norm(input.serial) || "手動-" + id.slice(-8),
      caseNo: norm(input.caseNo),
      type: input.type,
      district: parcels[0].district,
      section: parcels[0].section,
      sectionCode: parcels[0].sectionCode || "",
      parcels,
      notice: date,
      resultDate: date,
      due,
      vendor: norm(input.vendor),
      sourcePerson: norm(input.sourcePerson),
      area: norm(input.area),
      items,
      assignee: "",
      navigation,
      completed: false,
    };
    task = C.monthPolicy(task, now);
    const person = input.assignee ?? "auto";
    if (person === "auto") return C.autoAssign(task, now);
    if (!["", "p1", "p2", "p3"].includes(person))
      throw Error("負責人無效；廠商依標籤分組，不是人員負責人");
    return C.assign(task, person, now);
  };
  C.markComplete = (task, done, now = new Date()) => ({
    ...task,
    completed: done,
    completedAt: done ? task.completedAt || now.toISOString() : "",
  });
  C.roc = (d) => {
    let a = d.split("-");
    return `${+a[0] - 1911}年${+a[1]}月${+a[2]}日`;
  };
  C.esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  C.parseParcels = (values, district, section) => {
    let out = [];
    for (const raw of values) {
      for (let t of norm(raw)
        .replace(/之|－/g, "-")
        .replace(/號/g, "")
        .split(/[、,，;；\s]+/)) {
        if (!t) continue;
        let p;
        if (/^\d+(?:-\d+)?$/.test(t))
          p = { county: "屏東縣", district, section, lot: C.lot(t) };
        else {
          const m = t.match(
            /^(?:([\u4e00-\u9fff]{1,6}[鄉鎮市區]))?([\u4e00-\u9fff\d]+段)(\d+(?:-\d+)?)$/,
          );
          if (!m) throw Error("無法辨識地號：" + t);
          p = {
            county: "屏東縣",
            district: m[1] || district,
            section: m[2],
            lot: C.lot(m[3]),
          };
        }
        if (!out.some((x) => C.key(x) === C.key(p))) out.push(p);
      }
    }
    return out;
  };
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++)
      h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0).toString(16);
  }
  C.parseExcelRows = (sheets) => {
    let tasks = [],
      warnings = [],
      seen = new Set();
    for (const name of ["砍樹", "圍籬", "雜草垃圾"]) {
      let rows = sheets[name] || [];
      if (rows.length > 30000) throw Error("單一工作表超過30,000列");
      for (let rno = 1; rno < rows.length; rno++) {
        const r = rows[rno] || [],
          sidx = name === "雜草垃圾" ? 10 : 8,
          section = norm(r[sidx]);
        if (!section) continue;
        let district = norm(r[3]);
        if (district.startsWith("#")) district = "";
        let parcels;
        try {
          parcels = C.parseParcels(
            r.slice(sidx + 1, sidx + 6),
            district,
            section,
          );
        } catch (e) {
          warnings.push(`${name} 第${rno + 1}列：${e.message}；整列未匯入`);
          continue;
        }
        if (!parcels.length) {
          warnings.push(`${name} 第${rno + 1}列：無有效地號`);
          continue;
        }
        let serial = norm(r[0]),
          id = name + ":" + (serial || "未編號:" + hash(JSON.stringify(r)));
        if (!serial) {
          let b = id,
            n = 1;
          while (seen.has(id)) id = b + ":" + ++n;
          warnings.push(`${name} 第${rno + 1}列：缺序號，已保留`);
        }
        if (seen.has(id)) {
          warnings.push(`${name} 第${rno + 1}列：序號重複`);
          continue;
        }
        seen.add(id);
        const ni = name === "雜草垃圾" ? 7 : 5,
          notice = C.date(r[ni]),
          due = C.date(r[ni + 1]);
        if (!notice) warnings.push(`${name} 第${rno + 1}列：通知日期缺漏`);
        if (!district) warnings.push(`${name} 第${rno + 1}列：鄉鎮待補`);
        let items = [];
        for (let i = 0; i < 3; i++) {
          if (name === "雜草垃圾") {
            if (norm(r[16 + i * 2]))
              items.push({
                name: norm(r[16 + i * 2]),
                quantity: norm(r[17 + i * 2]),
                unit: "㎡",
                note: norm(r[22 + i]),
              });
          } else if (name === "圍籬") {
            if (norm(r[14 + i * 2]) || norm(r[15 + i * 2]))
              items.push({
                name: norm(r[14 + i * 2]) || "圍籬",
                quantity: norm(r[15 + i * 2]),
                unit: norm(r[20 + i]) || "公尺",
                note: norm(r[26 + i]),
              });
          } else if (norm(r[15 + i * 2]))
            items.push({
              name: norm(r[23 + i]) || "樹木處理",
              quantity: norm(r[15 + i * 2]),
              unit: norm(r[20 + i]) || "株",
              note: norm(r[26 + i]),
            });
        }
        tasks.push({
          id,
          type: name,
          row: rno + 1,
          serial: serial || "未編號",
          caseNo: [r[1], r[2]]
            .filter((x) => x !== null && x !== undefined && x !== "")
            .join("-"),
          district,
          section,
          sectionCode: norm(r[4]),
          parcels,
          notice,
          resultDate: notice,
          due: due ? due + "T17:00" : "",
          vendor: norm(r[name === "雜草垃圾" ? 6 : 30]),
          sourcePerson: norm(r[name === "雜草垃圾" ? 5 : 29]),
          area: norm(r[name === "雜草垃圾" ? 9 : 7]),
          items,
          assignee: "",
          navigation: null,
        });
      }
    }
    return { tasks, warnings };
  };
  function xml(text, handlers) {
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error("不支援DTD或外部實體");
    let p = root.sax.parser(true, { trim: true, xmlns: false });
    let stack = [];
    p.onopentag = (n) => {
      stack.push(n.name.split(":").pop());
      handlers.open?.(stack, n);
    };
    p.ontext = (t) => handlers.text?.(stack, t);
    p.oncdata = (t) => handlers.text?.(stack, t);
    p.onclosetag = () => {
      handlers.close?.(stack);
      stack.pop();
    };
    p.onerror = (e) => {
      throw Error("XML格式錯誤：" + e.message.slice(0, 120));
    };
    p.write(text).close();
  }
  C.parseLandXML = (text, source) => {
    let records = [],
      row = null,
      field = "",
      value = "";
    xml(text, {
      open: (s, n) => {
        if (s.at(-1) === "土地標示部") row = { ownership: s.at(-2), source };
        if (row && s.at(-2) === "土地標示部") {
          field = s.at(-1);
          value = "";
        }
      },
      text: (s, t) => {
        if (row && s.at(-2) === "土地標示部") value += t;
      },
      close: (s) => {
        if (row && s.at(-2) === "土地標示部") {
          const map = {
            縣市: "county",
            鄉鎮市區: "district",
            段代碼: "code",
            段小段: "section",
            地號: "rawLot",
          };
          if (map[field]) row[map[field]] = norm(value);
        }
        if (s.at(-1) === "土地標示部" && row) {
          row.lot = C.xmlLot(row.rawLot);
          row.code = C.sectionCode(row.code);
          if (row.code && row.lot && row.section && row.district)
            records.push(row);
          row = null;
        }
      },
    });
    return records;
  };
  C.parseKML = (text, source) => {
    let result = [],
      warnings = [],
      pm = null,
      poly = null,
      ring = null,
      field = "",
      value = "",
      coord = "";
    xml(text, {
      open: (s, n) => {
        const tag = s.at(-1);
        if (tag === "NetworkLink")
          warnings.push(source + "：略過外部NetworkLink");
        if (tag === "Placemark")
          pm = { source, code: "", lot: "", label: "", polygons: [] };
        if (!pm) return;
        if (tag === "SimpleData") {
          field = n.attributes.name;
          value = "";
        }
        if (tag === "Data") {
          field = n.attributes.name;
          value = "";
        }
        if (tag === "Polygon") poly = [];
        if (tag === "LinearRing") {
          ring = [];
          coord = "";
        }
      },
      text: (s, t) => {
        if (!pm) return;
        if (s.at(-1) === "SimpleData" || s.at(-1) === "value") value += t;
        if (s.at(-1) === "name" && s.at(-2) === "Placemark") pm.label += t;
        if (s.at(-1) === "coordinates" && ring) coord += t;
      },
      close: (s) => {
        if (!pm) return;
        const tag = s.at(-1);
        if (tag === "SimpleData" || tag === "Data") {
          if (field === "SECTNO") pm.code = norm(value);
          if (field === "PARCELNO") pm.lot = C.lot(value);
        }
        if (tag === "LinearRing" && ring) {
          let pts = coord
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((x) => x.split(",").slice(0, 2).map(Number));
          if (
            pts.length < 4 ||
            pts.some(
              (p) =>
                p.length !== 2 ||
                !p.every(Number.isFinite) ||
                Math.abs(p[0]) > 180 ||
                Math.abs(p[1]) > 90,
            ) ||
            pts[0].some((x, i) => x !== pts.at(-1)[i])
          ) {
            warnings.push(source + "：無效或未封閉邊界");
            pm.invalid = true;
          } else poly?.push(pts);
          ring = null;
        }
        if (tag === "Polygon" && poly) {
          if (poly.length) pm.polygons.push(poly);
          poly = null;
        }
        if (tag === "Placemark") {
          const label = norm(pm.label).match(
            /^(\d{1,4})\s*\/\s*(\d{1,8}(?:[-之]\d{1,8})?)\s*(?:地號|號)?$/,
          );
          pm.code = C.sectionCode(pm.code);
          if (label) {
            const code = C.sectionCode(label[1]),
              lot = C.lot(label[2]);
            if ((pm.code && pm.code !== code) || (pm.lot && pm.lot !== lot)) {
              warnings.push(source + "：KML標示與欄位代碼／地號不一致，未匯入");
              pm.invalid = true;
            } else {
              pm.code = code;
              pm.lot = lot;
            }
          }
          if (pm.code && pm.lot && pm.polygons.length && !pm.invalid) {
            pm.bbox = C.bbox(pm.polygons);
            pm.id =
              pm.code + ":" + pm.lot + ":" + hash(JSON.stringify(pm.polygons));
            result.push(pm);
          } else warnings.push(source + "：略過缺識別欄位、無面或無效地物");
          pm = null;
        }
      },
    });
    return { features: result, warnings };
  };
  C.bbox = (polys) => {
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const poly of polys)
      for (const ring of poly)
        for (const [x, y] of ring) {
          b[0] = Math.min(b[0], x);
          b[1] = Math.min(b[1], y);
          b[2] = Math.max(b[2], x);
          b[3] = Math.max(b[3], y);
        }
    return b;
  };
  C.insideRing = (p, r) => {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      let a = r[i],
        b = r[j];
      if (
        a[1] > p[1] !== b[1] > p[1] &&
        p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        inside = !inside;
    }
    return inside;
  };
  C.inside = (p, polys) =>
    polys.some(
      (poly) =>
        C.insideRing(p, poly[0]) &&
        !poly.slice(1).some((r) => C.insideRing(p, r)),
    );
  function area(r) {
    let a = 0;
    for (let i = 1; i < r.length; i++)
      a += r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1];
    return Math.abs(a / 2);
  }
  C.point = (polys) => {
    let sorted = [...polys].sort(
      (a, b) =>
        area(b[0]) -
        b.slice(1).reduce((s, r) => s + area(r), 0) -
        (area(a[0]) - a.slice(1).reduce((s, r) => s + area(r), 0)),
    );
    for (const poly of sorted) {
      const ys = [...new Set(poly.flat().map((p) => p[1]))].sort(
        (a, b) => a - b,
      );
      let best = null,
        width = 0;
      let mids = [];
      for (let i = 1; i < ys.length; i++) mids.push((ys[i - 1] + ys[i]) / 2);
      if (mids.length > 128)
        mids = Array.from(
          { length: 128 },
          (_, i) => mids[Math.floor((i * (mids.length - 1)) / 127)],
        );
      for (const y of mids) {
        let xs = [];
        for (const r of poly)
          for (let i = 1; i < r.length; i++) {
            const a = r[i - 1],
              b = r[i];
            if (a[1] > y !== b[1] > y)
              xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
          }
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2)
          if (xs[i + 1] - xs[i] > width) {
            const p = [(xs[i + 1] + xs[i]) / 2, y];
            if (C.inside(p, [poly])) {
              best = p;
              width = xs[i + 1] - xs[i];
            }
          }
      }
      if (best) return best;
    }
    return null;
  };
  C.match = (parcel, index) => {
    const code = C.sectionCode(parcel.sectionCode);
    if (code)
      return (
        index.byCode?.get(C.codeKey(parcel.county, code, parcel.lot)) || []
      );
    if (!norm(parcel.district) || !norm(parcel.section)) return [];
    return index.get(C.key(parcel)) || [];
  };
  C.navURL = (p) => {
    if (
      !Array.isArray(p) ||
      p.length !== 2 ||
      !p.every(Number.isFinite) ||
      Math.abs(p[0]) > 180 ||
      Math.abs(p[1]) > 90
    )
      throw Error("無效導航座標");
    return (
      "https://www.google.com/maps/dir/?api=1&destination=" +
      encodeURIComponent(p[1] + "," + p[0]) +
      "&travelmode=driving"
    );
  };
  C.makeIndex = (features) => {
    const m = new Map();
    m.byCode = new Map();
    m.sectionCodes = new Map();
    const add = (map, key, f) => {
      if (!map.has(key)) map.set(key, []);
      if (!map.get(key).some((x) => x.id === f.id)) map.get(key).push(f);
    };
    for (const f of features) {
      const code = C.sectionCode(f.code),
        counties = new Set();
      for (const land of f.lands || []) {
        add(m, C.key(land), f);
        counties.add(norm(land.county || "屏東縣"));
        if (code && norm(land.district) && norm(land.section)) {
          const key = C.sectionKey(land);
          if (!m.sectionCodes.has(key)) m.sectionCodes.set(key, new Set());
          m.sectionCodes.get(key).add(code);
        }
      }
      if (code) {
        if (!counties.size) counties.add(norm(f.county || "屏東縣"));
        for (const county of counties)
          add(m.byCode, C.codeKey(county, code, f.lot), f);
      }
    }
    return m;
  };
  root.PSCore = C;
  if (typeof module !== "undefined") module.exports = C;
})(typeof self !== "undefined" ? self : globalThis);
