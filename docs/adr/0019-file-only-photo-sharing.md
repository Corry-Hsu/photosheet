# ADR-0019：照片分享僅傳送檔案

- 狀態：已採用；2026-11-23（Asia/Taipei）。
- 起點：`24f6822621111e8d7b71b28bbce0b0a0ffd89884`（main，#54已合併）。
- 關係：補充 ADR-0010；取代目前程式在單張／ZIP分享附上title的行為，不改照片保存與取消／重試規則。
- 來源：使用者LINE截圖顯示，ZIP檔之前多出「任務照片 ZIP」文字，要求只傳檔案。

## 決策與理由

`field-camera.js`單張JPEG（拍後及放大檢視）與相簿ZIP的Web Share資料都僅傳 `{ files: [file] }`，不附title、text或url。原程式分別附帶「任務照片」、「任務照片 ZIP」作title；移除應用主動提供的標題，避免分享接收端將它作為額外聊天文字。

## 未採與影響

未只清空text卻保留title、未改照片／ZIP檔名、未改ZIP位元組或拆成多次分享、不串接LINE API或自動發訊息。僅改兩個分享呼叫及六個現場入口JS版本；相機版面、GPS、照片與公開data不變。保留取消不下載／不刪除、JPEG分享失敗下載備援、ZIP失去手勢後可再按分享或下載。

## 驗證與限制

新增完整payload鍵值檢查後，修正前bulk suite因title仍存在而失敗；移除後 `bulk_photos_qa.py`、`field_photo_flow_qa.py`兩組Chromium通過。驗證JPEG拍後／放大檢視與人員／廠商ZIP只含files，單次一檔、位元組／檔名保留、取消不刪資料、JPEG失敗下載同位元組、ZIP重試／重新手勢與批刪回復沿用。JS語法及diff檢查通過，結果見[交接](../HANDOFF.md)及[驗證紀錄](../verification/file-only-photo-share.json)。

未實際向LINE送檔，也未跑iPhone／Android或WebKit。接收端與系統分享面板最終如何顯示檔案仍需實機確認；本次證明的是網站不再附帶文字欄位。未跑全套測試，P0原生多頁GPS未解狀態仍保留。
