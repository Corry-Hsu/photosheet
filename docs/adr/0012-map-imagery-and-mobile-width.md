# ADR-0012：底圖備援、範圍配色與手機地圖滿寬

- 狀態：已採用（本次回溯整理；原始實作時間見PR）。
- 整理日：2026-11-20；核對基準：8258a42。
- 證據與範圍：[PR #14](https://github.com/Corry-Hsu/photosheet/pull/14)、[#15](https://github.com/Corry-Hsu/photosheet/pull/15)、[#34](https://github.com/Corry-Hsu/photosheet/pull/34)、[#35](https://github.com/Corry-Hsu/photosheet/pull/35)、[#45](https://github.com/Corry-Hsu/photosheet/pull/45)；[field-basemap.css](../../field-basemap.css)、[admin-basemap.js](../../admin-basemap.js)。

## 背景

衛星／正射背景下藍綠地籍不清楚；管理者希望不同來源正射，現場希望手機地圖用足左右寬度。

## 決策／改了什麼

地籍統一細紅框＋半透明橘填。現場NLSC PHOTO2與OSM，管理另加局部UAV與逐級備援，偏好分開；切底圖不丟地籍／GPS／入口。980px以下現場地圖貼viewport邊，控制保留內距，管理及桌面不套用。

## 為什麼

符合使用者明確視覺／來源需求；局部UAV不承諾全區完整，範圍及日期需要明示。

## 未採用／已取代的方案

不採全站共用單一圖資偏好、把局部UAV當全縣正射、影像失效就清地籍、整縣預抓瓦片或只改地籍顏色卻保留不清楚填色。

## 影響與取捨

外部供應可故障，合成瓦片測試不能證明正式服務可用。地圖width改動只在現場專用CSS，與相機滿寬是不同決策，不要誤套管理頁或照相crop。

## 驗證與後續

對應[規格完成定義](../SPECIFICATION.md#9-可驗證完成定義產品變更)，實際結果及未通過項目見[交接](../HANDOFF.md)。修改此決策時新增ADR並標示本編號被取代的確切範圍，不刪除本紀錄。
