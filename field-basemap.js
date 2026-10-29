/* Optional field-page basemaps. Task geometry, entrances and GPS keep their layers. */
(function () {
  "use strict";
  const attached = new WeakSet(),
    preferenceKey = "photosheet.field.basemap.v1";
  window.FieldBasemap = {
    attach(map) {
      if (!document.body.dataset.worker || attached.has(map)) return;
      let street;
      map.eachLayer((layer) => {
        if (
          layer instanceof L.TileLayer &&
          layer._url === "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        )
          street = layer;
      });
      if (!street) return;
      attached.add(map);
      const orthophoto = L.tileLayer(
        "https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}",
        {
          minZoom: 0,
          maxZoom: 19,
          maxNativeZoom: 19,
          noWrap: true,
          updateWhenIdle: true,
          keepBuffer: 1,
          attribution:
            '正射影像 &copy; <a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noopener">國土測繪中心</a>',
        },
      );
      const controls = document.createElement("div");
      controls.className = "field-basemap-controls";
      controls.innerHTML =
        '<label>底圖<select aria-label="選擇地圖底圖" id="field-basemap"><option value="street">一般地圖</option><option value="orthophoto">正射影像</option></select></label><p id="field-basemap-status" role="status" aria-live="polite" hidden></p>';
      map.getContainer().before(controls);
      const select = controls.querySelector("select"),
        status = controls.querySelector("p");
      let current = street;
      const note = (text) => {
        status.textContent = text;
        status.hidden = !text;
      };
      function switchTo(key, save = false, reason = "") {
        const next = key === "orthophoto" ? orthophoto : street;
        current = next;
        select.value = next === orthophoto ? "orthophoto" : "street";
        // Remove only the other basemap, never task/GPS/parcel overlays.
        for (const layer of [street, orthophoto])
          if (layer !== next && map.hasLayer(layer)) map.removeLayer(layer);
        note(
          reason ||
            (next === orthophoto
              ? "正射影像非即時畫面；地籍範圍與導航標記仍保留。"
              : ""),
        );
        if (!map.hasLayer(next)) next.addTo(map);
        if (save) {
          try {
            localStorage.setItem(preferenceKey, select.value);
          } catch (_) {}
        }
      }
      orthophoto.on("tileerror", () => {
        if (current !== orthophoto) return;
        switchTo(
          "street",
          false,
          "正射影像暫時無法載入或此區無影像，已切回一般地圖。可稍後重試。",
        );
      });
      select.onchange = () => switchTo(select.value, true);
      let preferred;
      try {
        preferred = localStorage.getItem(preferenceKey);
      } catch (_) {}
      switchTo(preferred === "orthophoto" ? preferred : "street");
    },
  };
})();
