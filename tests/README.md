# 重現驗證與測試範圍

現行規格見 [SPECIFICATION](../docs/SPECIFICATION.md)，本次commit／真實成功與失敗見 [HANDOFF](../docs/HANDOFF.md)，可讀取的結果為 [2026-11-20 baseline](../docs/verification/2026-11-20-baseline.json)。**歷史基準16/18，另2組失敗；P0接續修復兩組並執行必要回歸共4組通過，未重跑全套18組，不能合稱全套綠燈。** 詳見 [P0紀錄](../docs/verification/2026-11-20-p0.json)與[ADR-0014](../docs/adr/0014-clock-consistent-browser-gps-fixtures.md)。

## 管理月統計（2026-11-20新增）

```sh
node --test tests/core.test.cjs tests/admin-monthly-stats.test.cjs
PHOTOSHEET_TEST_URL=http://127.0.0.1:8813/ python tests/admin_monthly_stats_qa.py
PHOTOSHEET_TEST_URL=http://127.0.0.1:8813/ python tests/admin_scope_completion_qa.py
HISTORY_TEST_URL=http://127.0.0.1:8813/ python tests/admin_history_qa.py
```

需先在網站根目錄啟動8813伺服器。新suite以虛構資料驗證72件／153筆範例、月份切換、完成／隱藏案件、篩選獨立、真實管理新增／改地號／改日期／刪除及失敗回復、重載、臺灣跨年、零資料、手機版面與人員頁隔離。截圖只存`/tmp`，非真實案件，未提交。實際結果見[月統計紀錄](../docs/verification/2026-11-20-monthly-stats.json)；沒有重跑全套或宣稱GPS未解問題消失。

## 環境與安全

Node.js、Python、Playwright、Chromium，Python套件包含 Pillow、openpyxl、PyMuPDF：

```sh
python -m pip install playwright Pillow openpyxl PyMuPDF
python -m playwright install chromium
```

2026-11-20驗證環境：Node v24.19.0、Python 3.12.14、Chromium 154.0.8037.57、Playwright 1.62.0、Pillow 12.3.0、openpyxl 3.1.5、PyMuPDF 1.26.6。這是實測組態，不是承諾其他全部版本均通過。可用 `PHOTOSHEET_CHROMIUM` 指定執行檔；共用test_config未指定時找系統chromium，None時由Playwright使用預設安裝。

在乾淨checkout的網站根目錄啟動，不要服務包含私人附件的上層目錄：

```sh
python -m http.server 8812 --bind 127.0.0.1
```

測試使用獨立context，不碰日常瀏覽器的IDB。GPS、相機、圖磚大多為程式生成或模擬；多個舊腳本不會全面攔截每個外部圖資主機，因此「已阻擋OSM」也不等於可宣稱完全零外網。測試不提交公開派工，evidence可能含私人案例，不能整包加入Git。

## URL 設定

共用測試預設 `http://127.0.0.1:8778/photosheet-static/`；此處用8812根目錄，須設定環境變數。Linux／macOS shell：

```sh
export PHOTOSHEET_TEST_URL=http://127.0.0.1:8812/
export HISTORY_TEST_URL=$PHOTOSHEET_TEST_URL
export DELETE_TEST_URL=$PHOTOSHEET_TEST_URL
export PARCEL_TEST_URL=$PHOTOSHEET_TEST_URL
export DISPATCH_TEST_URL=$PHOTOSHEET_TEST_URL
export AREA_TEST_URL=$PHOTOSHEET_TEST_URL
export ADMIN_MAP_TEST_URL=$PHOTOSHEET_TEST_URL
export PS_TEST_ENGINE=chromium
```

PowerShell先用 `$env:PHOTOSHEET_TEST_URL='http://127.0.0.1:8812/'`，其餘各變數以同樣方式設定；不能直接貼上shell的export。HISTORY_ADMIN_PASSWORD應不設定，否則部分測試會改走後端版路徑，並非photosheet靜態基準。

## 純邏輯／資料轉換

```sh
node --test tests/core.test.cjs tests/dispatch-plan.test.cjs tests/land-area.test.cjs
python tests/land_area_converter_test.py
```

`npm test`目前僅跑 `tests/core.test.cjs`，不是上列三檔，更不是瀏覽器回歸。core為正規化、幾何、日期、指派等；dispatch-plan為追加／欄位修正／保留／去重；land-area含實際精簡面積資料驗證；converter有8個合成XML測試。

## 瀏覽器回歸選擇

