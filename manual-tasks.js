/* Admin-only local task editor. Uses the same task shape as Excel import. */
(function () {
  const C = PSCore,
    E = C.esc,
    $ = (s) => document.querySelector(s),
    all = (s) => [...document.querySelectorAll(s)];
  window.ManualTasks = {
    open({ state, sectionCatalog, onSave }) {
      const towns = [
        ...new Set([
          ...C.selfDistricts,
          ...state.tasks.map((t) => t.district).filter(Boolean),
        ]),
      ];
      $("#dialog-title").textContent = "手動新增任務";
      $("#dialog-body").innerHTML =
        `<p>同一份任務可包含多個地號；廠商依工作類型分組，不會取代人員負責人。</p><div class="form-grid"><label>工作類型<select id="manual-type"><option>雜草垃圾</option><option>砍樹</option><option>圍籬</option></select></label><label>案件編號（選填）<input id="manual-case" maxlength="120"></label><label>成果指定日期<input id="manual-date" type="date" value="${C.today()}"></label><label>完成期限<input id="manual-due" type="datetime-local" value="${C.today()}T17:00"></label><label>人員負責人<select id="manual-person"><option value="auto">依鄉鎮自動分派</option><option value="">暫不分派</option>${state.people.map((p) => `<option value="${p.id}">${E(p.name)}</option>`).join("")}</select></label><label>原案序號（選填）<input id="manual-serial" maxlength="80"></label></div><p class="muted">管理清單只顯示今年本月起至年底；舊月份任務不能新增指派。</p><h3>地段地號</h3><p class="muted">同列可輸入多個地號，以空格、逗號或頓號分隔。跨地段可新增另一列。</p><datalist id="manual-towns">${towns.map((t) => `<option value="${E(t)}"></option>`).join("")}</datalist><datalist id="manual-sections">${[...new Set(state.tasks.map((t) => t.section).filter(Boolean))].map((s) => `<option value="${E(s)}"></option>`).join("")}</datalist><div id="manual-parcels"></div><button id="manual-add-parcel">新增地籍列</button><h3>工作項目（選填）</h3><div id="manual-items"></div><button id="manual-add-item">新增工作項目</button><h3>白板／工作單資料</h3><div class="form-grid"><label>施作廠商<input id="manual-vendor" maxlength="120"></label><label>施作人員<input id="manual-contact" maxlength="80"></label><label>面積（選填）<input id="manual-area" type="number" min="0" step="any"></label></div><details><summary>已核對入口座標（選填）</summary><p>未填時沿用地籍自動參考位置，之後可在地圖核對入口。</p><div class="form-grid"><label>緯度<input id="manual-lat" type="number" step="any" placeholder="22.6…"></label><label>經度<input id="manual-lng" type="number" step="any" placeholder="120.5…"></label></div></details><p id="manual-error" class="warning" role="alert"></p><button id="commit-manual" class="primary">新增任務</button>`;
      function addParcel() {
        const rows = all("[data-manual-parcel]"),
          last = rows.at(-1),
          get = (k) =>
            last?.querySelector('[data-field="' + k + '"]').value || "";
        const row = document.createElement("section");
        row.className = "panel manual-row";
        row.dataset.manualParcel = "";
        row.innerHTML = `<div class="form-grid"><label>鄉鎮<input data-field="district" list="manual-towns" value="${E(get("district"))}" placeholder="例如：屏東市"></label><label>地段<input data-field="section" list="manual-sections" value="${E(get("section"))}" placeholder="例如：關帝段"></label><label>段代碼（選填）<input data-field="sectionCode" inputmode="numeric" maxlength="4" value="${E(get("sectionCode"))}" placeholder="0582"></label><label>地號<input data-field="lots" placeholder="1198、1198-1"></label></div><button data-remove-parcel>移除此列</button>`;
        $("#manual-parcels").append(row);
        row.querySelector("[data-remove-parcel]").onclick = () => {
          if (all("[data-manual-parcel]").length > 1) row.remove();
          else $("#manual-error").textContent = "至少保留一列地籍資料";
        };
        const code = row.querySelector('[data-field="sectionCode"]');
        if (code.value) code.dataset.auto = "true";
        code.oninput = () => delete code.dataset.auto;
        const fillCode = () => {
          if (code.value && !code.dataset.auto) return;
          const district = row.querySelector('[data-field="district"]').value,
            section = row.querySelector('[data-field="section"]').value;
          const key = C.sectionKey({ district, section });
          const codes =
            sectionCatalog.authoritative?.get(key) || sectionCatalog.get(key);
          code.value = codes?.size === 1 ? [...codes][0] : "";
          code.dataset.auto = "true";
        };
        row.querySelector('[data-field="district"]').onchange = fillCode;
        row.querySelector('[data-field="section"]').onchange = fillCode;
      }
      function addItem() {
        const row = document.createElement("section");
        row.className = "panel manual-row";
        row.dataset.manualItem = "";
        row.innerHTML =
          '<div class="form-grid"><label>項目名稱<input data-field="name" placeholder="例如：除草清理"></label><label>數量<input data-field="quantity" type="number" min="0" step="any"></label><label>單位<input data-field="unit" placeholder="㎡／株／公尺"></label><label>備註<input data-field="note"></label></div><button data-remove-item>移除此項</button>';
        $("#manual-items").append(row);
        row.querySelector("[data-remove-item]").onclick = () => row.remove();
      }
      addParcel();
      addItem();
      $("#manual-add-parcel").onclick = addParcel;
      $("#manual-add-item").onclick = addItem;
      const readRows = (selector) =>
        all(selector).map((row) =>
          Object.fromEntries(
            [...row.querySelectorAll("[data-field]")].map((el) => [
              el.dataset.field,
              el.value,
            ]),
          ),
        );
      $("#commit-manual").onclick = async () => {
        const button = $("#commit-manual");
        button.disabled = true;
        $("#manual-error").textContent = "";
        try {
          await onSave({
            type: $("#manual-type").value,
            caseNo: $("#manual-case").value,
            resultDate: $("#manual-date").value,
            due: $("#manual-due").value,
            assignee: $("#manual-person").value,
            serial: $("#manual-serial").value,
            parcels: readRows("[data-manual-parcel]"),
            items: readRows("[data-manual-item]"),
            vendor: $("#manual-vendor").value,
            sourcePerson: $("#manual-contact").value,
            area: $("#manual-area").value,
            latitude: $("#manual-lat").value,
            longitude: $("#manual-lng").value,
          });
        } catch (e) {
          $("#manual-error").textContent = e.message;
        } finally {
          if (button.isConnected) button.disabled = false;
        }
      };
      if (!$("#dialog").open) $("#dialog").showModal();
    },
  };
})();
