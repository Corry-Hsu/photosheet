"""Online land area workflow: actual sanitized data, synthetic manager tasks."""
from pathlib import Path
from datetime import datetime,timezone
import copy,json,os,shutil,tempfile
from playwright.sync_api import sync_playwright
from openpyxl import load_workbook
ROOT=Path(__file__).resolve().parents[1];BASE=os.getenv('AREA_TEST_URL','http://127.0.0.1:8806/').rstrip('/')+'/'
def task(ident,lots):return dict(id=ident,caseNo=ident,type='雜草垃圾',district='東港鎮',section='關帝段',sectionCode='0582',parcels=[dict(county='屏東縣',district='東港鎮',section='關帝段',lot=lot) for lot in lots],area='999',items=[dict(name='除草',quantity='8',unit='㎡',note='unchanged')],due='',resultDate='2026-11-11',assignee='p2',navigation=dict(point=[120.5,22.5],source='manual',confirmed=True))
a=task('complete',['24','24-1','24-2']);b=task('partial',['24','999999']);b['area']='888'
cat=json.loads((ROOT/'data/land-area/catalog.json').read_text());entry=next(e for e in cat['sections'] if e['district']=='內埔鄉');raw=json.loads((ROOT/'data/land-area'/entry['file']).read_text());lot=next(p for p in raw['parcels'] if p['area'] is not None)
o=task('other',[lot['lot']]);o.update(district=entry['district'],section=entry['section'],sectionCode=entry['code']);o['parcels']=[dict(county=entry['county'],district=entry['district'],section=entry['section'],lot=lot['lot'])]
state=dict(id='manager',schemaVersion=1,people=[dict(id='p1',name='我自己'),dict(id='p2',name='人員二'),dict(id='p3',name='人員三')],tasks=[a,b,o],settings={},sectionReference=[])
with tempfile.TemporaryDirectory() as tmp,sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox']);ctx=browser.new_context(viewport=dict(width=390,height=844),is_mobile=True,accept_downloads=True)
 for host in ['tile.openstreetmap.org','wmts.nlsc.gov.tw']:ctx.route('https://'+host+'/**',lambda r:r.abort())
 pg=ctx.new_page();errors=[];reads=[];writes=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.on('request',lambda r:reads.append(r.url.split('?')[0].split('/')[-1]) if '/data/land-area/' in r.url else None);ctx.on('request',lambda r:writes.append(r.method) if r.method not in ['GET','HEAD'] else None);pg.clock.set_fixed_time(datetime(2026,11,11,tzinfo=timezone.utc))
 pg.goto(BASE);pg.wait_for_function('window.PSApp&&PSApp.map');pg.evaluate('async s=>{await Store.put("state",s)}',state);pg.reload();pg.wait_for_selector('[data-detail]');original=pg.evaluate('structuredClone(PSApp.state.tasks)')
 pg.click('#land-areas');pg.wait_for_function('document.querySelector("#area-status").textContent.includes("配對完成")');assert set(reads)=={'catalog.json','0582.json',entry['file']};assert len(reads)==3
 assert '907' in pg.locator('#area-source').inner_text();assert '369.67' in pg.locator('.area-result').filter(has_text='complete').inner_text();assert pg.locator('[data-area-task=partial]').is_disabled();assert pg.locator('[data-area-task=complete]').is_enabled();assert pg.locator('[data-area-task]:checked').count()==0
 # Preview alone does not mutate any task. Save failure restores the entire task list.
 assert pg.evaluate('PSApp.state.tasks')==original;pg.check('[data-area-task=complete]');pg.evaluate('()=>{window.actualPut=Store.put;Store.put=async()=>{throw Error("quota-test")}}');pg.click('#area-apply');pg.wait_for_function('document.querySelector("#area-status").textContent.includes("quota-test")');assert pg.evaluate('PSApp.state.tasks')==original
 pg.evaluate('()=>{Store.put=window.actualPut}');pg.click('#area-apply');pg.wait_for_function('document.querySelector("#area-status").textContent.includes("已套用")');updated=pg.evaluate('PSApp.state.tasks');assert updated[0]['area']=='369.67' and updated[0]['originalArea']=='999';assert updated[0]['navigation']==a['navigation'];assert updated[0]['items']==a['items'];assert updated[1:]==original[1:]
 for width in [360,390,844,1440]:
  pg.set_viewport_size(dict(width=width,height=900));assert pg.evaluate('document.querySelector("#land-area-dialog").scrollWidth<=document.querySelector("#land-area-dialog").clientWidth+1')
 pg.set_viewport_size(dict(width=390,height=844));pg.screenshot(path=str(ROOT/'evidence/land-areas-mobile.png'));pg.click('#area-close');pg.reload();pg.wait_for_selector('[data-detail]');assert pg.evaluate('PSApp.state.tasks')==updated
 # Actual work-order Excel uses the computed total.
 pg.check('[data-check=complete]');pg.click('#orders')
 with pg.expect_download() as d:pg.click('#doc-xlsx')
 dest=Path(tmp)/'order.xlsx';d.value.save_as(dest);wb=load_workbook(dest,data_only=True);values=[v for ws in wb for row in ws.iter_rows(values_only=True) for v in row];assert '369.67' in values or 369.67 in values;assert '土地登記總面積（㎡）' in values;pg.click('#close-dialog')
 # Real selected person/vendor JSON contains only the referenced area proof.
 pg.click('#publish');pg.check('[data-publish-person=v1]');pg.click('#confirm-publish')
 for name in ['worker-2.json','vendor-1.json']:
  with pg.expect_download() as d:pg.locator('.dispatch-download[download="'+name+'"]').click()
  dest=Path(tmp)/name;d.value.save_as(dest);pack=json.loads(dest.read_text());job=next(t for t in pack['tasks'] if t['id']=='complete');assert job['area']=='369.67';assert len(job['landArea']['parcels'])==3;assert pg.evaluate('t=>!LandAreaCore.stale(t)',job);assert not any(k in dest.read_text() for k in ['統一編號','所有權人'])
 pg.click('#close-dialog');pg.uncheck('[data-check=complete]')
 # Network failure preserves prior area and disables affected tasks; retry recovers.
 pg.route('**/data/land-area/0582.json*',lambda r:r.fulfill(status=503,body='offline'));pg.click('#land-areas');pg.wait_for_function('document.querySelector("#area-status").textContent.includes("配對完成")');assert pg.locator('[data-area-task=complete]').is_disabled();assert pg.locator('[data-area-task=other]').is_enabled();assert pg.evaluate('PSApp.state.tasks[0].area')=='369.67'
 pg.unroute('**/data/land-area/0582.json*');pg.click('#area-retry');pg.wait_for_function('document.querySelector("#area-status").textContent.includes("配對完成")');assert pg.locator('[data-area-task=complete]').is_enabled()
 # Local task edits while preview is open cannot apply an outdated total.
 pg.check('[data-area-task=complete]');pg.evaluate('PSApp.state.tasks[0].parcels[0].lot="25"');pg.click('#area-apply');pg.wait_for_function('document.querySelector("#area-status").textContent.includes("已變更")');assert pg.evaluate('PSApp.state.tasks[0].area')=='369.67';pg.evaluate('PSApp.state.tasks[0].parcels[0].lot="24"');pg.click('#area-close')
 # Adding a parcel through the supported editor clears the derived area until rechecked.
 pg.locator('[data-detail=complete]').click();assert '369.67' in pg.locator('#task-land-area').inner_text();pg.click('#edit-parcels');pg.click('#add-parcel');pg.locator('[data-parcel-edit]').last.locator('[data-field=lot]').fill('25');pg.click('#save-parcels');pg.wait_for_selector('#task-land-area');assert pg.evaluate('PSApp.state.tasks[0].area')=='';assert pg.evaluate('PSApp.state.tasks[0].landArea.stale') is True;assert '重新配對' in pg.locator('#task-land-area').inner_text()
 # Single-task detail shortcut recomputes and refreshes the underlying detail dialog.
 pg.click('#detail-area');pg.wait_for_function('document.querySelector("#area-status").textContent.includes("配對完成")');assert pg.locator('[data-area-task]').count()==1;pg.check('[data-area-task=complete]');pg.click('#area-apply');pg.wait_for_function('document.querySelector("#area-status").textContent.includes("已套用")');assert pg.evaluate('PSApp.state.tasks[0].landArea.stale') is False;pg.click('#area-close');assert 'XML 配對' in pg.locator('#task-land-area').inner_text();pg.click('#close-dialog')
 # Malformed catalogue blocks the preview, without clearing prior user data.
 pg.route('**/data/land-area/catalog.json*',lambda r:r.fulfill(json=dict(schemaVersion=1,unit='㎡',sections=[dict(code='0582',county='屏東縣',district='東港鎮',section='關帝段',file='../bad.json',records=1)])))
 before=pg.evaluate('structuredClone(PSApp.state.tasks)');pg.click('#land-areas');pg.wait_for_function('document.querySelector("#area-status").textContent.includes("無法配對")');assert pg.locator('#area-apply').is_disabled();assert pg.evaluate('PSApp.state.tasks')==before;pg.click('#area-close');pg.unroute('**/data/land-area/catalog.json*')
 pg.goto(BASE+'worker-2.html');pg.wait_for_function('window.PSApp&&PSApp.map');assert pg.locator('#land-areas').count()==0;assert pg.locator('#land-area-dialog').count()==0;assert not writes,writes;assert not errors,errors
 print('PASS: required-section-only GETs, preview without mutation, partial blocking, exact totals, save rollback/retry, area provenance and unchanged navigation/items, reload, actual XLSX and person/vendor JSON, network recovery, stale preview and parcel edit invalidation, bad catalog blocking, responsive layout, field isolation')
 browser.close()
