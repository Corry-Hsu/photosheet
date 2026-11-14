"""Only manager-created tasks can be deleted, with local atomic persistence."""
from pathlib import Path
from datetime import datetime,timezone
import copy,json,os,shutil,tempfile
from playwright.sync_api import sync_playwright
BASE=os.getenv('DELETE_TEST_URL','http://127.0.0.1:8810/').rstrip('/')+'/'
def task(ident,source=None,serial=''):
 t=dict(id=ident,type='雜草垃圾',serial=serial,caseNo='',row=0,district='東港鎮',section='測試段',sectionCode='0582',parcels=[dict(county='屏東縣',district='東港鎮',section='測試段',lot='1')],items=[],resultDate='2026-11-14',due='',assignee='p2',navigation=dict(point=[120.5,22.5],source='manual',confirmed=True))
 if source is not None:t['source']=source
 return t
manuals=[task('manual:row','manual'),task('manual:detail','manual'),task('manual:legacy'),task('manual:custom','manual','自訂-123')];manuals[3]['completed']=True
excel=task('雜草垃圾:42',serial='未編號');excel['row']=42
state=dict(id='manager',schemaVersion=1,people=[dict(id='p1',name='我自己'),dict(id='p2',name='人員二'),dict(id='p3',name='人員三')],tasks=manuals+[excel],settings={},sectionReference=[])
feature=dict(id='0582:1',code='0582',lot='1',lands=excel['parcels'],polygons=[[[[120.5,22.5],[120.501,22.5],[120.501,22.501],[120.5,22.5]]]],bbox=[120.5,22.5,120.501,22.501])
with tempfile.TemporaryDirectory() as tmp,sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox']);ctx=browser.new_context(viewport=dict(width=390,height=844),is_mobile=True,accept_downloads=True);writes=[]
 for host in ['tile.openstreetmap.org','wmts.nlsc.gov.tw','storage.geodac.tw']:ctx.route('https://'+host+'/**',lambda r:r.abort())
 ctx.on('request',lambda r:writes.append(r.method) if r.method not in ['GET','HEAD'] else None)
 pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.clock.set_fixed_time(datetime(2026,11,14,tzinfo=timezone.utc));pg.goto(BASE);pg.wait_for_function('window.PSApp&&PSApp.map')
 pg.evaluate('async o=>{await Store.put("state",o.state);await Store.saveGeo(o.geo);await Store.put("photos",{id:"keep-photo",person:"manager",taskId:"manual:row",watermarked:new Blob(["keep"],{type:"image/jpeg"})})}',dict(state=state,geo=dict(id='catalogue',features=[feature],counts=dict(kml=1,xml=0))))
 pg.reload();pg.wait_for_selector('[data-delete-task]');assert pg.locator('[data-delete-task]').count()==4;assert pg.locator('[data-id="雜草垃圾:42"] [data-delete-task]').count()==0;assert pg.locator('[data-id="manual:custom"] [data-delete-task]').count()==1
 before=pg.evaluate('structuredClone(PSApp.state.tasks)');geo_before=pg.evaluate('structuredClone(PSApp.features)')
 # Cancel has no effect, including DB, selection and existing photos.
 messages=[]
 def cancel(d):messages.append(d.message);d.dismiss()
 pg.once('dialog',cancel);pg.locator('[data-delete-task="manual:row"]').click();assert '整理發布資料' in messages[0];assert pg.evaluate('PSApp.state.tasks')==before
 # Saving failure rolls back the entire task list and permits retry.
 pg.check('[data-check="manual:row"]');pg.locator('[data-id="manual:row"] h3').click();pg.click('button[data-tab=map]');pg.click('#pin-mode');pg.click('button[data-tab=list]');pg.evaluate('()=>{window.originalPut=Store.put;Store.put=async()=>{throw Error("delete-quota")}}');pg.once('dialog',lambda d:d.accept());pg.locator('[data-delete-task="manual:row"]').click();pg.wait_for_function('document.querySelector("#message").textContent.includes("delete-quota")');assert pg.evaluate('PSApp.state.tasks')==before;assert pg.locator('[data-check="manual:row"]').is_checked();assert pg.locator('[data-delete-task="manual:row"]').is_enabled()
 pg.evaluate('()=>{Store.put=window.originalPut}');pg.once('dialog',lambda d:d.accept());pg.locator('[data-delete-task="manual:row"]').click();pg.wait_for_selector('[data-id="manual:row"]',state='detached');assert pg.evaluate('PSApp.state.tasks.length')==4;assert pg.locator('#pin-mode').get_attribute('class')!='active';assert pg.locator('#batch').is_hidden();assert pg.evaluate('PSApp.features')==geo_before;assert pg.evaluate('async()=>!!(await Store.get("photos","keep-photo"))')
 assert pg.evaluate('()=>{let n=0;PSApp.map.eachLayer(l=>{if(l instanceof L.Marker)n++});return n}')==0
 # Detail deletion remains pending until persistence completes, disables duplicates, then closes.
 pg.locator('[data-detail="manual:detail"]').click();pg.wait_for_selector('#detail-delete');pg.evaluate('()=>{Store.put=(store,value)=>new Promise((resolve,reject)=>window.finishDelete=()=>window.originalPut.call(Store,store,value).then(resolve,reject))}');pg.once('dialog',lambda d:d.accept());pg.click('#detail-delete');pg.wait_for_function('typeof finishDelete==="function"');assert pg.locator('#detail-delete').is_disabled();assert pg.locator('[data-delete-task]:enabled').count()==0;assert pg.locator('#dialog').is_visible();pg.evaluate('async()=>{await finishDelete()}');pg.wait_for_function('!document.querySelector("#dialog").open');pg.evaluate('()=>{Store.put=window.originalPut}');assert pg.evaluate('PSApp.state.tasks.length')==3
 # Legacy manual ID is supported; Excel task with no serial is guarded even against a wrong button target.
 pg.once('dialog',lambda d:d.accept());pg.locator('[data-delete-task="manual:legacy"]').click();pg.wait_for_selector('[data-id="manual:legacy"]',state='detached');remaining=pg.evaluate('structuredClone(PSApp.state.tasks)');assert remaining==[before[3],before[4]]
 pg.evaluate('document.querySelector("[data-delete-task]").dataset.deleteTask="雜草垃圾:42"');pg.locator('[data-delete-task]').click();pg.wait_for_function('document.querySelector("#message").textContent.includes("只能在管理頁")');assert pg.evaluate('PSApp.state.tasks')==remaining
 pg.reload();pg.wait_for_selector('[data-id="雜草垃圾:42"]');assert pg.evaluate('PSApp.state.tasks')==remaining
 pg.locator('[data-detail="雜草垃圾:42"]').click();assert pg.locator('#detail-delete').count()==0;pg.click('#close-dialog')
 for width in [360,390,844,1440]:
  pg.set_viewport_size(dict(width=width,height=900));assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
 # Full-snapshot export excludes removed tasks while retaining the shared cadastral feature.
 pg.click('#publish');pg.click('#confirm-publish')
 with pg.expect_download() as d:pg.locator('.dispatch-download[download="worker-2.json"]').click()
 out=Path(tmp)/'worker-2.json';d.value.save_as(out);pack=json.loads(out.read_text());assert [t['id'] for t in pack['tasks']]==['雜草垃圾:42'];assert len(pack['features'])==1;pg.click('#close-dialog')
 # Deleting the only task on the last page clamps pagination to the remaining page.
 last_state=copy.deepcopy(state);last_state['tasks']=[dict(task('雜草垃圾:'+str(i+100),serial=str(i+100)),due='2026-11-14T17:00') for i in range(25)]+[task('manual:last','manual')];pg.evaluate('async s=>{await Store.put("state",s)}',last_state);pg.reload();pg.wait_for_selector('#next');pg.click('#next');pg.wait_for_selector('[data-delete-task="manual:last"]');pg.once('dialog',lambda d:d.accept());pg.locator('[data-delete-task="manual:last"]').click();pg.wait_for_selector('[data-id="manual:last"]',state='detached');assert pg.evaluate('PSApp.state.tasks.length')==25;assert pg.locator('#page').inner_text()=='1 / 1';assert pg.locator('[data-detail]').count()==25
 # Field pages never gain deletion controls, including for manually-created dispatched tasks.
 fieldpack=dict(schemaVersion=1,batch='test',person=dict(id='p2',name='人員二'),settings={},tasks=[manuals[0]],features=[feature]);ctx.route('**/data/worker-2.json*',lambda r:r.fulfill(json=fieldpack));pg.goto(BASE+'worker-2.html');pg.wait_for_selector('[data-detail]');assert pg.locator('[data-delete-task]').count()==0;pg.locator('[data-detail]').click();assert pg.locator('#detail-delete').count()==0
 assert not errors,errors;assert not writes,writes
 print('PASS: manual-only list/detail controls, cancel, atomic persistence and rollback/retry, pending duplicate prevention, selected/map cleanup, shared KML and photo retention, legacy/custom IDs, unnumbered Excel guard, reload, snapshot export, pagination, responsive layout and field isolation')
 browser.close()
