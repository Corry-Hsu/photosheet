"""Full-width uncut preview and genuine rear ultra-wide preference, on both field roles."""
from test_config import ROOT, BASE, CHROMIUM, QA_NOW
from playwright.sync_api import sync_playwright
import ast,copy,json

tree=ast.parse((ROOT/'tests/camera_optics_qa.py').read_text())
shim=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='shim' for t in n.targets))
shim=shim.replace('get:()=>1600','get:()=>window.testWidth||1600').replace('get:()=>900','get:()=>window.testHeight||900')
shim=shim.replace('getSettings:()=>({...settings})', 'getSettings:()=>{const v={...settings};if(window.omitDeviceId)delete v.deviceId;return v}')
shim=shim.replace("label:'Back ultra-wide'","label:'後置超廣角相機'").replace("label:'Front camera'","label:'前置超廣角相機'")
fixture=json.loads((ROOT/'tests/fixtures/worker-1.json').read_text())
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
 errors=[];measurements=[]
 for role in ['worker','vendor']:
  ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,accept_downloads=True)
  ctx.add_init_script(shim);ctx.route('https://tile.openstreetmap.org/**',lambda r:r.abort())
  data=copy.deepcopy(fixture)
  if role=='vendor':
   data['person']={'id':'v1','name':'示範廠商'};data['vendorType']='雜草垃圾';data['tasks']=[{**data['tasks'][0],'type':'雜草垃圾'}]
  name=role+'-1';ctx.route('**/data/'+name+'.json',lambda r:r.fulfill(json=data))
  pg=ctx.new_page();pg.on('pageerror',lambda e:errors.append(str(e)));pg.clock.set_fixed_time(QA_NOW)
  pg.goto(BASE+name+'.html');pg.wait_for_function('PSApp.state.tasks.length>0');pg.locator('.task-content').first.click()
  def open_camera(mode='physical-zoom',failure=False):
   pg.evaluate('(o)=>{opticsMode=o.mode;failLens=o.failure;holdLens=false}',{'mode':mode,'failure':failure})
   pg.click('#worker-camera');pg.wait_for_selector('#camera-optics:visible')
   pg.wait_for_function('!document.querySelector("#shutter").disabled')
  def back():
   pg.click('#camera-back');pg.wait_for_selector('#detail-board');pg.click('#close-dialog')
   assert pg.evaluate('tracks.every(t=>t.stopped)&&watches.size===0')
  open_camera()
  assert pg.locator('#camera-lens').input_value()=='rear-wide'
  assert pg.locator('[data-zoom="0.5"]').get_attribute('aria-pressed')=='true'
  assert pg.evaluate('requests.every(r=>r.video.deviceId?.exact!=="front")')
  assert pg.locator('#camera-optics-note').is_hidden()
  assert '點選倍率切換' not in pg.locator('#dialog-body').inner_text()
  assert '照片保留完整尺寸' not in pg.locator('#dialog-body').inner_text()
  for w,h,vw,vh in [(390,844,900,1600),(320,568,900,1600),(844,390,1600,900)]:
   pg.set_viewport_size({'width':w,'height':h});pg.evaluate('(s)=>{testWidth=s.w;testHeight=s.h;document.querySelector("#video").onresize()}',{'w':vw,'h':vh})
   pg.wait_for_function('Math.abs(document.querySelector("#live-watermark").getBoundingClientRect().width-innerWidth)<1')
   m=pg.locator('#camera-media').bounding_box();v=pg.locator('#video').bounding_box()
   assert abs(m['x'])<1 and abs(m['width']-w)<1 and abs(v['width']-w)<1
   assert abs(m['height']-w*vh/vw)<1 and abs(v['height']-m['height'])<1,(m,w,vw,vh)
   button=pg.locator('#shutter').bounding_box();assert button['y']>=0 and button['y']+button['height']<=h+1,button
   if w>h:assert pg.locator('.field-camera-controls').bounding_box()['height']<h*.3
   assert pg.evaluate('document.querySelector("#dialog-body").scrollWidth<=innerWidth')
   out=ROOT/'evidence/full-width-camera';out.mkdir(parents=True,exist_ok=True)
   pg.screenshot(path=str(out/f'{role}-{w}.png'));measurements.append({'role':role,'screen':w,'image_width':round(v['width'])})
  # Keep the selected lens and active stream when resuming after a saved shot.
  count=pg.evaluate('requests.length');pg.click('#shutter');pg.wait_for_selector('#capture-save:visible')
  pg.wait_for_function('document.querySelector("#capture-preview").naturalWidth>0')
  assert pg.locator('#capture-preview').bounding_box()['width']==844
  pg.click('#capture-preview');pg.wait_for_selector('#shutter:visible');assert pg.evaluate('requests.length')==count
  back()
  pg.evaluate('omitDeviceId=true');open_camera()
  assert pg.locator('#camera-lens').input_value()=='rear-wide'
  assert pg.locator('[data-zoom="0.5"]').get_attribute('aria-pressed')=='true';back();pg.evaluate('omitDeviceId=false')
  open_camera('unsupported');assert pg.evaluate('tracks.at(-1).getSettings().deviceId')=='rear-main';back()
  open_camera('physical-zoom',True)
  assert pg.evaluate('tracks.at(-1).getSettings().deviceId')=='rear-main'
  assert pg.evaluate('requests.filter(r=>r.video.deviceId?.exact==="rear-wide").length')>=1;back()
  # Leaving during the automatic ultra-wide open must release the late camera.
  pg.evaluate("opticsMode='physical-zoom';failLens=false;holdLens=true")
  pg.click('#worker-camera');pg.wait_for_function('typeof releaseLens==="function"')
  pg.click('#camera-back');pg.wait_for_selector('#detail-board');pg.evaluate('releaseLens()')
  pg.wait_for_function('tracks.every(t=>t.stopped)&&watches.size===0')
  ctx.close()
 assert not errors,errors
 print(json.dumps({'full_width':measurements,'native_aspect_without_crop':True,'removed_instructions':True,'rear_ultra_wide_preferred':True,'rear_fallback_and_no_front':True,'shutter_reachable':True,'warm_stream_kept':True,'late_auto_switch_cleanup':True,'errors':errors},ensure_ascii=False,indent=2))
 browser.close()
