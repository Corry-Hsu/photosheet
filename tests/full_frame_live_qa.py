"""Full-resolution portrait/landscape captures, native still fallback, and aligned live watermark."""
from test_config import ROOT,BASE,CHROMIUM,QA_NOW
from playwright.sync_api import sync_playwright
from PIL import Image,ImageOps,ImageChops
from pathlib import Path
import io,json,os,tempfile,base64
fixture=json.loads((ROOT/'tests/fixtures/worker-1.json').read_text());engine=os.getenv('PS_TEST_ENGINE','chromium')
shim=r'''(()=>{
window.cameraSize={width:1600,height:900};window.stillMode='none';window.gpsOK=true;window.calls=[];window.stamps=[];window.watches=new Set();let seq=0;
function edgeCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#445566';x.fillRect(0,0,w,h);for(const [a,b,color]of [[0,0,'#ff0000'],[w-60,0,'#00ff00'],[0,h-60,'#0000ff'],[w-60,h-60,'#ffff00']]){x.fillStyle=color;x.fillRect(a,b,60,60)}return c}
const draw=CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage=function(img,...args){if(img instanceof HTMLVideoElement)img=edgeCanvas(cameraSize.width,cameraSize.height);return draw.call(this,img,...args)};
const fill=CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText=function(text,x,y){if(this.shadowBlur>0)stamps.push({canvas:this.canvas.id,text,x,y,w:this.canvas.width,h:this.canvas.height,scale:Math.hypot(this.getTransform().a,this.getTransform().b),a:this.getTransform().a,b:this.getTransform().b,px:this.getTransform().a*x+this.getTransform().c*y+this.getTransform().e,py:this.getTransform().b*x+this.getTransform().d*y+this.getTransform().f,shadow:this.shadowBlur,align:this.textAlign});return fill.apply(this,arguments)};
Object.defineProperty(HTMLVideoElement.prototype,'videoWidth',{get:()=>cameraSize.width});Object.defineProperty(HTMLVideoElement.prototype,'videoHeight',{get:()=>cameraSize.height});Object.defineProperty(HTMLVideoElement.prototype,'srcObject',{configurable:true,get(){return this._fake},set(v){this._fake=v}});HTMLVideoElement.prototype.play=async()=>{};
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async c=>{calls.push(c);const t={stop(){},getSettings:()=>({deviceId:'main'})};return {getTracks:()=>[t],getVideoTracks:()=>[t]}}}});
window.ImageCapture=class {async takePhoto(){if(stillMode==='none'||stillMode==='fail')throw Error('no still API');if(stillMode==='exif')return new Blob([Uint8Array.from(atob(exifPhoto),c=>c.charCodeAt(0))],{type:'image/jpeg'});return await new Promise(r=>edgeCanvas(2000,3000).toBlob(r,'image/jpeg',.98))}};
function position(){return {coords:{latitude:22.6,longitude:120.5,accuracy:5},timestamp:Date.now()}}
Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(ok,bad){const id=++seq;watches.add(id);gpsOK?ok(position()):bad({message:'no GPS'});return id},clearWatch(id){watches.delete(id)},getCurrentPosition(ok,bad){gpsOK?ok(position()):bad({message:'no GPS'})}}});
})();'''
# Encoded native photo carrying EXIF orientation 6 must retain every edge after normalization.
source=Image.new('RGB',(1200,800),'#445566')
for box,col in [((0,0,60,60),'red'),((1140,0,1200,60),'lime'),((0,740,60,800),'blue'),((1140,740,1200,800),'yellow')]:source.paste(col,box)
exif=source.getexif();exif[274]=6;buffer=io.BytesIO();source.save(buffer,'JPEG',quality=98,exif=exif);exif_bytes=buffer.getvalue();rotated=ImageOps.exif_transpose(Image.open(io.BytesIO(exif_bytes)))
with tempfile.TemporaryDirectory() as tmp,sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']) if engine=='chromium' else p.webkit.launch()
 ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,accept_downloads=True);ctx.add_init_script(shim);ctx.route('https://tile.openstreetmap.org/**',lambda r:r.abort());ctx.route('**/data/worker-1.json',lambda r:r.fulfill(json=fixture));pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.clock.set_fixed_time(QA_NOW);pg.goto(BASE+'worker-1.html');pg.wait_for_function('PSApp.state.tasks.length>0');pg.locator('.task-content').first.click();pg.evaluate('(value)=>window.exifPhoto=value',base64.b64encode(exif_bytes).decode())
 results=[]
 cases=[(1600,900,390,844,'none'),(900,1600,390,844,'none'),(900,1600,844,390,'none'),(4500,3000,390,844,'none'),(800,1200,390,844,'native'),(1600,900,844,390,'fail'),(800,1200,390,844,'exif')]
 for index,(w,h,vw,vh,mode) in enumerate(cases):
  pg.set_viewport_size({'width':vw,'height':vh});pg.evaluate('(s)=>{cameraSize={width:s.w,height:s.h};stillMode=s.mode;stamps=[]}',{'w':w,'h':h,'mode':mode});pg.click('#worker-camera');pg.wait_for_function('!document.querySelector("#shutter").disabled');pg.wait_for_function('stamps.filter(s=>s.canvas==="live-watermark").some(s=>s.text.includes("GPS 22.600000"))');assert pg.locator('#live-watermark').is_visible();assert pg.locator('#camera-guide').count()==0
  assert pg.evaluate('calls.at(-1).video.aspectRatio===undefined&&calls.at(-1).video.width.ideal>1920&&calls.at(-1).video.height.ideal>1920&&calls.at(-1).video.resizeMode.ideal==="none"')
  bounds=pg.evaluate('''()=>{const v=document.querySelector('#video'),m=document.querySelector('#camera-media').getBoundingClientRect(),c=document.querySelector('#live-watermark').getBoundingClientRect();return {mw:m.width,mh:m.height,cw:c.width,ch:c.height,x:c.x-m.x,y:c.y-m.y}}''')
  assert abs(bounds['cw']/bounds['ch']-w/h)<.01
  assert abs(bounds['x']-(bounds['mw']-bounds['cw'])/2)<2 and abs(bounds['y']-(bounds['mh']-bounds['ch'])/2)<2,bounds
  live=pg.evaluate('stamps.filter(s=>s.canvas==="live-watermark").slice(-2)');assert len(live)==2 and all(s['align']=='center' for s in live)
  pg.clock.set_fixed_time('2026-10-26T00:00:05Z');pg.wait_for_function('stamps.filter(s=>s.canvas==="live-watermark").some(s=>s.text.includes("08:00:05"))')
  if index==1:
   out=ROOT/'evidence/full-frame';out.mkdir(parents=True,exist_ok=True);pg.screenshot(path=str(out/f'{engine}-portrait-live.png'))
  pg.click('#shutter');pg.wait_for_function('!document.querySelector("#capture-save").hidden',timeout=60000);assert pg.locator('#live-watermark').is_hidden();assert pg.evaluate('watches.size')==0
  with pg.expect_download() as dl:pg.click('#capture-save')
  dest=Path(tmp)/f'{index}.jpg';dl.value.save_as(str(dest));im=Image.open(dest)
  expected=(2000,3000) if mode=='native' else (800,1200) if mode=='exif' else (w,h)
  assert im.size==expected,(mode,im.size,expected)
  ew,eh=expected
  for point,color in [((8,8),(255,0,0)),((ew-9,8),(0,255,0)),((8,eh-9),(0,0,255)),((ew-9,eh-9),(255,255,0))]:
   if mode=='exif':color=rotated.getpixel(point)
   assert max(abs(a-b) for a,b in zip(im.getpixel(point),color))<20,(mode,point,im.getpixel(point),color)
  saved=pg.evaluate('stamps.filter(s=>s.canvas!=="live-watermark").slice(-2)');assert len(saved)==2
  white=ImageChops.darker(ImageChops.darker(im.getchannel('R'),im.getchannel('G')),im.getchannel('B')).point(lambda v:255 if v>220 else 0).getbbox();assert white
  if eh>ew:
   assert all(0<s['px']<ew*.35 and abs(s['py']-eh/2)<1e-6 and s['b']>.99 for s in saved),saved
   assert white[2]<ew*.35,white
  else:
   assert all(s['x']==ew/2 and abs(s['b'])<1e-6 and s['py']>eh*.65 for s in saved),saved
   assert white[1]>eh*.65,white
  if mode not in ['native','exif']:
   for a,b in zip(live,saved):assert abs(a['px']/a['w']-b['px']/ew)<1e-6 and abs(a['py']/a['h']-b['py']/eh)<1e-6 and abs(a['shadow']/a['scale']-b['shadow'])<1e-4,(a,b,a['shadow']/a['scale']-b['shadow'])
  results.append({'source':[w,h],'mode':mode,'output':list(im.size)});pg.click('#camera-back');pg.wait_for_selector('#detail-board');pg.click('#close-dialog');assert pg.evaluate('watches.size')==0
 # No coordinates are invented if location is unavailable; saving still requires real GPS.
 pg.evaluate("gpsOK=false;stillMode='none'");pg.click('#worker-camera');pg.wait_for_function('!document.querySelector("#shutter").disabled');pg.wait_for_function('stamps.filter(s=>s.canvas==="live-watermark").some(s=>s.text.includes("尚未取得定位"))');pg.click('#shutter');pg.wait_for_function('document.querySelector("#capture-status").textContent.includes("no GPS")');assert pg.locator('#capture-save').is_hidden();pg.evaluate('gpsOK=true');pg.click('#capture-retry-save');pg.wait_for_function('!document.querySelector("#capture-save").hidden');pg.click('#camera-back');pg.wait_for_selector('#detail-board');pg.click('#close-dialog')
 # Leaving directly from the live camera also releases its location watch.
 pg.click('#worker-camera');pg.wait_for_function('!document.querySelector("#shutter").disabled');assert pg.evaluate('watches.size')==1;pg.click('#camera-back');pg.wait_for_selector('#detail-board');assert pg.evaluate('watches.size')==0
 assert not errors,errors
 result={'engine':engine,'frames':results,'live_date_time_gps_and_position':True,'live_stamp_matches_saved_position':True,'portrait_left_long_edge_landscape_bottom':True,'saved_pixel_stamp_bounds':True,'contain_fit_both_orientations':True,'no_crop_no_4096_resize':True,'native_still_and_exif':True,'fallback_when_still_unavailable':True,'gps_failure_retry':True,'watch_cleanup':True,'errors':errors};out=ROOT/'evidence/full-frame';out.mkdir(exist_ok=True,parents=True);(out/f'{engine}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2));browser.close()
