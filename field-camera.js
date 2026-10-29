/* Field-only camera. Admin keeps the original camera module and interface. */
(function () {
  "use strict";
  const C = PSCore,
    E = C.esc,
    $ = (s) => document.querySelector(s),
    dialog = $("#dialog");
  let active = null,
    stream = null,
    previewURL = null,
    galleryURLs = [],
    session = 0;
  const isVendor = (person) =>
    /^v[123]$/.test(person) || window.HubUser?.role === "vendor";
  const backend = () => !!window.HubAPI;
  const message = (text) => {
    if ($("#capture-status")) $("#capture-status").textContent = text;
  };
  function stopStream() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  function cleanup() {
    session++;
    stopStream();
    active = null;
    dialog.classList.remove("camera-mode");
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null;
  }
  function gps() {
    return new Promise((yes, no) => {
      if (!navigator.geolocation) return no(Error("此瀏覽器不支援定位"));
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const c = p.coords;
          if (
            ![c.latitude, c.longitude, c.accuracy].every(Number.isFinite) ||
            Math.abs(c.latitude) > 90 ||
            Math.abs(c.longitude) > 180 ||
            c.accuracy < 0
          )
            return no(Error("定位資料無效"));
          yes({
            latitude: c.latitude,
            longitude: c.longitude,
            accuracy: c.accuracy,
            timestamp: p.timestamp,
          });
        },
        (e) =>
          no(
            Error(
              "無法取得定位，照片尚未儲存。請允許定位後按「重試儲存」：" +
                e.message,
            ),
          ),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
      );
    });
  }
  function blobOf(canvas, quality = 0.95) {
    return new Promise((yes, no) =>
      canvas.toBlob(
        (b) => (b ? yes(b) : no(Error("照片處理失敗"))),
        "image/jpeg",
        quality,
      ),
    );
  }
  function fileName(task, id) {
    return (task.id + "_" + id).replace(/[^\w\u4e00-\u9fff-]/g, "_") + ".jpg";
  }
  async function saveImage(blob, name) {
    const file = new File([blob], name, { type: "image/jpeg" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "任務照片" });
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }
    saveDownload(blob, name);
  }
  // Store photo bytes rather than Blob objects: WebKit can reject Blob IDB writes
  // with an empty transaction error. Read adapters also accept all legacy photos.
  const localStore = window.Store;
  const originalPut = localStore.put.bind(localStore),
    originalGet = localStore.get.bind(localStore),
    originalAll = localStore.all.bind(localStore),
    originalPhotos = localStore.photosFor.bind(localStore);
  const revive = (row) => {
    if (!row) return row;
    if (row._photoBytes) {
      row.blob = new Blob([row._photoBytes], {
        type: row._photoType || "image/jpeg",
      });
      delete row._photoBytes;
      delete row._photoType;
    }
    if (row._originalBytes) {
      row.original = new Blob([row._originalBytes], {
        type: row._originalType || "image/jpeg",
      });
      delete row._originalBytes;
      delete row._originalType;
    }
    return row;
  };
  localStore.put = async (store, value) => {
    if (store !== "photos") return originalPut(store, value);
    const row = { ...value };
    if (row.blob instanceof Blob) {
      row._photoBytes = await row.blob.arrayBuffer();
      row._photoType = row.blob.type;
      delete row.blob;
    }
    if (row.original instanceof Blob) {
      row._originalBytes = await row.original.arrayBuffer();
      row._originalType = row.original.type;
      delete row.original;
    }
    return originalPut(store, row);
  };
  localStore.get = async (store, id) => {
    const row = await originalGet(store, id);
    return store === "photos" ? revive(row) : row;
  };
  localStore.all = async (store) => {
    const rows = await originalAll(store);
    return store === "photos" ? rows.map(revive) : rows;
  };
  localStore.photosFor = async (...args) =>
    (await originalPhotos(...args)).map(revive);

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
    x.textAlign = "center";
    lines.forEach((t, i) =>
      x.fillText(t, canvas.width / 2, canvas.height - box + pad + i * line),
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

  function guide() {
    const media = $("#camera-media"),
      frame = $("#camera-guide");
    if (!media || !frame) return;
    const r = media.getBoundingClientRect(),
      w = Math.min(r.width, (r.height * 4) / 3);
    frame.style.width = w + "px";
    frame.style.height = (w * 3) / 4 + "px";
  }
  async function startVideo(token) {
    stopStream();
    try {
      const obtained = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
          aspectRatio: { ideal: 4 / 3 },
        },
        audio: false,
      });
      if (!active || token !== session) {
        obtained.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = obtained;
      const video = $("#video");
      video.srcObject = stream;
      await video.play();
      if (!active || token !== session) return;
      $("#shutter").disabled = false;
      $("#camera-restart").hidden = true;
      message("框內為橫式照片；橫拿手機可放大取景。");
      guide();
    } catch (e) {
      if (token === session && active) {
        message("無法開啟相機。請允許瀏覽器使用相機後重試：" + e.message);
        $("#camera-restart").hidden = false;
      }
    }
  }
  function showReview(blob, saved) {
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = URL.createObjectURL(blob);
    const img = $("#capture-preview");
    img.src = previewURL;
    img.hidden = false;
    img.onclick = () => {
      if (active?.record)
        viewImage(active.record.blob, fileName(active.task, active.record.id));
    };
    $("#video").hidden = true;
    $("#camera-guide").hidden = true;
    $("#shutter").hidden = true;
    $("#capture-again").hidden = false;
    $("#capture-save").hidden = !saved;
    $("#capture-retry-save").hidden = saved;
    $("#capture-mode").textContent = saved
      ? "已儲存的任務照片"
      : "照片尚未儲存";
  }
  async function savePending() {
    const current = active,
      token = session;
    if (!current?.pending || current.busy) return;
    current.busy = true;
    $("#capture-retry-save").disabled = true;
    $("#capture-again").disabled = true;
    message("正在取得定位並儲存照片…");
    try {
      const location = await gps();
      if (!active || session !== token) return;
      message("正在製作並保存含日期與座標的照片…");
      const pending = current.pending,
        blob = await jpeg(
          pending.frame,
          current.task,
          location,
          pending.capturedAt,
        );
      if (!active || session !== token) return;
      const record = {
        id: crypto.randomUUID(),
        person: current.person,
        role: isVendor(current.person) ? "vendor" : "worker",
        taskId: current.task.id,
        taskSnapshot: structuredClone(current.task),
        capturedAt: pending.capturedAt,
        timeSource: "web-shutter",
        gps: location,
        original: pending.original,
        blob,
        savedAt: new Date().toISOString(),
      };
      if (backend()) await Store.savePhoto(record);
      else await Store.put("photos", record);
      if (!active || session !== token) return;
      current.record = record;
      current.pending = null;
      showReview(blob, true);
      message(
        backend()
          ? "已儲存在手機，正在回傳主機。"
          : "照片已儲存在此裝置。按「儲存照片」可存到手機或分享。",
      );
      if (backend()) document.dispatchEvent(new Event("hub-photo-saved"));
    } catch (e) {
      if (active && session === token) {
        message(e?.message || "照片尚未儲存，請確認裝置空間後重試");
        $("#capture-retry-save").hidden = false;
      }
    } finally {
      if (active && session === token) {
        current.busy = false;
        $("#capture-retry-save").disabled = false;
        $("#capture-again").disabled = false;
      }
    }
  }
  async function capture() {
    const current = active,
      token = session,
      video = $("#video");
    if (!current || current.busy || !video.videoWidth) return;
    $("#shutter").disabled = true;
    try {
      const capturedAt = new Date().toISOString(),
        raw = document.createElement("canvas");
      raw.width = video.videoWidth;
      raw.height = video.videoHeight;
      raw.getContext("2d").drawImage(video, 0, 0);
      // Match the visible cover crop before applying the horizontal 4:3 guide crop.
      const rect = $("#camera-media").getBoundingClientRect(),
        aspect = rect.width / rect.height;
      const cropW = Math.min(raw.width, raw.height * aspect),
        cropH = cropW / aspect,
        frame = document.createElement("canvas");
      frame.width = Math.max(1, Math.round(cropW));
      frame.height = Math.max(1, Math.round(cropH));
      frame
        .getContext("2d")
        .drawImage(
          raw,
          (raw.width - cropW) / 2,
          (raw.height - cropH) / 2,
          cropW,
          cropH,
          0,
          0,
          frame.width,
          frame.height,
        );
      const original = await blobOf(raw, 0.98),
        frozen = await blobOf(frame);
      if (!active || session !== token) return;
      current.pending = { original, frame, capturedAt };
      current.record = null;
      stopStream();
      showReview(frozen, false);
      await savePending();
    } catch (e) {
      message(e?.message || "照片尚未儲存，請確認裝置空間後重試");
      if ($("#shutter")) $("#shutter").disabled = false;
    }
  }
  function leave() {
    if (active?.pending && !confirm("這張照片尚未儲存，確定離開？")) return;
    const back = active?.back;
    cleanup();
    if (back) back();
    else dialog.close();
  }
  async function openCamera(task, person, back) {
    if (!C.date(task.resultDate)) throw Error("請先由管理者補齊成果指定日期");
    cleanup();
    const token = session;
    active = {
      task: structuredClone(task),
      person,
      back,
      pending: null,
      record: null,
      busy: false,
    };
    dialog.classList.add("camera-mode");
    $("#dialog-title").textContent = "現場拍照";
    $("#dialog-body").innerHTML =
      `<section class="field-camera-shell"><header class="field-camera-header"><button id="camera-back">返回任務</button><div><strong id="capture-mode">現場拍照</strong><small>${E(task.parcels.map((p) => p.section + " " + p.lot).join("、"))}</small></div></header><div id="camera-media" class="field-camera-media"><video id="video" autoplay playsinline muted></video><div id="camera-guide" aria-hidden="true"><span>橫式照片範圍</span></div><img id="capture-preview" alt="本次拍攝的照片" hidden></div><footer class="field-camera-controls"><p id="capture-status" role="status" aria-live="polite">請允許相機及定位。</p><div class="field-camera-buttons"><button id="shutter" disabled>拍照</button><button id="camera-restart" hidden>重新開啟相機</button><button id="capture-save" hidden>儲存照片</button><button id="capture-again" hidden>繼續拍下一張</button><button id="capture-retry-save" hidden>重試儲存</button>${backend() ? '<button id="capture-retry">重試回傳</button>' : ""}</div></footer></section>`;
    if (!dialog.open) dialog.showModal();
    $("#camera-back").onclick = leave;
    $("#shutter").onclick = capture;
    $("#camera-restart").onclick = () => startVideo(token);
    $("#capture-save").onclick = () => {
      if (active?.record)
        saveImage(active.record.blob, fileName(task, active.record.id)).catch(
          (e) => message(e?.message || "照片尚未儲存，請確認裝置空間後重試"),
        );
    };
    $("#capture-retry-save").onclick = savePending;
    $("#capture-again").onclick = () => {
      if (active?.pending && !confirm("目前照片尚未儲存，確定重新拍攝？"))
        return;
      active.pending = null;
      active.record = null;
      $("#capture-preview").hidden = true;
      $("#video").hidden = false;
      $("#camera-guide").hidden = false;
      for (const id of [
        "#capture-save",
        "#capture-again",
        "#capture-retry-save",
      ])
        $(id).hidden = true;
      $("#shutter").hidden = false;
      $("#shutter").disabled = true;
      $("#capture-mode").textContent = "現場拍照";
      startVideo(token);
    };
    if ($("#capture-retry"))
      $("#capture-retry").onclick = () =>
        HubSync.sync().catch((e) =>
          message(e?.message || "照片尚未儲存，請確認裝置空間後重試"),
        );
    await startVideo(token);
  }
  async function viewImage(source, name = "任務照片.jpg") {
    const viewer = document.createElement("dialog");
    viewer.className = "field-image-dialog";
    const owned = source instanceof Blob,
      url = owned ? URL.createObjectURL(source) : source;
    viewer.innerHTML = `<div class="field-image-shell"><button class="field-image-close">返回</button><img src="${E(url)}" alt="含日期、時間及GPS的任務照片"><button class="field-image-save">儲存照片</button><p class="field-image-status" role="status"></p></div>`;
    document.body.append(viewer);
    viewer.showModal();
    viewer.querySelector(".field-image-close").onclick = () => viewer.close();
    viewer.querySelector(".field-image-save").onclick = async () => {
      try {
        let blob = source;
        if (!owned) {
          const response = await fetch(source);
          if (!response.ok) throw Error("無法讀取照片，請確認網路");
          blob = await response.blob();
        }
        await saveImage(blob, name);
      } catch (e) {
        viewer.querySelector(".field-image-status").textContent = e.message;
      }
    };
    viewer.addEventListener(
      "close",
      () => {
        if (owned) URL.revokeObjectURL(url);
        viewer.remove();
      },
      { once: true },
    );
  }
  async function gallery(task, person, el) {
    galleryURLs.forEach((url) => URL.revokeObjectURL(url));
    galleryURLs = [];
    const rows = (await Store.photosFor(person, task.id)).sort((a, b) =>
      a.savedAt.localeCompare(b.savedAt),
    );
    if (!el.isConnected) return;
    el.innerHTML = `<h3>任務照片${isVendor(person) ? "" : " " + rows.length + " 張"}</h3><p>${backend() ? "照片先保存在手機，再回傳主機。" : "照片保存在此裝置；請儲存到手機或分享備份。"}</p><div class="photos">${
      rows
        .map((p) => {
          const url = URL.createObjectURL(p.blob);
          galleryURLs.push(url);
          return `<article class="photo"><button class="field-photo-thumb" data-photo-view="${p.id}" aria-label="查看照片"><img src="${url}" alt="含日期時間與座標的照片"></button><p>${E(new Date(p.capturedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }))}${backend() ? " · " + (p.uploaded ? "已回傳" : "待回傳") : ""}</p><button data-photo-save="${p.id}">儲存照片</button><button data-photo-delete="${p.id}">刪除此裝置照片</button></article>`;
        })
        .join("") || "<p>尚未拍攝照片</p>"
    }</div>`;
    el.querySelectorAll("[data-photo-view]").forEach(
      (b) =>
        (b.onclick = () => {
          const p = rows.find((p) => p.id === b.dataset.photoView);
          viewImage(p.blob, fileName(task, p.id));
        }),
    );
    el.querySelectorAll("[data-photo-save]").forEach(
      (b) =>
        (b.onclick = async () => {
          const p = rows.find((p) => p.id === b.dataset.photoSave);
          try {
            await saveImage(p.blob, fileName(task, p.id));
          } catch (e) {
            alert(e.message);
          }
        }),
    );
    el.querySelectorAll("[data-photo-delete]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm("刪除此裝置的照片？請先確認已儲存或回傳。")) return;
          await Store.del("photos", b.dataset.photoDelete);
          await gallery(task, person, el);
        }),
    );
  }
  dialog.addEventListener("cancel", (e) => {
    if (active?.pending) {
      e.preventDefault();
      leave();
    }
  });
  dialog.addEventListener("close", cleanup);
  addEventListener("resize", guide);
  addEventListener("pagehide", cleanup);
  window.FieldCamera = { open: openCamera, gallery, stop: cleanup, viewImage };
})();
