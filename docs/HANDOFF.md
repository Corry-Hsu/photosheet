# photosheet 交接紀錄

整理／本次驗證日：**2026-11-20，Asia/Taipei**。閱讀順序：[規格](SPECIFICATION.md) → [ADR索引](adr/README.md) → 本文件 → [新對話指令](START_HERE.md)。

## 最新版：管理頁緊湊化（2026-11-20）

- 起點與主線：開工工作目錄乾淨；重新fetch確認主線仍為`2d0b13c`，本次從月統計PR #49的`2dc059396345f311f51ba2941af66dc13a30ce40`建立`feat/compact-admin-layout`。功能PR以`feat/admin-monthly-statistics`為base，需先合併#48、#49，再改指main。無覆蓋使用者改動；本版commit用`git log -1 -- admin-compact.css`查詢。
- 修改／理由：工具與月統計在桌面並排，手機工具四欄（兩個發布鈕各跨兩欄）；整合搜尋、類型、人員、完成及日期篩選，減少頁首／面板／表格／任務列留白。首頁品牌副標、操作教學、廠商JSON與月統計長說明、靜態地圖教學移除，按鈕短標題取代冗長標題。所有10個管理功能及廠商入口仍可用。
- 保留與未採：保留成果月份、件／筆、清單範圍／隱藏數及任務資料，發布與刪除確認、儲存／地籍進度／錯誤、圖資來源／日期／備援訊息仍在操作當下顯示。未全站隱藏p或muted、未縮現場相機、未刪功能、未裁切地號、未改資料。[ADR-0016](adr/0016-compact-manager-layout.md)局部取代0015呈現方式，統計口徑不變；規格R-15／D18同步。
- 影響模組：`index.html`、管理專用`admin-compact.css`、`app.js`管理清單範圍短文案。CSS只在管理頁載入；派工與相機／GPS／照片資料契約不變，公開data未變。
- 前後量測：同一組12件虛構資料、960px視窗高度。1440px第一列由1100.19→392px，390px由1562.78→810px，320px由1961.38→842px；月統計390px由400.78→182px。手機控制至少44px高，桌面一般控制至少36px高；320／390／844／1440px皆無橫向溢出。窄手機仍需捲動，非一屏看完的保證。
- 實測：新`admin_compact_qa.py`與`admin_monthly_stats_qa.py`、`admin_scope_completion_qa.py`、`manual_delete_qa.py`、`admin_basemap_qa.py`必要回歸共5組通過。涵蓋月份／篩選、真實新增／編輯／刪除／失敗回復與照片保留、完成／空發布、管理地圖入口／來源／備援／現場隔離。`node --check app.js`、`git diff --check`通過。命令、前後量測及檔案hash見[緊湊版驗證](verification/2026-11-20-compact-admin.json)。
- 開發中失敗：首輪320px第一列1018px，未通過850px門檻；進一步調整工具欄數、縮短按鈕與合併日期篩選後842px通過，未放寬最終門檻。截圖與原始日誌只存本機`/tmp`／evidence，未提交。
- Pages：查主線`2d0b13c`的[run 44646964050](https://github.com/Corry-Hsu/photosheet/actions/runs/44646964050) completed/success，本功能尚未合併部署。下一步依序合併前置PR與本版，再核對Pages來源及實機布局。
- 限制：本次無全套18組、WebKit、實機、私人原Excel／XML／大檔及圖資供應商可用性證據；P0原生多頁GPS未解仍保留。未提交私人檔案、公開派工變更或GitHub寫入憑證。


## 前版功能：管理頁每月任務統計（2026-11-20）

本節為本次功能交付；以下P0及第1–6節保留歷史，未將不同版本測試合併為全綠。

- 開工檢查：工作目錄乾淨，fetch後主線為`2d0b13c`，本次從PR #48的`7a1b75c0bd50e4b4292f1f618f19812cb06a2fbf`建立獨立功能分支`feat/admin-monthly-statistics`；PR以`fix/verification-baseline`為基底，須先合併#48再將功能PR改指main。無使用者改動被覆蓋。交付commit由`git log -1 -- admin-monthly-stats.js`查詢。
- 修改：新增管理專用`admin-monthly-stats.js`／CSS與`index.html`統計區，`app.js`的管理render更新統計。預設臺灣本月，可選上月，民國年月；三類與合計各列案件／地號筆數。
- 理由與口徑：依成果日期計入本機全部任務，包括已完成、隱藏舊案、未指派與重新開放。一任務一件，地號逐案累加；同地號跨案計多筆，不以案號合併，不讀三人／三廠商派工包加總。缺日期／無效日期不計，零資料顯示0。
- 未採：只算目前可見／當頁、以期限或實拍日分月、跨案去重地號、切換統計月便加回舊案、任意歷史月份或遠端同步。[ADR-0015](adr/0015-admin-monthly-statistics.md)局部取代R-06對新月統計的可見範圍限制；既有清單摘要、篩選／指派／完成／發布與照片保護保持原行為。
- 影響：管理新增／刪除、改地號／日期、匯入／還原後即時計算，搜尋或完成篩選不影響月總數。聚焦／回前景即檢查月份，前景每分鐘檢查月界，跨月保留相對本月／上月，重載預設本月。現場頁不載入統計模組；無新儲存欄位、資料遷移、API或公開data變更。
- 實際驗證：`node --test tests/core.test.cjs tests/admin-monthly-stats.test.cjs`通過（core原21個檢查＋新2個test）；新瀏覽器`admin_monthly_stats_qa.py`及必要回歸`admin_scope_completion_qa.py`、`admin_history_qa.py`三組通過。驗證使用者72件／153筆範例、已完成／隱藏／零值、清單篩選獨立、真實新增／改地號／改成果日／刪除與失敗回復、重載、臺灣跨年、320–1440px及人員頁隔離。`node --check`兩個變更JS、`git diff --check`通過。
- 開發中失敗：舊8812伺服器無回應，改啟8813；測試直接evaluate回傳Store.put函式導致Playwright代為呼叫而報錯，改成不回傳函式的callback後通過。沒有為通過測試放寬產品規則。命令、修正前後結果與檔案SHA-256見[月統計驗證](verification/2026-11-20-monthly-stats.json)。
- Pages：重新查詢主線`2d0b13c`的[run 44646964050](https://github.com/Corry-Hsu/photosheet/actions/runs/44646964050) completed/success；功能分支未合併、尚未部署。未提交任何原始evidence、照片、私人Excel／XML或備份。
- 已知限制／下一步：數字只反映這個瀏覽器已匯入的資料；非全月唯一土地數，無跨裝置同步。本次未跑全套18組、實機、WebKit、私人原檔、圖資供應商；P0原生多頁GPS未解狀態仍保留。先審查並依序合併PR #48及本功能PR，再核對Pages來源commit及管理者本機資料。


## 本次接續：P0驗證修復（2026-11-20）

本節為最新接續結果；下方第1–6節保留PR #47的歷史紀錄，不把當時16/18改寫成今日全綠。

- 起點：重新clone並fetch後，main／HEAD同為 `2d0b13c0d5830307ed449bc5412d63644edb3762`（PR #47）；無既有使用者改動。最終版本以 `git log -1 -- tests/vendor_manual_qa.py docs/HANDOFF.md` 查詢，不自填尚未產生的SHA。
- 範圍：`tests/admin_scope_completion_qa.py`、`tests/vendor_manual_qa.py`、新增原生定位診斷探針與規格／ADR／交接。正式runtime與所有公開data不變。
- 修改與理由：K-01改核對四個可見任務ID和四筆隱藏數；K-02綜合測試改成頁面時鐘一致的callback GPS，先證明有效定位，再檢查定位失敗IDB零張、恢復後原影格重試一張、正確GPS／非空JPEG。存圖成功改讀實際IDB結果，避免Promise輪詢假陽性。
- 未採：還原舊文案、加長timeout求綠、略過廠商拍照、放寬GPS保護、改公開派工或新增後端。新[ADR-0014](adr/0014-clock-consistent-browser-gps-fixtures.md)補充0013，未取代任何產品決策。
- 修前實測：在起點重跑兩支，均exit 1，與K-01／K-02失敗位置相同。廠商多頁診斷：可見頁面，native定位maximumAge=Infinity成功但timestamp約比固定Date新25天；maximumAge=5000、timeout=1500則code 3逾時。
- 修後實測：兩支原腳本完整通過（廠商為合成callback定位），必要回歸`admin_history_qa.py`與`field_photo_flow_qa.py`通過；共4組，不是18組全套。無新pageerror。命令、環境及測試檔SHA-256見[P0紀錄](verification/2026-11-20-p0.json)。
- 原生最小探針：`PHOTOSHEET_TEST_URL=http://127.0.0.1:8812/ python tests/gps_clock_probe.py` exit 0。單頁原生Date與固定Date均能取得位置，立即與5.1秒後都成功；固定Date的age為負。**未重現多頁逾時，尚未證明時鐘差是唯一根因**。合成fixture修復不代表原生定位／實機問題已排除。
- Pages：本次查GitHub Actions，main `2d0b13c` 的[run 44646964050](https://github.com/Corry-Hsu/photosheet/actions/runs/44646964050) completed/success；本分支未合併部署。這是建置來源證據，未另作線上實機驗收。
- 下一步：審查本次測試／文件提交；K-01已修復，K-02的綜合回歸已穩定驗證但原生多頁根因仍未完全確認。至少iPhone Safari／Android Chrome各一台確認GPS拒絕／重試、連拍與背景恢復；私人原檔／圖資、WebKit及全套本次未跑。原生最小探針不是產品通過門檻。

原生對照補充：以起點的 `vendor_manual_qa.py` 只移除兩處 `clock.set_fixed_time(QA_NOW)` 後另存 `/tmp/vendor-native-date-control.py` 執行，仍在 `#capture-save` 等待逾時（exit 1）。因此不能把固定Date認定為充分或唯一原因；多頁／原生模擬定位交互作用仍待查。該暫存診斷不列入四組通過。

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

### K-01：管理範圍／完成腳本的舊文案斷言（歷史；本次P0已修復）

- 重現：`PHOTOSHEET_TEST_URL=http://127.0.0.1:8812/ python tests/admin_scope_completion_qa.py`。
- 失敗：腳本預期 `4 筆其他`，現行 `app.js` 顯示 `4 筆隱藏資料` 並說明手動加回。
- 可確認：腳本前一步已見8個儲存任務、4個可見任務；不因此宣稱後續完成／空發布／回滾已由此腳本通過。
- 下一步：依R-06～R-09改成檢查可見集合與隱藏數，不依賴已取代文案，再跑完整後半流程；不要改產品文案迎合舊測試。預期為測試更新，不需順便改正式派工。

### K-02：舊廠商綜合腳本在照片儲存等待逾時（歷史；fixture已修復，原生根因仍待查）

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
