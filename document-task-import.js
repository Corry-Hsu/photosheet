(function(root){
 'use strict';const X=DocumentTaskCore,E=PSCore.esc;
 const labels={serial:'序號',caseNo:'案號',notice:'通知日',resultDate:'成果日期',due:'完成期限',vendor:'施工廠商',sourcePerson:'廠商人員',area:'登記面積',parcels:'全案地段地號',items:'工作項目／徑級'};
 const place=t=>t.parcels.map(p=>p.county+p.district+p.section+' '+p.lot).join('；');
 function display(value){return typeof value==='object'?JSON.stringify(value,null,2):String(value??'未提供')}
 function mount(options){
  const button=document.getElementById('import-document-tasks');if(!button)return;
  const input=document.createElement('input');input.id='document-task-file';input.type='file';input.accept='.json,application/json';input.hidden=true;document.body.append(input);
  const dialog=document.createElement('dialog');dialog.id='document-task-dialog';dialog.className='document-import';dialog.innerHTML='<div class="document-import-head"><h2>匯入文件任務</h2><button type="button" id="document-task-close">關閉</button></div><p>新增案可追加；既有案只更新勾選欄位。指派、完成狀態、舊案鎖定與導航保留。</p><p id="document-task-summary"></p><label><input id="document-task-geo" type="checkbox" checked>一併加入所選案件的新地籍範圍（不覆蓋既有範圍）</label><div id="document-task-rows"></div><p id="document-task-status" role="status"></p><div class="document-import-foot"><button type="button" class="primary" id="document-task-apply">確認合併所選變更</button></div>';document.body.append(dialog);
  const $=id=>document.getElementById(id);let packet,snapshot,busy=false;
  button.onclick=()=>{if(!busy)input.click()};$('document-task-close').onclick=()=>{if(!busy)dialog.close()};dialog.oncancel=e=>{if(busy)e.preventDefault()};
  input.onchange=async()=>{const file=input.files[0];input.value='';if(!file||busy)return;try{if(file.size>128*1024*1024)throw Error('交換檔超過128MB');const next=X.validate(JSON.parse((await file.text()).replace(/^\uFEFF/,''))),snap=await options.snapshot(),rows=X.plan(snap.state,next);packet=next;snapshot=snap;
    $('document-task-summary').textContent=`${rows.length}案：新增 ${rows.filter(r=>r.status==='new').length}、有差異 ${rows.filter(r=>r.status==='changed').length}、相同 ${rows.filter(r=>r.status==='same').length}。來源匯出日期 ${next.exportedAt}。`;
    $('document-task-rows').innerHTML=rows.map(r=>`<section class="document-import-row"><h3>${r.status==='new'?`<input type="checkbox" data-document-new="${E(r.id)}" checked>`:''}${E(r.incoming.type+' · '+r.incoming.serial+' · '+r.id)} <span>${r.status==='new'?'新增／尚未派工':r.status==='changed'?'待核對差異':'資料相同'}</span></h3><p>${E(place(r.incoming))} · 成果 ${E(r.incoming.resultDate)}</p>${r.differences.length?'<details><summary>逐欄選擇更新（預設全部保留派工端）</summary>'+r.differences.map(d=>`<label class="document-import-field"><input type="checkbox" data-document-change="${E(d.key)}">${E(labels[d.field])}<div class="document-import-values"><div><strong>派工端目前資料</strong><pre>${E(display(d.oldValue))}</pre></div><div><strong>文件端資料</strong><pre>${E(display(d.newValue))}</pre></div></div></label>`).join('')+'</details>':''}</section>`).join('');$('document-task-status').textContent='確認合併僅更新此瀏覽器管理資料；發布派工仍需另外執行。';$('document-task-geo').checked=true;dialog.showModal();
   }catch(e){options.tell('文件任務匯入失敗：'+e.message,true)}};
  $('document-task-apply').onclick=async()=>{if(busy||!packet||!snapshot)return;try{
   const choices={newIds:[...dialog.querySelectorAll('[data-document-new]:checked')].map(el=>el.dataset.documentNew),updates:[...dialog.querySelectorAll('[data-document-change]:checked')].map(el=>el.dataset.documentChange)};
   if(!choices.newIds.length&&!choices.updates.length){$('document-task-status').textContent='沒有選取變更，不需套用。';return}
   const result=X.apply(snapshot.state,packet,choices,{features:snapshot.features,includeFeatures:$('document-task-geo').checked,policy:t=>PSCore.monthPolicy(t)});busy=true;$('document-task-apply').disabled=true;
   await options.commit(snapshot,result);dialog.close();options.tell(`文件任務已合併：新增${result.added}案、修改${result.changed}案、新地籍${result.addedFeatures}筆。${result.warnings.join('；')}請核對並派工，網站發布需另行執行。`);packet=null;snapshot=null;
  }catch(e){$('document-task-status').textContent='合併未完成：'+e.message+'。目前資料未由本操作覆蓋，請重新匯入核對。';options.tell(e.message,true)}finally{busy=false;$('document-task-apply').disabled=false}};
 }
 root.DocumentTaskImport={mount};
})(globalThis);
