(function () {
  const C = PSCore,
    E = C.esc;
  let active = null,
    stream = null,
    objects = [];
  const $ = (s) => document.querySelector(s);
  const getGPS = () =>
    new Promise((yes, no) => {
      if (!navigator.geolocation) return no(Error("此瀏覽器不支援定位"));
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const c = p.coords;
          if (![c.longitude, c.latitude, c.accuracy].every(Number.isFinite))
            return no(Error("定位資料無效"));
          yes({
            latitude: c.latitude,
            longitude: c.longitude,
            accuracy: c.accuracy,
            timestamp: p.timestamp,
          });
        },
        (e) => no(Error("無法取得定位，請允許GPS並重試：" + e.message)),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
      );
    });
  async function jpeg(image, task, gps, capturedAt) {
    const canvas = document.createElement("canvas"),
      width = image.videoWidth || image.naturalWidth || image.width,
      height = image.videoHeight || image.naturalHeight || image.height;
    if (!width || !height) throw Error("無法讀取照片尺寸");
    const cropWidth = Math.min(width, (height * 4) / 3),
      cropHeight = (cropWidth * 3) / 4,
      scale = Math.min(1, 4096 / cropWidth);
    canvas.width = Math.round(cropWidth * scale);
    canvas.height = Math.round((canvas.width * 3) / 4);
    const x = canvas.getContext("2d");
    x.drawImage(
      image,
      (width - cropWidth) / 2,
      (height - cropHeight) / 2,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Taipei",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(capturedAt));
    const lines = [
      C.roc(task.resultDate) + " " + time,
      `GPS ${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}  ±${Math.round(gps.accuracy)}m`,
    ];
    let font = Math.max(10, Math.round(canvas.width * 0.035));
    x.font = `bold ${font}px Arial`;
    while (
      lines.some((t) => x.measureText(t).width > canvas.width * 0.92) &&
      font > 5
    )
      x.font = `bold ${--font}px Arial`;
    let line = font * 1.4,
      pad = Math.max(4, canvas.width * 0.025),
      box = line * 2 + pad * 2;
    x.shadowColor = "rgba(0,0,0,.9)";
    x.shadowBlur = Math.max(2, font * 0.16);
    x.shadowOffsetX = Math.max(1, font * 0.06);
    x.shadowOffsetY = Math.max(1, font * 0.08);
    x.fillStyle = "white";
    x.textBaseline = "top";
    lines.forEach((t, i) =>
      x.fillText(t, pad, canvas.height - box + pad + i * line),
    );
    const blob = await new Promise((yes, no) =>
      canvas.toBlob(
        (b) => (b ? yes(b) : no(Error("照片處理失敗"))),
        "image/jpeg",
        0.93,
      ),
    );
    return blob;
  }
  function stop() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  async function store(original, image, capturedAt, timeSource) {
    let a = active;
    if (!a) throw Error("拍照已取消");
    const gps = await getGPS();
    if (active !== a) throw Error("拍照已取消");
    const blob = await jpeg(image, a.task, gps, capturedAt);
    const record = {
      id: crypto.randomUUID(),
      person: a.person,
      taskId: a.task.id,
      taskSnapshot: structuredClone(a.task),
      capturedAt,
      timeSource,
      gps,
      original,
      blob,
      savedAt: new Date().toISOString(),
    };
    await Store.put("photos", record);
    if (active === a) {
      $("#capture-status").textContent = "已暫存於此裝置，請下載備份。";
      await count();
    }
  }
  async function count() {
    const a = active;
    if (!a) return;
    const list = await Store.photosFor(a.person, a.task.id);
    $("#capture-count").textContent =
      `本機照片 ${list.length} 張 · 建議至少 2 張；不回傳、不標記完成。`;
  }
  window.FieldCamera = {
    async open(task, person, back) {
      if (!C.date(task.resultDate)) throw Error("請先由管理者補齊成果指定日期");
      stop();
      active = { task: structuredClone(task), person, back };
      $("#dialog-title").textContent = "現場拍照";
      $("#dialog-body").innerHTML =
        `<p>${E(task.parcels.map((p) => p.district + p.section + " " + p.lot).join("；"))}</p><video id="video" class="camera" autoplay playsinline muted></video><p id="capture-count"></p><p id="capture-status">請允許相機及GPS。照片日期採 ${E(C.roc(task.resultDate))}。</p><div class="toolbar"><button id="shutter" class="primary">拍攝並暫存</button><button id="native">手機原生相機</button><button id="camera-back">返回任務</button></div><input id="native-file" type="file" accept="image/jpeg,image/png,image/heic" capture="environment" hidden><p class="muted">預設橫式 4:3 中央取景，原圖另存。原生相機照片須保留 EXIF 拍攝時間；無法讀取時請使用網頁相機。</p>`;
      await count();
      const wrap = (fn) => async () => {
        const b = $("#shutter");
        try {
          b.disabled = true;
          await fn();
        } catch (e) {
          if ($("#capture-status"))
            $("#capture-status").textContent = e.message;
        } finally {
          if ($("#shutter")) $("#shutter").disabled = false;
        }
      };
      $("#shutter").onclick = wrap(async () => {
        if (!stream || !$("#video").videoWidth)
          throw Error("相機尚未就緒，請允許相機或改用原生相機");
        const capturedAt = new Date().toISOString(),
          v = $("#video"),
          c = document.createElement("canvas");
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext("2d").drawImage(v, 0, 0);
        const original = await new Promise((yes) =>
          c.toBlob(yes, "image/jpeg", 0.98),
        );
        if (!original) throw Error("拍攝失敗");
        await store(original, c, capturedAt, "web-shutter");
      });
      $("#native").onclick = () => $("#native-file").click();
      $("#native-file").onchange = wrap(async () => {
        const f = $("#native-file").files[0];
        if (!f) return;
        if (f.size > 30 * 1024 * 1024) throw Error("照片超過30MB");
        const meta = await exifr.parse(f, {
          pick: ["DateTimeOriginal"],
          reviveValues: false,
        });
        const raw = String(meta?.DateTimeOriginal || "");
        const m = raw.match(
          /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
        );
        if (!m) throw Error("照片沒有可讀取的EXIF拍攝時間；請使用網頁相機");
        const capturedAt = new Date(
          `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+08:00`,
        ).toISOString();
        const img = new Image(),
          u = URL.createObjectURL(f);
        try {
          await new Promise((yes, no) => {
            img.onload = yes;
            img.onerror = () =>
              no(Error("無法解碼此照片，請使用JPEG或網頁相機"));
            img.src = u;
          });
          await store(f, img, capturedAt, "EXIF-Taiwan");
        } finally {
          URL.revokeObjectURL(u);
        }
      });
      $("#camera-back").onclick = () => {
        stop();
        active = null;
        back();
      };
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
            aspectRatio: { ideal: 4 / 3 },
          },
          audio: false,
        });
        if (!active) {
          stop();
          return;
        }
        $("#video").srcObject = stream;
        await $("#video").play();
      } catch (e) {
        $("#capture-status").textContent =
          "無法開啟網頁相機，可重開頁面授權或改用原生相機：" + e.message;
      }
    },
    async gallery(task, person, el) {
      for (const u of objects) URL.revokeObjectURL(u);
      objects = [];
      let rows = (await Store.photosFor(person, task.id)).sort((a, b) =>
        a.savedAt.localeCompare(b.savedAt),
      );
      el.innerHTML = `<h3>本機照片 ${rows.length} 張</h3><p>建議至少 2 張；只存於這台裝置，請下載備份。</p>${rows.length ? '<button id="photos-zip">全部下載 ZIP</button>' : ""}<div class="photos">${rows
        .map((p) => {
          let u = URL.createObjectURL(p.blob);
          objects.push(u);
          return `<div class="photo"><img src="${u}" alt="含日期時間與座標的照片"><p>${E(new Date(p.capturedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }))}</p><button data-photo-download="${p.id}">下載浮水印</button><button data-photo-original="${p.id}">原始照片</button><button data-photo-delete="${p.id}">刪除</button></div>`;
        })
        .join("")}</div>`;
      const name = (p) =>
        task.id.replace(/[^\w\u4e00-\u9fff-]/g, "_") + "_" + p.id + ".jpg";
      el.querySelectorAll("[data-photo-download]").forEach(
        (b) =>
          (b.onclick = () =>
            saveDownload(
              rows.find((p) => p.id === b.dataset.photoDownload).blob,
              name(rows.find((p) => p.id === b.dataset.photoDownload)),
            )),
      );
      el.querySelectorAll("[data-photo-original]").forEach(
        (b) =>
          (b.onclick = () => {
            const p = rows.find((p) => p.id === b.dataset.photoOriginal);
            saveDownload(
              p.original,
              name(p).replace(
                ".jpg",
                "_原始." +
                  (p.original.type === "image/png"
                    ? "png"
                    : p.original.type === "image/heic"
                      ? "heic"
                      : "jpg"),
              ),
            );
          }),
      );
      el.querySelectorAll("[data-photo-delete]").forEach(
        (b) =>
          (b.onclick = async () => {
            if (!confirm("刪除這張本機照片？請先確認已下載備份。")) return;
            await Store.del("photos", b.dataset.photoDelete);
            this.gallery(task, person, el);
          }),
      );
      if (rows.length)
        $("#photos-zip").onclick = async () => {
          try {
            let fs = {};
            for (const p of rows)
              fs[name(p)] = new Uint8Array(await p.blob.arrayBuffer());
            saveDownload(
              new Blob([fflate.zipSync(fs, { level: 0 })], {
                type: "application/zip",
              }),
              "任務照片.zip",
            );
          } catch (e) {
            alert("下載失敗：" + e.message);
          }
        };
    },
    stop,
  };
  document.querySelector("#dialog").addEventListener("close", () => {
    active = null;
    stop();
  });
})();
