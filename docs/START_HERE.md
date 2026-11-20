# 新對話接力指令

請在 photosheet 的乾淨 checkout 貼上以下內容。不要把整段歷史聊天、私人管理備份或大量試錯日誌當起始上下文。

```text
請接續 Corry-Hsu/photosheet 靜態派工工具。
先讀 AGENTS.md、docs/SPECIFICATION.md、docs/adr/README.md、docs/HANDOFF.md，並讀本次變更相關ADR。
執行 git status、fetch 主線及 log，確認最新commit，不假設交接檔的SHA仍是HEAD；保留使用者改動。
先簡述本次目標、受影響模組及驗收方式，再執行已授權的可逆工作。
photosheet 是公開GitHub Pages靜態版，CW015及land-dispatch-hub各自獨立；不要加入登入、回傳、同步或OCR而未有本次授權。
保留一Excel列一任務、多地號、手動任務／舊案／完成／重新開放、廠商類型、JSON差異與本機照片保護。
目前記錄的基準測試有失敗，先讀HANDOFF，不把舊evidence或其他測試通過當作全部綠燈。
每完成一個可驗收版本，同步規格、ADR、交接紀錄，寫出修改、理由、未採方案、影響、實際測試與已知限制。
修改既有決策時建立新ADR並標示取代關係；缺少歷史證據寫未確認，不補寫推測。
只跑與變更相符及必要回歸測試；失敗就調查修復，通過且無新問題即完成，不無限循環。
不要提交私人原Excel/XML、管理備份、照片、含真實案例的evidence，前端不能有GitHub寫入憑證。
完成後回報commit/PR、測試與失敗、Pages狀態及下一步；新對話由使用者手動開啟。
```

資料更新工作還需明確寫：目標入口、新增或移除條件、同ID修正是否允許、既有資料保留規則。相機工作需明確寫：管理或現場、預覽或成品、滿寬是否可捲；不要把「滿寬」理解為裁切照片。
