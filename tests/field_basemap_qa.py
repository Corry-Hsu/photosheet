"""Basemap switching must preserve parcel/GPS overlays and use lazy, attributed WMTS tiles."""
from test_config import ROOT, BASE, CHROMIUM, QA_NOW
from playwright.sync_api import sync_playwright
from PIL import Image
import base64,copy,io,json,os

engine=os.getenv('PS_TEST_ENGINE','chromium')
fixture=json.loads((ROOT/'tests/fixtures/worker-1.json').read_text())
b=io.BytesIO();Image.new('RGB',(256,256),'#c6d7b9').save(b,'JPEG');tile=b.getvalue()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']) if engine=='chromium' else p.webkit.launch()
 ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True)
 ctx.add_init_script("""Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(ok){setTimeout(()=>ok({coords:{latitude:22.6005,longitude:120.5015,accuracy:8},timestamp:Date.now()}),20);return 7},clearWatch(){}}})""")
 requests=[];fail={'image':False,'street':False};errors=[]
 def serve(r):
  is_image='wmts.nlsc.gov.tw' in r.request.url
  if is_image:
   requests.append(r.request.url);assert '/PHOTO2/default/GoogleMapsCompatible/' in r.request.url
   assert len(r.request.url.split('/')[-3:])==3 and all(x.isdigit() for x in r.request.url.split('/')[-3:])
  if fail['image' if is_image else 'street']:r.abort()
  else:r.fulfill(body=tile,content_type='image/jpeg')
 ctx.route('https://tile.openstreetmap.org/**',serve);ctx.route('https://wmts.nlsc.gov.tw/**',serve)
 ctx.route('**/data/worker-1.json',lambda r:r.fulfill(json=fixture))
 pg=ctx.new_page();pg.on('pageerror',lambda e:errors.append(str(e)));pg.clock.set_fixed_time(QA_NOW);pg.goto(BASE+'worker-1.html');pg.wait_for_function('PSApp.state.tasks.length>0')
 assert pg.locator('#field-basemap').input_value()=='street' and not requests
 pg.locator('.task-content').first.click();pg.wait_for_function('document.querySelector(".map-panel").getBoundingClientRect().top<100')
 pg.click('#field-locate');pg.wait_for_function('document.querySelector("#field-locate").textContent==="關閉定位"')
 pg.wait_for_function('Object.values(PSApp.map._layers).filter(l=>l instanceof L.CircleMarker).length>=2')
 def state():return pg.evaluate('''()=>{const m=PSApp.map;return {center:[m.getCenter().lat,m.getCenter().lng],zoom:m.getZoom(),overlayIds:Object.values(m._layers).filter(l=>!(l instanceof L.TileLayer)).map(l=>L.stamp(l)).sort((a,b)=>a-b),bases:Object.values(m._layers).filter(l=>l instanceof L.TileLayer).map(l=>l._url),route:document.querySelector('#worker-navigate').href}}''')
 before=state()
 for i in range(4):
  pg.select_option('#field-basemap','orthophoto');pg.wait_for_function('document.querySelectorAll("#map .leaflet-tile-loaded").length>0');after=state()
  assert len(after['bases'])==1 and 'PHOTO2' in after['bases'][0]
  assert all(after[k]==before[k] for k in ['center','zoom','overlayIds','route'])
  assert '國土測繪中心' in pg.locator('.leaflet-control-attribution').inner_text()
  assert '非即時' in pg.locator('#field-basemap-status').inner_text()
  pg.select_option('#field-basemap','street');assert state()==before
 assert requests and 'OpenStreetMap' in pg.locator('.leaflet-control-attribution').inner_text()
 pg.select_option('#field-basemap','orthophoto');pg.reload();pg.wait_for_function('PSApp.state.tasks.length>0')
 assert pg.locator('#field-basemap').input_value()=='orthophoto'
 pg.evaluate('FieldBasemap.attach(PSApp.map)');assert pg.locator('#field-basemap').count()==1
 pg.locator('.task-content').first.click();before=state()
 for w,h in [(360,640),(390,844),(844,390)]:
  pg.set_viewport_size({'width':w,'height':h});assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
 # An unavailable imagery provider falls back without deleting task overlays or navigation.
 pg.select_option('#field-basemap','street');fail['image']=fail['street']=True
 pg.select_option('#field-basemap','orthophoto');pg.wait_for_function('document.querySelector("#field-basemap").value==="street"')
 after=state();assert len(after['bases'])==1 and 'openstreetmap' in after['bases'][0]
 assert after['overlayIds']==before['overlayIds'] and after['route']==before['route']
 assert '已切回一般地圖' in pg.locator('#field-basemap-status').inner_text()
 assert not pg.locator('#worker-camera').is_disabled()
 fail['image']=fail['street']=False
 # Fixed-type vendor pages use the same layer switch and keep parcel/entrance data.
 vendor=copy.deepcopy(fixture);vendor['person']={'id':'v1','name':'示範廠商'};vendor['vendorType']='雜草垃圾';vendor['tasks']=[{**vendor['tasks'][0],'type':'雜草垃圾'}]
 ctx.route('**/data/vendor-1.json',lambda r:r.fulfill(json=vendor));vp=ctx.new_page();vp.on('pageerror',lambda e:errors.append(str(e)));vp.clock.set_fixed_time(QA_NOW);vp.goto(BASE+'vendor-1.html');vp.wait_for_function('PSApp.state.tasks.length===1');vp.locator('.task-content').first.click()
 vp.select_option('#field-basemap','orthophoto');assert vp.locator('#worker-navigate').get_attribute('href');assert vp.locator('#pin-mode').count()==0
 # Existing management pages keep their original street-only interface.
 count=len(requests);admin=ctx.new_page();admin.on('pageerror',lambda e:errors.append(str(e)));admin.goto(BASE+'index.html');admin.wait_for_function('!!PSApp.map');assert admin.locator('#field-basemap').count()==0
 assert admin.evaluate('Object.values(PSApp.map._layers).filter(l=>l instanceof L.TileLayer).every(l=>l._url.includes("openstreetmap"))')
 # Denied localStorage cannot prevent map use or switching.
 isolated=browser.new_context(viewport={'width':390,'height':844});isolated.add_init_script("""for(const key of ['getItem','setItem']){const original=Storage.prototype[key];Storage.prototype[key]=function(name,...args){if(name==='photosheet.field.basemap.v1')throw new DOMException('denied','SecurityError');return original.call(this,name,...args)}}""")
 isolated.route('https://tile.openstreetmap.org/**',serve);isolated.route('https://wmts.nlsc.gov.tw/**',serve);isolated.route('**/data/worker-1.json',lambda r:r.fulfill(json=fixture))
 ip=isolated.new_page();ip.on('pageerror',lambda e:errors.append(str(e)));ip.clock.set_fixed_time(QA_NOW);ip.goto(BASE+'worker-1.html');ip.wait_for_function('PSApp.state.tasks.length>0');assert ip.locator('#field-basemap').input_value()=='street';ip.select_option('#field-basemap','orthophoto');assert ip.locator('#field-basemap').input_value()=='orthophoto'
 assert not errors,errors
 result={'engine':engine,'lazy_wmts_tiles_with_correct_row_col':True,'switch_keeps_view_parcels_gps_and_navigation':True,'attribution':True,'remember_choice':True,'no_duplicate_controls':True,'failure_falls_back_without_losing_overlays':True,'vendor_fixed_type_unchanged':True,'manager_unchanged':True,'storage_denied_ok':True,'responsive':True,'errors':errors}
 out=ROOT/'evidence/field-basemap';out.mkdir(parents=True,exist_ok=True);(out/f'{engine}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2));browser.close()
