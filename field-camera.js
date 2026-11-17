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
    session = 0,
    liveTimer = null,
    liveWatch = null,
    liveResize = null;
  const isVendor = (person) =>
    /^v[123]$/.test(person) || window.HubUser?.role === "vendor";
  const backend = () => !!window.HubAPI;
  const message = (text, quiet = false) => {
    const status = $("#capture-status");
    if (status) {
      status.textContent = text;
      status.classList.toggle("camera-quiet", quiet);
    }
  };
  function stopStream() {
    clearInterval(liveTimer);
    liveTimer = null;
    if (liveWatch !== null) navigator.geolocation?.clearWatch?.(liveWatch);
    liveWatch = null;
    liveResize?.disconnect();
    liveResize = null;
    if ($("#live-watermark")) $("#live-watermark").hidden = true;
    if (active) active.drawLive = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  function cleanup() {
    session++;
    stopStream();
    active?.pending?.frame?.close?.();
    active = null;
    dialog.classList.remove("camera-mode");
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null;
  }
  function gps(current = active) {
    const cached = current?.liveGPS;
    const age = cached ? Date.now() - cached.timestamp : Infinity;
    if (cached && Number.isFinite(age) && age >= 0 && age <= 5000)
      return Promise.resolve({ ...cached });
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
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
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
  async function photoBytes(value) {
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
    return row;
  }
  localStore.put = async (store, value) =>
    originalPut(store, store === "photos" ? await photoBytes(value) : value);
  // Keep upload acknowledgements from recreating locally deleted photos.
  localStore.updatePhotoIfPresent = async (record) => {
    const row = await photoBytes(record),
      db = await localStore.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("photos", "readwrite"),
        photos = tx.objectStore("photos");
      const request = photos.get(row.id);
      request.onsuccess = () => {
        if (request.result) photos.put(row);
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || Error("照片更新取消"));
    });
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

  function paintStamp(x, width, height, task, gps, capturedAt) {
    x.save();
    if (height > width) {
      // Portrait: put the virtual landscape bottom along the photo's left long edge.
      x.translate(width, 0);
      x.rotate(Math.PI / 2);
      [width, height] = [height, width];
    }
    paintLongEdgeStamp(x, width, height, task, gps, capturedAt);
    x.restore();
  }
  function paintLongEdgeStamp(x, width, height, task, gps, capturedAt) {
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Taipei",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(capturedAt));
    const lines = [
      C.roc(task.resultDate) + " " + time,
      gps
        ? `GPS ${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}  ±${Math.round(gps.accuracy)}m`
        : "GPS 尚未取得定位",
    ];
    let font = Math.max(10, Math.round(width * 0.035));
    x.font = `bold ${font}px Arial`;
    while (lines.some((t) => x.measureText(t).width > width * 0.92) && font > 5)
      x.font = `bold ${--font}px Arial`;
    let line = font * 1.4,
      pad = Math.max(4, width * 0.025),
      box = line * 2 + pad * 2;
    const matrix = x.getTransform(),
      effectScale = Math.hypot(matrix.a, matrix.b);
    x.shadowColor = "rgba(0,0,0,.9)";
    x.shadowBlur = Math.max(2, font * 0.16) * effectScale;
    x.shadowOffsetX = Math.max(1, font * 0.06) * effectScale;
    x.shadowOffsetY = Math.max(1, font * 0.08) * effectScale;
    x.fillStyle = "white";
    x.textBaseline = "top";
    x.textAlign = "center";
    lines.forEach((t, i) =>
      x.fillText(t, width / 2, height - box + pad + i * line),
    );
  }
  async function jpeg(image, task, gps, capturedAt) {
    const canvas = document.createElement("canvas"),
      width = image.videoWidth || image.naturalWidth || image.width,
      height = image.videoHeight || image.naturalHeight || image.height;
    if (!width || !height) throw Error("無法讀取照片尺寸");
    canvas.width = width;
    canvas.height = height;
    const x = canvas.getContext("2d");
    x.drawImage(image, 0, 0);
    paintStamp(x, width, height, task, gps, capturedAt);
    const blob = await new Promise((yes, no) =>
      canvas.toBlob(
        (b) => (b ? yes(b) : no(Error("照片處理失敗"))),
        "image/jpeg",
        0.93,
      ),
    );
    return blob;
  }

  function startLivePreview(token) {
    const current = active,
      video = $("#video"),
      canvas = $("#live-watermark"),
      media = $("#camera-media");
    canvas.hidden = false;
    function draw() {
      if (
        !active ||
        token !== session ||
        current.phase !== "live" ||
        video.hidden ||
        !video.videoWidth
      )
        return;
      const width = video.videoWidth,
        height = video.videoHeight,
        rect = media.getBoundingClientRect(),
        scale = Math.min(rect.width / width, rect.height / height),
        dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!scale) return;
      const w = width * scale,
        h = height * scale;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      const cw = Math.max(1, Math.round(w * dpr)),
        ch = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== cw) canvas.width = cw;
      if (canvas.height !== ch) canvas.height = ch;
      const x = canvas.getContext("2d");
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, canvas.width, canvas.height);
      x.scale(canvas.width / width, canvas.height / height);
      const location =
        current.liveGPS && Date.now() - current.liveGPS.timestamp <= 60000
          ? current.liveGPS
          : null;
      paintStamp(
        x,
        width,
        height,
        current.task,
        location,
        new Date().toISOString(),
      );
    }
    const onLocation = (p) => {
      if (!active || token !== session) return;
      const c = p.coords;
      if (
        ![c.latitude, c.longitude, c.accuracy].every(Number.isFinite) ||
        Math.abs(c.latitude) > 90 ||
        Math.abs(c.longitude) > 180 ||
        c.accuracy < 0
      )
        return;
      current.liveGPS = {
        latitude: c.latitude,
        longitude: c.longitude,
        accuracy: c.accuracy,
        timestamp: p.timestamp || Date.now(),
      };
      draw();
    };
    const onError = () => {
      if (active && token === session) {
        current.liveGPS = null;
        draw();
      }
    };
    try {
      if (navigator.geolocation?.watchPosition)
        liveWatch = navigator.geolocation.watchPosition(onLocation, onError, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 20000,
        });
      else
        navigator.geolocation?.getCurrentPosition(onLocation, onError, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 20000,
        });
    } catch (_) {
      onError();
    }
    liveResize = new ResizeObserver(draw);
    liveResize.observe(media);
    video.onresize = draw;
    active.drawLive = draw;
    liveTimer = setInterval(draw, 1000);
    draw();
  }
  async function decodePhoto(blob) {
    if (window.createImageBitmap) {
      try {
        return await createImageBitmap(blob, {
          imageOrientation: "from-image",
        });
      } catch (_) {}
    }
    return new Promise((resolve, reject) => {
      const image = new Image(),
        url = URL.createObjectURL(blob);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(Error("無法讀取相機照片"));
      };
      image.src = url;
    });
  }
  async function fullFrame(video) {
    const track = stream?.getVideoTracks?.()[0];
    if (track && window.ImageCapture) {
      let frame;
      try {
        const original = await new ImageCapture(track).takePhoto();
        frame = await decodePhoto(original);
        if (frame.width || frame.naturalWidth) return { original, frame };
      } catch (_) {
        frame?.close?.();
      }
    }
    const frame = document.createElement("canvas");
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    frame.getContext("2d").drawImage(video, 0, 0);
    return { original: backend() ? await blobOf(frame, 0.98) : null, frame };
  }
  // Real hardware zoom or an explicitly identified ultra-wide lens; never fake 0.5× by cropping.
  async function cameraTools(token) {
    const currentStream = stream,
      track = currentStream?.getVideoTracks?.()[0];
    let caps = {},
      settings = {},
      cameras = [];
    try {
      caps = track?.getCapabilities?.() || {};
      settings = track?.getSettings?.() || {};
    } catch (_) {}
    try {
      cameras = (
        (await navigator.mediaDevices.enumerateDevices?.()) || []
      ).filter(
        (d) =>
          d.kind === "videoinput" &&
          d.deviceId &&
          !/front|user|facetime|前置|前鏡/i.test(d.label),
      );
    } catch (_) {}
    if (!active || token !== session || stream !== currentStream) return;
    const tools = $("#camera-optics"),
      buttons = $("#camera-zoom-buttons"),
      note = $("#camera-optics-note"),
      select = $("#camera-lens");
    const ultra = (d) =>
      /ultra[\s-]*wide|超廣角|超广角|超広角|0[.,]5\s*[x×]/i.test(
        d?.label || "",
      );
    const current = cameras.find((d) => d.deviceId === settings.deviceId);
    const wide = cameras.find(ultra);
    const main = cameras.find(
      (d) =>
        !ultra(d) &&
        !/tele|望遠|长焦|長焦/i.test(d.label) &&
        /back|rear|environment|後置|后置|後鏡|主鏡|wide/i.test(d.label),
    );
    const range = caps.zoom;
    const hasZoom =
      !!track?.applyConstraints &&
      Number.isFinite(range?.min) &&
      Number.isFinite(range?.max) &&
      range.min > 0 &&
      range.max >= range.min;
    const base = hasZoom && range.min < 1 ? 1 : ultra(current) ? 0.5 : 1;
    const zoom = Number.isFinite(settings.zoom) ? settings.zoom : 1;
    const actual = base * zoom;
    const nativeValue = (value) => {
      const raw = value / base;
      if (!hasZoom || raw < range.min || raw > range.max) return null;
      const snapped =
        Number.isFinite(range.step) && range.step > 0
          ? range.min + Math.round((raw - range.min) / range.step) * range.step
          : raw;
      return Math.abs(snapped - raw) < 0.001 ? raw : null;
    };
    const targetLens = (value) =>
      value === 0.5 && wide && !ultra(current)
        ? wide
        : value === 1 && main && ultra(current)
          ? main
          : null;
    buttons.replaceChildren();
    for (const value of [0.5, 0.75, 1]) {
      const native = nativeValue(value),
        lens = native === null ? targetLens(value) : null;
      const supported = !!lens || native !== null || value === actual;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.zoom = value;
      button.textContent = (value === 0.75 ? "0.75" : value.toFixed(1)) + "×";
      button.disabled = !supported;
      button.setAttribute(
        "aria-pressed",
        String(Math.abs(actual - value) < 0.001),
      );
      if (!supported) button.title = "此瀏覽器未提供此倍率或鏡頭";
      button.onclick = async () => {
        if (
          !active ||
          active.busy ||
          active.phase !== "live" ||
          token !== session
        )
          return;
        if (!lens && (native === null || Math.abs(actual - value) < 0.001))
          return;
        const control = active;
        control.busy = true;
        $("#shutter").disabled = true;
        buttons.querySelectorAll("button").forEach((b) => (b.disabled = true));
        try {
          if (lens) {
            const previous = settings.deviceId;
            const opened = await startVideo(++session, lens.deviceId);
            if (!opened && active === control && previous) {
              await startVideo(++session, previous);
              if (active === control)
                $("#camera-optics-note").classList.remove("camera-quiet");
              if (active === control)
                $("#camera-optics-note").textContent =
                  "此鏡頭無法開啟，已回復原鏡頭。";
            }
          } else if (native !== null) {
            await track.applyConstraints({ advanced: [{ zoom: native }] });
            if (active === control && stream === currentStream)
              await cameraTools(token);
          }
        } catch (_) {
          if (active === control && stream === currentStream) {
            await cameraTools(token);
            $("#camera-optics-note").classList.remove("camera-quiet");
            $("#camera-optics-note").textContent =
              "此倍率無法套用，已保留目前倍率。";
          }
        } finally {
          if (active === control) {
            control.busy = false;
            $("#shutter").disabled = control.phase !== "live";
          }
        }
      };
      buttons.append(button);
    }
    $("#camera-lens-row").hidden = cameras.length < 2;
    $("#camera-lens-menu").hidden =
      cameras.length < 2 || active.phase !== "live";
    if (cameras.length > 1) {
      select.innerHTML =
        (cameras.some((d) => d.deviceId === settings.deviceId)
          ? ""
          : '<option value="" disabled selected>目前鏡頭</option>') +
        cameras
          .map(
            (d, i) =>
              `<option value="${E(d.deviceId)}">${E(d.label || "相機 " + (i + 1))}</option>`,
          )
          .join("");
      select.value = settings.deviceId || "";
      select.onchange = async () => {
        if (!active || active.busy || active.phase !== "live") return;
        const control = active,
          previous = active.deviceId;
        const opened = await startVideo(++session, select.value);
        if (!opened && active === control)
          await startVideo(++session, previous);
      };
    }
    note.classList.add("camera-quiet");
    note.textContent =
      wide || nativeValue(0.5) !== null || ultra(current)
        ? "點選倍率切換；0.5× 使用瀏覽器開放的超廣角。"
        : "此瀏覽器未開放 0.5× 超廣角；可使用已啟用的倍率。";
    tools.hidden = active.phase !== "live";
  }
  async function startVideo(token, deviceId = active?.deviceId) {
    stopStream();
    if (active) active.phase = "starting";
    $("#shutter").disabled = true;
    $("#camera-optics").hidden = true;
    try {
      const obtained = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: { ideal: "environment" } }),
          width: { ideal: 10000 },
          height: { ideal: 10000 },
          resizeMode: { ideal: "none" },
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
      active.deviceId =
        stream.getVideoTracks?.()[0]?.getSettings?.().deviceId || deviceId;
      active.phase = "live";
      $("#shutter").disabled = !!active.busy;
      $("#camera-restart").hidden = true;
      message(
        "照片保留完整尺寸，不裁切。浮水印固定在長邊：直式靠左，橫式靠下。",
        true,
      );
      startLivePreview(token);
      void cameraTools(token).catch(() => {});
      return true;
    } catch (e) {
      if (token === session && active) {
        message("無法開啟相機。請允許瀏覽器使用相機後重試：" + e.message);
        $("#camera-restart").hidden = false;
      }
      return false;
    }
  }
  function showReview(blob, saved) {
    if (active.reviewBlob !== blob) {
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = URL.createObjectURL(blob);
      active.reviewBlob = blob;
      $("#capture-preview").src = previewURL;
    }
    $("#capture-preview").hidden = false;
    $("#live-watermark").hidden = true;
    $("#video").hidden = true;
    $("#camera-optics").hidden = true;
    $("#camera-lens-menu").hidden = true;
    $("#camera-lens-menu").open = false;
    $("#shutter").hidden = true;
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
    message("正在取得定位並儲存照片…");
    try {
      const pending = current.pending;
      if (!pending.location) {
        const result = pending.gpsResult
          ? await pending.gpsResult
          : await gps(current).then((location) => ({ location }));
        pending.gpsResult = null;
        if (result.error) throw result.error;
        pending.location = result.location;
      }
      if (active !== current || session !== token) return;
      if (!pending.blob)
        pending.blob = await jpeg(
          pending.frame,
          current.task,
          pending.location,
          pending.capturedAt,
        );
      if (active !== current || session !== token) return;
      showReview(pending.blob, false);
      message("正在保存照片…");
      const record = {
        id: pending.id,
        person: current.person,
        role: isVendor(current.person) ? "vendor" : "worker",
        taskId: current.task.id,
        taskSnapshot: structuredClone(current.task),
        capturedAt: pending.capturedAt,
        timeSource: "web-shutter",
        gps: pending.location,
        ...(backend() && pending.original
          ? { original: pending.original }
          : {}),
        blob: pending.blob,
        savedAt: new Date().toISOString(),
      };
      if (backend()) await Store.savePhoto(record);
      else await Store.put("photos", record);
      if (active !== current || session !== token) return;
      current.record = record;
      pending.frame.close?.();
      current.pending = null;
      showReview(record.blob, true);
      message("已儲存・點照片繼續拍攝" + (backend() ? " 正在回傳主機。" : ""));
      if (backend()) document.dispatchEvent(new Event("hub-photo-saved"));
    } catch (e) {
      if (active === current && session === token) {
        message(e?.message || "照片尚未儲存，請確認裝置空間後重試");
        $("#capture-retry-save").hidden = false;
      }
    } finally {
      if (active === current && session === token) {
        current.busy = false;
        $("#capture-retry-save").disabled = false;
      }
    }
  }
  async function capture() {
    const current = active,
      token = session,
      video = $("#video");
    if (
      !current ||
      current.busy ||
      current.phase !== "live" ||
      !video.videoWidth
    )
      return;
    current.busy = true;
    current.phase = "capturing";
    $("#shutter").disabled = true;
    $("#camera-optics").hidden = true;
    message("正在拍攝…");
    const capturedAt = new Date().toISOString();
    const gpsResult = gps(current).then(
      (location) => ({ location }),
      (error) => ({ error }),
    );
    video.pause();
    try {
      const { original, frame } = await fullFrame(video);
      if (active !== current || session !== token) {
        frame.close?.();
        return;
      }
      current.pending = {
        id: crypto.randomUUID(),
        original,
        frame,
        capturedAt,
        gpsResult,
      };
      current.record = null;
      current.phase = "review";
      current.busy = false;
      $("#shutter").hidden = true;
      $("#capture-mode").textContent = "照片處理中";
      await savePending();
    } catch (e) {
      if (active !== current || session !== token) return;
      current.busy = false;
      current.phase = "live";
      await video.play().catch(() => {});
      message(e?.message || "照片尚未儲存，請重試");
      $("#shutter").disabled = false;
      $("#camera-optics").hidden = false;
    }
  }
  async function resumePreview() {
    const current = active,
      token = session;
    if (!current || current.busy || current.phase !== "review") return;
    if (current.pending || !current.record) {
      message("這張照片尚未儲存，請先按「重試儲存」。");
      return;
    }
    current.record = null;
    current.reviewBlob = null;
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null;
    $("#capture-preview").hidden = true;
    $("#capture-preview").removeAttribute("src");
    $("#video").hidden = false;
    for (const id of ["#capture-save", "#capture-retry-save"])
      $(id).hidden = true;
    $("#shutter").hidden = false;
    $("#capture-mode").textContent = "現場拍照";
    if (stream?.getVideoTracks?.().some((t) => t.readyState !== "ended")) {
      current.phase = "live";
      await $("#video")
        .play()
        .catch(() => {});
      if (active !== current || token !== session) return;
      $("#shutter").disabled = false;
      $("#camera-optics").hidden = false;
      $("#camera-lens-menu").hidden = $("#camera-lens-row").hidden;
      $("#live-watermark").hidden = false;
      current.drawLive?.();
      message("相機已就緒，點「拍照」拍攝下一張。", true);
    } else await startVideo(++session);
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
      phase: "starting",
    };
    dialog.classList.add("camera-mode");
    $("#dialog-title").textContent = "現場拍照";
    $("#dialog-body").innerHTML =
      `<section class="field-camera-shell"><header class="field-camera-header"><button id="camera-back">返回任務</button><div><strong id="capture-mode">現場拍照</strong><small>${E(task.parcels.map((p) => p.section + " " + p.lot).join("、"))}</small></div><details id="camera-lens-menu" hidden><summary>鏡頭</summary><label id="camera-lens-row" hidden>鏡頭<select id="camera-lens" aria-label="選擇相機鏡頭"></select></label></details></header><div id="camera-media" class="field-camera-media"><video id="video" autoplay playsinline muted></video><canvas id="live-watermark" aria-label="浮水印即時預覽" hidden></canvas><img id="capture-preview" alt="本次拍攝的照片" hidden></div><footer class="field-camera-controls"><div id="camera-optics" hidden><div id="camera-zoom-buttons" role="group" aria-label="點選相機倍率"><button type="button" data-zoom="0.5" disabled>0.5×</button><button type="button" data-zoom="0.75" disabled>0.75×</button><button type="button" data-zoom="1" disabled>1.0×</button></div><p id="camera-optics-note" role="status"></p></div><p id="capture-status" role="status" aria-live="polite">請允許相機及定位。</p><div class="field-camera-buttons"><button id="shutter" disabled>拍照</button><button id="camera-restart" hidden>重新開啟相機</button><button id="capture-save" hidden>儲存照片</button><button id="capture-retry-save" hidden>重試儲存</button>${backend() ? '<button id="capture-retry">重試回傳</button>' : ""}</div></footer></section>`;
    if (!dialog.open) dialog.showModal();
    $("#camera-back").onclick = leave;
    $("#shutter").onclick = capture;
    $("#camera-restart").onclick = () => startVideo(++session);
    $("#capture-save").onclick = () => {
      if (active?.record)
        saveImage(active.record.blob, fileName(task, active.record.id)).catch(
          (e) => message(e?.message || "照片尚未儲存，請確認裝置空間後重試"),
        );
    };
    $("#capture-retry-save").onclick = savePending;
    $(".field-camera-shell").onclick = (e) => {
      if (
        e.defaultPrevented ||
        e.target.closest("button,a,input,select,label,summary,details")
      )
        return;
      void resumePreview();
    };
    $("#capture-preview").tabIndex = 0;
    $("#capture-preview").setAttribute(
      "aria-label",
      "點選照片返回取景，繼續拍攝下一張",
    );
    $("#capture-preview").onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        void resumePreview();
      }
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
  async function photoZip(task, rows) {
    const files = Object.create(null);
    for (const [index, photo] of rows.entries()) {
      const name =
        String(index + 1).padStart(3, "0") + "_" + fileName(task, photo.id);
      files[name] = new Uint8Array(await photo.blob.arrayBuffer());
    }
    // JPEGs are already compressed. Store them losslessly in a standard ZIP.
    return new File(
      [fflate.zipSync(files, { level: 0 })],
      fileName(task, "照片").replace(/\.jpg$/, ".zip"),
      { type: "application/zip" },
    );
  }
  async function deleteLocalPhotos(rows) {
    const db = await localStore.open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("photos", "readwrite");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || Error("照片刪除失敗"));
      tx.onabort = () => reject(tx.error || Error("照片刪除取消，未變更照片"));
      try {
        for (const photo of rows) tx.objectStore("photos").delete(photo.id);
      } catch (e) {
        tx.abort();
        reject(e);
      }
    });
  }
  async function gallery(task, person, el) {
    galleryURLs.forEach((url) => URL.revokeObjectURL(url));
    galleryURLs = [];
    const rows = (await Store.photosFor(person, task.id)).sort((a, b) =>
      a.savedAt.localeCompare(b.savedAt),
    );
    if (!el.isConnected) return;
    el.innerHTML = `<h3>任務照片${isVendor(person) ? "" : " " + rows.length + " 張"}</h3><p>${backend() ? "照片先保存在手機，再回傳主機。刪除此裝置照片不會刪除主機回傳紀錄。" : "照片保存在此裝置；可勾選含浮水印照片打包 ZIP 儲存或分享。"}</p><div class="field-photo-toolbar" ${rows.length ? "" : "hidden"}><label class="field-photo-select-all"><input type="checkbox" data-photos-all>全選</label><span data-photos-count aria-live="polite">已選 0 張</span><button data-photos-export disabled>打包勾選照片 ZIP</button><button data-photos-delete disabled>刪除勾選照片</button></div><div class="field-photo-zip" data-photos-zip hidden><a class="button" data-photos-download download>下載 ZIP</a><button data-photos-share hidden>分享 ZIP</button></div><p class="field-photo-status" data-photos-status role="status" aria-live="polite"></p><div class="photos">${
      rows
        .map((p, index) => {
          const url = URL.createObjectURL(p.blob);
          galleryURLs.push(url);
          return `<article class="photo"><label class="field-photo-pick"><input type="checkbox" data-photo-select="${E(p.id)}">選取照片 ${index + 1}</label><button class="field-photo-thumb" data-photo-view="${E(p.id)}" aria-label="查看照片 ${index + 1}"><img src="${url}" alt="含日期時間與座標的照片"></button><p>${E(new Date(p.capturedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }))}${backend() ? " · " + (p.uploaded ? "已回傳" : "待回傳") : ""}</p></article>`;
        })
        .join("") || "<p>尚未拍攝照片</p>"
    }</div>`;
    const checks = [...el.querySelectorAll("[data-photo-select]")],
      all = el.querySelector("[data-photos-all]"),
      count = el.querySelector("[data-photos-count]"),
      exportButton = el.querySelector("[data-photos-export]"),
      deleteButton = el.querySelector("[data-photos-delete]"),
      ready = el.querySelector("[data-photos-zip]"),
      download = el.querySelector("[data-photos-download]"),
      share = el.querySelector("[data-photos-share]"),
      status = el.querySelector("[data-photos-status]");
    let busy = false,
      archive = null,
      archiveURL = null;
    const selected = () => {
      const ids = new Set(
        checks.filter((c) => c.checked).map((c) => c.dataset.photoSelect),
      );
      return rows.filter((p) => ids.has(p.id));
    };
    function update() {
      const size = selected().length;
      count.textContent = `已選 ${size} 張`;
      all.checked = size > 0 && size === checks.length;
      all.indeterminate = size > 0 && size < checks.length;
      all.disabled = busy;
      checks.forEach((c) => {
        c.disabled = busy;
        c.closest(".photo").classList.toggle("field-photo-selected", c.checked);
      });
      exportButton.disabled = deleteButton.disabled = busy || size === 0;
      share.disabled = busy;
    }
    function clearArchive() {
      if (archiveURL) URL.revokeObjectURL(archiveURL);
      archiveURL = archive = null;
      download.removeAttribute("href");
      ready.hidden = true;
      status.textContent = "";
    }
    all.onchange = () => {
      checks.forEach((c) => (c.checked = all.checked));
      clearArchive();
      update();
    };
    checks.forEach(
      (c) =>
        (c.onchange = () => {
          clearArchive();
          update();
        }),
    );
    el.querySelectorAll("[data-photo-view]").forEach(
      (b) =>
        (b.onclick = () => {
          const p = rows.find((p) => p.id === b.dataset.photoView);
          viewImage(p.blob, fileName(task, p.id));
        }),
    );
    // This function calls share before its first await, so the ready button also
    // works on browsers that require a fresh user gesture after ZIP creation.
    async function shareArchive() {
      if (!archive || busy) return;
      busy = true;
      update();
      try {
        await navigator.share({ files: [archive], title: "任務照片 ZIP" });
        status.textContent = "ZIP 已交給分享面板；也可再次下載。";
      } catch (e) {
        status.textContent =
          e.name === "AbortError"
            ? "已取消分享；ZIP 仍可下載或再次分享。"
            : "ZIP 已備妥，請按「分享 ZIP」或「下載 ZIP」。";
      } finally {
        busy = false;
        update();
      }
    }
    share.onclick = shareArchive;
    exportButton.onclick = async () => {
      const chosen = selected();
      if (busy || !chosen.length) return;
      clearArchive();
      busy = true;
      update();
      status.textContent = `正在打包 ${chosen.length} 張照片…`;
      try {
        const file = await photoZip(task, chosen);
        if (!el.isConnected) return;
        archive = file;
        archiveURL = URL.createObjectURL(file);
        galleryURLs.push(archiveURL);
        download.href = archiveURL;
        download.download = file.name;
        let canShare = false;
        try {
          canShare =
            !!navigator.share && !!navigator.canShare?.({ files: [file] });
        } catch (_) {}
        ready.hidden = false;
        share.hidden = !canShare;
        status.textContent = `已打包 ${chosen.length} 張含浮水印照片。`;
        busy = false;
        update();
        if (canShare) await shareArchive();
        else download.click();
      } catch (e) {
        status.textContent = "打包失敗，照片仍保留：" + (e.message || e);
      } finally {
        busy = false;
        update();
      }
    };
    deleteButton.onclick = async () => {
      const chosen = selected();
      if (busy || !chosen.length) return;
      const pending = backend() ? chosen.filter((p) => !p.uploaded).length : 0;
      if (
        !confirm(
          `刪除勾選的 ${chosen.length} 張此裝置照片？${pending ? `其中 ${pending} 張尚未回傳，刪除後無法再從此裝置回傳。` : ""}請先確認已儲存或備份。${backend() ? "主機已收到的照片不受影響。" : ""}`,
        )
      )
        return;
      busy = true;
      update();
      status.textContent = "正在刪除勾選照片…";
      try {
        await deleteLocalPhotos(chosen);
        if (!el.isConnected) return;
        await gallery(task, person, el);
        el.querySelector("[data-photos-status]").textContent =
          `已刪除 ${chosen.length} 張此裝置照片。`;
        if (window.HubSync) HubSync.pending().catch(() => {});
      } catch (e) {
        status.textContent = "刪除失敗，請重試：" + (e.message || e);
      } finally {
        busy = false;
        update();
      }
    };
    update();
  }
  dialog.addEventListener("cancel", (e) => {
    if (active?.pending) {
      e.preventDefault();
      leave();
    }
  });
  dialog.addEventListener("close", cleanup);
  addEventListener("pagehide", cleanup);
  window.FieldCamera = { open: openCamera, gallery, stop: cleanup, viewImage };
})();
