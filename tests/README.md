# 重現自動驗收

測試資料不隨專案交付。請自備原始 Excel 與地籍 ZIP；照片測試使用程式生成的色塊及 EXIF，不是真正現場影像。

1. 安裝 Node.js、Python 3.11+。
2. Python 測試套件：`pip install playwright Pillow openpyxl`。安裝 Chromium，或執行 `playwright install chromium`。
3. 從專案父目錄啟動 `python -m http.server 8778 --bind 127.0.0.1`。預設專案目錄名稱為 `photosheet-static`；其他名稱可設定 `PHOTOSHEET_TEST_URL` 為完整網站根網址。
4. 設定環境變數 `PHOTOSHEET_TEST_EXCEL`、`PHOTOSHEET_TEST_KML_ZIP` 為兩份原檔的絕對路徑。可用 `PHOTOSHEET_CHROMIUM` 指定瀏覽器執行檔；未設定時找系統 chromium，再使用 Playwright 安裝的版本。
5. 在專案目錄依序執行：

```sh
node tests/core.test.cjs
python tests/browser_qa.py
python tests/acceptance_qa.py
python tests/performance_qa.py
python tests/photo_edges_qa.py
python tests/mobile_worker_qa.py
python tests/field_location_qa.py
python tests/gps_native_qa.py
python tests/code_kml_qa.py
python tests/admin_scope_completion_qa.py
```

測試只使用新的瀏覽器 context，不會操作你平常瀏覽器的任務或照片。日期固定在 2026-10-26，避免日後測試受跨月規則影響。測試期間阻擋底圖網路，驗證底圖失敗時的地籍功能；不能據此宣稱實際底圖服務可用或完成實機測試。

`reference_importer.py` 是既有 Python 匯入器的獨立驗證基準，用於比較真實 Excel 的地號、日期與工作數量；不會在部署網站執行。

照片測試以瀏覽器假相機、假 GPS 或合成 EXIF 驗證流程，仍需 Android / iPhone 實測。自動化結果放入 evidence，不要把包含真實案例的測試報告、管理備份或上傳原檔放進公開部署。

`mobile_worker_qa.py` 使用20筆虛構任務，驗證390px首屏至少6筆、注意事項位於清單後、單筆與批次白板PDF/PNG非空白、4:3取景／輸出及無黑底陰影浮水印。預設Chromium；可設定 `PS_TEST_ENGINE=webkit` 驗證WebKit版面與白板。WebKit測試需先安裝Playwright WebKit及其系統相依套件；仍不能替代真實iPhone硬體測試。

現場同頁地圖版本另外驗證：任務列點選同步地圖、地圖位於清單後且注意事項位於地圖後、導航按鈕開啟正確Google Maps位置與從地圖開啟任務，以及浮水印兩行均以照片寬度一半為中心錨點。

另外驗證純KML標示0582/1198、Excel段對照、原始資料保留、今年本月起的管理清單、單筆與批次完成／取消、完成狀態篩選、儲存失敗回滾及全部完成後發布空清單。

GPS測試包含Chromium／WebKit的定位回呼與原生watchPosition API（以模擬裝置座標注入）：移動、精度圈、回到手機位置、不覆寫任務、拒絕與逾時、舊位置標記、前背景生命週期及關閉後忽略遲到回呼。測試不代表已在真實手機GPS硬體驗證。
