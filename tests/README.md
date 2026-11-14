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
python tests/field_photo_flow_qa.py
python tests/mobile_worker_qa.py
python tests/field_location_qa.py
python tests/gps_native_qa.py
python tests/code_kml_qa.py
python tests/admin_scope_completion_qa.py
python tests/auto_dispatch_qa.py
python tests/vendor_manual_qa.py
```

測試只使用新的瀏覽器 context，不會操作你平常瀏覽器的任務或照片。日期固定在 2026-10-26，避免日後測試受跨月規則影響。測試期間阻擋底圖網路，驗證底圖失敗時的地籍功能；不能據此宣稱實際底圖服務可用或完成實機測試。

`reference_importer.py` 是既有 Python 匯入器的獨立驗證基準，用於比較真實 Excel 的地號、日期與工作數量；不會在部署網站執行。

照片測試以瀏覽器假相機、假 GPS 或合成 EXIF 驗證流程，仍需 Android / iPhone 實測。自動化結果放入 evidence，不要把包含真實案例的測試報告、管理備份或上傳原檔放進公開部署。

`mobile_worker_qa.py` 使用20筆虛構任務，驗證390px首屏至少6筆、注意事項位於清單後、單筆與批次白板PDF/PNG非空白、4:3取景／輸出及無黑底陰影浮水印。預設Chromium；可設定 `PS_TEST_ENGINE=webkit` 驗證WebKit版面與白板。WebKit測試需先安裝Playwright WebKit及其系統相依套件；仍不能替代真實iPhone硬體測試。

現場同頁地圖版本另外驗證：任務列點選同步地圖、地圖位於清單後且注意事項位於地圖後、導航按鈕開啟正確Google Maps位置與從地圖開啟任務，以及浮水印兩行均以照片寬度一半為中心錨點。

另外驗證純KML標示0582/1198、Excel段對照、原始資料保留、今年本月起的管理清單、單筆與批次完成／取消、完成狀態篩選、儲存失敗回滾及全部完成後發布空清單。

GPS測試包含Chromium／WebKit的定位回呼與原生watchPosition API（以模擬裝置座標注入）：移動、精度圈、回到手機位置、不覆寫任務、拒絕與逾時、舊位置標記、前背景生命週期及關閉後忽略遲到回呼。測試不代表已在真實手機GPS硬體驗證。

`auto_dispatch_qa.py` 驗證11個指定鄉鎮給人員一、其他鄉鎮給人員二，新匯入與既有任務套用、保留手動人員三、舊案／完成／鎖定不改派、儲存失敗回滾、按人員選擇直接下載JSON及手機寬度。

`vendor_manual_qa.py` 使用合成資料驗證手機手動新增三類任務、多地籍列、欄位錯誤／儲存失敗回滾、六份按入口JSON、廠商標籤隔離、KML多地號圖形、座標與地圖設定本機入口／重整／新批次重設、PDF非空白，以及廠商相機不顯示完成張數。支援Chromium與WebKit，WebKit不以假相機代替實機拍攝驗收。

`field_photo_flow_qa.py` 驗證任務自動滑到地圖、地圖拍照與清單詳情白板／拍照路徑、滿版橫直取景與不溢出、拍後預覽含浮水印JPEG、連拍、相簿放大、GPS／寫入失敗保留畫面重試，以及廠商無篩選、人員保留篩選。Chromium使用模擬裝置相機及GPS；WebKit使用合成相機畫面與GPS回呼，但照片實際寫入IndexedDB。兩者皆不能代替實體手機驗收。

舊 `photo_edges_qa.py` 保留為新測試的相容入口；原生相機選取／EXIF流程已從現場介面移除，因此以新流程測試取代。`mobile_worker_qa.py` 保留清單、地圖與文件測試，照片細節由新測試負責。

`landscape_uncropped_qa.py` 以1600×900的16:9合成影像，在直式與橫式螢幕分別拍攝並檢查輸出尺寸與四角色標，確認完整保留畫面；也驗證紅叉地圖按鈕移除、詳情白板保留。

`camera_optics_qa.py` 用合成硬體能力驗證 Chromium／WebKit 的無框取景、縮放限制與連續操作、縮放失敗還原、指定裝置切換、切換失敗復原、不支援與列舉失敗降級、連拍保留鏡頭、非同步離開釋放相機及橫直畫面不溢出。實體手機是否開放超廣角須另外確認，不由模擬測試推定。

`bulk_photos_qa.py` 用真實IndexedDB驗證：部分選取／全選、ZIP解壓後檔名與位元組（只含指定浮水印照片，排除原圖與其他任務／人員）、分享成功／取消／需新手勢的重試、打包失敗保留資料、確認取消、批次刪除失敗整批回復與重試、重載持久性、空相簿、廠商與手機橫直排版。另驗證上傳回應不會復活已刪本機照片，以及更新維持WebKit相容的位元組儲存。

`field_basemap_qa.py` 在Chromium／WebKit驗證正射影像延遲載入、z/y/x路徑、來源標示、反覆切換保留地籍／GPS／入口／導航／視野、偏好記憶、無重複介面、圖資失敗回復一般地圖、無localStorage降級、廠商及管理頁不變、手機版面。圖磚在測試內合成；另實測官方PHOTO2之屏東位置圖磚回傳HTTP200、JPEG256×256，服務未來可用性仍依供應端。

`full_frame_live_qa.py` 驗證即時日期時間GPS、浮水印相對影像的位置／陰影與成品一致、contain留白定位、直拍／橫拍及大於4096px照片的完整尺寸與四角色標、原生照片API及EXIF方向、API失敗時完整影格降級、定位未取得與重試、拍照／離開清理定位監聽。Chromium與WebKit均使用合成硬體畫面及真實JPEG／IndexedDB，仍需實機確認裝置實際提供的解析度。

長邊浮水印另以畫布轉換與JPEG白字像素邊界驗證：直式在左側長邊旋轉90°、橫式在下方，預覽／成品位置及陰影一致，照片方向、尺寸及四角不變。

`admin_history_qa.py` 用31筆合成資料驗證前月搜尋（跨年、閏日）、20筆分頁、地段地號混合搜尋、加回並重新開放、篩選重設、日期地號導航及其他任務不變、選取任務可指派並給廠商／未選取舊案仍鎖定、失敗回復重試、備份與重載持久性、無重複及手機版面，並確認現場頁沒有歷史搜尋介面。

`dispatch-plan.test.cjs` 驗證不可變的追加合併、ID 與案件去重、逐欄修正、共用 KML 保留、重讀基準後的失效修正／暫停移除、廠商與負責人限制、不安全資料拒絕，以及六份現有資料無操作時逐欄不變。

`dispatch_tools_qa.py` 使用合成的六入口公開資料，驗證批次鄉鎮移除、實際下載 JSON、地號與 KML 修正同步、重複去除、版本衝突與斷線阻擋、無效多檔整批拒絕、草稿隔離／重載、管理頁直接帶入、四種螢幕寬度及現場頁不受影響。`DISPATCH_TEST_URL` 預設 `http://127.0.0.1:8804/`；需要 Chromium 與 Playwright。草稿／下載均發生在測試瀏覽器，正式 `data` 檔案不變。

