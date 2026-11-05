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
