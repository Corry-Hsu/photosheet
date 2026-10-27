from test_config import ROOT,BASE,CHROMIUM
from playwright.sync_api import sync_playwright
import os,json
engine=os.getenv('PS_TEST_ENGINE','chromium');fixture=json.loads((ROOT/'tests/fixtures/worker-1.json').read_text())
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']) if engine=='chromium' else p.webkit.launch();c=b.new_context(viewport={'width':390,'height':844},is_mobile=True,permissions=['geolocation'],geolocation={'latitude':22.628,'longitude':120.291,'accuracy':8});c.route('https://tile.openstreetmap.org/**',lambda r:r.abort());c.route('**/data/worker-1.json',lambda r:r.fulfill(json=fixture));pg=c.new_page();pg.goto(BASE+'worker-1.html');pg.wait_for_function('PSApp.state.tasks.length===1');pg.click('#field-locate');pg.wait_for_function('document.querySelector("#field-location-status").dataset.state==="active"',timeout=25000)
 def pos():return pg.evaluate("""()=>{let p;PSApp.map.eachLayer(l=>{if(l.options.gpsLayer==='position')p=l.getLatLng()});return p}""")
 assert pos()['lat']==22.628;c.set_geolocation({'latitude':22.629,'longitude':120.292,'accuracy':12});pg.wait_for_function("(()=>{let found=false;PSApp.map.eachLayer(l=>{if(l.options.gpsLayer==='position'&&l.getLatLng().lat===22.629)found=true});return found})()",timeout=20000);assert pos()['lng']==120.292;pg.click('#field-location-stop');assert pos() is None
 out=ROOT/'evidence/gps';out.mkdir(exist_ok=True);(out/f'{engine}-native-api.json').write_text(json.dumps({'engine':engine,'native_watch_api_with_emulated_device':True,'position_updates':True,'stop_removes_point':True},indent=2));print(engine,'native watchPosition + simulated device: PASS');b.close()
