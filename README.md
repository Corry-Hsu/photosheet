# photosheet｜地籍任務靜態派工工具

管理者匯入 Excel／手動任務、配對地籍範圍與面積、分派給三位人員及三個固定類型廠商，透過 GitHub Pages 發布。現場端查看任務、地圖與導航，輸出白板，拍攝並保存含日期及 GPS 浮水印的照片。

## 權威文件與接手順序

本 README 為入口；歷史版本中的滑桿、4:3 裁切、拍攝下一張等描述已被取代。以下文件以 **2026-11-20／主線 8258a42** 為實作與資料基準：

1. [規格書：現況、限制、資料契約及完成定義](docs/SPECIFICATION.md)
2. [ADR 決策索引與歷史取代關係](docs/adr/README.md)
3. [交接紀錄：commit、驗證、已知問題、下一步](docs/HANDOFF.md)
4. [新對話交接指令](docs/START_HERE.md)
5. [測試重現與涵蓋範圍](tests/README.md)

**目前有兩組已記錄的基準驗證失敗，尚未達成全面綠燈**；原因與限制見交接紀錄。瀏覽器合成測試不能代替真正 iPhone／Android 驗收。

## 網址與部署

- 儲存庫：[Corry-Hsu/photosheet](https://github.com/Corry-Hsu/photosheet)
- 管理頁：[index.html](https://corry-hsu.github.io/photosheet/)
- 人員：`worker-1.html`、`worker-2.html`、`worker-3.html`，對應 `data/worker-N.json`。
- 廠商：`vendor-1.html` 雜草垃圾、`vendor-2.html` 砍樹、`vendor-3.html` 圍籬，對應 `data/vendor-N.json`。
- 舊照片排版工具：`photosheet-app.html`，與新派工頁並存，不作為本次 ADR 改寫對象。

GitHub Pages 從 **main 根目錄**部署，無遠端後端、登入或 GitHub 寫入憑證。瀏覽器仍使用 IndexedDB 保存本機資料；不等於完全沒有資料庫。公開入口不構成權限隔離。

乾淨 checkout 可本機測試（不要把私人備份、原始 XML、照片放進被服務的目錄）：

```sh
python -m http.server 8000 --bind 127.0.0.1
# 開啟 http://localhost:8000/；相機／GPS 正式使用需 HTTPS。
```

不支援直接雙擊 HTML 的 file:// 使用方式；手機連電腦的普通 HTTP IP 網址不保證有相機或 GPS 權限。

## 日常工作

1. 管理頁匯入 Excel（砍樹／圍籬／雜草垃圾）或手動新增。**Excel 一行是一筆任務，一案可含多地號**。
2. 匯入 KML／XML／ZIP，或依四碼段代號與地號配對已有索引；管理頁核對地圖及導航入口。需要面積時，預覽並套用精簡 XML 登記面積。
3. 自動依鄉鎮分派或手動調整。舊月份、完成、重新開放等規則見規格書；不要刪除隱藏舊案。
4. 選人員／廠商直接匯出完整 JSON，或使用「整理發布資料」追加、移除與逐欄差異核對。下載本身不會修改 GitHub。
5. 上傳核對過的同名 JSON 至 `data/`，等 Pages 部署完成，現場端重新整理派工資料。
6. 現場點任務自動捲到地圖；詳情可輸出白板／現場拍照。照片在此裝置暫存，需下載或分享備份。

## 操作細節

- [整理發布資料與衝突保護](docs/dispatch-workbench.md)
- [XML 面積配對、來源及計算](docs/land-area.md)
- [管理頁局部 UAV 正射與全區備援](docs/admin-basemap.md)
- [本機 XML 精簡工具](tools/README.md)
- [隨附套件與授權](DEPENDENCIES.md)

管理備份不含照片，不能上傳公開 GitHub。現場新照片以含浮水印 JPEG 為主要成果，EXIF GPS 不保證保留。靜態版不回傳照片、不做多人同步、沒有自動認領／簡訊驗證／後端兩張照片完成機制。`land-dispatch-hub` 及本機 CW015 各自獨立，不能將其未實作功能寫成 photosheet 已完成。
