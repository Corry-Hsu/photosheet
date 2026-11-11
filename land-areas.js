/* Admin-only read-only online area catalogue, preview, and explicit local apply. */
(function () {
  "use strict";
  const A = LandAreaCore,
    E = PSCore.esc;
  let dialog,
    options,
    results = [],
    snapshots = [],
    checked = new Set(),
    page = 1,
    controller,
    loading = false,
    applying = false,
    run = 0;
  const $ = (s) => dialog.querySelector(s);
  function status(message, error = false) {
    $("#area-status").textContent = message;
    $("#area-status").classList.toggle("warning", error);
  }
  async function json(name, signal) {
    const url = new URL("data/land-area/" + name, location.href);
    url.searchParams.set("v", "20261111-area1");
    const local = new AbortController(),
      timer = setTimeout(() => local.abort(), 20000),
      abort = () => local.abort();
    signal.addEventListener("abort", abort, { once: true });
    try {
      if (signal.aborted) throw Error("已取消");
      const response = await fetch(url, {
        cache: "no-store",
        signal: local.signal,
      });
      if (!response.ok)
        throw Error(name + " 讀取失敗（" + response.status + "）");
      const text = await response.text();
      if (text.length > 4 * 1024 * 1024) throw Error(name + " 檔案過大");
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
  function filtered() {
    const words = PSCore.norm($("#area-query").value)
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    return results.filter((r) => {
      const t = snapshots.find((t) => t.id === r.taskId);
      return words.every((w) =>
        [
          t?.caseNo,
          t?.type,
          r.taskId,
          ...r.parcels.flatMap((p) => [
            p.parcel.district,
            p.parcel.section,
            p.parcel.lot,
            p.status,
          ]),
        ]
          .join(" ")
          .toLowerCase()
          .includes(w),
      );
    });
  }
  function render() {
    const rows = filtered(),
      pages = Math.max(1, Math.ceil(rows.length / 20));
    page = Math.min(page, pages);
    $("#area-count").textContent =
      `${results.length} 筆任務，${results.filter((r) => r.complete).length} 筆完整配對；已勾選 ${checked.size} 筆。篩選結果 ${rows.length} 筆。`;
    $("#area-results").innerHTML =
      rows
        .slice((page - 1) * 20, page * 20)
        .map((r) => {
          const t = snapshots.find((t) => t.id === r.taskId);
          return `<article class="area-result"><label class="area-choice"><input type="checkbox" data-area-task="${E(r.taskId)}" ${checked.has(r.taskId) ? "checked" : ""} ${!r.complete || loading || applying ? "disabled" : ""}><span><b>${E(t?.type)} · ${E(t?.caseNo || r.taskId)}</b><br>${E([...new Set(r.parcels.map((p) => p.parcel.district + p.parcel.section))].join("、"))}</span></label><p>目前面積：${E(t?.area ?? "") || "未填"} ㎡ → ${r.complete ? `<b>${E(r.total)} ㎡</b>` : `<strong class="warning">未完整配對</strong>（已配對小計 ${E(r.subtotal)} ㎡）`}</p><details ${!r.complete ? "open" : ""}><summary>地號面積明細 · ${r.matched}/${r.parcels.length} 筆</summary>${r.parcels.map((p) => `<div class="area-parcel"><span>${E(p.parcel.district + p.parcel.section)} ${E(p.parcel.lot)}</span><span>${p.status === "已配對" ? E(p.area) + " ㎡" : `<span class="warning">${E(p.status)}</span>`}</span></div>`).join("")}</details></article>`;
        })
        .join("") || "<p>沒有符合條件的任務。</p>";
    $("#area-page").textContent = `${page} / ${pages}`;
    $("#area-prev").disabled = page <= 1;
    $("#area-next").disabled = page >= pages;
    $("#area-apply").disabled = loading || applying || !checked.size;
    $("#area-retry").disabled = loading || applying;
    $("#area-select").disabled = loading || applying;
    $("#area-clear").disabled = loading || applying;
    $("#area-close").disabled = applying;
  }
  async function load() {
    if (applying) return;
    controller?.abort();
    controller = new AbortController();
    const current = ++run,
      signal = controller.signal;
    loading = true;
    results = [];
    checked.clear();
    page = 1;
    snapshots = structuredClone(
      options.getState().tasks.filter((t) => options.taskIds.includes(t.id)),
    );
    render();
    if (!snapshots.length) {
      loading = false;
      status("請先匯入任務，或選取要配對的任務。", true);
      render();
      return;
    }
    status("正在讀取線上地段索引…");
    try {
      const entries = A.catalog(await json("catalog.json", signal)),
        requested = A.requests(snapshots, entries, options.getCatalog()),
        records = [],
        failures = {};
      let cursor = 0,
        done = 0;
      const reader = async () => {
        while (cursor < requested.needed.length) {
          const e = requested.needed[cursor++];
          if (signal.aborted) return;
          try {
            records.push(...A.section(await json(e.file, signal), e));
          } catch (error) {
            if (signal.aborted) return;
            failures[e.county + "|" + e.code] = error.message;
          }
          done++;
          if (current === run)
            status(
              `已讀取 ${done}/${requested.needed.length} 個所需地段（索引共 ${entries.length} 個地段）…`,
            );
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(4, requested.needed.length) }, reader),
      );
      if (current !== run || signal.aborted) return;
      results = A.analyze(requested, records, failures);
      $("#area-source").textContent =
        `線上資料：${entries.length} 個地段；本次僅讀取 ${requested.needed.length} 個地段檔。登記面積依土地登記慣例以㎡表示，原 XML 未另列單位。`;
      const n = results.filter((r) => r.complete).length;
      status(
        `配對完成：${n}/${results.length} 筆任務完整。請核對原面積及明細，再勾選套用。${Object.keys(failures).length ? " 有地段檔讀取失敗，可重新配對。" : ""}`,
        Object.keys(failures).length > 0,
      );
    } catch (error) {
      if (current === run && !signal.aborted)
        status(
          "無法配對：" + error.message + "。原面積未變更，可重新配對。",
          true,
        );
    } finally {
      if (current === run) {
        loading = false;
        render();
      }
    }
  }
  async function apply() {
    if (loading || applying || !checked.size) return;
    applying = true;
    render();
    try {
      await options.onApply(results, [...checked]);
      const count = checked.size;
      checked.clear();
      status(
        `已套用 ${count} 筆任務面積並儲存在本機。工作單會使用新面積；現場入口仍需另行匯出並發布。`,
      );
      snapshots = structuredClone(
        options.getState().tasks.filter((t) => options.taskIds.includes(t.id)),
      );
    } catch (error) {
      status("未套用：" + error.message + "。原資料已保留，可重試。", true);
    } finally {
      applying = false;
      render();
    }
  }
  function build() {
    dialog = document.createElement("dialog");
    dialog.id = "land-area-dialog";
    dialog.innerHTML = `<div class="area-heading"><h2>配對地籍面積</h2><button id="area-close">關閉</button></div><p>依縣市、鄉鎮、段代碼及地號讀取線上登記面積。同一地號只計一次；全部地號配對完整才可套用，不會修改工作項目的施作數量。</p><p id="area-status" role="status" aria-live="polite"></p><p id="area-source" class="muted"></p><div class="toolbar"><button id="area-retry">重新線上配對</button><button id="area-select">勾選篩選內完整配對任務</button><button id="area-clear">取消勾選</button></div><label>搜尋任務或配對問題<input id="area-query" type="search" placeholder="鄉鎮、地段、地號、案號或原因"></label><p id="area-count"></p><div id="area-results"></div><div class="toolbar"><button id="area-prev">上一頁</button><span id="area-page"></span><button id="area-next">下一頁</button></div><button id="area-apply" class="primary">套用勾選任務的登記總面積</button><p class="muted">保留原始面積及本次配對明細供追溯。新增或修改地號後，需重新配對面積。</p>`;
    document.body.append(dialog);
    const close = () => {
      if (applying) return;
      controller?.abort();
      run++;
      loading = false;
      dialog.close();
    };
    $("#area-close").onclick = close;
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      close();
    });
    $("#area-retry").onclick = load;
    $("#area-apply").onclick = apply;
    $("#area-query").oninput = () => {
      page = 1;
      render();
    };
    $("#area-select").onclick = () => {
      filtered()
        .filter((r) => r.complete)
        .forEach((r) => checked.add(r.taskId));
      render();
    };
    $("#area-clear").onclick = () => {
      checked.clear();
      render();
    };
    $("#area-prev").onclick = () => {
      page--;
      render();
    };
    $("#area-next").onclick = () => {
      page++;
      render();
    };
    dialog.addEventListener("change", (e) => {
      const id = e.target.dataset.areaTask;
      if (!id) return;
      e.target.checked ? checked.add(id) : checked.delete(id);
      $("#area-count").textContent =
        `${results.length} 筆任務；已勾選 ${checked.size} 筆。`;
      $("#area-apply").disabled = loading || applying || !checked.size;
    });
  }
  window.LandAreas = {
    open(config) {
      options = config;
      if (!dialog) build();
      $("#area-query").value = "";
      $("#area-source").textContent = "";
      if (!dialog.open) dialog.showModal();
      return load();
    },
  };
})();
