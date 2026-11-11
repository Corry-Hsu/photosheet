"""Admin raster changes retain cadastral task state and leave field basemaps alone."""
from pathlib import Path
from datetime import datetime,timezone
from io import BytesIO
import json,os,shutil
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];BASE=os.getenv('ADMIN_MAP_TEST_URL','http://127.0.0.1:8808/').rstrip('/')+'/'
metadata=json.loads((ROOT/'data/admin-orthophoto.json').read_text());target=next(i for i in metadata['images'] if '20260916_120631553' in i['id']);west,south,east,north=target['bounds'];lng,lat=(west+east)/2,(south+north)/2
buf=BytesIO();Image.new('RGB',(256,256),(90,125,71)).save(buf,format='JPEG');tile=buf.getvalue()
task=dict(id='map-test',type='雜草垃圾',caseNo='MAP',serial='MAP',district='萬巒鄉',section='測試段',parcels=[dict(county='屏東縣',district='萬巒鄉',section='測試段',lot='1',sectionCode='0582')],items=[],resultDate='2026-11-11',due='',assignee='p2',navigation=dict(point=[lng,lat],source='manual',confirmed=True))
feature=dict(id='0582/1',code='0582',lot='1',lands=task['parcels'],polygons=[[[[lng-.0005,lat-.0005],[lng+.0005,lat-.0005],[lng+.0005,lat+.0005],[lng-.0005,lat-.0005]]]],bbox=[lng-.0005,lat-.0005,lng+.0005,lat+.0005])
state=dict(id='manager',schemaVersion=1,people=[dict(id='p1',name='我自己'),dict(id='p2',name='人員二'),dict(id='p3',name='人員三')],tasks=[task],settings={},sectionReference=[])
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox']);ctx=browser.new_context(viewport=dict(width=1440,height=960));requests=[];writes=[];fail={'uav':False,'national':False};errors=[]
 def image_route(r):
  requests.append(r.request.url);bad=fail['uav'] if 'storage.geodac.tw' in r.request.url else fail['national'] if 'wmts.nlsc.gov.tw' in r.request.url else False
  r.fulfill(status=503,body='unavailable') if bad else r.fulfill(status=200,content_type='image/jpeg',body=tile)
 for host in ['storage.geodac.tw','wmts.nlsc.gov.tw','tile.openstreetmap.org']:ctx.route('https://'+host+'/**',image_route)
 ctx.on('request',lambda r:writes.append(r.method) if r.method not in ['GET','HEAD'] else None)
 pg=ctx.new_page();pg.on('pageerror',lambda e:errors.append(str(e)));pg.clock.set_fixed_time(datetime(2026,11,11,tzinfo=timezone.utc));pg.goto(BASE);pg.wait_for_function('window.PSApp&&PSApp.map')
 pg.evaluate('async o=>{await Store.put("state",o.state);await Store.saveGeo(o.geo);localStorage.setItem("photosheet.field.basemap.v1","orthophoto")}',dict(state=state,geo=dict(id='catalogue',features=[feature],counts=dict(kml=1,xml=0))))
 pg.reload();pg.wait_for_selector('[data-id="map-test"]');pg.locator('[data-id="map-test"] h3').click();assert pg.locator('#admin-basemap').input_value()=='street';assert not any('storage.geodac.tw' in u for u in requests);assert pg.locator('.admin-basemap-controls').count()==1
 before=pg.evaluate('JSON.stringify({state:PSApp.state,features:PSApp.features})');view=pg.evaluate('({center:PSApp.map.getCenter(),zoom:PSApp.map.getZoom()})');shapes=pg.evaluate('()=>{let ids=[];PSApp.map.eachLayer(l=>{if(l instanceof L.Path||l instanceof L.Marker)ids.push(L.stamp(l))});return ids.sort()}')
 pg.select_option('#admin-basemap','uav');pg.wait_for_function('document.querySelector("#admin-ortho-image").options.length>1');pg.wait_for_function('!!document.querySelector(".leaflet-adminImagery-pane img.leaflet-tile-loaded")');assert pg.locator('#admin-basemap').input_value()=='uav';assert pg.locator('#admin-ortho-image').input_value()==target['id'];assert '2026-09-16' in pg.locator('#admin-basemap-status').inner_text();assert pg.evaluate('document.querySelector(".leaflet-adminImagery-pane img").style.clipPath.startsWith("inset(")')
 assert any('/18/' in u or '/19/' in u for u in requests if 'storage.geodac.tw' in u);assert pg.evaluate('JSON.stringify({state:PSApp.state,features:PSApp.features})')==before;assert pg.evaluate('({center:PSApp.map.getCenter(),zoom:PSApp.map.getZoom()})')==view
 assert pg.evaluate('()=>{let ids=[];PSApp.map.eachLayer(l=>{if(l instanceof L.Path||l instanceof L.Marker)ids.push(L.stamp(l))});return ids.sort()}')==shapes
 assert 'BigGIS' in pg.locator('.leaflet-control-attribution').inner_text()
 for value in ['national','street','uav','national','uav']:
  pg.select_option('#admin-basemap',value)
 assert pg.locator('.admin-basemap-controls').count()==1;assert pg.evaluate('JSON.stringify({state:PSApp.state,features:PSApp.features})')==before;assert pg.evaluate('localStorage.getItem("photosheet.field.basemap.v1")')=='orthophoto'
 # No coverage is explicit and does not delete task layers or move the map.
 pg.evaluate('PSApp.map.setView([21.8,120.1],17)');pg.wait_for_function('document.querySelector("#admin-basemap-status").textContent.includes("沒有農村")');assert pg.locator('#admin-basemap').input_value()=='uav';assert pg.locator('#admin-full-ortho').is_visible();assert pg.evaluate('JSON.stringify({state:PSApp.state,features:PSApp.features})')==before
 # Manual image selection moves only the view; a specific older frame can be pinned.
 chosen=metadata['images'][-1];pg.select_option('#admin-ortho-image',chosen['id']);pg.wait_for_function('(id)=>document.querySelector("#admin-ortho-image").value===id',arg=chosen['id']);assert pg.evaluate('JSON.stringify({state:PSApp.state,features:PSApp.features})')==before
 # Complete UAV failure falls back to NLSC; NLSC failure falls back to street.
 fail['uav']=True;pg.select_option('#admin-ortho-image',metadata['images'][0]['id']);pg.wait_for_function('document.querySelector("#admin-basemap").value==="national"');assert '全區正射備用' in pg.locator('#admin-basemap-status').inner_text();assert pg.evaluate('localStorage.getItem("photosheet.admin.basemap.v1")')=='uav';assert pg.evaluate('JSON.stringify({state:PSApp.state,features:PSApp.features})')==before
 fail['national']=True;pg.evaluate('PSApp.map.setView([22.85,120.75],18)');pg.wait_for_function('document.querySelector("#admin-basemap").value==="street"');assert '切回一般地圖' in pg.locator('#admin-basemap-status').inner_text();fail.update(uav=False,national=False)
 for w in [360,390,844,1440]:
  pg.set_viewport_size(dict(width=w,height=900));assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
 # Admin and field selections are independent.
 pg.select_option('#admin-basemap','national');pg.reload();pg.wait_for_selector('#admin-basemap');assert pg.locator('#admin-basemap').input_value()=='national'
 pg.goto(BASE+'worker-2.html');pg.wait_for_selector('#field-basemap');assert pg.locator('#admin-basemap').count()==0;assert pg.locator('#field-basemap').input_value()=='orthophoto'
 pg.goto(BASE+'vendor-1.html');pg.wait_for_selector('#field-basemap');assert pg.locator('#admin-basemap').count()==0
 # Bad metadata is blocked and a late response cannot restore an abandoned choice.
 c=browser.new_context();c.route('https://tile.openstreetmap.org/**',image_route);c.route('https://wmts.nlsc.gov.tw/**',image_route);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.wait_for_selector('#admin-basemap');page.route('**/data/admin-orthophoto.json',lambda r:r.fulfill(json={'schemaVersion':1,'images':[dict(target,url='https://bad.example/tile')]}));page.select_option('#admin-basemap','uav');page.wait_for_function('document.querySelector("#admin-basemap").value==="national"');assert '目錄載入失敗' in page.locator('#admin-basemap-status').inner_text();page.unroute('**/data/admin-orthophoto.json')
 page.evaluate('raw=>{const original=fetch;window.fetch=(url,init)=>String(url).includes("admin-orthophoto.json")?new Promise(resolve=>window.releaseCatalogue=()=>resolve(new Response(JSON.stringify(raw),{status:200}))):original(url,init)}',metadata);page.select_option('#admin-basemap','uav');page.wait_for_function('typeof releaseCatalogue==="function"');page.select_option('#admin-basemap','street');page.evaluate('releaseCatalogue()');page.wait_for_timeout(200);assert page.locator('#admin-basemap').input_value()=='street';assert page.locator('.leaflet-adminImagery-pane img').count()==0
 assert not errors,errors;assert not writes,writes
 print('PASS: lazy public imagery, correct EPSG:4326 bounds and WMTS z/y/x, raster clipping, date/source labels, view/state/KML/entrance preserved, partial coverage and manual frame choice, UAV/NLSC failure fallbacks, preferences and field isolation, invalid metadata and late responses, responsive layouts')
 browser.close()
