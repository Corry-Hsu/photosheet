# ADR-0014：瀏覽器回歸的定位 fixture 與完成條件

- 狀態：已採用。
- 日期：2026-11-20（Asia/Taipei）；起點：`2d0b13c0d5830307ed449bc5412d63644edb3762`。
- 關係：補充 ADR-0013 的可驗證交接；沿用 ADR-0002、0008、0009、0010，**不取代產品決策**。
- 證據：[本次交接](../HANDOFF.md#本次接續p0驗證修復2026-11-20)、`tests/vendor_manual_qa.py`、`tests/gps_clock_probe.py`。

## 背景與決策

管理範圍測試被舊文案攔住，廠商綜合測試則在原生模擬定位逾時。固定業務日期與 Chromium 原生定位時間戳不同；完整多頁腳本觀察到定位逾時，但最小單頁探針未重現逾時，不能推定時間差是唯一根因。

管理測試核對可見任務 ID 集合及隱藏筆數，保留後半完成、空清單發布與交易回復驗證。廠商綜合測試改用 callback 定位 fixture，timestamp 取頁面 Date.now；先驗證有效座標與新鮮度，再驗證 GPS 失敗零張、重試一次存一張、GPS 與非空成果 JPEG。以可儲存畫面狀態及 await IDB 查詢的實際結果判定完成，不再用 async wait_for_function 的 Promise 作為存圖證據。

## 理由與未採方案

綜合回歸需要可控制的定位成功／失敗，避免依賴瀏覽器模擬服務的時間及頁面排程。沒有延長等待、略過拍照、修改產品文案、放寬 GPS 保護或以假座標修正式程式。也不把固定 fixture 通過等同原生 GPS 問題已解決。

## 影響與限制

只改測試與文件；正式 JS/CSS/HTML、公開 data、相機及本機照片格式不變。原生 GPS／多頁逾時原因尚未完全確認，實機仍待驗收。探針僅印出兩種時鐘下立即與五秒後的觀察；不要求所有 Chromium 版本必須逾時。保留原失敗基準與本次實際成功／失敗，不合併成跨版本全綠聲明。

## 實際驗證

兩支修正腳本及必要回歸 `admin_history_qa.py`、`field_photo_flow_qa.py` 通過；環境、命令、探針與原失敗見 [P0紀錄](../verification/2026-11-20-p0.json)。未執行全套18組、WebKit、實機及私人原檔驗收。

原生對照補充：以起點的 `vendor_manual_qa.py` 只移除兩處 `clock.set_fixed_time(QA_NOW)` 後另存 `/tmp/vendor-native-date-control.py` 執行，仍在 `#capture-save` 等待逾時（exit 1）。因此不能把固定Date認定為充分或唯一原因；多頁／原生模擬定位交互作用仍待查。該暫存診斷不列入四組通過。
