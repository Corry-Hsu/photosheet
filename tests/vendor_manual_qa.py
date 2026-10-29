from test_config import ROOT,BASE,CHROMIUM,QA_NOW
from playwright.sync_api import sync_playwright
from pathlib import Path
import json,os,tempfile,copy
import fitz
engine=os.getenv('PS_TEST_ENGINE','chromium');out=ROOT/'evidence/vendor-manual';out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as temp,sync_playwright() as p:
 tmp=Path(temp);b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']) if engine=='chromium' else p.webkit.launch();ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,accept_downloads=True,permissions=['geolocation']+(['camera'] if engine=='chromium' else []),geolocation={'latitude':22.44,'longitude':120.44,'accuracy':5});ctx.route('https://tile.openstreetmap.org/**',lambda r:r.abort());pg=ctx.new_page();pg.clock.set_fixed_time(QA_NOW);errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE);pg.wait_for_function('document.querySelector("#person-filter").options.length===5')
 # Invalid form must stay open with data intact and without a partially added task.
 pg.click('#manual-task');pg.click('#commit-manual');assert pg.locator('#dialog').evaluate('(d)=>d.open');assert pg.evaluate('PSApp.state.tasks.length')==0;assert pg.locator('#manual-error').inner_text();pg.click('#close-dialog')
 def add_task(kind,lots,person='auto',second=False):
  pg.click('#manual-task');pg.select_option('#manual-type',kind);pg.select_option('#manual-person',person);row=pg.locator('[data-manual-parcel]').first
  row.locator('[data-field="district"]').fill('東港鎮');row.locator('[data-field="section"]').fill('關帝段');row.locator('[data-field="sectionCode"]').fill('0582');row.locator('[data-field="lots"]').fill(lots)
  if second:
   pg.click('#manual-add-parcel');new=pg.locator('[data-manual-parcel]').last;new.locator('[data-field="section"]').fill('另一段');new.locator('[data-field="section"]').press('Tab');assert new.locator('[data-field="sectionCode"]').input_value()=='';new.locator('[data-field="section"]').fill('關帝段');new.locator('[data-field="sectionCode"]').fill('0582');new.locator('[data-field="lots"]').fill('1198-1')
  item=pg.locator('[data-manual-item]').first;item.locator('[data-field="name"]').fill('示範工作');item.locator('[data-field="quantity"]').fill('12.5');item.locator('[data-field="unit"]').fill('㎡');pg.fill('#manual-vendor','示範公司');pg.fill('#manual-contact','示範人員');pg.click('#commit-manual');pg.wait_for_function('!document.querySelector("#dialog").open')
 add_task('雜草垃圾','1198','p3',True);add_task('砍樹','1199');add_task('圍籬','1200')
 assert pg.evaluate('PSApp.state.tasks.length')==3;assert pg.evaluate('PSApp.state.tasks[0].parcels.length')==2;assert pg.evaluate('PSApp.state.tasks[0].assignee')=='p3';assert pg.evaluate('PSApp.state.tasks[1].assignee')=='p2'
 # A failed write restores task state and keeps the editable form visible.
 pg.evaluate("()=>{window.realPut=Store.put;Store.put=async()=>{throw Error('測試儲存失敗')}}");pg.click('#manual-task');row=pg.locator('[data-manual-parcel]').first;row.locator('[data-field="district"]').fill('屏東市');row.locator('[data-field="section"]').fill('示範段');row.locator('[data-field="lots"]').fill('1');pg.click('#commit-manual');pg.wait_for_function('document.querySelector("#manual-error").textContent.includes("儲存失敗")');assert pg.evaluate('PSApp.state.tasks.length')==3;assert row.locator('[data-field="lots"]').input_value()=='1';pg.evaluate('()=>{Store.put=realPut}');pg.click('#close-dialog');pg.reload();pg.wait_for_function('PSApp.state.tasks.length===3')
 shape='<Polygon><outerBoundaryIs><LinearRing><coordinates>120.44,22.44 120.441,22.44 120.441,22.441 120.44,22.44</coordinates></LinearRing></outerBoundaryIs></Polygon>'
 kml=tmp/'demo.kml';kml.write_text('<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+''.join('<Placemark><name>0582/'+lot+'</name>'+shape+'</Placemark>' for lot in ['1198','1198-1','1199','1200'])+'</Document></kml>');pg.locator('#geo-files').set_input_files(str(kml));pg.wait_for_function('PSApp.features.length===4&&document.querySelector("#cancel-geo").hidden')
 assert pg.locator('#pin-mode').count()==1;assert pg.locator('#pin-mode').evaluate('(el)=>typeof el.onclick')=='function'
 # Publish all six, with vendors keyed by type, not by personnel ownership.
 pg.click('#publish');assert pg.locator('[data-publish-person]').count()==6
 for who in ['v1','v2','v3']:pg.locator(f'[data-publish-person="{who}"]').check()
 pg.click('#confirm-publish');assert pg.locator('.dispatch-download').count()==6;packages={}
 for prefix in ['worker','vendor']:
  for i in range(1,4):
   name=f'{prefix}-{i}.json'
   with pg.expect_download() as dl:pg.locator(f'.dispatch-download[download="{name}"]').click()
   dest=tmp/name;dl.value.save_as(str(dest));packages[name]=json.loads(dest.read_text())
 assert len(packages['worker-3.json']['tasks'])==1;assert len(packages['worker-2.json']['tasks'])==2
 for i,kind in enumerate(['雜草垃圾','砍樹','圍籬'],1):
  pack=packages[f'vendor-{i}.json'];assert pack['vendorType']==kind and len(pack['tasks'])==1;assert pack['tasks'][0]['type']==kind;assert len(pack['features'])==(2 if i==1 else 1);assert pack['tasks'][0]['navigation']['point']
 pg.click('#close-dialog');assert all(t['source']=='manual' for t in pg.evaluate('PSApp.state.tasks'));assert pg.evaluate('PSApp.state.tasks[0].assignee')=='p3'
 # Each static vendor entry rejects cross-label packages, and retains its previous batch on failure.
 vendor_pages=[]
 for i in range(1,4):
  pack=packages[f'vendor-{i}.json'];ctx.route(f'**/data/vendor-{i}.json',lambda r,request,pack=pack:r.fulfill(json=pack));field=ctx.new_page();field.clock.set_fixed_time(QA_NOW);field.on('pageerror',lambda e:errors.append(str(e)));field.goto(BASE+f'vendor-{i}.html');field.wait_for_function('PSApp.state.tasks.length===1');vendor_pages.append(field);assert field.locator('#type-filter').is_disabled();assert field.locator('#type-filter').input_value()==pack['vendorType'];assert field.evaluate('PSApp.features.length')==len(pack['features'])
 field=vendor_pages[0];field.locator('.task-content').first.click();assert field.locator('#worker-navigate').get_attribute('href');field.locator('[data-detail]').first.click();field.fill('#field-nav-lat','22.45');field.fill('#field-nav-lng','120.46');field.click('#field-nav-save');field.wait_for_function('PSApp.state.tasks[0].navigation.point[0]===120.46');field.reload();field.wait_for_function('PSApp.state.tasks.length===1');assert field.evaluate('PSApp.state.tasks[0].navigation.point')==[120.46,22.45]
 field.locator('[data-detail]').first.click();assert field.locator('#field-nav-map').count()==0;assert field.locator('#pin-mode').count()==0;field.click('#close-dialog');before=field.evaluate('JSON.stringify(PSApp.state.tasks[0].navigation)');field.evaluate('PSApp.map.fire("click",{latlng:L.latLng(22.46,120.47)})');assert field.evaluate('JSON.stringify(PSApp.state.tasks[0].navigation)')==before;assert field.evaluate('(()=>{let draggable=false;PSApp.map.eachLayer(l=>{if(l instanceof L.Marker&&l.dragging?.enabled())draggable=true});return draggable})()')==False
 field.locator('[data-detail]').first.click();field.click('#detail-board');field.click('#doc-print');field.wait_for_selector('.doc-pdf-download')
 with field.expect_download() as dl:field.click('.doc-pdf-download')
 dest=tmp/'board.pdf';dl.value.save_as(str(dest));pdf=fitz.open(dest);assert len(pdf)==1 and sum(v<80 for v in pdf[0].get_pixmap().samples)>1000;field.click('#close-dialog')
 if engine=='chromium':
  field.locator('[data-detail]').first.click();field.click('#detail-camera');field.wait_for_function('document.querySelector("#video").videoWidth>0');field.click('#shutter');field.wait_for_function('(async()=>{const photos=await Store.photosFor("v1",PSApp.state.tasks[0].id);return photos.length===1})()');assert '不計完成張數' in field.locator('#capture-count').inner_text();assert '2 張' not in field.locator('#capture-count').inner_text();assert not field.evaluate('PSApp.state.tasks[0].completed||false');field.wait_for_function('!document.querySelector("#shutter").disabled');field.click('#camera-back');field.wait_for_selector('[data-photo-download]');assert '不計完成張數' in field.locator('#local-photos').inner_text();assert '2 張' not in field.locator('#local-photos').inner_text();field.click('#close-dialog')
 assert not pg.evaluate('PSApp.state.tasks[0].completed||false')
 bad=copy.deepcopy(packages['vendor-1.json']);bad['tasks'][0]['type']='砍樹';ctx.unroute('**/data/vendor-1.json');ctx.route('**/data/vendor-1.json',lambda r:r.fulfill(json=bad));field.locator('#worker-tools summary').click();field.click('#reload-worker');field.wait_for_function('document.querySelector("#worker-version").textContent.includes("更新失敗")');assert field.evaluate('PSApp.state.tasks[0].type')=='雜草垃圾'
 # A new published batch discards the previous batch's device entrance override.
 fresh=copy.deepcopy(packages['vendor-1.json']);fresh['batch']='next-batch';ctx.unroute('**/data/vendor-1.json');ctx.route('**/data/vendor-1.json',lambda r:r.fulfill(json=fresh));field.click('#reload-worker');field.wait_for_function('document.querySelector("#worker-version").textContent.includes("next-batch")');assert field.evaluate('PSApp.state.tasks[0].navigation.point')==fresh['tasks'][0]['navigation']['point']
 for view in [pg,*vendor_pages]:
  for width in [360,390,1440]:view.set_viewport_size({'width':width,'height':900});assert view.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors;report={'engine':engine,'manual_three_types_and_cross_row_parcels':True,'manual_errors_and_rollback':True,'six_json_files':True,'fixed_vendor_types':True,'personnel_unchanged':True,'kml_geometry_and_navigation':True,'local_entrance_coordinates_reload_and_new_batch':True,'vendor_map_edit_controls_absent':True,'cross_label_package_rejected':True,'vendor_camera_no_completion_count':engine=='chromium','whiteboard_pdf':True,'responsive':True,'errors':errors};(out/f'{engine}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2));b.close()
