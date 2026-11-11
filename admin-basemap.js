/* Admin-only public imagery. Raster switching never edits task, KML or entrance layers. */
(function () {
  "use strict";
  const attached = new WeakSet(),
    prefKey = "photosheet.admin.basemap.v1";
  function validate(raw) {
    if (
      raw?.schemaVersion !== 1 ||
      !Array.isArray(raw.images) ||
      !raw.images.length ||
      raw.images.length > 2000
    )
      throw Error("影像目錄格式錯誤");
    const seen = new Set();
    return raw.images
      .map((s) => {
        if (
          !s ||
          typeof s.id !== "string" ||
          !/^[A-Za-z0-9_-]+$/.test(s.id) ||
          seen.has(s.id) ||
          typeof s.title !== "string" ||
          !s.title.includes("屏東縣") ||
          typeof s.date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(s.date) ||
          PSCore.date(s.date) !== s.date ||
          !Array.isArray(s.bounds) ||
          s.bounds.length !== 4 ||
          !s.bounds.every(Number.isFinite) ||
          s.bounds[0] >= s.bounds[2] ||
          s.bounds[1] >= s.bounds[3] ||
          s.bounds[0] < -180 ||
          s.bounds[2] > 180 ||
          s.bounds[1] < -85 ||
          s.bounds[3] > 85 ||
          s.url !==
            `https://storage.geodac.tw/Tile/v2/RSImage/UAV/Ortho/${s.id}/{z}/{y}/{x}.jpg`
        )
          throw Error("影像目錄內容不正確");
        seen.add(s.id);
        return {
          ...s,
          bounds: L.latLngBounds(
            [s.bounds[1], s.bounds[0]],
            [s.bounds[3], s.bounds[2]],
          ),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  }
  window.AdminBasemap = {
    attach(map) {
      if (document.body.dataset.worker || attached.has(map)) return;
      let street;
      map.eachLayer((l) => {
        if (
          l instanceof L.TileLayer &&
          l._url === "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        )
          street = l;
      });
      if (!street) return;
      attached.add(map);
      const controls = document.createElement("div");
      controls.className = "admin-basemap-controls";
      controls.innerHTML =
        '<label>管理頁底圖<select id="admin-basemap" aria-label="選擇管理頁底圖"><option value="street">一般地圖</option><option value="uav">屏東 UAV 正射（農村水保署，局部）</option><option value="national">全區正射（國土測繪中心備用）</option></select></label><label id="admin-image-label" hidden>局部影像日期／地點（選取會移至影像範圍）<select id="admin-ortho-image" aria-label="選擇屏東局部正射影像"></select></label><p id="admin-basemap-status" role="status" aria-live="polite" hidden></p><button id="admin-full-ortho" type="button" hidden>切換全區正射</button>';
      map.getContainer().before(controls);
      const select = controls.querySelector("#admin-basemap"),
        imagesSelect = controls.querySelector("#admin-ortho-image"),
        imageLabel = controls.querySelector("#admin-image-label"),
        status = controls.querySelector("#admin-basemap-status"),
        fullButton = controls.querySelector("#admin-full-ortho");
      const national = L.tileLayer(
        "https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}",
        {
          maxZoom: 19,
          maxNativeZoom: 19,
          noWrap: true,
          updateWhenIdle: true,
          keepBuffer: 1,
          attribution:
            '正射影像 &copy; <a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noopener">國土測繪中心</a>',
        },
      );
      if (!map.getPane("adminImagery"))
        map.createPane("adminImagery").style.zIndex = "210";
      let mode = "street",
        images = null,
        catalogPromise = null,
        imagery = null,
        currentId = "",
        pinned = "",
        generation = 0,
        moveTimer;
      function note(text) {
        status.textContent = text;
        status.hidden = !text;
      }
      function clearImage() {
        if (imagery) {
          map.removeLayer(imagery);
          imagery = null;
        }
        currentId = "";
      }
      async function catalogue() {
        if (images) return images;
        if (catalogPromise) return catalogPromise;
        catalogPromise = (async () => {
          const abort = new AbortController(),
            timer = setTimeout(() => abort.abort(), 15000);
          try {
            const r = await fetch(
              new URL("data/admin-orthophoto.json", location.href),
              { cache: "no-store", signal: abort.signal },
            );
            if (!r.ok) throw Error("HTTP " + r.status);
            images = validate(await r.json());
            return images;
          } finally {
            clearTimeout(timer);
          }
        })().finally(() => {
          catalogPromise = null;
        });
        return catalogPromise;
      }
      function showImage(source) {
        if (currentId === source.id && imagery) return;
        clearImage();
        currentId = source.id;
        const layer = L.tileLayer(source.url, {
          pane: "adminImagery",
          bounds: source.bounds,
          noWrap: true,
          maxZoom: 19,
          maxNativeZoom: 19,
          updateWhenIdle: true,
          keepBuffer: 0,
          attribution:
            'UAV 正射影像 &copy; <a href="https://gis.ardswc.gov.tw/api-doc" target="_blank" rel="noopener">農業部農村水保署 BigGIS</a>',
        });
        imagery = layer;
        let succeeded = 0,
          failed = 0;
        layer.on("loading", () => {
          succeeded = 0;
          failed = 0;
        });
        // Clip the raster at its published bounding box; task polygons remain in overlayPane.
        layer.on("tileload", (e) => {
          succeeded++;
          const nw = map.project(source.bounds.getNorthWest(), e.coords.z),
            se = map.project(source.bounds.getSouthEast(), e.coords.z),
            size = layer.getTileSize(),
            x = e.coords.x * size.x,
            y = e.coords.y * size.y,
            clamp = (n, max) => Math.min(max, Math.max(0, n));
          e.tile.style.clipPath = `inset(${clamp(nw.y - y, size.y)}px ${clamp(x + size.x - se.x, size.x)}px ${clamp(y + size.y - se.y, size.y)}px ${clamp(nw.x - x, size.x)}px)`;
        });
        layer.on("tileerror", () => {
          failed++;
          if (mode === "uav" && imagery === layer)
            note("影像圖磚暫時無法載入；一般地圖仍保留，可切換全區正射。");
        });
        layer.on("load", () => {
          if (failed && !succeeded)
            setTimeout(() => {
              if (mode !== "uav" || imagery !== layer) return;
              switchTo("national");
              note("農村水保署影像載入失敗，已切換國土測繪中心全區正射備用。");
            }, 0);
        });
        layer.addTo(map);
      }
      function update() {
        if (mode !== "uav" || !images) return;
        const view = map.getBounds(),
          center = map.getCenter(),
          visible = images.filter((s) => s.bounds.intersects(view));
        const keep = pinned && visible.find((s) => s.id === pinned);
        const source =
          keep ||
          visible.find((s) => s.bounds.contains(center)) ||
          [...visible].sort(
            (a, b) =>
              center.distanceTo(a.bounds.getCenter()) -
              center.distanceTo(b.bounds.getCenter()),
          )[0];
        if (!keep) pinned = "";
        const fragment = document.createDocumentFragment(),
          placeholder = new Option(
            source ? "請選擇影像" : "目前視野無影像，可選其他地區",
            "",
          );
        fragment.append(placeholder);
        for (const s of images) {
          const option = new Option(
            `${s.date} · ${s.title.replace(/^\d{8}_UAV正射影像_屏東縣/, "")}${visible.includes(s) ? "（視野內）" : ""}`,
            s.id,
          );
          fragment.append(option);
        }
        imagesSelect.replaceChildren(fragment);
        if (source) {
          imagesSelect.value = source.id;
          note(
            `農村水保署局部影像 · ${source.date} · ${source.title.replace(/^\d{8}_UAV正射影像_/, "")}。非即時、非全縣連續覆蓋；影像外保留一般地圖。`,
          );
          showImage(source);
        } else {
          clearImage();
          imagesSelect.value = "";
          note(
            "目前視野沒有農村水保署 UAV 影像；顯示一般地圖。可選其他影像地點，或切換全區正射。",
          );
        }
      }
      async function switchTo(key, save = false) {
        const request = ++generation;
        mode = ["uav", "national"].includes(key) ? key : "street";
        select.value = mode;
        if (save) {
          try {
            localStorage.setItem(prefKey, mode);
          } catch (_) {}
        }
        imageLabel.hidden = mode !== "uav";
        fullButton.hidden = mode !== "uav";
        pinned = "";
        clearImage();
        if (map.hasLayer(national)) map.removeLayer(national);
        if (mode === "national") {
          if (map.hasLayer(street)) map.removeLayer(street);
          note("全區正射備用來源：國土測繪中心；非即時影像。");
          national.addTo(map);
        } else {
          if (!map.hasLayer(street)) street.addTo(map);
          if (mode === "street") note("");
          else {
            imagesSelect.replaceChildren(new Option("正在讀取影像目錄…", ""));
            note("正在讀取農村水保署屏東 UAV 影像目錄…");
            try {
              await catalogue();
              if (request === generation && mode === "uav") update();
            } catch (e) {
              if (request === generation && mode === "uav") {
                switchTo("national");
                note(
                  "農村水保署影像目錄載入失敗，已切換國土測繪中心全區正射備用。",
                );
              }
            }
          }
        }
      }
      national.on("tileerror", () => {
        if (mode === "national") {
          switchTo("street");
          note("全區正射暫時無法載入，已切回一般地圖。可稍後重試。");
        }
      });
      select.onchange = () => switchTo(select.value, true);
      fullButton.onclick = () => switchTo("national", true);
      imagesSelect.onchange = () => {
        const source = images?.find((s) => s.id === imagesSelect.value);
        if (!source || mode !== "uav") return;
        pinned = source.id;
        showImage(source);
        note(
          `農村水保署局部影像 · ${source.date} · ${source.title.replace(/^\d{8}_UAV正射影像_/, "")}。影像外保留一般地圖。`,
        );
        map.fitBounds(source.bounds, { maxZoom: 18, padding: [20, 20] });
      };
      map.on("moveend", () => {
        clearTimeout(moveTimer);
        moveTimer = setTimeout(update, 120);
      });
      let preferred;
      try {
        preferred = localStorage.getItem(prefKey);
      } catch (_) {}
      switchTo(preferred || "street");
    },
  };
})();
