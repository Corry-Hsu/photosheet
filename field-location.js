/* Foreground-only GPS display. Never stored, uploaded or used as a task entrance. */
(function () {
  "use strict";
  window.FieldLocation = {
    attach(map) {
      const locate = document.querySelector("#field-locate"),
        status = document.querySelector("#field-location-status");
      if (!locate || !status) return;
      let enabled = false,
        watch = null,
        generation = 0,
        last = null,
        dot = null,
        accuracy = null,
        timer = null,
        centerNext = false,
        stale = true,
        lastAnnouncement = 0;
      function say(text, state) {
        if (status.textContent !== text) status.textContent = text;
        status.dataset.state = state;
      }
      function clearWatch() {
        generation++;
        if (watch !== null) {
          navigator.geolocation.clearWatch(watch);
          watch = null;
        }
        if (timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      }
      function removePoint() {
        if (dot) map.removeLayer(dot);
        if (accuracy) map.removeLayer(accuracy);
        dot = accuracy = null;
        last = null;
      }
      function paintStale(message, state = "stale") {
        stale = true;
        dot?.setStyle({ fillColor: "#8796a6" });
        dot?.setTooltipContent("上次手機位置（待更新）");
        accuracy?.setStyle({
          color: "#8796a6",
          fillColor: "#8796a6",
          dashArray: "5 5",
        });
        say(message, state);
      }
      function disable(message, state = "off") {
        enabled = false;
        clearWatch();
        removePoint();
        locate.setAttribute("aria-pressed", "false");
        locate.textContent = "定位到我";
        say(message, state);
      }
      function onPosition(position, request) {
        if (request !== generation || !enabled || document.hidden) return;
        const c = position.coords || {},
          p = [c.latitude, c.longitude];
        if (
          !p.every(Number.isFinite) ||
          Math.abs(p[0]) > 90 ||
          Math.abs(p[1]) > 180 ||
          !Number.isFinite(c.accuracy) ||
          c.accuracy < 0
        ) {
          paintStale("定位資料無效，請稍候或重新定位。", "error");
          return;
        }
        last = {
          lat: c.latitude,
          lng: c.longitude,
          accuracy: c.accuracy,
          timestamp: Number.isFinite(position.timestamp)
            ? position.timestamp
            : Date.now(),
        };
        const latlng = [last.lat, last.lng];
        if (!accuracy)
          accuracy = L.circle(latlng, {
            radius: last.accuracy,
            color: "#2575e6",
            fillColor: "#2575e6",
            fillOpacity: 0.1,
            weight: 1,
            interactive: false,
            gpsLayer: "accuracy",
          }).addTo(map);
        else accuracy.setLatLng(latlng).setRadius(last.accuracy);
        accuracy.setStyle({
          color: "#2575e6",
          fillColor: "#2575e6",
          dashArray: null,
        });
        if (!dot)
          dot = L.circleMarker(latlng, {
            radius: 8,
            color: "#fff",
            weight: 3,
            fillColor: "#2575e6",
            fillOpacity: 1,
            gpsLayer: "position",
          })
            .bindTooltip("手機目前位置")
            .addTo(map);
        else dot.setLatLng(latlng);
        dot.setStyle({ fillColor: "#2575e6" });
        dot.setTooltipContent("手機目前位置");
        dot.bringToFront();
        const wasStale = stale;
        stale = false;
        locate.textContent = "關閉定位";
        if (centerNext) {
          map.invalidateSize();
          map.stop();
          map.setView(latlng, 17, { animate: false });
          centerNext = false;
        }
        if (Date.now() - last.timestamp > 60000) {
          paintStale("上次手機位置已超過1分鐘，正在等待新定位。");
          return;
        }
        if (wasStale || Date.now() - lastAnnouncement >= 10000) {
          say(
            `藍點：手機位置 · 精度 ±${Math.round(last.accuracy)} 公尺 · ${new Date(last.timestamp).toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })} 更新`,
            "active",
          );
          lastAnnouncement = Date.now();
        }
      }
      function begin() {
        if (!enabled || watch !== null || document.hidden) return;
        if (!window.isSecureContext) {
          disable("手機定位需使用 HTTPS 開啟此頁。", "error");
          return;
        }
        if (!navigator.geolocation) {
          disable("此瀏覽器不支援定位，請使用手機瀏覽器開啟。", "error");
          return;
        }
        const request = ++generation;
        say("正在取得手機位置，請允許定位權限…", "locating");
        locate.textContent = "關閉定位";
        try {
          const id = navigator.geolocation.watchPosition(
            (p) => onPosition(p, request),
            (error) => {
              if (request !== generation || !enabled) return;
              if (error.code === 1) {
                disable(
                  "定位權限未開啟，請在瀏覽器／手機設定允許定位後再按「定位到我」。",
                  "denied",
                );
                return;
              }
              paintStale(
                error.code === 3
                  ? "定位逾時，正在等待訊號；可關閉後重新開啟定位。"
                  : "暫時無法取得位置，請確認手機定位已開啟。",
                "error",
              );
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
          );
          if (request !== generation || !enabled)
            navigator.geolocation.clearWatch(id);
          else watch = id;
          if (enabled)
            timer = setInterval(() => {
              if (last && Date.now() - last.timestamp > 60000 && !stale)
                paintStale("上次手機位置已超過1分鐘，正在等待新定位。");
            }, 15000);
        } catch (e) {
          disable("無法啟動手機定位，請確認權限後重試。", "error");
        }
      }
      locate.setAttribute("aria-pressed", "false");
      locate.onclick = () => {
        if (enabled) {
          disable("手機定位已關閉。");
          return;
        }
        clearWatch();
        enabled = true;
        locate.textContent = "關閉定位";
        locate.setAttribute("aria-pressed", "true");
        centerNext = true;
        begin();
      };
      function pause() {
        if (!enabled) return;
        clearWatch();
        paintStale("手機定位已暫停，回到此頁後繼續更新。", "paused");
      }
      function resume() {
        if (enabled && !document.hidden) begin();
      }
      document.addEventListener("visibilitychange", () =>
        document.hidden ? pause() : resume(),
      );
      window.addEventListener("pagehide", pause);
      window.addEventListener("pageshow", resume);
      say("開啟定位後，藍點顯示手機位置；橘色圖釘為任務位置。", "off");
    },
  };
})();