`parcel_add_qa.py` 驗證既有任務新增／取消新地號列、空白及重複拒絕、儲存失敗完整回復與重試、保留原始地籍及導航、同段與跨段代碼 KML 配對、清單刷新與重載、實際人員／廠商發布包包含新增地號及範圍，以及手機與電腦排版。使用合成資料；`PARCEL_TEST_URL` 預設 `http://127.0.0.1:8804/`。

`land-area.test.cjs` 驗證精確小數、同地號去重、真實關帝段範例加總、缺漏及衝突阻擋、代碼／地段不一致、讀取失敗、舊預覽拒絕、面積追溯與失效、全部907地段／182597筆資料的欄位及內容，及發布整理變更地籍後不得沿用舊面積。

`land_areas_qa.py` 在真實瀏覽器使用精簡地籍檔與合成任務，確認只下載必要地段、預覽不變更資料、完整與部分配對、套用／儲存失敗回復、原導航及施作數量保留、重新載入、實際工作單 XLSX 與人員／廠商 JSON、斷線重試、過期預覽拒絕、地號編輯失效及詳情單筆重算、無效索引阻擋、手機與電腦排版、現場頁隔離。`AREA_TEST_URL` 預設 http://127.0.0.1:8806/；不修改正式派工檔。

`admin_basemap_qa.py` 在真實管理頁使用公開影像目錄及合成 JPEG 圖磚，驗證延遲讀取、EPSG:4326 範圍與 z/y/x 路徑、影像裁限、日期來源、地籍／入口／視野與管理資料不變、局部缺影像、手動選影像、UAV→全區正射→一般地圖備援、偏好及現場頁隔離、無效目錄與遲到回應、手機及電腦版面。外部實測另確認 NLSC 屏東圖磚 HTTP200/JPEG256×256；本次環境 BigGIS 影像目錄可讀，但其圖磚主機抽樣三區回503連線逾時，沒有以合成圖磚測試冒稱真實服務可用。`ADMIN_MAP_TEST_URL` 預設 http://127.0.0.1:8808/。

`manual_delete_qa.py` 以合成管理資料驗證手動任務清單／詳情刪除、確認取消、儲存失敗完整回復與重試、寫入期間防重複操作、勾選與地圖清理、共用 KML 與照片保留、舊手動識別碼及自訂編號、未編號 Excel 不可刪、重新載入持久性、完整快照發布排除已刪任務、最後分頁修正、手機／電腦排版及現場頁無刪除按鈕。`DELETE_TEST_URL` 預設 http://127.0.0.1:8810/；操作僅在獨立測試瀏覽器的 IndexedDB，不更改正式派工 JSON。
