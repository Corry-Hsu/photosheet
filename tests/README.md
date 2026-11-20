# 重現驗證與測試範圍

現行規格見 [SPECIFICATION](../docs/SPECIFICATION.md)，本次commit／真實成功與失敗見 [HANDOFF](../docs/HANDOFF.md)，可讀取的結果為 [2026-11-20 baseline](../docs/verification/2026-11-20-baseline.json)。**目前基準16/18瀏覽器腳本通過，另2組失敗，不是全套綠燈。**

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
| 管理月份／完成／空清單 | `admin_scope_completion_qa.py` | **本次失敗：舊文字斷言，後半未驗完** |
| 前月搜尋、加回與再發布 | `admin_history_qa.py` | 跨年、閏月、回滾、本機備份；HISTORY_TEST_URL |
| 鄉鎮自派／選擇發布 | `auto_dispatch_qa.py` | 11鄉鎮、p3保留、舊案保護 |
| 手動任務＋廠商綜合 | `vendor_manual_qa.py` | **本次拍照等待失敗，診斷GPS逾時**；不能報全通過 |
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
