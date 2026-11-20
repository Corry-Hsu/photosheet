# ADR-0006：管理入口與手機 GPS 的分離

- 狀態：已採用（本次回溯整理；原始實作時間見PR）。
- 整理日：2026-11-20；核對基準：8258a42。
- 證據與範圍：[PR #5](https://github.com/Corry-Hsu/photosheet/pull/5)、[#6](https://github.com/Corry-Hsu/photosheet/pull/6)、[#9](https://github.com/Corry-Hsu/photosheet/pull/9)、[#11](https://github.com/Corry-Hsu/photosheet/pull/11)；[app.js](../../app.js)、[field-location.js](../../field-location.js)。

## 背景

地籍代表點未必為入口；現場需要知道自己在哪，但廠商點圖誤改位置會影響導航。

## 決策／改了什麼

管理者仍可點圖／拖釘／輸入座標；現場地圖主工具列的點圖設定按鈕移除，人員詳情仍可改在地圖設定；廠商不提供點圖且圖釘不可拖，人員拖釘與詳情座標只存本機batch override。單鍵切換GPS追蹤，藍點／精度圈與任務橘點分離，前背景生命週期控制。

## 為什麼

依使用者明確要求「廠商拿掉，管理頁不能動」及後續地圖操作簡化；本機校正不擅自改管理者的正式入口。

## 未採用／已取代的方案

未採把GPS藍點當任務入口、追蹤時不斷搶回地圖、所有角色都可點圖改正式資料、為移除現場按鈕同時刪管理功能。

## 影響與取捨

本機入口依batch，重新發布可能重設；定位並非派工回報或歷史軌跡。GPS需要權限並可能過期；導航Google URL只提供目的地，不保證道路可達。

## 驗證與後續

對應[規格完成定義](../SPECIFICATION.md#9-可驗證完成定義產品變更)，實際結果及未通過項目見[交接](../HANDOFF.md)。修改此決策時新增ADR並標示本編號被取代的確切範圍，不刪除本紀錄。