| 功能 | 腳本 | 資料與限制 |
|---|---|---|
| 相機滿寬、超廣角預設／後置備援 | `full_width_camera_qa.py` | 合成裝置／GPS；人員、廠商、320／390／844px |
| 三倍率、鏡頭切換、連拍與故障 | `camera_optics_qa.py` | 真API呼叫模式模擬，不能代表實際鏡頭開放 |
| 完整尺寸、四角、EXIF方向、長邊浮水印 | `full_frame_live_qa.py` | 合成影像、實際JPEG與IDB，含GPS失敗重試 |
| 拍照／詳情／白板／相簿 | `field_photo_flow_qa.py` | Chromium假裝置＋定位注入；廠商路徑也驗證 |
| 勾選ZIP／分享／批刪與舊照片 | `bulk_photos_qa.py` | IDB交易、原位元組ZIP、取消及重試 |
| 手機地圖定位 | `field_location_qa.py` | 回呼模擬，追蹤／過期／前背景／關閉 |
| 現場底圖 | `field_basemap_qa.py` | 合成瓦片、來源、切圖層保留覆蓋、故障備援 |
| 緊湊清單、導航、白板PDF／PNG | `mobile_worker_qa.py` | 20筆虛構案；相機細節由專用suite負責 |
| 管理月份／完成／空清單 | `admin_scope_completion_qa.py` | P0通過：任務ID集合／隱藏數、完成及回復後半流程 |
| 前月搜尋、加回與再發布 | `admin_history_qa.py` | 跨年、閏月、回滾、本機備份；HISTORY_TEST_URL |
| 鄉鎮自派／選擇發布 | `auto_dispatch_qa.py` | 11鄉鎮、p3保留、舊案保護 |
| 手動任務＋廠商綜合 | `vendor_manual_qa.py` | P0合成定位通過：GPS失敗零張／恢復重試一張；原生定位逾時仍另列 |
| 只刪手動來源 | `manual_delete_qa.py` | 不把空號Excel誤刪；交易回復；DELETE_TEST_URL |
| 修改／新增多地號 | `parcel_add_qa.py` | 來源追溯、空白／重複、跨段；PARCEL_TEST_URL |
| 差異整理工作區 | `dispatch_tools_qa.py` | 攔截公開基準、欄位核准／刪除、草稿、競態；DISPATCH_TEST_URL |
| 線上登記面積 | `land_areas_qa.py` | 真實精簡JSON＋合成管理案，含輸出；AREA_TEST_URL |
| 管理UAV／全區正射 | `admin_basemap_qa.py` | 真目錄＋假瓦片，裁限與備援；ADMIN_MAP_TEST_URL |
| 純KML代號與段對照 | `code_kml_qa.py` | 自產合成Excel／KML，不需使用者原檔 |

例如改相機時先執行相關相機／照片suite，而非每次重跑所有無關功能：

```sh
python tests/full_width_camera_qa.py
python tests/camera_optics_qa.py
python tests/full_frame_live_qa.py
python tests/field_photo_flow_qa.py
python tests/bulk_photos_qa.py
```

資料只改公開JSON時，使用DispatchPlan.validate、ID／類型／欄位差異與引用檢查，不能用某張UI截圖代表所有資料正確。

## 未納入本次綠燈聲明

- `browser_qa.py`、`acceptance_qa.py`、`performance_qa.py` 等原始Excel／大地籍端對端：需使用者原檔，用 `PHOTOSHEET_TEST_EXCEL`、`PHOTOSHEET_TEST_KML_ZIP` 指定路徑。`reference_importer.py`是獨立對照基準，不在網站runtime。原檔不得提交。
- `gps_native_qa.py`、`landscape_uncropped_qa.py` 及相容入口 `photo_edges_qa.py` 等未在本次執行；新相機主基準是full_width／full_frame等，不把早期4:3或滑桿敘述當需求。
- `PS_TEST_ENGINE=webkit` 只對支援該參數的腳本生效，先裝WebKit及系統相依；不支援參數的腳本仍固定Chromium。這次沒跑WebKit，更不能代替iPhone。
- 真iPhone／Android的權限、鏡頭、GPS、尺寸、分享／下載、列印／白板及導航需要另附裝置版本與測試紀錄。
- 外部圖資真實可用性需要在當時網路直接實測，不能從合成瓦片推論。

## 結果保存與已知失敗

回歸結果必須記錄基準commit、命令、引擎／資料方式、成功／失敗、未測範圍。歷史evidence無Git追蹤，不是可重現的版本契約。不要將原始私人照片／備份／GPS與大量未整理日誌上傳公開repo。

K-01 舊文案斷言與 K-02 廠商拍攝GPS逾時，詳見 [HANDOFF](../docs/HANDOFF.md#4-已知問題與可重現步驟)。後續先確認規格與fixture，不能為求綠燈還原被使用者拒絕的功能，亦不能只跳過失敗就宣稱全套完成。

## P0接續：定位fixture與原生探針

```sh
PHOTOSHEET_TEST_URL=http://127.0.0.1:8812/ python tests/admin_scope_completion_qa.py
PHOTOSHEET_TEST_URL=http://127.0.0.1:8812/ python tests/vendor_manual_qa.py
HISTORY_TEST_URL=http://127.0.0.1:8812/ python tests/admin_history_qa.py
PHOTOSHEET_TEST_URL=http://127.0.0.1:8812/ python tests/field_photo_flow_qa.py
PHOTOSHEET_TEST_URL=http://127.0.0.1:8812/ python tests/gps_clock_probe.py
```

`vendor_manual`以頁面時鐘產生定位callback，保留真實瀏覽器相機假裝置、IDB及下載，不是原生GPS驗收。探針使用獨立context與CDP固定座標，比較原生Date／固定Date、立即／五秒後的回應；無實體定位、無相機或地圖副作用。探針輸出觀察，不要求特定版本一定逾時，也不計入四組回歸通過數。整支舊多頁腳本曾逾時，但最小探針未重現，不能推定唯一根因；原失敗留在歷史基準。

原生對照補充：以起點的 `vendor_manual_qa.py` 只移除兩處 `clock.set_fixed_time(QA_NOW)` 後另存 `/tmp/vendor-native-date-control.py` 執行，仍在 `#capture-save` 等待逾時（exit 1）。因此不能把固定Date認定為充分或唯一原因；多頁／原生模擬定位交互作用仍待查。該暫存診斷不列入四組通過。
