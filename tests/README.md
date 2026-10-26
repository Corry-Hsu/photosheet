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
```

測試只使用新的瀏覽器 context，不會操作你平常瀏覽器的任務或照片。日期固定在 2026-10-26，避免日後測試受跨月規則影響。測試期間阻擋底圖網路，驗證底圖失敗時的地籍功能；不能據此宣稱實際底圖服務可用或完成實機測試。

`reference_importer.py` 是既有 Python 匯入器的獨立驗證基準，用於比較真實 Excel 的地號、日期與工作數量；不會在部署網站執行。

照片測試以瀏覽器假相機、假 GPS 或合成 EXIF 驗證流程，仍需 Android / iPhone 實測。自動化結果放入 evidence，不要把包含真實案例的測試報告、管理備份或上傳原檔放進公開部署。
