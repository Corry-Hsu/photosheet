# 本機地籍面積精簡工具

下載 [Windows 工具 ZIP](../downloads/land-area-converter.zip)，解壓縮後執行 `run_land_area_converter.bat`。需要 Python 3，無第三方套件。預設來源 `F:\T_XML`，亦可把另一個資料夾拖到 BAT 檔。程式不連線、不修改原檔；產出帶時間的新目錄、報告及 ZIP。

輸出僅包含地段名稱／代碼、鄉鎮、縣市、地號與登記面積，不包含所有權人、統一編號、管理者或持分。依臺灣土地登記慣例以㎡表示，來源範例未另列單位。重複地號合併；不同面積與缺漏明確標示，不以任意值替代。

有 `manifest.csv` 時檢查列出的 XML 是否齊全；有 `schema-xml.csv` 時檢查必要欄位。完成後傳回產出的 ZIP 即可，不必傳回原始 XML。這是線上面積參考資料的準備工具，目前不會自行更新 GitHub 或管理頁任務。

手動執行：

```powershell
py -3 .\build_land_area_catalog.py "F:\T_XML" ".\land-area-new"
```

驗證：`python tests/land_area_converter_test.py`。包含重複所有權紀錄去重、小數處理、面積衝突、個資欄位排除、DTD／實體拒絕、缺檔停止、來源保護與實際 ZIP 內容。
