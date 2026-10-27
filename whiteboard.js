/* Draw text directly: PDF and PNG share the same complete, font-independent image. */
(function () {
  const C = PSCore;
  const W = 2400,
    H = 1697,
    LEFT = 162,
    TOP = 137,
    GAP = 34;
  const CONTENT = W - LEFT * 2;
  function rows(task, settings) {
    const groups = new Map();
    for (const p of task.parcels) {
      const key = p.district + p.section;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p.lot);
    }
    return {
      date: "日期： " + C.roc(task.resultDate),
      section: "地段： " + [...groups.keys()].join("；"),
      tokens: [
        "地號：",
        ...[...groups].flatMap(([name, lots]) =>
          groups.size === 1 ? lots : [name, ...lots],
        ),
      ],
      footer: [
        ["領勘廠商：", settings.guide || "", settings.contact || ""],
        ["施作廠商：", task.vendor || "", task.sourcePerson || ""],
      ],
    };
  }
  function wrap(ctx, tokens) {
    const lines = [];
    let line = "";
    for (const token of tokens) {
      if (ctx.measureText(token).width > CONTENT) return null;
      const next = line ? line + " " + token : token;
      if (line && ctx.measureText(next).width > CONTENT) {
        lines.push(line);
        line = token;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }
  function draw(task, settings) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("無法產生白板圖片，請重新開啟瀏覽器後重試");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#000";
    ctx.textBaseline = "top";
    const data = rows(task, settings);
    let footerSize = 85;
    for (; footerSize >= 12; footerSize--) {
      ctx.font = `${footerSize}px Arial, "Microsoft JhengHei", sans-serif`;
      if (
        data.footer.every(
          (r) =>
            r.reduce((n, v) => n + ctx.measureText(v).width, 0) + 50 <= CONTENT,
        )
      )
        break;
    }
    if (footerSize < 12) throw Error("廠商／人員文字過長，請先核對白板資料");
    const footerY = H - TOP - footerSize * 2.65,
      mainBottom = footerY - 48;
    let chosen, lines;
    for (let size = 214; size >= 12; size--) {
      ctx.font = `700 ${size}px Arial, "Microsoft JhengHei", sans-serif`;
      const lots = wrap(ctx, data.tokens);
      if (
        lots &&
        ctx.measureText(data.date).width <= CONTENT &&
        ctx.measureText(data.section).width <= CONTENT &&
        TOP + (lots.length + 2) * size * 1.18 + GAP * 2 <= mainBottom
      ) {
        chosen = size;
        lines = lots;
        break;
      }
    }
    if (!chosen) throw Error("地段地號過長，無法完整排入白板，請核對原案資料");
    let y = TOP;
    for (const line of [data.date, data.section]) {
      ctx.fillText(line, LEFT, y);
      y += chosen * 1.18 + GAP;
    }
    for (const line of lines) {
      ctx.fillText(line, LEFT, y);
      y += chosen * 1.18;
    }
    ctx.font = `${footerSize}px Arial, "Microsoft JhengHei", sans-serif`;
    data.footer.forEach((r, i) => {
      const y = footerY + i * footerSize * 1.4,
        labelWidth = ctx.measureText(r[0]).width;
      ctx.fillText(r[0], LEFT, y);
      ctx.fillText(r[1], LEFT + labelWidth + 24, y);
      ctx.fillText(r[2], W - LEFT - ctx.measureText(r[2]).width, y);
    });
    return canvas;
  }
  window.Whiteboards = {
    async generate(tasks, settings, progress) {
      if (!tasks.length || tasks.some((t) => !C.date(t.resultDate)))
        throw Error("請先補齊成果指定日期");
      if (document.fonts?.ready) await document.fonts.ready;
      if (!window.jspdf?.jsPDF) throw Error("PDF 元件未載入，請重新整理後重試");
      const pdf = new jspdf.jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      const images = [];
      for (let i = 0; i < tasks.length; i++) {
        progress?.(i + 1, tasks.length);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const canvas = draw(tasks[i], settings);
        const blob = await new Promise((yes, no) =>
          canvas.toBlob(
            (b) => (b ? yes(b) : no(Error("白板圖片產生失敗"))),
            "image/png",
          ),
        );
        if (i) pdf.addPage("a4", "landscape");
        pdf.addImage(canvas, "PNG", 0, 0, 297, 210, undefined, "FAST");
        const label = String(tasks[i].serial || i + 1).replace(
          /[\\/:*?"<>|]/g,
          "_",
        );
        images.push({ blob, name: `白板_${i + 1}_${label}.png` });
        canvas.width = 1;
        canvas.height = 1;
      }
      return { pdf: pdf.output("blob"), images };
    },
  };
})();
