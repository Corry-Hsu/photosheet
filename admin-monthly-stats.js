/* Manager-only monthly workload totals; no storage or network writes. */
(function (root) {
  "use strict";
  const C = root.PSCore,
    types = ["雜草垃圾", "砍樹", "圍籬"];
  function months(today = C.today()) {
    const [year, month] = today.split("-").map(Number);
    return [
      today.slice(0, 7),
      new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7),
    ];
  }
  function label(month) {
    const [year, number] = month.split("-").map(Number);
    return `民國${year - 1911}年${number}月`;
  }
  function summarize(tasks, month) {
    const rows = types.map((type) => ({ type, cases: 0, parcels: 0 }));
    for (const task of tasks) {
      const row = rows.find((r) => r.type === task.type);
      if (
        !row ||
        !task.resultDate ||
        C.date(task.resultDate) !== task.resultDate ||
        task.resultDate.slice(0, 7) !== month
      ) continue;
      row.cases++;
      row.parcels += task.parcels.length;
    }
    return [...rows, {
      type: "合計",
      cases: rows.reduce((sum, row) => sum + row.cases, 0),
      parcels: rows.reduce((sum, row) => sum + row.parcels, 0),
    }];
  }
  function mount(element, getTasks) {
    if (!element) return null;
    const select = element.querySelector("select"),
      body = element.querySelector("tbody");
    let knownMonth = "";
    function update() {
      const available = months();
      if (knownMonth !== available[0]) {
        // Keep the relative choice (this/last month) when Taiwan crosses a month.
        const offset = select.selectedIndex === 1 ? 1 : 0;
        select.innerHTML = available.map((month, i) =>
          `<option value="${month}">${label(month)}（${i ? "上個月" : "本月"}）</option>`
        ).join("");
        select.selectedIndex = offset;
        knownMonth = available[0];
      }
      const rows = summarize(getTasks(), select.value);
      const html = rows.map((row) =>
        `<tr><th scope="row">${row.type}</th><td>${row.cases.toLocaleString("zh-TW")}件</td><td>地號${row.parcels.toLocaleString("zh-TW")}筆</td></tr>`
      ).join("");
      // Avoid repeated live-region announcements when counts have not changed.
      if (body.innerHTML !== html) body.innerHTML = html;
    }
    select.addEventListener("change", update);
    root.addEventListener("focus", update);
    root.document.addEventListener("visibilitychange", () => {
      if (!root.document.hidden) update();
    });
    root.setInterval(() => {
      if (!root.document.hidden && months()[0] !== knownMonth) update();
    }, 60000);
    update();
    return { update };
  }
  root.AdminMonthlyStats = { months, label, summarize, mount };
  if (typeof module !== "undefined") module.exports = root.AdminMonthlyStats;
})(typeof window !== "undefined" ? window : globalThis);
