/* Management-only list restoration. Publication and assignment rules stay in PSCore. */
(function () {
  "use strict";
  const C = PSCore,
    E = C.esc;
  const restoredIds = (state) =>
    Array.isArray(state.adminRestoredTaskIds) ? state.adminRestoredTaskIds : [];
  function visible(state, task) {
    return C.adminVisible(task) || restoredIds(state).includes(task.id);
  }
  function period(today = C.today()) {
    const [year, month] = today.split("-").map(Number);
    return {
      start: new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10),
      end: today.slice(0, 7) + "-01",
    };
  }
  function find(state, query, today = C.today()) {
    const { start, end } = period(today),
      clean = (s) => C.norm(s).toLowerCase().replace(/\s+/g, ""),
      needle = clean(query);
    const restored = new Set(restoredIds(state));
    return state.tasks
      .filter(
        (t) =>
          C.date(t.resultDate) === t.resultDate &&
          t.resultDate >= start &&
          t.resultDate < end &&
          !C.adminVisible(t, today) &&
          !restored.has(t.id) &&
          clean(
            [
              t.caseNo,
              t.serial,
              t.type,
              t.district,
              t.section,
              ...t.parcels.map(
                (p) => p.county + p.district + p.section + p.lot,
              ),
            ].join(" "),
          ).includes(needle),
      )
      .sort(
        (a, b) =>
          a.resultDate.localeCompare(b.resultDate) || a.id.localeCompare(b.id),
      );
  }
  function open({ getState, save, onRestored, query = "" }) {
    const dialog = document.querySelector("#dialog"),
      body = document.querySelector("#dialog-body"),
      range = period();
    document.querySelector("#dialog-title").textContent = "搜尋上個月任務";
    body.innerHTML = `<section class="history-search"><p>搜尋 ${E(range.start)} 至 ${E(range.end)} 前的隱藏任務。按「加回清單並重新開放」會保留原日期，取消完成與舊案鎖定，可重新指派及發布給廠商。</p><label>地段、地號、鄉鎮或案號<input id="history-query" type="search" placeholder="例如：城南段 240" value="${E(query)}" autocomplete="off"></label><p id="history-count" role="status"></p><div id="history-results"></div><div class="toolbar history-pages"><button id="history-prev">上一頁</button><span id="history-page"></span><button id="history-next">下一頁</button></div><p id="history-status" role="status" aria-live="polite"></p><button id="history-back">回到任務清單</button></section>`;
    const shell = body.firstElementChild;
    if (!dialog.open) dialog.showModal();
    const input = body.querySelector("#history-query"),
      results = body.querySelector("#history-results"),
      status = body.querySelector("#history-status"),
      prev = body.querySelector("#history-prev"),
      next = body.querySelector("#history-next");
    let page = 1,
      busy = false;
    function render() {
      if (!body.contains(shell)) return;
      const tasks = find(getState(), input.value),
        pages = Math.max(1, Math.ceil(tasks.length / 20));
      page = Math.min(page, pages);
      body.querySelector("#history-count").textContent =
        `找到 ${tasks.length} 筆未顯示的任務`;
      body.querySelector("#history-page").textContent = `${page} / ${pages}`;
      prev.disabled = busy || page === 1;
      next.disabled = busy || page === pages;
      input.disabled = busy;
      results.innerHTML =
        tasks
          .slice((page - 1) * 20, page * 20)
          .map(
            (t) =>
              `<article class="history-task"><div><h3>${E([...new Set(t.parcels.map((p) => p.district + p.section))].join("；"))}</h3><p>地號：${E(t.parcels.map((p) => p.lot).join("、"))}</p><p>${E(t.type)} · 成果 ${E(t.resultDate)}${t.caseNo ? " · 案號 " + E(t.caseNo) : ""}</p></div><button data-history-restore="${E(t.id)}" ${busy ? "disabled" : ""}>加回清單並重新開放</button></article>`,
          )
          .join("") ||
        "<p>沒有符合的上個月隱藏任務。若尚未匯入該月份資料，請先匯入 Excel 或還原備份。</p>";
      results.querySelectorAll("[data-history-restore]").forEach(
        (button) =>
          (button.onclick = async () => {
            if (busy) return;
            const state = getState(),
              task = find(state, input.value).find(
                (t) => t.id === button.dataset.historyRestore,
              );
            if (!task) {
              render();
              return;
            }
            const existed = Object.prototype.hasOwnProperty.call(
                state,
                "adminRestoredTaskIds",
              ),
              previous = state.adminRestoredTaskIds;
            state.adminRestoredTaskIds = [
              ...new Set([...restoredIds(state), task.id]),
            ];
            const taskIndex = state.tasks.findIndex((t) => t.id === task.id),
              reopenedTask = C.reopenForDispatch(task);
            state.tasks[taskIndex] = reopenedTask;
            busy = true;
            render();
            status.textContent = "正在加回清單…";
            try {
              await save();
            } catch (error) {
              state.tasks[taskIndex] = task;
              if (existed) state.adminRestoredTaskIds = previous;
              else delete state.adminRestoredTaskIds;
              status.textContent =
                "儲存失敗，尚未加回清單：" + (error.message || error);
              busy = false;
              render();
              return;
            }
            onRestored(reopenedTask);
            status.textContent = `已將 ${task.caseNo || task.id} 加回清單並重新開放派工，可繼續搜尋或返回清單。`;
            busy = false;
            render();
          }),
      );
    }
    input.oninput = () => {
      page = 1;
      render();
    };
    prev.onclick = () => {
      if (!busy && page > 1) {
        page--;
        render();
      }
    };
    next.onclick = () => {
      if (!busy) {
        page++;
        render();
      }
    };
    body.querySelector("#history-back").onclick = () => dialog.close();
    render();
    input.focus();
  }
  window.AdminHistory = { visible, period, find, open };
})();
