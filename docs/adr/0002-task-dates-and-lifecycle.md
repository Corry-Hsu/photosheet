# ADR-0002：任務粒度、日期、舊案與重新開放

- 狀態：已採用（本次回溯整理；原始實作時間見PR）；僅手動來源可刪的部分由[ADR-0022](0022-manager-delete-imported-tasks.md)取代。
- 整理日：2026-11-20；核對基準：8258a42。
- 證據與範圍：[PR #1](https://github.com/Corry-Hsu/photosheet/pull/1)、[#4](https://github.com/Corry-Hsu/photosheet/pull/4)、[#26](https://github.com/Corry-Hsu/photosheet/pull/26)；[core.js](../../core.js)、[admin-history.js](../../admin-history.js)。

## 背景

一筆 Excel 紀錄可能有多個地號；成果照片指定日、期限與實拍時間不同。舊月工作不得隨意改派，但使用者後續需要找回前月案件繼續派工。

## 決策／改了什麼

以 task.id 為案件鍵、Excel一列一案；resultDate／due／capturedAt 分開。當年本月至年底為預設清單；舊案用 assignmentClosed／assignmentLockedTo 限制。明確加回才設 reopenedForDispatch、清完成與鎖定，恢復人員及廠商發布。

## 為什麼

符合使用者更正「一行代表一任務」及「加回也要重新開放派工」；保留原日期與歷史，不用改日期繞鎖。手動新增以獨立manual識別並保留原地籍，編號空白不當成可刪依據，避免誤刪Excel案。

## 未採用／已取代的方案

不採每地號拆案、照片日期一律用實拍日、僅隱藏舊案卻仍允許改派、只加回畫面而不解鎖。也未批次把所有舊案寫成 completed=true；舊需求「當完成」在現況主要以歸檔／不可派處理，是否回填完成欄位尚未核實為已決新需求。

## 影響與取捨

地號及工作數量不重複；原圖日期不重製。沒有有效成果日期的任務保留但通常不顯示／不可正常發布；前月搜尋不等於全歷史恢復。完成與關閉派工是不同欄位。

補充來源：[PR #31](https://github.com/Corry-Hsu/photosheet/pull/31)（新增地號）、[#38](https://github.com/Corry-Hsu/photosheet/pull/38)（只刪手動來源）。

## 驗證與後續

對應[規格完成定義](../SPECIFICATION.md#9-可驗證完成定義產品變更)，實際結果及未通過項目見[交接](../HANDOFF.md)。修改此決策時新增ADR並標示本編號被取代的確切範圍，不刪除本紀錄。

2026-11-20補充：[ADR-0015](0015-admin-monthly-statistics.md)為管理月統計採用全部本機任務，局部取代規格R-06對統計的可見範圍限制；本ADR的任務、日期與生命週期決策仍有效。

後續：[ADR-0022](0022-manager-delete-imported-tasks.md)允許管理者確認後逐筆刪除Excel／文件等來源，取代只刪手動來源限制；任務粒度、舊案、完成、照片與地籍保護仍沿用。
