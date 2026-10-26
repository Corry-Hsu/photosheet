(function () {
  const C = PSCore,
    E = C.esc;
  const groups = (t) => {
    let m = new Map();
    for (const p of t.parcels) {
      const k = p.district + p.section;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p.lot);
    }
    return [...m];
  };
  function board(t, s) {
    const g = groups(t),
      section = g.map((x) => x[0]).join("；"),
      lots =
        g.length === 1 ? g[0][1] : g.map((x) => x[0] + " " + x[1].join(" "));
    return `<section class="board sheet"><div class="main"><div class="line nowrap">日期： ${E(C.roc(t.resultDate))}</div><div class="line nowrap">地段： ${E(section)}</div><div class="line">地號： ${lots.map((x) => `<span>${E(x)}</span>`).join(" ")}</div></div><div class="footer"><div><span>領勘廠商：</span><span>${E(s.guide)}</span><span>${E(s.contact)}</span></div><div><span>施作廠商：</span><span>${E(t.vendor)}</span><span>${E(t.sourcePerson)}</span></div></div></section>`;
  }
  function order(t, s) {
    return `<section class="order sheet"><h2>${E(s.agency)}</h2><h1>${t.type === "圍籬" ? "開口契約訂單通知表" : "工作通知單"}</h1><p>${E(s.project)}　招標案號：${E(s.tender)}</p>${t.type === "圍籬" ? `<p>${E(s.fence_terms)}</p>` : ""}<table><tr><th>案件編號</th><td>${E(t.caseNo || t.serial)}</td><th>工作類別</th><td>${E(t.type)}</td></tr><tr><th>通知時間</th><td>${E(t.notice ? C.roc(t.notice) : "")}</td><th>限定完成履約時間</th><td>${E(s.contract_deadline)}</td></tr><tr><th>派工完成期限</th><td colspan="3">${E(t.due.replace("T", " "))}</td></tr><tr><th>工程位置</th><td colspan="3">${E(
      groups(t)
        .map((x) => x[0] + " " + x[1].join("、"))
        .join("；"),
    )}</td></tr><tr><th>土地登記總面積（㎡）</th><td>${E(t.area)}</td><th>得標／施作廠商</th><td>${E(t.vendor)}</td></tr><tr><th>會勘情形、現況概述</th><td colspan="3" style="height:45px"></td></tr></table><h3>工作項目及範圍</h3><table><tr><th style="width:9%">項次</th><th>項目說明及範圍</th><th style="width:14%">計價單位</th><th style="width:14%">數量</th><th>備註</th></tr>${t.items.map((i, n) => `<tr><td>${n + 1}</td><td>${E(i.name)}</td><td>${E(i.unit)}</td><td>${E(i.quantity)}</td><td>${E(i.note)}</td></tr>`).join("") || '<tr><td colspan="5">原資料未填工作項目／數量，請核對補填。</td></tr>'}</table><p class="note">本單含原案全部地號；數量及面積為整案資料，未分攤至單一地號。</p><table><tr><th>領勘廠商</th><td>${E(s.guide)}</td><th>聯絡人</th><td>${E(s.contact)}</td></tr><tr><th>電話</th><td>${E(s.phone)}</td><th>傳真</th><td>${E(s.fax)}</td></tr><tr><th>機關／領勘廠商簽章</th><td style="height:65px"></td><th>施工廠商／人員簽章</th><td>${E(t.sourcePerson)}</td></tr></table><p class="note">本表由機關（或領勘廠商）及廠商人員至履約現場勘查評估後填寫，並由雙方簽章確認。履約期限與契約條款請於正式發文前核對。</p></section>`;
  }
  const css = `*{box-sizing:border-box}body{margin:0;color:black;background:white;font-family:Arial,'Microsoft JhengHei',sans-serif}.sheet{width:297mm;height:210mm;padding:17mm 20mm;break-after:page}.sheet:last-child{break-after:auto}.board{display:flex;flex-direction:column;gap:5mm}.main{flex:1;min-height:0;display:flex;flex-direction:column;gap:4mm;font-weight:700}.line{font-size:100px;line-height:1.18;overflow-wrap:anywhere;flex-shrink:0}.nowrap{white-space:nowrap}.line span{display:inline-block;white-space:nowrap}.footer{font-size:40px;line-height:1.24;display:flex;flex-direction:column;gap:2mm}.footer>div{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;white-space:nowrap}.order{font-size:13px;width:210mm;height:297mm;padding:14mm;page:order}.board{page:board}.order h1{font-size:23px;margin:8px 0}.order h2{margin:6px 0}.order p{font-size:12px;line-height:1.5;margin:7px 0}.order h3{font-size:15px;margin:12px 0}.order .note{font-size:10px}.order h1,.order h2{text-align:center}.order h2{font-size:19px}.order table{width:100%;border-collapse:collapse}.order th,.order td{border:1px solid black;padding:7px;overflow-wrap:anywhere}.sign{margin-top:25mm}.controls{position:fixed;right:10px;top:10px}.controls button{padding:10px}.order table{table-layout:fixed}@page board{size:A4 landscape;margin:0}@page order{size:A4 portrait;margin:0}@media print{.controls{display:none}}`;
  const fit = `function fit(){for(const b of document.querySelectorAll('.board')){const main=b.querySelector('.main'),footer=b.querySelector('.footer');let lo=10,hi=40;while(hi-lo>.1){let mid=(lo+hi)/2;footer.style.fontSize=mid+'px';if(footer.scrollWidth<=footer.clientWidth+.5)lo=mid;else hi=mid}footer.style.fontSize=lo+'px';lo=10;hi=100;while(hi-lo>.1){let mid=(lo+hi)/2;main.querySelectorAll('.line').forEach(x=>x.style.fontSize=mid+'px');if(main.scrollHeight<=main.clientHeight+.5&&main.scrollWidth<=main.clientWidth+.5)lo=mid;else hi=mid}main.querySelectorAll('.line').forEach(x=>x.style.fontSize=lo+'px')}}document.fonts.ready.then(fit);window.addEventListener('beforeprint',fit);fit();`;
  window.Documents = {
    settings: {
      guide: "全威測量工程有限公司",
      contact: "許書桓",
      agency: "財政部國有財產署南區分署屏東辦事處",
      project: "國有土地作業",
      tender: "",
      phone: "08-7364773",
      fax: "08-7363187",
      contract_deadline: "依契約規定",
      fence_terms: "依契約規定辦理。",
    },
    async show(tasks, kind, settings, download, previewWindow) {
      if (!tasks.length) throw Error("請先選取任務");
      if (kind === "board" && tasks.some((t) => !C.date(t.resultDate)))
        throw Error("請先補齊成果指定日期");
      const s = { ...this.settings, ...settings };
      if (download === "xlsx") {
        let wb = new ExcelJS.Workbook();
        for (let i = 0; i < tasks.length; i++) {
          const t = tasks[i],
            ws = wb.addWorksheet(
              (kind === "board" ? "白板" : "工作單") + (i + 1),
              {
                views: [{ showGridLines: false }],
                pageSetup: {
                  paperSize: 9,
                  orientation: kind === "board" ? "landscape" : "portrait",
                  fitToPage: true,
                  fitToWidth: 1,
                  fitToHeight: 1,
                  margins: {
                    left: 0.5,
                    right: 0.5,
                    top: 0.5,
                    bottom: 0.5,
                    header: 0,
                    footer: 0,
                  },
                },
              },
            );
          ws.columns = Array.from({ length: 12 }, () => ({ width: 10 }));
          if (kind === "board") {
            const g = groups(t),
              rows = [
                "日期： " + C.roc(t.resultDate),
                "地段： " + g.map((x) => x[0]).join("；"),
                "地號： " +
                  g
                    .map(
                      (x) => (g.length > 1 ? x[0] + " " : "") + x[1].join(" "),
                    )
                    .join("；"),
              ];
            rows.forEach((v, j) => {
              ws.mergeCells(j + 1, 1, j + 1, 12);
              let cell = ws.getCell(j + 1, 1);
              cell.value = v;
              cell.font = {
                name: "Microsoft JhengHei",
                size: Math.min(64, Math.max(18, Math.floor(700 / v.length))),
                bold: true,
              };
              cell.alignment = { wrapText: true, vertical: "middle" };
              ws.getRow(j + 1).height = j === 2 ? 165 : 95;
            });
            for (const [j, v] of [
              [4, "領勘廠商： " + s.guide + "　" + s.contact],
              [5, "施作廠商： " + t.vendor + "　" + t.sourcePerson],
            ]) {
              ws.mergeCells(j, 1, j, 12);
              ws.getCell(j, 1).value = v;
              ws.getCell(j, 1).font = { size: 25 };
              ws.getRow(j).height = 45;
            }
          } else {
            let rows = [
              [s.agency],
              [t.type === "圍籬" ? "開口契約訂單通知表" : "工作通知單"],
              [s.project],
              ["招標案號", s.tender],
              ["案件編號", t.caseNo || t.serial],
              ["工作類別", t.type],
              ["通知日期", t.notice],
              ["限定完成履約時間", s.contract_deadline],
              ["派工完成期限", t.due],
              [
                "工程位置",
                groups(t)
                  .map((x) => x[0] + " " + x[1].join("、"))
                  .join("；"),
              ],
              ["土地登記總面積（㎡）", t.area],
              ["得標／施作廠商", t.vendor],
              ["會勘情形、現況概述", ""],
              ["項次", "項目說明及範圍", "計價單位", "數量", "備註"],
              ...t.items.map((x, i) => [
                String(i + 1),
                x.name,
                x.unit,
                x.quantity,
                x.note,
              ]),
              ["整案資料", "本單含原案全部地號；數量及面積未分攤至單一地號。"],
              ["領勘廠商", s.guide],
              ["聯絡人", s.contact],
              ["電話", s.phone],
              ["傳真", s.fax],
              ["機關／領勘廠商簽章", ""],
              ["施工廠商／人員簽章", t.sourcePerson],
              [
                "契約條款",
                t.type === "圍籬" ? s.fence_terms : "依契約規定辦理。",
              ],
            ];
            for (let j = 0; j < rows.length; j++) {
              const vals = rows[j];
              let cols;
              if (vals.length === 1) {
                ws.mergeCells(j + 1, 1, j + 1, 12);
                cols = [1];
              } else if (vals.length === 2) {
                ws.mergeCells(j + 1, 1, j + 1, 3);
                ws.mergeCells(j + 1, 4, j + 1, 12);
                cols = [1, 4];
              } else {
                ws.mergeCells(j + 1, 2, j + 1, 5);
                ws.mergeCells(j + 1, 6, j + 1, 7);
                ws.mergeCells(j + 1, 8, j + 1, 9);
                ws.mergeCells(j + 1, 10, j + 1, 12);
                cols = [1, 2, 6, 8, 10];
              }
              cols.forEach((c, k) => {
                const cell = ws.getCell(j + 1, c);
                cell.value = String(vals[k] ?? "");
                cell.font = { size: 12 };
                cell.alignment = { wrapText: true, vertical: "middle" };
                cell.border = {
                  top: { style: "thin" },
                  bottom: { style: "thin" },
                  left: { style: "thin" },
                  right: { style: "thin" },
                };
              });
              ws.getRow(j + 1).height = j === 9 || j === 12 ? 55 : 27;
            }
          }
        }
        return new Blob([await wb.xlsx.writeBuffer()], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      }
      const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${kind === "board" ? "拍攝白板" : "工作單"}</title><style>${css}</style><body><div class="controls"><button onclick="print()">列印／另存 PDF</button></div>${tasks.map((t) => (kind === "board" ? board(t, s) : order(t, s))).join("")}<script>${fit}<\/script></body></html>`;
      const w = previewWindow || window.open("about:blank", "_blank");
      if (!w) throw Error("請允許開啟文件視窗後重試");
      w.document.open();
      w.document.write(html);
      w.document.close();
    },
  };
})();
