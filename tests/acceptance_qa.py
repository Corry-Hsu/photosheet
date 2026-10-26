from test_config import ROOT, BASE, ZIP, EXCEL, CHROMIUM, QA_NOW
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,zipfile,time,statistics
results={}
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);c=b.new_context(viewport={'width':1440,'height':1000},timezone_id='Asia/Taipei',accept_downloads=True);pg=c.new_page();pg.clock.set_fixed_time(QA_NOW);errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.route('https://tile.openstreetmap.org/**',lambda r:r.abort());pg.goto(BASE);pg.wait_for_function('PSApp.state.people.length===3')
 # Synthetic tasks avoid changing real source or sharing real assignment data.
 tasks=[]
 for i,ty in enumerate(['砍樹','圍籬','雜草垃圾']):
  tasks.append({'id':'sample-'+str(i),'type':ty,'row':i+2,'serial':str(i+1),'caseNo':'DEMO','district':'屏東市','section':'示例段','sectionCode':'DEMO','parcels':[{'county':'屏東縣','district':'屏東市','section':'示例段','lot':str(x)} for x in range(1,13 if i==0 else 3)],'notice':'2026-10-14','resultDate':'2026-10-14','due':'2026-10-30T17:00','vendor':'示例廠商','sourcePerson':'示例人員','area':'3400','items':[{'name':'示例工作','quantity':'40','unit':'㎡','note':'三層'}],'assignee':''})
 # Three geometric cases: split polygon, hole, and concavity.
 features=[{'id':'D:'+str(i),'code':'D','lot':str(i),'lands':[{'county':'屏東縣','district':'屏東市','section':'示例段','lot':str(i)}],'polygons':[[[[120.5+i*.001,22.6],[120.5008+i*.001,22.6],[120.5008+i*.001,22.6008],[120.5+i*.001,22.6008],[120.5+i*.001,22.6]]]],'sources':['sample.kml']} for i in range(1,13)]
 pg.evaluate('''async d=>{let state={...PSApp.state,tasks:d.tasks};for(let f of d.features)f.bbox=PSCore.bbox(f.polygons);await Store.replaceManager(state,{id:'catalogue',features:d.features,counts:{xml:1,kml:1}})}''',{'tasks':tasks,'features':features});pg.reload();pg.wait_for_function('PSApp.state.tasks.length===3')
 # Correct UI assignment (no direct mutation).
 pg.click('#select-page');pg.click('#batch-assign');pg.select_option('#assign-person','p1');pg.click('#commit-assign');pg.wait_for_function('!document.querySelector("#dialog").open && PSApp.state.tasks.length===3 && PSApp.state.tasks.every(t=>t.assignee==="p1")');pg.reload();pg.wait_for_function('PSApp.state.tasks.length===3 && PSApp.state.tasks.every(t=>t.assignee==="p1")');results['ui_assignment_persistence']=True
 # Manual navigation saving and map selection.
 pg.locator('[data-detail]').first.click();pg.fill('#nav-lat','22.607');pg.fill('#nav-lng','120.509');pg.click('#save-nav');pg.wait_for_function('PSApp.state.tasks.some(t=>t.navigation?.confirmed) && document.querySelector("#nav-lat").value==="22.607"');pg.wait_for_timeout(100);pg.click('#close-dialog');pg.reload();pg.wait_for_function('PSApp.state.tasks.some(t=>t.navigation?.point[0]===120.509)');results['manual_navigation_persistence']=True
 pg.locator('.task').first.click();assert pg.locator('.task.selected').count()==1
 # Reverse selection: click Leaflet path, then selected task stays synchronized.
 pg.evaluate('''()=>{let task=PSApp.state.tasks[0];PSApp.map.fire('click',{latlng:L.latLng(22.6,120.5)})}''');results['list_to_map']=pg.evaluate('document.querySelectorAll(".leaflet-interactive").length>0')
 pg.screenshot(path=str(ROOT/'evidence/map-desktop.png'))
 # Date filtering and source corrections preserve audit fields.
 pg.locator('#date-filters summary').click();pg.fill('#date-from','2026-10-15');assert pg.locator('.task').count()==0;pg.fill('#date-from','');assert pg.locator('.task').count()==3;results['date_filter']=True
 pg.locator('[data-detail]').first.click();pg.click('#edit-parcels');pg.locator('[data-field=lot]').first.fill('999');pg.click('#save-parcels');pg.wait_for_selector('#edit-parcels');assert pg.evaluate('PSApp.state.tasks[0].originalParcels[0].lot')=='1';assert pg.evaluate('PSApp.state.tasks[0].parcels[0].lot')=='999';pg.click('#edit-parcels');pg.locator('[data-field=lot]').first.fill('1');pg.click('#save-parcels');pg.wait_for_selector('#edit-parcels');pg.click('#close-dialog');results['source_correction_audit']=True
 # Real map-layer event must select its matching task in the list.
 pg.locator('[data-id="sample-1"]').click();pg.click('#show-context');pg.evaluate('PSApp.map.fitBounds([[22.599,120.5],[22.602,120.514]],{animate:false})');pg.wait_for_function("(()=>{let found=false;PSApp.map.eachLayer(l=>{if(l.feature?.properties.id==='D:12')found=true});return found})()")
 found=pg.evaluate("""()=>{let found=false;PSApp.map.eachLayer(l=>{if(l.feature?.properties.id==='D:12'){found=true;l.fire('click',{originalEvent:{},latlng:L.latLng(22.6002,120.5122)})}});return found}""");assert found;assert pg.locator('.task.selected').get_attribute('data-id')=='sample-0';results['map_to_list']=True
 # Backup and transactional restore.
 with pg.expect_download() as dl:pg.click('#backup')
 backup=Path('/tmp/photosheet-acceptance-backup.json');dl.value.save_as(str(backup));payload=json.loads(backup.read_text());assert len(payload['state']['tasks'])==3
 pg.locator('#restore-file').set_input_files(str(backup));pg.wait_for_selector('#confirm-restore');pg.click('#confirm-restore');pg.wait_for_function('!document.querySelector("#dialog").open');results['backup_restore']=True
 bad=Path('/tmp/photosheet-bad-backup.json');bad.write_text('{"schemaVersion":9}');pg.locator('#restore-file').set_input_files(str(bad));pg.wait_for_function('document.querySelector("#message").textContent.includes("備份格式錯誤")');assert pg.evaluate('PSApp.state.tasks.length')==3;results['bad_backup_preserves_state']=True
 # 12 lots + all 3 workorder types in a single PDF / XLSX.
 pg.click('#select-page');pg.click('#boards')
 with c.expect_page() as pop:pg.click('#doc-print')
 bp=pop.value;bp.wait_for_function('document.querySelectorAll(".board").length===3');bp.wait_for_timeout(200)
 assert bp.evaluate('''()=>[...document.querySelectorAll('.main')].every(m=>m.scrollWidth<=m.clientWidth+1&&m.scrollHeight<=m.clientHeight+1)''');assert not bp.evaluate('document.querySelector(".board").textContent.includes("任務編號")');bp.pdf(path=str(ROOT/'evidence/whiteboard-stress.pdf'),prefer_css_page_size=True);bp.close();pg.click('#close-dialog');pg.click('#orders')
 with c.expect_page() as pop:pg.click('#doc-print')
 op=pop.value;op.wait_for_selector('.order');assert op.locator('h1',has_text='開口契約訂單通知表').count()==1;op.pdf(path=str(ROOT/'evidence/three-workorders.pdf'),prefer_css_page_size=True);op.close()
 with pg.expect_download() as dl:pg.click('#doc-xlsx')
 dl.value.save_as(str(ROOT/'evidence/three-workorders.xlsx'));pg.click('#close-dialog');results['documents_three_types_and_12_lots']=True
 # Failed storage transaction does not partially replace state or geo.
 assert pg.evaluate('''async()=>{const before=await Store.get('state','manager');let d=await Store.open();await new Promise(resolve=>{const tr=d.transaction(['state','geo'],'readwrite');tr.objectStore('state').put({id:'manager',tasks:[]});tr.objectStore('geo').clear();tr.onabort=resolve;tr.abort()});return (await Store.get('state','manager')).tasks.length===before.tasks.length&&(await Store.getGeo()).features.length===12}''');results['transaction_rollback']=True
 # Old task attempts cannot partly update a mixed batch.
 pg.evaluate('''async()=>{let s=await Store.get('state','manager');s.tasks[0].resultDate='2026-09-01';s.tasks[0].assignee='';await Store.put('state',s)}''');pg.reload();pg.wait_for_function('PSApp.state.tasks[0].assignmentClosed');pg.click('#select-page');pg.click('#batch-assign');pg.select_option('#assign-person','p2');pg.click('#commit-assign');pg.wait_for_function('document.querySelector("#message").textContent.includes("不可新增指派")');assert pg.evaluate('PSApp.state.tasks.filter(t=>t.assignee==="p2").length')==0;results['mixed_batch_month_rule_atomic']=True;pg.click('#close-dialog')
 # Pending import cancellation leaves catalogue intact.
 pg.locator('#geo-files').set_input_files(str(ZIP));pg.wait_for_selector('#cancel-geo',state='visible');pg.click('#cancel-geo');assert pg.evaluate('PSApp.features.length')==12;results['cancel_import_preserves_catalogue']=True
 # Mobile map mode and viewport widths.
 for width in [360,390,768,1440]:
  pg.set_viewport_size({'width':width,'height':844});assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
 pg.set_viewport_size({'width':390,'height':844});pg.click('button[data-tab=map]');pg.wait_for_timeout(150);pg.screenshot(path=str(ROOT/'evidence/map-mobile.png'));assert pg.locator('#map').is_visible();results['mobile_map']=True
 # Empty published worker pages and rejected schema preserve old content.
 worker=c.new_page();worker.goto(BASE+'worker-2.html');worker.wait_for_function('document.querySelector("#worker-version").textContent.includes("尚未發布")');assert worker.evaluate('PSApp.state.tasks.length')==0;results['empty_worker']=True
 # Performance: pure spatial query + actual Leaflet drawing, five independent runs.
 pg.bring_to_front();pg.set_viewport_size({'width':1440,'height':1000});times=pg.evaluate("""async()=>{let fs=Array.from({length:10000},(_,i)=>{const x=120+(i%100)*.001,y=22+Math.floor(i/100)*.001;const points=Array.from({length:100},(_,j)=>[y+.0004+Math.sin(j*Math.PI/50)*.0004,x+.0004+Math.cos(j*Math.PI/50)*.0004]);points.push(points[0]);return {minX:x,minY:y,maxX:x+.0008,maxY:y+.0008,id:i,points}});let tree=new RBush();tree.load(fs);PSApp.map.fitBounds([[22,120],[22.02,120.02]],{animate:false});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));let times=[];for(let n=0;n<5;n++){let start=performance.now(),hits=tree.search({minX:120,minY:22,maxX:120.019,maxY:22.019}).slice(0,500),renderer=PSApp.map.options.renderer;let group=L.featureGroup(hits.map(f=>L.polygon(f.points,{renderer}))).addTo(PSApp.map);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));times.push(performance.now()-start);PSApp.map.removeLayer(group)}return times}""");print('spatial ms',times,flush=True);assert max(times)<=1000;results['spatial_10000_query_draw_ms']=times
 assert not errors,errors;results['page_errors']=errors;(ROOT/'evidence/acceptance-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False,indent=2));b.close()
