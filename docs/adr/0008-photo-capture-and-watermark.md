# ADR-0008：完整取像與長邊浮水印

- 狀態：已採用（本次回溯整理；原始實作時間見PR）。
- 整理日：2026-11-20；核對基準：8258a42。
- 證據與範圍：[PR #10](https://github.com/Corry-Hsu/photosheet/pull/10)、[#11](https://github.com/Corry-Hsu/photosheet/pull/11)、[#16](https://github.com/Corry-Hsu/photosheet/pull/16)、[#17](https://github.com/Corry-Hsu/photosheet/pull/17)；[field-camera.js](../../field-camera.js)。

## 背景

4:3框、4096縮圖與方向不一致曾讓照片缺角；使用者要求取景就看到成果日期／時間與GPS，並指定直式左側長邊。

## 決策／改了什麼

現場用getUserMedia／video，優先ImageCapture.takePhoto、EXIF方向解碼；失敗用完整video影格，不指定aspect、不裁切縮圖。成品Canvas加浮水印：任務指定日＋快門實際臺灣時間＋GPS精度，白字陰影透明底，直式左側90°、橫式下方。預覽與成品共用繪製。

## 為什麼

這是使用者多輪更正後的明確成果要求，取代早期預設4:3／橫式模板及短邊文字位置。

## 未採用／已取代的方案

已取代早期4:3裁切、4096限制、黑底浮水印、固定以螢幕方向決定文字。現場也移除原生input相機入口及原圖／浮水印分開下載操作。

## 影響與取捨

JPEG會重新編碼，EXIF GPS不保證保留；肉眼GPS文字與IDB gps欄位不同。實際鏡頭、解析度及native still視野由瀏覽器決定，無法保證等同每款原生相機；不能虛稱防偽。

## 驗證與後續

對應[規格完成定義](../SPECIFICATION.md#9-可驗證完成定義產品變更)，實際結果及未通過項目見[交接](../HANDOFF.md)。修改此決策時新增ADR並標示本編號被取代的確切範圍，不刪除本紀錄。
