/* Static publishing workbench: public reads and local downloads only. */
(function () {
  "use strict";
  const P = window.DispatchPlan,
    R = P.recipients,
    DRAFT = "dispatch-tools-draft-v1";
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (x) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[x],
    );
  const fields = {
    parcels: "地段地號",
    navigation: "導航位置",
    completed: "完成狀態",
    resultDate: "成果日期",
    due: "期限",
    items: "工作內容",
    sectionCode: "地段代碼",
    district: "鄉鎮",
    section: "地段",
    polygons: "地籍範圍",
    lands: "地籍名稱",
    reopenedForDispatch: "重新開放派工",
    assignee: "負責人",
    name: "名稱",
  };
  let dialog,
    entries = {},
    selected = new Set(),
    checked = new Set(),
    plans = {},
    failures = {},
    urls = [],
    callback,
    page = 1,
    revision = 0,
    busy = false,
    saveQueue = Promise.resolve();
  const $ = (s) => dialog.querySelector(s);
  const label = (t) =>
    (t.parcels || [])
      .map((p) => `${p.district}${p.section} ${p.lot}`)
      .join("、");
  function show(value, field) {
    if (field === "polygons" && Array.isArray(value))
      return JSON.stringify(
        {
          範圍數: value.length,
          頂點數: value.reduce(
            (n, p) => n + p.reduce((n, r) => n + r.length, 0),
            0,
          ),
          邊界: PSCore.bbox(value),
        },
        null,
        2,
      );
    if (value === undefined) return "（原本未設定）";
    if (value === null) return "未設定";
    if (Array.isArray(value) && value[0]?.lot) return label({ parcels: value });
    return typeof value === "object"
      ? JSON.stringify(value, null, 2)
      : String(value);
  }
  function message(text, error = false) {
    $("#dt-status").textContent = text;
    $("#dt-status").classList.toggle("dt-error", error);
  }
  function invalidate() {
    urls.forEach(URL.revokeObjectURL);
    urls = [];
    $("#dt-downloads").replaceChildren();
  }
  function snapshot() {
    return {
      id: DRAFT,
      version: 1,
      savedAt: new Date().toISOString(),
      entries: P.copy(entries),
      selected: [...selected],
    };
  }
  function save() {
    const value = snapshot();
    saveQueue = saveQueue
      .catch(() => {})
      .then(() => Store.put("state", value))
      .then(() => {
        $("#dt-saved").textContent =
          "草稿已存於本機 · " +
          new Date(value.savedAt).toLocaleTimeString("zh-TW");
      })
      .catch((e) => {
        $("#dt-saved").textContent =
          "本機儲存失敗，請下載整理草稿：" + e.message;
      });
    return saveQueue;
  }
  function recalc() {
    plans = {};
    for (const [id, entry] of Object.entries(entries))
      plans[id] = P.plan(entry);
  }
  function changed(note) {
    revision++;
    invalidate();
    recalc();
    checked.clear();
    page = 1;
    render();
    save();
    if (note) message(note);
  }
  async function read(r) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(
        "https://raw.githubusercontent.com/Corry-Hsu/photosheet/main/data/" +
          r.file +
          "?dispatch=" +
          Date.now(),
        { cache: "no-store", signal: controller.signal },
      );
      if (!response.ok)
        throw Error(r.file + " 讀取失敗（" + response.status + "）");
      const pack = P.normalize(await response.json());
      if (pack.person.id !== r.id) throw Error(r.file + " 的入口ID不一致");
      return pack;
    } catch (e) {
      if (controller.signal.aborted)
        throw Error(r.file + " 讀取逾時，請稍後重試");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async function load(rebase = false) {
    const results = await Promise.allSettled(R.map(read)),
      errors = [];
    for (let i = 0; i < R.length; i++) {
      const id = R[i].id,
        res = results[i];
      if (res.status === "rejected") {
        failures[id] = res.reason.message;
        errors.push(res.reason.message);
        continue;
      }
      delete failures[id];
      if (rebase && entries[id]) entries[id].base = res.value;
      else if (!entries[id]) entries[id] = P.create(res.value);
    }
    changed(
      errors.length
        ? errors.join("；")
        : rebase
          ? "已重新讀取線上版本；原值已變更的修正與移除必須重新勾選。"
          : "已讀取六個入口的線上資料。",
    );
    if (errors.length) message(errors.join("；"), true);
  }
  function targets() {
    return R.filter((r) => selected.has(r.id));
  }
  function taskRows() {
    const query = $("#dt-query")
        .value.trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
      town = $("#dt-town").value,
      type = $("#dt-type").value;
    return targets()
      .flatMap((r) => (plans[r.id]?.result.tasks || []).map((t) => ({ r, t })))
      .filter(
        ({ r, t }) =>
          (!town || t.parcels.some((p) => p.district === town)) &&
          (!type || t.type === type) &&
          query.every((q) =>
            [r.name, t.id, t.caseNo, t.type, t.resultDate, label(t)]
              .join(" ")
              .toLowerCase()
              .includes(q),
          ),
      );
  }
  function renderTasks() {
    const rows = taskRows(),
      pages = Math.max(1, Math.ceil(rows.length / 25));
    page = Math.min(page, pages);
    $("#dt-task-count").textContent =
      `篩選結果 ${rows.length} 筆（同一任務在不同入口分開整理），已勾選 ${checked.size} 筆`;
    $("#dt-tasks").innerHTML =
      rows
        .slice((page - 1) * 25, page * 25)
        .map(({ r, t }) => {
          const k = JSON.stringify([r.id, t.id]);
          return `<label class="dt-task"><input type="checkbox" data-task="${esc(k)}" ${checked.has(k) ? "checked" : ""}><span><b>${esc(t.type)} · ${esc(t.caseNo || t.id)}</b><br>${esc(label(t))}<small>${esc(r.name)} · 成果 ${esc(t.resultDate || "未設定")}</small></span></label>`;
        })
        .join("") || '<p class="muted">請勾選入口，或調整搜尋條件。</p>';
    $("#dt-page").textContent = `${page} / ${pages}`;
    $("#dt-prev").disabled = page <= 1;
    $("#dt-next").disabled = page >= pages;
    $("#dt-remove").disabled = !checked.size || busy;
  }
  function render() {
    $("#dt-recipients").innerHTML = R.map(
      (r) =>
        `<label class="dt-recipient"><input type="checkbox" data-recipient="${r.id}" ${selected.has(r.id) ? "checked" : ""} ${!entries[r.id] || failures[r.id] ? "disabled" : ""}><span><b>${esc(r.name)}</b><small>${r.file} · ${entries[r.id]?.base.tasks.length ?? "—"} → ${plans[r.id]?.result.tasks.length ?? "—"} 筆</small>${failures[r.id] ? `<small class="dt-error">${esc(failures[r.id])}</small>` : ""}</span></label>`,
    ).join("");
    const oldTown = $("#dt-town").value,
      towns = [
        ...new Set(
          targets().flatMap((r) =>
            (plans[r.id]?.result.tasks || []).flatMap((t) =>
              t.parcels.map((p) => p.district),
            ),
          ),
        ),
      ].sort();
    $("#dt-town").innerHTML =
      '<option value="">全部鄉鎮</option>' +
      towns.map((t) => `<option>${esc(t)}</option>`).join("");
    if (towns.includes(oldTown)) $("#dt-town").value = oldTown;
    renderTasks();
    renderDiff();
    $("#dt-export").disabled =
      busy ||
      !targets().some((r) => plans[r.id]?.changed) ||
      targets().some(
        (r) =>
          !entries[r.id] || failures[r.id] || plans[r.id]?.suspended.length,
      );
  }
  function renderDiff() {
    const open = new Set(
      [...$("#dt-diffs").querySelectorAll(".dt-diff")].flatMap((a) =>
        [...a.querySelectorAll(":scope > details")]
          .map((d, i) => (d.open ? a.dataset.entry + ":" + i : null))
          .filter(Boolean),
      ),
    );
    $("#dt-diffs").innerHTML =
      targets()
        .map((r) => {
          const p = plans[r.id];
          if (!p) return "";
          const tasks = p.tasks,
            features = p.features,
            pending = p.conflicts.filter((c) => !c.applied).length;
          return `<article class="dt-diff" data-entry="${r.id}"><h4>${esc(r.name)} <small>${r.file}</small></h4><p>任務：新增 <b>${tasks.added.length}</b> · 移除 <b>${tasks.removed.length}</b> · 修改 <b>${tasks.updated.length}</b><br>地籍圖形：新增 ${features.added.length} · 移除 ${features.removed.length} · 修改 ${features.updated.length}</p><p class="muted">比對既有任務 ${p.duplicates.tasks} 筆；${pending} 個差異保留原值。${p.metaChanged ? "入口名稱或設定有變更。" : ""}</p>${
            p.missing.length
              ? `<p class="dt-warning">${p.missing.length} 筆地號缺少唯一 KML 配對；不會猜測導航位置。<details><summary>查看地號</summary>${p.missing
                  .slice(0, 100)
                  .map(
                    (m) =>
                      `<p>${esc(m.taskId)}：${esc(label({ parcels: [m.parcel] }))}（${esc(m.status)}）</p>`,
                  )
                  .join("")}</details></p>`
              : ""
          }${p.suspended.length ? `<p class="dt-error">${p.suspended.length} 筆移除因原資料變動而暫停。請在上方重新勾選移除，或按下方取消移除。</p>${p.suspended.map((id) => undo(r.id, id)).join("")}` : ""}<details ${tasks.removed.length ? "open" : ""}><summary>新增／移除任務明細</summary>${tasks.added.map((t) => `<p class="dt-added">＋ ${esc(t.type)} ${esc(t.caseNo || t.id)} · ${esc(label(t))}</p>`).join("")}${tasks.removed.map((t) => `<p class="dt-removed">－ ${esc(t.type)} ${esc(t.caseNo || t.id)} · ${esc(label(t))} ${undo(r.id, t.id)}</p>`).join("")}${!tasks.added.length && !tasks.removed.length ? "<p>沒有新增或移除任務。</p>" : ""}</details><details><summary>逐欄差異（${p.conflicts.length}）；勾選才套用</summary><div class="dt-conflicts">${p.conflicts.map((c, i) => `<section class="dt-conflict"><label><input type="checkbox" data-conflict="${r.id}:${i}" ${c.applied ? "checked" : ""}><b>${esc(c.kind === "feature" ? "地籍圖形" : c.kind === "task" ? "任務" : "入口設定")} ${esc(c.id)} · ${esc(fields[c.field] || c.field)}</b></label><div class="dt-values"><div><small>原值</small><pre>${esc(show(c.oldValue, c.field))}</pre></div><div><small>匯入／修正值</small><pre>${esc(show(c.newValue, c.field))}</pre></div></div>${c.stale ? '<p class="dt-warning">線上原值已改變，需重新確認。</p>' : ""}${c.kind === "task" && c.applied && c.field !== "assignee" ? `<button type="button" data-sync="${r.id}:${i}">同步此欄到相同任務的其他入口</button>` : ""}</section>`).join("") || "<p>沒有欄位衝突。</p>"}</div></details></article>`;
        })
        .join("") ||
      '<p class="muted">選擇入口後顯示差異。未勾選的欄位一律保留原值。</p>';
    for (const a of $("#dt-diffs").querySelectorAll(".dt-diff"))
      [...a.querySelectorAll(":scope > details")].forEach((d, i) => {
        if (open.has(a.dataset.entry + ":" + i)) d.open = true;
      });
  }
  function undo(id, task) {
    return `<button type="button" data-undo="${esc(JSON.stringify([id, task]))}">取消移除 ${esc(task)}</button>`;
  }
  async function importPacks(packs) {
    const incoming = new Map();
    for (const raw of packs) {
      const pack = P.normalize(raw),
        id = pack.person.id;
      if (!entries[id] || failures[id])
        throw Error(
          "請先成功讀取 " + R.find((r) => r.id === id).file + " 的線上版本",
        );
      if (incoming.has(id) && !P.equal(incoming.get(id), pack))
        throw Error("同批含有同一入口的不同版本，請分次匯入。");
      incoming.set(id, pack);
    }
    // Validate the entire batch before committing any changes.
    const next = P.copy(entries);
    for (const [id, pack] of incoming) {
      if (!P.equal(next[id].incoming, pack)) {
        next[id].incoming = pack;
        next[id].approvals = {};
        next[id].extra = [];
        next[id].extraFeatures = [];
      }
      P.plan(next[id]);
    }
    entries = next;
    for (const id of incoming.keys()) selected.add(id);
    changed(
      `已匯入 ${incoming.size} 個入口；新任務追加，重複任務保留原值，差異可在下方逐欄勾選。`,
    );
  }
  async function files(input) {
    const list = [...input.files];
    input.value = "";
    if (!list.length) return;
    if (
      list.some((f) => f.size > 24 * 1024 * 1024) ||
      list.reduce((n, f) => n + f.size, 0) > 72 * 1024 * 1024
    )
      throw Error("每檔限24MB，每批限72MB");
    await importPacks(
      await Promise.all(
        list.map(async (f) => {
          try {
            return JSON.parse(await f.text());
          } catch {
            throw Error(f.name + " 不是有效JSON");
          }
        }),
      ),
    );
  }
  function synchronize(id, index) {
    const c = plans[id].conflicts[index];
    if (!c?.applied || c.kind !== "task" || c.field === "assignee") return;
    const source = plans[id].result.tasks.find((t) => t.id === c.id);
    if (!source) throw Error("任務已移除");
    const next = P.copy(entries),
      affected = [];
    for (const r of R) {
      if (r.id === id || !next[r.id] || failures[r.id]) continue;
      const before = plans[r.id].result.tasks.find(
        (t) =>
          t.id === c.id &&
          t.type === source.type &&
          t.caseNo === source.caseNo &&
          t.resultDate ===
            (c.field === "resultDate" ? c.oldValue : source.resultDate),
      );
      // A different confirmed value is never silently replaced by synchronization.
      if (!before || !P.equal(before[c.field], c.oldValue)) continue;
      const entry = next[r.id];
      entry.extra = entry.extra.filter(
        (e) => !(e.kind === "task" && e.id === c.id && e.field === c.field),
      );
      entry.extra.push({
        kind: "task",
        id: c.id,
        field: c.field,
        value: P.copy(c.newValue),
      });
      if (c.field === "parcels") {
        const pool = [
            ...new Map(
              Object.values(plans)
                .flatMap((p) => p.result.features)
                .map((f) => [f.id, f]),
            ).values(),
          ],
          refs = P.references([{ ...before, parcels: c.newValue }], pool).used;
        entry.extraFeatures = [
          ...new Map(
            entry.extraFeatures
              .concat(pool.filter((f) => refs.has(f.id)))
              .map((f) => [f.id, f]),
          ).values(),
        ];
      }
      const conflict = P.plan(entry).conflicts.find(
        (x) => x.kind === "task" && x.id === c.id && x.field === c.field,
      );
      if (conflict) P.approve(entry, conflict);
      P.plan(entry);
      affected.push(r.id);
    }
    entries = next;
    affected.forEach((x) => selected.add(x));
    changed(
      affected.length
        ? `已同步到 ${affected.length} 個其他入口，請核對各入口差異後再匯出。`
        : "其他入口沒有原值一致的相同任務，未變更資料。",
    );
  }
  async function exportFiles() {
    invalidate();
    const chosen = targets();
    if (!chosen.length) throw Error("請先選擇入口");
    if (
      chosen.some(
        (r) => failures[r.id] || !entries[r.id] || plans[r.id].suspended.length,
      )
    )
      throw Error("請先處理讀取失敗或待重新確認的移除");
    const version = revision,
      results = await Promise.allSettled(chosen.map(read));
    if (version !== revision)
      throw Error("檢查期間資料已變動，請重新產生發布檔");
    const stale = chosen.filter(
      (r, i) =>
        results[i].status !== "fulfilled" ||
        !P.equal(entries[r.id].base, results[i].value),
    );
    if (stale.length)
      throw Error(
        "無法匯出：" +
          stale.map((r) => r.file).join("、") +
          " 的線上版本已變動或無法讀取。請按「重新讀取線上版本」，核對差異後再匯出。",
      );
    invalidate();
    let count = 0;
    for (const r of chosen) {
      const p = plans[r.id];
      if (!p.changed) continue;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(p.result, null, 2) + "\n"], {
          type: "application/json",
        }),
      );
      urls.push(url);
      const a = document.createElement("a");
      a.className = "button dt-download";
      a.href = url;
      a.download = r.file;
      a.textContent = "下載 " + r.file;
      $("#dt-downloads").append(a);
      count++;
    }
    if (!count) throw Error("沒有資料變更，不需要發布檔");
    const note = document.createElement("p");
    note.textContent =
      "已於 " +
      new Date().toLocaleString("zh-TW") +
      " 核對線上版本。檔案已產生，網站尚未更新；下載後將同名JSON上傳 GitHub data，其他檔案不用上傳。";
    $("#dt-downloads").prepend(note);
    message(`已產生 ${count} 個發布檔；請逐一下載。`);
  }
  async function action(fn) {
    if (busy) return;
    busy = true;
    dialog.setAttribute("aria-busy", "true");
    dialog
      .querySelectorAll("button,input,select")
      .forEach((x) => (x.disabled = true));
    try {
      await fn();
    } catch (e) {
      message(e.message, true);
    } finally {
      busy = false;
      dialog.removeAttribute("aria-busy");
      dialog
        .querySelectorAll("button,input,select")
        .forEach((x) => (x.disabled = false));
      render();
    }
  }
  function build() {
    dialog = document.createElement("dialog");
    dialog.id = "dispatch-tools-dialog";
    dialog.innerHTML = `<div class="dt-heading"><div><small>PHOTOSHEET · 發布前整理</small><h2>整理發布資料</h2></div><button id="dt-close" aria-label="關閉整理工具">關閉</button></div><p>以目前網站的派工檔為基準，追加新任務、勾選移除，再檢查差異。這裡不會直接更新網站，也不會改動管理頁的 Excel 原始資料。</p><p id="dt-status" role="status" aria-live="polite">讀取中…</p><small id="dt-saved"></small><section><h3>1. 選擇要整理的入口</h3><div id="dt-recipients"></div><div class="dt-actions"><button id="dt-load">重新讀取線上版本</button><button id="dt-import">匯入新派工 JSON</button><button id="dt-manager">帶入管理頁所選入口任務</button></div><input id="dt-file" type="file" accept=".json,application/json" multiple hidden><p class="muted">匯入時按檔案內入口ID辨識。廠商標籤固定；重複任務不新增，也不直接覆蓋。</p></section><section><h3>2. 搜尋與批次整理</h3><div class="dt-filters"><label>搜尋<input id="dt-query" type="search" placeholder="鄉鎮、地段、地號、案號"></label><label>鄉鎮<select id="dt-town"><option value="">全部鄉鎮</option></select></label><label>類型<select id="dt-type"><option value="">全部類型</option><option>雜草垃圾</option><option>砍樹</option><option>圍籬</option></select></label></div><p id="dt-task-count"></p><div class="dt-actions"><button id="dt-select">勾選全部篩選結果</button><button id="dt-clear-selection">取消勾選</button><button id="dt-remove">從所選入口移除勾選任務</button></div><div id="dt-tasks"></div><div class="dt-actions"><button id="dt-prev">上一頁</button><span id="dt-page"></span><button id="dt-next">下一頁</button></div></section><section><h3>3. 預覽差異</h3><p>新增任務會追加；既有欄位必須逐欄勾選才修改。移除後可取消，仍被其他任務使用的 KML 會保留。</p><div id="dt-diffs"></div></section><section><h3>4. 匯出發布檔</h3><button id="dt-export" class="primary">核對線上版本並產生發布檔</button><div id="dt-downloads"></div><p><a href="https://github.com/Corry-Hsu/photosheet/tree/main/data" target="_blank" rel="noopener">開啟 GitHub data 資料夾</a></p></section><details><summary>草稿與復原</summary><p>整理草稿自動儲存在這個瀏覽器。下載草稿可換裝置繼續整理；草稿不會當成派工檔發布。</p><div class="dt-actions"><button id="dt-save-draft">下載整理草稿</button><button id="dt-restore-draft">匯入整理草稿</button><button id="dt-reset">放棄整理，重新開始</button></div><input id="dt-draft-file" type="file" accept=".json,application/json" hidden></details>`;
    document.body.append(dialog);
    $("#dt-close").onclick = () => dialog.close();
    dialog.addEventListener("cancel", (e) => {
      if (busy) e.preventDefault();
    });
    $("#dt-load").onclick = () => action(() => load(true));
    $("#dt-import").onclick = () => $("#dt-file").click();
    $("#dt-file").onchange = () => action(() => files($("#dt-file")));
    $("#dt-manager").onclick = () =>
      action(async () => {
        if (!selected.size) throw Error("請先勾選要帶入的入口");
        await importPacks(await callback([...selected]));
      });
    for (const id of ["dt-query", "dt-town", "dt-type"])
      $("#" + id).addEventListener(
        id === "dt-query" ? "input" : "change",
        () => {
          checked.clear();
          page = 1;
          renderTasks();
        },
      );
    $("#dt-select").onclick = () => {
      taskRows().forEach(({ r, t }) =>
        checked.add(JSON.stringify([r.id, t.id])),
      );
      renderTasks();
    };
    $("#dt-clear-selection").onclick = () => {
      checked.clear();
      renderTasks();
    };
    $("#dt-prev").onclick = () => {
      page--;
      renderTasks();
    };
    $("#dt-next").onclick = () => {
      page++;
      renderTasks();
    };
    $("#dt-remove").onclick = () =>
      action(() => {
        const count = checked.size;
        for (const k of checked) {
          const [id, taskId] = JSON.parse(k),
            task = plans[id].result.tasks.find((t) => t.id === taskId);
          if (task) P.remove(entries[id], task);
        }
        changed(`已預備移除 ${count} 筆；尚未更新網站，可在差異明細取消移除。`);
      });
    $("#dt-export").onclick = () => action(exportFiles);
    $("#dt-save-draft").onclick = () => {
      const url = URL.createObjectURL(
          new Blob([JSON.stringify(snapshot(), null, 2)], {
            type: "application/json",
          }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = "photosheet-dispatch-draft.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    };
    $("#dt-restore-draft").onclick = () => $("#dt-draft-file").click();
    $("#dt-draft-file").onchange = () =>
      action(async () => {
        const input = $("#dt-draft-file"),
          f = input.files[0];
        input.value = "";
        if (!f) return;
        if (f.size > 72 * 1024 * 1024) throw Error("草稿過大");
        const d = JSON.parse(await f.text());
        restore(d);
        changed("已匯入整理草稿；匯出前仍會核對線上版本。");
      });
    $("#dt-reset").onclick = () =>
      action(async () => {
        if (!confirm("放棄尚未發布的整理草稿，重新讀取六個入口？")) return;
        entries = {};
        selected.clear();
        failures = {};
        await load();
      });
    dialog.addEventListener("change", (e) => {
      if (e.target.dataset.recipient) {
        const id = e.target.dataset.recipient;
        e.target.checked ? selected.add(id) : selected.delete(id);
        changed();
      }
      if (e.target.dataset.task) {
        const key = e.target.dataset.task;
        e.target.checked ? checked.add(key) : checked.delete(key);
        renderTasks();
      }
      if (e.target.dataset.conflict) {
        const [id, i] = e.target.dataset.conflict.split(":");
        const conflict = plans[id].conflicts[Number(i)];
        P.approve(entries[id], conflict, e.target.checked);
        changed("已更新欄位選擇，請核對差異。");
      }
    });
    dialog.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.undo)
        action(() => {
          const [id, task] = JSON.parse(b.dataset.undo);
          entries[id].removals = entries[id].removals.filter(
            (r) => r.id !== task,
          );
          changed("已取消移除。");
        });
      if (b.dataset.sync)
        action(() => {
          const [id, i] = b.dataset.sync.split(":");
          synchronize(id, Number(i));
        });
    });
  }
  function restore(draft) {
    if (
      draft?.id !== DRAFT ||
      draft.version !== 1 ||
      !draft.entries ||
      typeof draft.entries !== "object" ||
      !Array.isArray(draft.selected)
    )
      throw Error("不是有效的整理草稿");
    const next = {};
    for (const [id, e] of Object.entries(draft.entries)) {
      if (!R.some((r) => r.id === id) || e.base?.person?.id !== id)
        throw Error("草稿入口不正確");
      P.validate(e.base);
      if (e.incoming) P.validate(e.incoming);
      P.plan(e);
      next[id] = P.copy(e);
    }
    entries = next;
    selected = new Set(
      draft.selected.filter((id) => R.some((r) => r.id === id)),
    );
    failures = {};
  }
  window.DispatchTools = {
    async open({ getCandidates }) {
      callback = getCandidates;
      if (dialog) {
        dialog.showModal();
        return;
      }
      build();
      dialog.showModal();
      await action(async () => {
        let draft;
        try {
          draft = await Store.get("state", DRAFT);
        } catch (e) {
          message("讀取本機草稿失敗：" + e.message, true);
        }
        if (draft) {
          restore(draft);
          recalc();
          render();
          message(
            "已恢復本機草稿；發布前會重新核對線上版本。請按重新讀取線上版本以更新基準。",
          );
        } else await load();
      });
    },
  };
})();
