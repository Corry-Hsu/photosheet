(function () {
  "use strict";
  const C = PSCore,
    E = C.esc,
    $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)],
    worker = document.body.dataset.worker || "",
    PAGE = worker ? 50 : 25;
  let state = {
      id: "manager",
      schemaVersion: 1,
      people: [
        { id: "p1", name: "我自己" },
        { id: "p2", name: "人員二" },
        { id: "p3", name: "人員三" },
      ],
      tasks: [],
      sectionReference: [],
      settings: { ...Documents.settings },
    },
    features = [],
    index = new Map(),
    sectionCatalog = new Map(),
    featureMap = new Map(),
    spatial = new RBush(),
    selected = new Set(),
    focused = "",
    page = 1,
    map,
    landLayer,
    contextLayer,
    pin,
    contextOn = false,
    pinMode = false,
    importWorker = null,
    geoCounts = null,
    urls = [],
    publishURLs = [];
  const tell = (s, error = false) => {
    const m = $("#message");
    m.textContent = s;
    m.classList.toggle("error", error);
    m.hidden = false;
    clearTimeout(tell.timer);
    tell.timer = setTimeout(() => (m.hidden = true), 7000);
  };
  window.PSApp = {
    get state() {
      return state;
    },
    get features() {
      return features;
    },
    get index() {
      return index;
    },
    get map() {
      return map;
    },
    get selected() {
      return selected;
    },
  };
  function bind(sel, fn) {
    $(sel).onclick = async (e) => {
      try {
        await fn(e);
      } catch (err) {
        tell(err.message || String(err), true);
        console.error(err);
      }
    };
  }
  function download(blob, name) {
    const u = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  }
  window.saveDownload = download;
  async function persist() {
    if (!worker) await Store.put("state", structuredClone(state));
  }
  function rebuild() {
    index = C.makeIndex(features);
    sectionCatalog = C.sectionCatalog(
      state.tasks,
      index.sectionCodes,
      state.sectionReference,
    );
    featureMap = new Map(features.map((f) => [f.id, f]));
    spatial.clear();
    spatial.load(
      features.map((f) => ({
        minX: f.bbox[0],
        minY: f.bbox[1],
        maxX: f.bbox[2],
        maxY: f.bbox[3],
        id: f.id,
      })),
    );
    $("#geo-summary").textContent =
      `地籍索引：${features.length.toLocaleString()} 筆土地${geoCounts ? "；" + geoCounts.kml + " 個 KML／" + geoCounts.xml + " 個 XML" : ""}`;
    const t = listSource().find((t) => t.id === focused);
    if (t) draw(t, false);
    else {
      focused = "";
      if (landLayer) map.removeLayer(landLayer);
      if (pin) map.removeLayer(pin);
      pin = null;
    }
  }
  function candidates(t, p) {
    let xs = C.match(
      { ...p, sectionCode: C.parcelCode(t, p, sectionCatalog) },
      index,
    );
    const chosen = t.parcelChoices?.[C.key(p)];
    if (chosen) {
      let f = xs.find((x) => x.id === chosen);
      if (f) return [f];
    }
    return xs;
  }
  function matching(t) {
    let groups = t.parcels.map((p) => candidates(t, p)),
      ok = groups.filter((a) => a.length === 1).length,
      ambiguous = groups.some((a) => a.length > 1),
      status = ambiguous
        ? "ambiguous"
        : ok === groups.length
          ? "all"
          : ok
            ? "partial"
            : "none";
    return {
      groups,
      ok,
      status,
      features: [
        ...new Map(
          groups
            .filter((a) => a.length === 1)
            .flat()
            .map((f) => [f.id, f]),
        ).values(),
      ],
    };
  }
  function nav(t) {
    if (t.navigation?.point) return t.navigation;
    const f = matching(t).features[0];
    if (!f) return null;
    const p = C.point(f.polygons);
    return p ? { point: p, source: "auto", confirmed: false } : null;
  }
  const location = (t) =>
    [...new Set(t.parcels.map((p) => p.district + p.section))].join("；");
  function listSource() {
    return worker ? state.tasks : state.tasks.filter((t) => C.adminVisible(t));
  }
  function filtered() {
    let q = C.norm($("#search").value).toLowerCase(),
      ty = $("#type-filter").value,
      person = $("#person-filter").value,
      g = $("#geo-filter").value,
      from = $("#date-from").value,
      to = $("#date-to").value,
      completedFilter = $("#complete-filter")?.value || "";
    return listSource()
      .filter(
        (t) =>
          (!completedFilter ||
            (completedFilter === "done" ? !!t.completed : !t.completed)) &&
          (!ty || t.type === ty) &&
          (!from || t.resultDate >= from) &&
          (!to || (!!t.resultDate && t.resultDate <= to)) &&
          (!person ||
            (person === "none" ? !t.assignee : t.assignee === person)) &&
          (!g || matching(t).status === g) &&
          (!q ||
            C.norm(
              [
                t.caseNo,
                t.serial,
                t.type,
                ...t.parcels.map((p) => p.district + p.section + " " + p.lot),
              ].join(" "),
            )
              .toLowerCase()
              .includes(q)),
      )
      .sort(
        (a, b) =>
          (a.due || "9999").localeCompare(b.due || "9999") ||
          a.id.localeCompare(b.id),
      );
  }
  function render() {
    const visible = listSource();
    if (!worker) {
      const ids = new Set(visible.map((t) => t.id));
      for (const id of selected) if (!ids.has(id)) selected.delete(id);
      if (focused && !ids.has(focused)) {
        focused = "";
        if (landLayer) map.removeLayer(landLayer);
        if (pin) map.removeLayer(pin);
        pin = null;
      }
      if ($("#task-date-scope")) {
        $("#task-date-scope").textContent =
          `清單只顯示 ${C.today().slice(0, 7)}-01 至 ${C.today().slice(0, 4)}-12-31 的成果指定日期；${state.tasks.length - visible.length} 筆其他年度、舊月份或未填日期資料未列入。`;
      }
    }
    sectionCatalog = C.sectionCatalog(
      state.tasks,
      index.sectionCodes,
      state.sectionReference,
    );
    const list = filtered(),
      max = Math.max(1, Math.ceil(list.length / PAGE));
    page = Math.min(page, max);
    $("#count").textContent = `${list.length} 筆`;
    $("#page").textContent = `${page} / ${max}`;
    $("#prev").disabled = page === 1;
    $("#next").disabled = page === max;
    $("#summary").innerHTML =
      `<span><strong>${visible.length}</strong> 任務</span>${worker ? "" : `<span><strong>${visible.filter((t) => t.assignee).length}</strong> 已分派</span><span><strong>${visible.filter((t) => t.completed).length}</strong> 已完成</span>`}`;
    const rows = list.slice((page - 1) * PAGE, page * PAGE);
    $("#tasks").innerHTML = rows.length
      ? rows
          .map((t) => {
            const person = state.people.find((p) => p.id === t.assignee);
            if (worker)
              return `<article class="task worker-task ${t.id === focused ? "selected" : ""}" data-id="${E(t.id)}"><input type="checkbox" aria-label="選取 ${E(t.serial)}" data-check="${E(t.id)}" ${selected.has(t.id) ? "checked" : ""}><div class="task-content"><div class="task-topline"><h3>${E(location(t))}</h3><span class="badge">${E(t.type)}</span></div><p class="task-lots">${E(t.parcels.map((p) => p.lot).join("、"))}</p><p class="task-deadline">期限 ${E(t.due ? t.due.slice(5).replace("T", " ") : "未設定")} · 成果 ${E(t.resultDate ? t.resultDate.slice(5) : "待補")}</p></div><button data-detail="${E(t.id)}" aria-label="查看 ${E(location(t))} ${E(t.parcels.map((p) => p.lot).join("、"))}">›</button></article>`;
            return `<article class="task ${t.id === focused ? "selected" : ""}" data-id="${E(t.id)}"><input type="checkbox" aria-label="選取 ${E(t.serial)}" data-check="${E(t.id)}" ${selected.has(t.id) ? "checked" : ""}><div><h3>${E(location(t))}</h3><p>${E(t.parcels.map((p) => p.lot).join("、"))}</p><span class="badge">${E(t.type)}</span> ${t.completed ? '<span class="badge task-completed">已完成</span>' : ""}<p class="muted">${worker ? "" : E(person?.name || "未指派") + " · "}成果日期 ${E(t.resultDate || "待補")}<br>期限 ${E(t.due.replace("T", " ") || "未設定")}</p></div><div class="task-row-actions"><button data-detail="${E(t.id)}">查看任務</button><button data-complete="${E(t.id)}">${t.completed ? "取消完成" : "標記完成"}</button></div></article>`;
          })
          .join("")
      : '<p class="muted">沒有符合條件的任務。</p>';
    $$("[data-check]").forEach(
      (el) =>
        (el.onchange = () => {
          el.checked
            ? selected.add(el.dataset.check)
            : selected.delete(el.dataset.check);
          updateBatch();
          if (worker) focus(el.dataset.check, false);
        }),
    );
    $$(".task").forEach(
      (el) =>
        (el.onclick = (e) => {
          if (e.target.closest("button,input")) return;
          focus(el.dataset.id);
          if (worker) scrollFieldMap();
        }),
    );
    if (worker)
      $$(".task-content").forEach((el) => {
        el.tabIndex = 0;
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", "在下方地圖查看此任務");
        el.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            el.click();
          }
        };
      });
    $$("[data-complete]").forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            const t = state.tasks.find((t) => t.id === b.dataset.complete);
            await markCompleted([t], !t.completed);
          } catch (e) {
            tell(e.message, true);
          } finally {
            b.disabled = false;
          }
        }),
    );
    $$("[data-detail]").forEach(
      (el) => (el.onclick = () => detail(el.dataset.detail)),
    );
    updateBatch();
  }
  async function markCompleted(tasks, done) {
    const ids = new Set(tasks.map((t) => t.id));
    if (!ids.size) throw Error("請先選取任務");
    const before = state.tasks;
    state.tasks = state.tasks.map((t) =>
      ids.has(t.id) ? C.markComplete(t, done) : t,
    );
    try {
      await persist();
    } catch (e) {
      state.tasks = before;
      throw e;
    }
    render();
    tell(done ? "已標記完成；現場清單請重新發布派工檔後更新。" : "已取消完成");
  }
  function updateBatch() {
    $("#batch").hidden = !selected.size;
    $("#selected-count").textContent = `已選 ${selected.size} 筆`;
  }
  function setupFilters() {
    const v = $("#person-filter").value;
    $("#person-filter").innerHTML =
      '<option value="">全部負責人</option><option value="none">未指派</option>' +
      state.people
        .map((p) => `<option value="${p.id}">${E(p.name)}</option>`)
        .join("");
    $("#person-filter").value = v;
  }
  function open(title, body) {
    $("#dialog-title").textContent = title;
    $("#dialog-body").innerHTML = body;
    if (!$("#dialog").open) $("#dialog").showModal();
  }
  function focus(id, fit = true) {
    const t = listSource().find((t) => t.id === id);
    if (!t) return;
    focused = id;
    render();
    draw(t, fit);
    if (worker && $("#field-map-title")) {
      $("#field-map-title").textContent =
        location(t) + " " + t.parcels.map((p) => p.lot).join("、");
      $("#worker-open-task").disabled = false;
      const route = nav(t),
        a = $("#worker-navigate");
      a.setAttribute("aria-disabled", String(!route));
      if (route) a.href = C.navURL(route.point);
      else a.removeAttribute("href");
    }
  }
  function scrollFieldMap() {
    map.invalidateSize();
    $(".map-panel").scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }
  function polygonLayer(fs, style, onClick) {
    return L.geoJSON(
      fs.map((f) => ({
        type: "Feature",
        properties: { id: f.id },
        geometry: { type: "MultiPolygon", coordinates: f.polygons },
      })),
      {
        style,
        renderer: map.options.renderer,
        onEachFeature: (f, layer) => {
          const land = featureMap.get(f.properties.id),
            text =
              land?.lands
                ?.map((l) => l.district + l.section + " " + l.lot)
                .join("；") || f.properties.id;
          layer.bindTooltip(E(text));
          layer.on("click", async (e) => {
            L.DomEvent.stopPropagation(e);
            if (pinMode && !worker) {
              const task = state.tasks.find((t) => t.id === focused);
              if (task) {
                try {
                  await setNavigation(task, [e.latlng.lng, e.latlng.lat]);
                  pinMode = false;
                  tell("入口已保存");
                } catch (err) {
                  tell(err.message, true);
                }
              }
            } else onClick(f.properties.id);
          });
        },
      },
    );
  }
  function taskForFeature(id) {
    return listSource().find((t) =>
      matching(t).features.some((f) => f.id === id),
    );
  }
  function draw(t, fit) {
    if (landLayer) map.removeLayer(landLayer);
    if (pin) map.removeLayer(pin);
    pin = null;
    const fs = matching(t).features;
    landLayer = polygonLayer(
      fs,
      { color: "#176950", weight: 3, fillColor: "#4eaa70", fillOpacity: 0.3 },
      () => focus(t.id, false),
    ).addTo(map);
    const n = nav(t);
    if (n) {
      pin = L.marker([n.point[1], n.point[0]], {
        draggable: !worker,
        icon: L.divIcon({
          className: "",
          html: '<div class="pin"></div>',
          iconSize: [27, 27],
          iconAnchor: [13, 26],
        }),
      }).addTo(map);
      pin.bindTooltip(n.confirmed ? "已核對入口" : "地籍參考位置");
      pin.on("dragend", async () => {
        const p = pin.getLatLng();
        try {
          await setNavigation(t, [p.lng, p.lat]);
          tell("入口已保存");
        } catch (err) {
          draw(t, false);
          tell(err.message, true);
        }
      });
    }
    $("#map-status").textContent = worker ? "" : location(t);
    if (fit) {
      map.stop();
      if (fs.length)
        map.fitBounds(landLayer.getBounds(), {
          padding: [25, 25],
          maxZoom: 18,
          animate: false,
        });
      else if (n) map.setView([n.point[1], n.point[0]], 17, { animate: false });
    }
    setTimeout(() => map.invalidateSize(), 20);
  }
  async function setNavigation(t, p) {
    C.navURL(p);
    const previous = t.navigation;
    t.navigation = { point: p, source: "manual", confirmed: true };
    try {
      await persist();
    } catch (e) {
      t.navigation = previous;
      throw e;
    }
    draw(t, false);
  }
  let mapTimer;
  function context() {
    if (!contextOn) return;
    if (contextLayer) map.removeLayer(contextLayer);
    const b = map.getBounds(),
      hits = spatial.search({
        minX: b.getWest(),
        minY: b.getSouth(),
        maxX: b.getEast(),
        maxY: b.getNorth(),
      });
    if (hits.length > 500) {
      $("#map-status").textContent =
        `附近有 ${hits.length} 筆地籍，請放大至500筆以下查看`;
      return;
    }
    contextLayer = polygonLayer(
      hits.map((h) => featureMap.get(h.id)),
      { color: "#849b89", weight: 1, fillOpacity: 0.06 },
      (id) => {
        let t = taskForFeature(id);
        if (t) focus(t.id, false);
        else tell("此地籍未在目前任務中");
      },
    ).addTo(map);
  }
  async function detail(id) {
    focus(id);
    const t = state.tasks.find((t) => t.id === id),
      m = matching(t),
      n = nav(t);
    open(
      "任務詳情",
      `<h2>${E(location(t))}</h2><p>${E(t.type)} · 原表第${t.row}列 · ${E(t.serial)}</p><p>成果指定日期：${E(t.resultDate || "待補")}<br>完成期限：${E(t.due.replace("T", " ") || "未設定")}</p><h3>全部地號</h3>${worker ? "" : '<button id="edit-parcels">修正地段地號</button>'}${t.parcels
        .map((p, i) => {
          const xs = m.groups[i];
          return `<div class="parcel-row"><strong>${E(p.district + p.section + " " + p.lot)}</strong>${xs.length === 1 ? `<button data-parcel-nav="${i}">導航此地號參考位置</button>` : ""}</div>`;
        })
        .join(
          "",
        )}<h3>工作項目</h3><ul>${t.items.map((i) => `<li>${E(i.name)}　${E(i.quantity)} ${E(i.unit)} ${E(i.note)}</li>`).join("")}</ul><p>施作廠商：${E(t.vendor)}　${E(t.sourcePerson)}</p><h3>導航入口</h3><p>${n ? (n.confirmed ? "已核對入口" : "地籍參考位置") + "：" + n.point[1].toFixed(6) + ", " + n.point[0].toFixed(6) : "尚無導航位置，可由管理者在地圖上設定"}</p>${n ? `<a class="button" href="${E(C.navURL(n.point))}" target="_blank" rel="noopener">導航前往</a>` : ""}${!worker ? `<div class="nav-fields"><input id="nav-lat" type="number" step="any" placeholder="緯度" aria-label="入口緯度" value="${n?.point[1] ?? ""}"><input id="nav-lng" type="number" step="any" placeholder="經度" aria-label="入口經度" value="${n?.point[0] ?? ""}"><button id="save-nav">保存已核對入口</button><button id="map-pin">改在地圖設定</button></div><div class="form-grid"><label>任務鄉鎮（僅補空值）<input id="fix-district" placeholder="例如：南州鄉"></label><button id="save-district">補齊鄉鎮</button></div>` : ""}<div class="toolbar"><button id="detail-board">輸出白板</button>${worker ? "" : `<button id="detail-edit">分派／日期</button><button id="detail-complete">${t.completed ? "取消已完成" : "標記已完成"}</button>`}<button id="detail-camera">現場拍照</button></div><section id="local-photos"></section>`,
    );
    $$("[data-parcel-nav]").forEach(
      (el) =>
        (el.onclick = () => {
          let p = C.point(m.groups[+el.dataset.parcelNav][0].polygons);
          if (p) window.open(C.navURL(p), "_blank", "noopener");
        }),
    );
    if (!worker) {
      bind("#edit-parcels", () => {
        open(
          "修正原案地籍欄位",
          `<p>任務仍是一整筆，不拆分地號。請依原案資料核對後修改；原始地號會留存供追溯。</p><div id="parcel-edit">${t.parcels.map((p, i) => `<div class="form-grid" data-parcel-edit="${i}"><label>鄉鎮<input data-field="district" value="${E(p.district)}"></label><label>地段<input data-field="section" value="${E(p.section)}"></label><label>地號<input data-field="lot" value="${E(p.lot)}"></label></div>`).join("")}</div><button id="save-parcels" class="primary">保存修改</button>`,
        );
        bind("#save-parcels", async () => {
          const ps = $$("[data-parcel-edit]").map((el) => {
            const value = (k) =>
              C.norm(el.querySelector('[data-field="' + k + '"]').value);
            return {
              county: "屏東縣",
              district: value("district"),
              section: value("section"),
              lot: C.lot(value("lot")),
            };
          });
          if (ps.some((p) => !p.district || !p.section || !p.lot))
            throw Error("請填寫完整且有效的地籍欄位");
          if (new Set(ps.map((p) => C.key(p))).size !== ps.length)
            throw Error("同一任務不可重複相同地號");
          const old = structuredClone(t);
          t.originalParcels ??= structuredClone(t.parcels);
          t.parcels = ps;
          t.parcelChoices = {};
          try {
            await persist();
          } catch (e) {
            Object.assign(t, old);
            throw e;
          }
          await detail(id);
        });
      });
      bind("#save-nav", async () => {
        if (!$("#nav-lat").value || !$("#nav-lng").value)
          throw Error("請填寫經緯度");
        await setNavigation(t, [
          Number($("#nav-lng").value),
          Number($("#nav-lat").value),
        ]);
        await detail(id);
      });
      bind("#map-pin", () => {
        $("#dialog").close();
        pinMode = true;
        document.body.dataset.tab = "map";
        map.invalidateSize();
        tell("點地圖設定此任務入口");
      });
      bind("#save-district", async () => {
        const v = C.norm($("#fix-district").value);
        if (!v) throw Error("請填鄉鎮");
        for (const p of t.parcels) if (!p.district) p.district = v;
        if (!t.district) t.district = v;
        await persist();
        detail(id);
      });
      bind("#detail-edit", () => assignDialog([t]));
      bind("#detail-complete", async () => {
        await markCompleted([t], !t.completed);
        await detail(id);
      });
    }
    bind("#detail-board", () => documentDialog([t], "board"));
    bind("#detail-camera", () =>
      FieldCamera.open(t, worker || "manager", () => detail(id)),
    );
    await FieldCamera.gallery(t, worker || "manager", $("#local-photos"));
  }
  function assignDialog(tasks) {
    open(
      "批次分派與日期",
      `<p>選取 ${tasks.length} 筆任務。空白日期維持原設定；上個月以前案件不可新增指派或改派。</p><div class="form-grid"><label>負責人<select id="assign-person"><option value="keep">維持原設定</option><option value="">解除指派</option>${state.people.map((p) => `<option value="${p.id}">${E(p.name)}</option>`).join("")}</select></label><label>完成註記<select id="assign-complete"><option value="keep">維持原設定</option><option value="yes">標記已完成</option><option value="no">取消完成</option></select></label><label>成果指定日期<input type="date" id="assign-date"></label><label>完成期限（臺灣時間）<input type="datetime-local" id="assign-due"></label></div><button id="commit-assign" class="primary">儲存</button>`,
    );
    bind("#commit-assign", async () => {
      const person = $("#assign-person").value,
        date = $("#assign-date").value,
        due = $("#assign-due").value,
        completion = $("#assign-complete").value;
      if (date && !C.date(date)) throw Error("無效日期");
      let changes = tasks.map((t) => {
        let initial = completion === "no" ? C.markComplete(t, false) : t;
        let next =
          person === "keep"
            ? C.monthPolicy({ ...initial })
            : C.assign(initial, person);
        if (completion === "yes") next = C.markComplete(next, true);
        if (date) next.resultDate = date;
        if (due) next.due = due;
        return next;
      });
      let old = state.tasks;
      const ids = new Map(changes.map((t) => [t.id, t]));
      state.tasks = state.tasks.map((t) => ids.get(t.id) || t);
      try {
        await persist();
      } catch (e) {
        state.tasks = old;
        throw e;
      }
      $("#dialog").close();
      render();
      tell("已儲存分派與日期");
    });
  }
  function documentDialog(tasks, kind) {
    if (!tasks.length) throw Error("請選取任務");
    open(
      kind === "board" ? "輸出拍攝白板" : "輸出工作單",
      `<p>選取 ${tasks.length} 筆，每筆一份，保留全部地號與整案數量。</p>${
        !worker
          ? `<div class="form-grid">${Object.entries({
              guide: "領勘廠商",
              contact: "領勘人員",
              agency: "機關",
              project: "工程名稱",
              tender: "招標案號",
              phone: "電話",
              fax: "傳真",
              contract_deadline: "限定完成履約時間",
              fence_terms: "圍籬契約條款",
            })
              .filter(([k]) =>
                kind === "board" ? ["guide", "contact"].includes(k) : true,
              )
              .map(
                ([k, l]) =>
                  `<label>${l}<input data-doc-setting="${k}" value="${E(state.settings[k])}"></label>`,
              )
              .join("")}</div>`
          : ""
      }<div class="toolbar"><button id="doc-print" class="primary">${kind === "board" ? "產生 PDF／圖片" : "列印／另存 PDF"}</button><button id="doc-xlsx">下載 Excel</button></div><section id="doc-result" aria-live="polite"></section>`,
    );
    const settings = async () => {
      const next = { ...state.settings };
      $$("[data-doc-setting]").forEach(
        (el) => (next[el.dataset.docSetting] = el.value),
      );
      state.settings = next;
      await persist();
      return next;
    };
    bind("#doc-print", async () => {
      if (kind === "board") {
        const button = $("#doc-print"),
          result = $("#doc-result");
        button.disabled = true;
        try {
          const settingsValue = await settings();
          result.textContent = "正在產生白板…";
          const outputs = await Whiteboards.generate(
            tasks,
            { ...Documents.settings, ...settingsValue },
            (n, total) => {
              result.textContent = `正在產生白板 ${n} / ${total}…`;
            },
          );
          const links = [];
          const link = (blob) => {
            const u = URL.createObjectURL(blob);
            links.push(u);
            return u;
          };
          const pdf = link(outputs.pdf);
          result.innerHTML = `<div class="toolbar"><a class="button primary doc-pdf-download" href="${pdf}" download="拍攝白板.pdf">下載 PDF</a><a class="button" href="${pdf}" target="_blank" rel="noopener">開啟 PDF</a></div><p class="muted">白板預覽如下；可直接下載 PDF 或圖片。手機可從檔案預覽選擇儲存／分享。</p>${outputs.images
            .map((im, i) => {
              const u = link(im.blob);
              return `<figure class="board-preview"><img loading="lazy" decoding="async" src="${u}" alt="第 ${i + 1} 張白板，含完整日期、地段及地號"><figcaption><a class="button doc-image-download" href="${u}" download="${E(im.name)}">下載第 ${i + 1} 張圖片</a></figcaption></figure>`;
            })
            .join("")}`;
          if (outputs.images.length > 1) {
            const zip = {};
            for (const im of outputs.images)
              zip[im.name] = new Uint8Array(await im.blob.arrayBuffer());
            const u = link(
              new Blob([fflate.zipSync(zip, { level: 0 })], {
                type: "application/zip",
              }),
            );
            const a = document.createElement("a");
            a.href = u;
            a.download = "白板圖片.zip";
            a.className = "button";
            a.textContent = "全部圖片 ZIP";
            result.querySelector(".toolbar").append(a);
          }
          // Keep PDF links alive after closing the dialog: iOS may open the viewer lazily.
          setTimeout(
            () => links.forEach((u) => URL.revokeObjectURL(u)),
            30 * 60 * 1000,
          );
        } catch (e) {
          result.textContent = "白板產生失敗：" + e.message;
          throw e;
        } finally {
          button.disabled = false;
        }
        return;
      }
      const w = window.open("about:blank", "_blank");
      if (!w) throw Error("請允許開啟文件視窗");
      try {
        await Documents.show(tasks, kind, await settings(), "print", w);
      } catch (e) {
        w.close();
        throw e;
      }
    });
    bind("#doc-xlsx", async () => {
      const s = await settings();
      download(
        await Documents.show(tasks, kind, s, "xlsx"),
        (kind === "board" ? "白板" : "工作單") + ".xlsx",
      );
    });
  }
  function validateTask(t) {
    if (
      !t ||
      typeof t.id !== "string" ||
      !["砍樹", "圍籬", "雜草垃圾"].includes(t.type) ||
      !Array.isArray(t.parcels) ||
      !t.parcels.length ||
      !t.parcels.every(
        (p) =>
          p &&
          typeof p.section === "string" &&
          typeof p.district === "string" &&
          !!C.lot(p.lot),
      ) ||
      !Array.isArray(t.items) ||
      typeof t.resultDate !== "string" ||
      (t.resultDate && C.date(t.resultDate) !== t.resultDate) ||
      typeof t.due !== "string" ||
      (t.completed !== undefined && typeof t.completed !== "boolean") ||
      !["", "p1", "p2", "p3"].includes(t.assignee)
    )
      throw Error("任務資料格式錯誤");
    if (t.navigation) C.navURL(t.navigation.point);
  }
  function validateFeatures(fs) {
    if (!Array.isArray(fs)) throw Error("地籍格式錯誤");
    for (const f of fs) {
      if (
        typeof f.id !== "string" ||
        !Array.isArray(f.lands) ||
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
        throw Error("地籍座標格式錯誤");
      f.bbox = C.bbox(f.polygons);
    }
  }
  async function loadWorker() {
    try {
      const r = await fetch(`data/worker-${worker.slice(1)}.json`, {
        cache: "no-store",
      });
      if (!r.ok) throw Error("HTTP " + r.status);
      const data = await r.json();
      if (data.schemaVersion !== 1) throw Error("不支援此資料版本");
      if (
        data.person?.id !== worker ||
        typeof data.person.name !== "string" ||
        !Array.isArray(data.tasks) ||
        typeof data.batch !== "string" ||
        !data.settings
      )
        throw Error("派工格式錯誤");
      data.tasks.forEach(validateTask);
      if (
        data.tasks.some((t) => t.assignee !== worker) ||
        new Set(data.tasks.map((t) => t.id)).size !== data.tasks.length
      )
        throw Error("派工人員或識別碼不一致");
      validateFeatures(data.features);
      state = {
        ...state,
        tasks: data.tasks,
        people: [data.person],
        settings: { ...Documents.settings, ...data.settings },
      };
      features = data.features;
      selected.clear();
      rebuild();
      setupFilters();
      render();
      $("#title").textContent = data.person.name + "的任務";
      $("#edition").textContent = "固定派工網址 · 無需匯入";
      $("#worker-version").textContent =
        `批次：${data.batch} · 產生時間：${data.generatedAt ? new Date(data.generatedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "尚未發布"}`;
    } catch (e) {
      if (!state.tasks.length)
        $("#tasks").innerHTML =
          '<p class="warning">派工資料尚未載入，請確認網路，並在頁尾重新整理派工資料。</p>';
      $("#worker-version").textContent =
        "更新失敗：" + e.message + "。畫面若有任務，仍為上一批資料。";
      throw e;
    }
  }
  async function importGeo(files) {
    if (!files.length) return;
    if (importWorker) throw Error("正在匯入地籍");
    $("#progress").hidden = false;
    $("#cancel-geo").hidden = false;
    $("#progress").textContent = "背景解析中；先讀XML索引，再合併KML圖幅…";
    importWorker = new Worker("geo-worker.js?v=20261027-3");
    const w = importWorker;
    w.onmessage = async (e) => {
      const d = e.data;
      if (d.error) {
        tell(d.error, true);
        finish();
        return;
      }
      if (d.progress) {
        $("#progress").textContent =
          `已解析 ${d.progress} 檔 · XML ${d.counts.xml}／KML ${d.counts.kml}`;
        return;
      }
      if (d.done) {
        try {
          if (!d.features.length) throw Error("沒有可匯入的地籍範圍");
          let merged = new Map(features.map((f) => [f.id, f]));
          for (const f of d.features) {
            const old = merged.get(f.id);
            if (old) {
              const ps = new Map(
                [...old.polygons, ...f.polygons].map((p) => [
                  JSON.stringify(p),
                  p,
                ]),
              );
              f.polygons = [...ps.values()];
              f.bbox = C.bbox(f.polygons);
              f.sources = [
                ...new Set([...(old.sources || []), ...(f.sources || [])]),
              ];
              f.lands = [
                ...new Map(
                  [...(old.lands || []), ...f.lands].map((l) => [
                    C.key(l) + "|" + l.ownership,
                    l,
                  ]),
                ).values(),
              ];
            }
            merged.set(f.id, f);
          }
          const next = [...merged.values()];
          await Store.saveGeo({
            id: "catalogue",
            features: next,
            counts: d.counts,
          });
          features = next;
          geoCounts = d.counts;
          rebuild();
          render();
          $("#progress").textContent =
            `已儲存 ${features.length.toLocaleString()} 筆地籍，${d.counts.vertices.toLocaleString()} 個邊界點。${d.warnings.length} 項提醒。` +
            (d.warnings.length
              ? "\n" + d.warnings.slice(0, 15).join("\n")
              : "");
          if (d.warnings.length)
            download(
              new Blob([d.warnings.join("\n")], {
                type: "text/plain;charset=utf-8",
              }),
              "地籍匯入提醒.txt",
            );
          tell("地籍索引已建立");
        } catch (err) {
          tell(err.message, true);
        } finally {
          finish();
        }
      }
    };
    w.onerror = (e) => {
      tell("地籍匯入失敗：" + e.message, true);
      finish();
    };
    w.postMessage({ files });
    function finish() {
      w.terminate();
      importWorker = null;
      $("#cancel-geo").hidden = true;
    }
  }
  async function start() {
    map = L.map("map", { preferCanvas: true, renderer: L.canvas() }).setView(
      [22.55, 120.58],
      10,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    })
      .addTo(map)
      .on("tileerror", () => {
        $("#map-status").textContent =
          "底圖暫時無法載入，仍可查看已匯入地籍與導航位置";
      });
    map.on("moveend", () => {
      clearTimeout(mapTimer);
      mapTimer = setTimeout(context, 150);
    });
    map.on("click", async (e) => {
      if (!pinMode || worker) return;
      const t = listSource().find((t) => t.id === focused);
      if (!t) {
        tell("請先選取一筆任務", true);
        return;
      }
      try {
        await setNavigation(t, [e.latlng.lng, e.latlng.lat]);
        pinMode = false;
        tell("已保存入口");
      } catch (err) {
        tell(err.message, true);
      }
    });
    if (worker) {
      if (window.FieldLocation) FieldLocation.attach(map);
      else {
        const status = $("#field-location-status");
        if (status) status.textContent = "定位功能未載入，請重新整理頁面。";
        if ($("#field-locate")) $("#field-locate").disabled = true;
      }
      $("#admin-tools").hidden = true;
      $("#worker-tools").hidden = false;
      $("#batch-assign").hidden = true;
      $("#orders").hidden = true;
      $("#person-filter").hidden = true;
      $("#date-filters").hidden = true;
      $("#pin-mode").hidden = true;
      $("#show-context").hidden = true;
      bind("#worker-map-jump", scrollFieldMap);
      bind("#worker-open-task", () => {
        const t = state.tasks.find((t) => t.id === focused) || filtered()[0];
        if (t) return detail(t.id);
        throw Error("目前沒有任務");
      });
      bind("#worker-navigate", (e) => {
        if (!e.currentTarget.getAttribute("href")) {
          e.preventDefault();
          throw Error("此任務尚無導航位置，請由管理者核對");
        }
      });
      bind("#worker-filter-toggle", () => {
        const open = document.body.classList.toggle("worker-filters-open");
        $("#worker-filter-toggle").setAttribute("aria-expanded", String(open));
      });
      bind("#worker-select-toggle", () => {
        const open = document.body.classList.toggle("worker-selecting");
        $("#worker-select-toggle").setAttribute("aria-pressed", String(open));
        if (!open) {
          selected.clear();
          render();
        }
      });
      try {
        await loadWorker();
      } catch (e) {
        tell(e.message, true);
      }
    } else {
      const saved = await Store.get("state", "manager");
      if (saved) state = saved;
      state.settings = { ...Documents.settings, ...state.settings };
      state.tasks.forEach((t) => C.monthPolicy(t));
      await persist();
      const geo = await Store.getGeo();
      if (geo) {
        features = geo.features;
        geoCounts = geo.counts;
      }
      rebuild();
      setupFilters();
      render();
    }
    bind("#close-dialog", () => $("#dialog").close());
    bind("#select-page", () => {
      for (const t of filtered().slice((page - 1) * PAGE, page * PAGE))
        selected.add(t.id);
      render();
    });
    bind("#clear-select", () => {
      selected.clear();
      render();
    });
    bind("#prev", () => {
      page--;
      render();
    });
    bind("#next", () => {
      page++;
      render();
    });
    for (const s of [
      "#search",
      "#type-filter",
      "#person-filter",
      "#geo-filter",
      "#date-from",
      "#date-to",
      "#complete-filter",
    ])
      $(s)?.addEventListener(s === "#search" ? "input" : "change", () => {
        page = 1;
        render();
      });
    $$("[data-tab]")
      .filter((el) => el.tagName === "BUTTON")
      .forEach(
        (b) =>
          (b.onclick = () => {
            document.body.dataset.tab = b.dataset.tab;
            $$(".mobile-tabs button").forEach((x) =>
              x.classList.toggle("active", x === b),
            );
            setTimeout(() => map.invalidateSize(), 20);
          }),
      );
    bind("#fit-map", () => {
      const t = state.tasks.find((t) => t.id === focused) || filtered()[0];
      if (t) focus(t.id);
    });
    bind("#show-context", () => {
      contextOn = !contextOn;
      $("#show-context").classList.toggle("active", contextOn);
      if (!contextOn && contextLayer) map.removeLayer(contextLayer);
      else context();
    });
    bind("#pin-mode", () => {
      if (!focused) throw Error("請先選取任務");
      pinMode = !pinMode;
      $("#pin-mode").classList.toggle("active", pinMode);
      tell(pinMode ? "點地圖設定已核對入口" : "已取消入口設定");
    });
    const chosen = () => state.tasks.filter((t) => selected.has(t.id));
    bind("#batch-assign", () => assignDialog(chosen()));
    if ($("#batch-complete"))
      bind("#batch-complete", () => markCompleted(chosen(), true));
    bind("#boards", () => documentDialog(chosen(), "board"));
    bind("#orders", () => documentDialog(chosen(), "order"));
    bind("#reload-worker", loadWorker);
    if (worker) return;
    bind("#auto-assign", () => {
      const next = state.tasks.map((t) => C.autoAssign(t));
      const changed = next.filter((t, i) => t !== state.tasks[i]);
      open(
        "依鄉鎮自動分派",
        `<p>${C.selfDistricts.map(E).join("、")} → ${E(state.people[0].name)}（人員一）。其餘鄉鎮 → ${E(state.people[1].name)}（人員二）。</p><p>套用今年本月起的未完成任務，會調整人員一、二的既有分派；人員三、舊月份、已完成及鎖定任務維持原設定。鄉鎮缺漏時保留原設定。</p><p>將更新 ${changed.length} 筆任務。</p><button id="confirm-auto-assign" class="primary">套用自動分派</button>`,
      );
      bind("#confirm-auto-assign", async () => {
        const previous = state.tasks;
        state.tasks = next;
        try {
          await persist();
        } catch (e) {
          state.tasks = previous;
          throw e;
        }
        $("#dialog").close();
        render();
        tell(`已依鄉鎮更新 ${changed.length} 筆任務；發布檔需另行產生與上傳`);
      });
    });
    bind("#import-excel", () => $("#excel-file").click());
    $("#excel-file").onchange = async () => {
      try {
        const file = $("#excel-file").files[0];
        if (!file) return;
        if (file.size > 12 * 1024 * 1024) throw Error("Excel 超過12MB");
        const excelBytes = new Uint8Array(await file.arrayBuffer());
        C.checkArchive(excelBytes, 80 * 1024 * 1024, 4000);
        let result = await readExcel(excelBytes);
        if (!result.tasks.length) throw Error("沒有有效任務");
        open(
          "Excel 匯入預覽",
          `<p>共 ${result.tasks.length} 筆任務。每列一筆；新任務依鄉鎮自動分派。</p><div class="toolbar">${["雜草垃圾", "砍樹", "圍籬"].map((n) => `<label><input type="checkbox" data-import-type="${n}" checked>${n} ${result.tasks.filter((t) => t.type === n).length}</label>`).join("")}</div><label>統一成果日期（選填）<input id="import-date" type="date"></label><div class="preview">${result.tasks.map((t, i) => `<div class="preview-row"><span>${E(t.type)} 第${t.row}列 · ${E(location(t))} ${E(t.parcels.map((p) => p.lot).join("、"))}</span><input type="date" data-import-date="${i}" value="${t.resultDate}" aria-label="第${i + 1}筆成果日期"></div>`).join("")}</div><details><summary>${result.warnings.length} 項資料提醒</summary><pre>${E(result.warnings.join("\n"))}</pre></details><button id="commit-import" class="primary">確認匯入</button>`,
        );
        $("#import-date").onchange = () => {
          if ($("#import-date").value)
            $$("[data-import-date]").forEach(
              (el) => (el.value = $("#import-date").value),
            );
        };
        bind("#commit-import", async () => {
          let types = $$("[data-import-type]:checked").map(
              (el) => el.dataset.importType,
            ),
            ids = new Set(state.tasks.map((t) => t.id));
          $$("[data-import-date]").forEach(
            (el) =>
              (result.tasks[+el.dataset.importDate].resultDate = el.value),
          );
          const add = result.tasks
            .filter((t) => types.includes(t.type) && !ids.has(t.id))
            .map((t) => C.autoAssign(C.monthPolicy(t)));
          if (!types.length) throw Error("請勾選工作類型");
          const old = state.tasks,
            oldReference = state.sectionReference;
          state.sectionReference = [
            ...new Map(
              [
                ...(state.sectionReference || []),
                ...(result.sectionReference || []),
              ].map((p) => [C.sectionKey(p) + "|" + p.code, p]),
            ).values(),
          ];
          state.tasks = [...state.tasks, ...add];
          try {
            await persist();
          } catch (e) {
            state.tasks = old;
            state.sectionReference = oldReference;
            throw e;
          }
          $("#dialog").close();
          render();
          tell(`新增 ${add.length} 筆；重匯的既有任務維持原分派與日期`);
        });
      } catch (e) {
        tell(e.message, true);
      } finally {
        $("#excel-file").value = "";
      }
    };
    bind("#import-geo", () => $("#geo-files").click());
    $("#geo-files").onchange = () => {
      importGeo([...$("#geo-files").files]).catch((e) => tell(e.message, true));
      $("#geo-files").value = "";
    };
    bind("#cancel-geo", () => {
      importWorker?.terminate();
      importWorker = null;
      $("#cancel-geo").hidden = true;
      $("#progress").textContent = "已取消匯入，原索引保持不變";
    });
    bind("#people", () => {
      open(
        "三人設定",
        `<p>姓名可改，固定網址不變。包含你自己最多三人。</p><div class="form-grid">${state.people.map((p, i) => `<label>人員 ${i + 1}<input data-person="${p.id}" value="${E(p.name)}" maxlength="60"><a href="worker-${i + 1}.html" target="_blank" rel="noopener">worker-${i + 1}.html</a></label>`).join("")}</div><button id="save-people" class="primary">保存姓名</button>`,
      );
      bind("#save-people", async () => {
        const people = $$("[data-person]").map((el) => ({
          id: el.dataset.person,
          name: el.value.trim(),
        }));
        if (people.some((p) => !p.name)) throw Error("姓名不可空白");
        state.people = people;
        await persist();
        setupFilters();
        render();
        $("#dialog").close();
      });
    });
    bind("#backup", () =>
      download(
        new Blob(
          [
            JSON.stringify({
              schemaVersion: 1,
              kind: "photosheet-manager-backup",
              state,
              features,
              geoCounts,
            }),
          ],
          { type: "application/json" },
        ),
        "管理備份_勿上傳GitHub_" + C.today() + ".json",
      ),
    );
    bind("#restore", () => $("#restore-file").click());
    $("#restore-file").onchange = async () => {
      try {
        const f = $("#restore-file").files[0];
        if (!f) return;
        if (f.size > 350 * 1024 * 1024) throw Error("備份超過350MB");
        const b = JSON.parse(await f.text());
        if (
          b.schemaVersion !== 1 ||
          b.kind !== "photosheet-manager-backup" ||
          b.state?.id !== "manager" ||
          !Array.isArray(b.state.tasks) ||
          !Array.isArray(b.state.people) ||
          b.state.people.length !== 3 ||
          b.state.people.some(
            (p, i) => p.id !== "p" + (i + 1) || typeof p.name !== "string",
          ) ||
          !b.state.settings ||
          (b.state.sectionReference !== undefined &&
            !Array.isArray(b.state.sectionReference))
        )
          throw Error("備份格式錯誤");
        b.state.tasks.forEach(validateTask);
        if (
          new Set(b.state.tasks.map((t) => t.id)).size !== b.state.tasks.length
        )
          throw Error("任務識別碼重複");
        validateFeatures(b.features);
        open(
          "確認還原",
          `<p>將取代本機的 ${state.tasks.length} 筆任務及地籍索引。照片不受影響。</p><p>備份包含 ${b.state.tasks.length} 筆任務、${b.features.length} 筆地籍。建議先取消並下載目前備份。</p><button id="confirm-restore" class="primary">確認取代本機管理資料</button>`,
        );
        bind("#confirm-restore", async () => {
          await Store.replaceManager(b.state, {
            id: "catalogue",
            features: b.features,
            counts: b.geoCounts,
          });
          state = b.state;
          features = b.features;
          geoCounts = b.geoCounts;
          selected.clear();
          rebuild();
          setupFilters();
          render();
          $("#dialog").close();
          tell("還原完成");
        });
      } catch (e) {
        tell(e.message, true);
      } finally {
        $("#restore-file").value = "";
      }
    };
    bind("#publish", () => {
      state.tasks.forEach((t) => C.monthPolicy(t));
      const assigned = state.tasks.filter((t) => t.assignee && !t.completed);
      open(
        "選擇人員發布",
        `<p>勾選要更新的人員，直接產生各自的 JSON 檔，不壓縮。</p><p>已完成任務不列入；沒有任務仍可產生空清單以清除該人員舊派工。</p><div class="form-grid">${state.people.map((p, i) => `<label><input type="checkbox" data-publish-person="${p.id}" checked>${E(p.name)}（人員${i + 1}）：${assigned.filter((t) => t.assignee === p.id).length} 筆任務</label>`).join("")}</div><p class="warning">內容將公開。請確認成果日期與導航位置。</p><button id="confirm-publish" class="primary">產生所選人員 JSON</button>`,
      );
      bind("#confirm-publish", () => {
        const people = state.people.filter((p) =>
          $$("[data-publish-person]:checked").some(
            (el) => el.dataset.publishPerson === p.id,
          ),
        );
        if (!people.length) throw Error("請至少勾選一位人員");
        const chosenTasks = assigned.filter((t) =>
          people.some((p) => p.id === t.assignee),
        );
        if (chosenTasks.some((t) => !C.date(t.resultDate)))
          throw Error("所選人員的任務有成果日期缺漏，請先補齊");
        const batch = C.today() + "-" + crypto.randomUUID().slice(0, 8),
          generatedAt = new Date().toISOString(),
          files = [];
        for (const p of people) {
          const i = state.people.findIndex((person) => person.id === p.id),
            tasks = assigned
              .filter((t) => t.assignee === p.id)
              .map((t) => ({
                ...t,
                navigation: nav(t),
                parcels: t.parcels.map((p) => ({
                  ...p,
                  sectionCode: C.parcelCode(t, p, sectionCatalog),
                })),
              })),
            fs = [
              ...new Map(
                tasks
                  .flatMap((t) => matching(t).features)
                  .map((f) => [f.id, f]),
              ).values(),
            ].map((f) => ({
              id: f.id,
              code: f.code,
              lot: f.lot,
              lands: f.lands.map((l) => ({
                county: l.county,
                district: l.district,
                section: l.section,
                lot: l.lot,
              })),
              polygons: f.polygons,
              bbox: f.bbox,
            }));
          files.push({
            name: `worker-${i + 1}.json`,
            person: p.name,
            blob: new Blob(
              [
                JSON.stringify(
                  {
                    schemaVersion: 1,
                    batch,
                    generatedAt,
                    person: p,
                    settings: state.settings,
                    tasks,
                    features: fs,
                  },
                  null,
                  2,
                ),
              ],
              { type: "application/json" },
            ),
          });
        }
        publishURLs.forEach((u) => URL.revokeObjectURL(u));
        publishURLs = files.map((f) => URL.createObjectURL(f.blob));
        open(
          "下載發布檔",
          `<p>批次：${E(batch)}</p><p>逐一下載以下 JSON，直接放入 GitHub 專案的 data 資料夾，取代同名檔案。未勾選的人員維持原派工；產生檔案尚未更新網站。</p><div class="form-grid">${files.map((f, i) => `<a class="button dispatch-download" href="${publishURLs[i]}" download="${f.name}">${E(f.person)}：下載 ${f.name}</a>`).join("")}</div>`,
        );
      });
    });
  }
  start().catch((e) => {
    tell("啟動失敗：" + e.message, true);
    console.error(e);
  });
})();
