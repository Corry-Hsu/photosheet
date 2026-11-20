# photosheet 交接紀錄

整理／本次驗證日：**2026-11-20，Asia/Taipei**。閱讀順序：[規格](SPECIFICATION.md) → [ADR索引](adr/README.md) → 本文件 → [新對話指令](START_HERE.md)。

## 1. 版本與目前完成範圍

| 項目 | 可查證基準 |
|---|---|
| 儲存庫 | Corry-Hsu/photosheet，main |
| 實作＋公開資料基準 | `8258a4226ab3f62e10c0d1ebdcd83f58f631161f`（8258a42） |
| 最近功能變更 | PR #46，merge `05c03782a392e5d2f1765a7c86e2ad17a15d8812`：相機滿寬／去說明／後置超廣角優先 |
| 隨後資料提交 | `58a6a7c09e122aa476b046bb859d5afccf9cbe41`、`8258a4226ab3f62e10c0d1ebdcd83f58f631161f`：更新／移除部分worker/vendor JSON，非新相機程式 |
| package metadata | `photosheet-static`，`1.0.0-rc.1`，沒有宣稱正式SemVer新版本 |
| 檢查時Pages | built，main `/`，上述8258a42，Actions run [44257683651](https://github.com/Corry-Hsu/photosheet/actions/runs/44257683651) success |
| 網址 | https://corry-hsu.github.io/photosheet/ |
| 本次工作 | 規格、13份ADR、測試／問題基準、接力規則、README整合；**沒有改runtime或data** |

本文的基準SHA是被驗證的版本，不是聲稱本文自身SHA。文件merge後HEAD／Pages會有新的提交；前端與data仍是上述已驗證內容。本文自身版本用 `git log -1 -- docs/HANDOFF.md` 查詢，接手前一律重新fetch核對。

靜態派工、KML/XML索引、精簡面積、主動分配、廠商、工作區差異、文件、地圖、GPS、本機照片均已有實作。照片回傳、多人同步、OTP／裝置認證、自動認領、CW015 OCR／排版不在現行產品。歷史至少2張需求尚無現場強制門檻；目前人員顯示張數、廠商不計完成張數，沒有後端完成機制。

## 2. 公開派工資料快照

以實際 DispatchPlan.validate 驗證六份資料，格式及入口／標籤相符，未發現任務重複ID。這是資料結構驗證，不代表每案地籍完整、日期合理或現地導航已人工核對；不改動這些檔案。

| 檔案 | 任務 | 圖形 | 驗證／重複任務ID數 |
|---|---:|---:|---|
| `worker-1.json` | 11 | 8 | valid／0 |
| `worker-2.json` | 3 | 2 | valid／0 |
| `worker-3.json` | 0 | 0 | valid／0 |
| `vendor-1.json` | 12 | 10 | valid／0 |
| `vendor-2.json` | 4 | 4 | valid／0 |
| `vendor-3.json` | 3 | 6 | valid／0 |

檔案SHA-256及測試機器可讀紀錄見 [baseline.json](verification/2026-11-20-baseline.json)。不要用這些公共派工子集推定管理者本機Excel或私人備份有同樣筆數。

## 3. 本次實際驗證

在8258a42內容的文件分支執行，獨立Chromium context、合成任務／GPS／相機／圖磚、真實瀏覽器IDB及下載。沒有操作使用者平常的瀏覽器、沒有向GitHub寫入派工，沒有真實手機硬體。

- Node：`node --test tests/core.test.cjs tests/dispatch-plan.test.cjs tests/land-area.test.cjs`，**3個測試檔通過**。不是宣稱只有／共有3個內部斷言。
- XML converter：`python tests/land_area_converter_test.py`，**8 tests通過**。
- JavaScript：Git追蹤25個JS檔逐一 `node --check`，**25/25通過**。
- 公開派工JSON：**6/6 validate通過**，各檔無重複任務ID。
- 瀏覽器：**18組腳本中16通過、2失敗**，不能稱全面驗收完成。

| 腳本 | 本次結果 | 約耗時 |
|---|---|---:|
| `full_width_camera_qa.py` | 通過 | 7.57 秒 |
| `camera_optics_qa.py` | 通過 | 6.14 秒 |
| `full_frame_live_qa.py` | 通過 | 8.88 秒 |
| `field_photo_flow_qa.py` | 通過 | 9.33 秒 |
| `bulk_photos_qa.py` | 通過 | 4.75 秒 |
| `field_location_qa.py` | 通過 | 2.92 秒 |
| `field_basemap_qa.py` | 通過 | 6.28 秒 |
| `mobile_worker_qa.py` | 通過 | 10.22 秒 |
| `admin_scope_completion_qa.py` | **失敗** | 3.26 秒 |
| `auto_dispatch_qa.py` | 通過 | 4.9 秒 |
| `vendor_manual_qa.py` | **失敗** | 66.89 秒 |
| `admin_history_qa.py` | 通過 | 6.0 秒 |
| `manual_delete_qa.py` | 通過 | 4.75 秒 |
| `parcel_add_qa.py` | 通過 | 3.76 秒 |
| `dispatch_tools_qa.py` | 通過 | 5.24 秒 |
| `land_areas_qa.py` | 通過 | 4.89 秒 |
| `admin_basemap_qa.py` | 通過 | 4.61 秒 |
| `code_kml_qa.py` | 通過 | 2.86 秒 |

`npm test`目前只跑core，**不等於全部上述測試**。舊evidence有Chromium／WebKit報告但未Git追蹤，本次不把它們當相同commit的通過證據；未提交可能含私人案例的原始日誌或圖片。

## 4. 已知問題與可重現步驟

### K-01：管理範圍／完成腳本的舊文案斷言

- 重現：`PHOTOSHEET_TEST_URL=http://127.0.0.1:8812/ python tests/admin_scope_completion_qa.py`。
- 失敗：腳本預期 `4 筆其他`，現行 `app.js` 顯示 `4 筆隱藏資料` 並說明手動加回。
- 可確認：腳本前一步已見8個儲存任務、4個可見任務；不因此宣稱後續完成／空發布／回滾已由此腳本通過。
- 下一步：依R-06～R-09改成檢查可見集合與隱藏數，不依賴已取代文案，再跑完整後半流程；不要改產品文案迎合舊測試。預期為測試更新，不需順便改正式派工。

### K-02：舊廠商綜合腳本在照片儲存等待逾時

- 重現：`PHOTOSHEET_TEST_URL=http://127.0.0.1:8812/ python tests/vendor_manual_qa.py`。此腳本用Chromium假裝置與瀏覽器地理模擬，包含多個廠商頁／批次／本機入口操作。
- 初次結果：等 `#capture-save` 不隱藏時逾時，exit 1；不能報廠商流程全通過。
- 額外診斷：狀態是「無法取得定位…Timeout expired」，photos陣列為空，畫面仍在照片處理中且有重試儲存指示。這符合「無GPS不產生假成果」的保護，但**未確認根因只在測試或也影響某些真實瀏覽器**。
- 相對證據：full_width_camera、field_photo_flow、camera_optics等以確定GPS回呼驗證均通過；不能據此遮蓋本失敗。
- 下一步：縮小為單廠商＋同來源地理授權／定位fixture，檢查固定Date與原生GPS timestamp／maximumAge互動、前背景多頁、watch與getCurrentPosition；避免把async Promise本身當wait_for_function成功。先證明fixture確實提供有效位置，再判斷是否需修正式相機，之後原腳本與實機都重測。

### K-03：尚未實機驗收與外部服務

- 本次未跑真iPhone Safari／Android Chrome：權限、可見鏡頭、真0.5×、直橫方向、高解析度記憶體、分享／儲存、白板下載、Google導航都待裝置＋瀏覽器版本＋結果紀錄。
- 未重跑原使用者Excel／完整T.zip的端對端與效能；不要把合成KML／工作表當真實原檔驗收。
- 本次未重測外部UAV／NLSC瓦片；已知2026-11-11 UAV目錄可讀但圖磚抽樣503，這是歷史現象，不宣稱現在仍故障或已恢復。合成瓦片可驗證降級，不能證明供應商可用。
- 本次未安裝／執行WebKit；歷史WebKit報告不是iPhone實機證明。

### K-04：穩定的產品限制

本機資料不跨裝置同步，備份不含照片；新現場JPEG不保證EXIF GPS；靜態固定網址非認證；無service worker完整離線啟動；局部UAV非全縣。程式有HubAPI等相容分支不代表Pages有後端注入。原XML／管理備份不能拿來當公開data。這些不是本次要偷偷補上的功能。

### K-05：兩張照片需求的落地界線

早期要求每案至少2張；現場field-camera目前僅在相簿顯示人員張數，沒有每任務最低張數設定、明確2張警示或自動完成。管理用舊camera.js仍有2張建議，不能代替現場功能。後端回傳與完成已另案，是否要補回純本機提示／檢查需後續需求確認，不在文件提交中順便新增。

## 5. 下一步優先順序

1. **P0 驗證基準修復**：獨立提交更新K-01測試及調查K-02，不改斷言求假綠；保存先後結果。若發現產品bug，再按相關ADR與DoD處理。
2. **P1 實機清單**：至少一台iPhone Safari、一台Android Chrome；記錄型號／OS／瀏覽器、HTTPS授權、後置超廣角、滿寬長圖捲動、浮水印位置、連拍、拒絕GPS／重試與容量、分享、白板與導航。
3. **P1 真實資料與圖資**：在本機不公開原檔的前提重跑Excel／地籍大檔及面積、抽樣核對代表點／入口、確認外部影像來源與fallback。
4. **P2 發布治理**：後續每版用規格＋ADR＋交接閉環；來源快照與公開data分開看，避免資料提交被誤稱功能版本；視需要再規劃CI，不宣稱現在已有CI自動驗收。

使用者本次只要求完整文件。本次**不擴大修復應用、補後端、變更派工資料或改CW015**。是否啟動上述功能工作，以後續指令為準。

## 6. 安全接力與回退

```sh
git status --short
git fetch origin main
git log -8 --oneline
# 比對實作差異與資料差異；不得reset/clean掉使用者未提交檔
```

乾淨checkout啟動本機伺服器後，依 [tests/README](../tests/README.md) 設定各suite URL。不要服務含私人備份的工作區上層目錄。測試使用固定日期，但使用者工作與顯示日期採Asia/Taipei。

文書更正用新的docs提交；產品回退只選授權的程式變更，不整包把main/data退回舊月。每次公開JSON提交核對入口、任務ID與欄位／KML引用；Pages完成後比對對應來源。要開始新對話，使用START_HERE與本次目標，不把整份試錯聊天餵回去。
