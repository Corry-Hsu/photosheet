"""Add parcels to an existing task, preserving identity and exporting matching KML."""
import copy,json,os,shutil,tempfile
from datetime import datetime,timezone
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.getenv('PARCEL_TEST_URL','http://127.0.0.1:8804/').rstrip('/')+'/'
original=dict(id='grass:695',type='雜草垃圾',caseNo='693',serial='693',row=695,district='萬丹鄉',section='萬全段',sectionCode='0582',parcels=[dict(county='屏東縣',district='萬丹鄉',section='萬全段',sectionCode='0582',lot='326',note='keep')],items=[],resultDate='2026-11-10',due='',assignee='p2',navigation=dict(point=[120.5,22.5],source='manual',confirmed=True))
state=dict(id='manager',schemaVersion=1,people=[dict(id='p1',name='我自己'),dict(id='p2',name='人員二'),dict(id='p3',name='人員三')],settings={},sectionReference=[dict(county='屏東縣',district='萬丹鄉',section='萬全段',code='0582'),dict(county='屏東縣',district='萬丹鄉',section='另一段',code='0583')],tasks=[original])
def feature(code,lot):return dict(id=code+'/'+lot,code=code,lot=lot,lands=[],polygons=[[[[120.5,22.5],[120.51,22.5],[120.51,22.51],[120.5,22.5]]]],bbox=[120.5,22.5,120.51,22.51])
geo=dict(id='catalogue',features=[feature('0582','326'),feature('0582','341-3'),feature('0583','100')],counts=dict(kml=1,xml=0,vertices=12))
with tempfile.TemporaryDirectory() as temp,sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox']);c=b.new_context(viewport=dict(width=390,height=844),is_mobile=True,accept_downloads=True)
 for host in ['tile.openstreetmap.org','wmts.nlsc.gov.tw']:c.route('https://'+host+'/**',lambda r:r.abort())
 pg=c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.clock.set_fixed_time(datetime(2026,11,11,tzinfo=timezone.utc));pg.goto(BASE);pg.wait_for_function('window.PSApp&&PSApp.map')
 pg.evaluate('async o=>{await Store.put("state",o.state);await Store.saveGeo(o.geo)}',dict(state=state,geo=geo));pg.reload();pg.wait_for_selector('[data-detail]');pg.locator('[data-detail]').click();pg.click('#edit-parcels');assert pg.locator('[data-parcel-edit]').count()==1
 pg.click('#add-parcel');last=pg.locator('[data-parcel-edit]').last
 assert last.locator('[data-field=district]').input_value()=='萬丹鄉';assert last.locator('[data-field=section]').input_value()=='萬全段';assert last.locator('[data-field=lot]').input_value()==''
 pg.click('#save-parcels');assert pg.locator('#save-parcels').count()==1;assert pg.evaluate('PSApp.state.tasks[0].parcels.length')==1
 last.locator('[data-field=lot]').fill('326');pg.click('#save-parcels');assert pg.locator('#save-parcels').count()==1;assert pg.evaluate('PSApp.state.tasks[0].parcels.length')==1
 last.locator('[data-field=lot]').fill('341-3');pg.click('#add-parcel');pg.locator('[data-parcel-edit]').last.locator('[data-cancel-parcel]').click();assert pg.locator('[data-parcel-edit]').count()==2
 # Storage failure must restore every property, keeping unsaved form rows for retry.
 pg.evaluate('()=>{window.realPut=Store.put;Store.put=async()=>{throw Error("test storage failure")}}');pg.click('#save-parcels');pg.wait_for_function('document.querySelector("#message").textContent.includes("test storage failure")');assert pg.evaluate('PSApp.state.tasks[0]')==original
 pg.evaluate('()=>{Store.put=window.realPut}');pg.click('#save-parcels');pg.wait_for_selector('#edit-parcels');assert pg.locator('.parcel-row').count()==2;assert pg.locator('[data-parcel-nav]').count()==2
 first=pg.evaluate('structuredClone(PSApp.state.tasks[0])');assert first['originalParcels']==original['parcels'];assert first['parcels'][0]==original['parcels'][0];assert first['parcels'][1]['sectionCode']=='0582';assert first['navigation']==original['navigation'];assert first['id']==original['id'];assert pg.locator('.task').count()==1;assert '341-3' in pg.locator('.task').inner_text()
 # Cross-section addition uses reference code instead of the task's old main code.
 pg.click('#edit-parcels');pg.click('#add-parcel');last=pg.locator('[data-parcel-edit]').last;last.locator('[data-field=section]').fill('另一段');last.locator('[data-field=lot]').fill('100');pg.click('#save-parcels');pg.wait_for_selector('#edit-parcels');assert pg.locator('[data-parcel-nav]').count()==3
 updated=pg.evaluate('structuredClone(PSApp.state.tasks[0])');assert updated['parcels'][2]['sectionCode']=='0583';assert updated['originalParcels']==original['parcels'];assert len(pg.evaluate('PSApp.state.tasks'))==1
 for w in [360,390,844,1440]:
  pg.set_viewport_size(dict(width=w,height=900));pg.click('#edit-parcels');assert pg.evaluate('document.querySelector("#dialog").scrollWidth<=document.querySelector("#dialog").clientWidth+1');pg.click('#save-parcels');pg.wait_for_selector('#edit-parcels')
 pg.click('#close-dialog');pg.reload();pg.wait_for_selector('[data-detail]');assert pg.evaluate('PSApp.state.tasks[0]')==updated
 # Real person and vendor downloads both include all three parcels and KML features.
 pg.click('#publish');pg.check('[data-publish-person=v1]');pg.click('#confirm-publish')
 for name in ['worker-2.json','vendor-1.json']:
  with pg.expect_download() as d:pg.locator('.dispatch-download[download="'+name+'"]').click()
  dest=Path(temp)/name;d.value.save_as(dest);package=json.loads(dest.read_text());assert len(package['tasks'])==1;assert [x['lot'] for x in package['tasks'][0]['parcels']]==['326','341-3','100'];assert len(package['features'])==3;assert package['tasks'][0]['navigation']==original['navigation']
 assert not errors,errors
 print('PASS: add/cancel rows, empty and duplicate rejection, full storage-failure rollback and retry, same/cross-section KML match, original metadata/history preserved, unchanged task identity, list refresh, reload, actual person/vendor JSON downloads, mobile/desktop layout')
 b.close()
