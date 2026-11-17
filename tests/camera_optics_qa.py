"""Real zoom buttons, physical ultra-wide switching, failure recovery and lifecycle.
Synthetic hardware verifies browser API use; it does not measure phone performance.
"""
from test_config import ROOT, BASE, CHROMIUM, QA_NOW
from playwright.sync_api import sync_playwright
import json, os

engine = os.getenv('PS_TEST_ENGINE', 'chromium')
fixture = json.loads((ROOT/'tests/fixtures/worker-1.json').read_text())
shim = r'''(()=>{
window.opticsMode='supported';window.tracks=[];window.requests=[];window.zoomCalls=[];
window.failZoom=false;window.failLens=false;window.holdLens=false;window.holdEnumeration=false;
window.gpsCalls=0;window.watches=new Set();let sequence=0;
Object.defineProperty(HTMLVideoElement.prototype,'videoWidth',{get:()=>1600});
Object.defineProperty(HTMLVideoElement.prototype,'videoHeight',{get:()=>900});
Object.defineProperty(HTMLVideoElement.prototype,'srcObject',{configurable:true,get(){return this._fake},set(v){this._fake=v}});
HTMLVideoElement.prototype.play=async()=>{};window.ImageCapture=undefined;
const draw=CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage=function(img,...args){if(img instanceof HTMLVideoElement){const c=document.createElement('canvas');c.width=1600;c.height=900;c.getContext('2d').fillRect(0,0,1600,900);img=c}return draw.call(this,img,...args)};
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
getUserMedia:async constraints=>{
 requests.push(constraints);const id=constraints.video.deviceId?.exact||'rear-main';
 if(failLens&&id==='rear-wide')throw Error('lens unavailable');
 const settings={deviceId:id,zoom:1,facingMode:'environment'};
 const track={stopped:false,readyState:'live',stop(){this.stopped=true;this.readyState='ended'},getSettings:()=>({...settings}),getCapabilities:()=>opticsMode==='unsupported'||opticsMode==='physical'?{}:{zoom:{min:.5,max:4,step:.1}},applyConstraints:async c=>{zoomCalls.push(c);if(failZoom)throw Error('zoom rejected');settings.zoom=c.advanced[0].zoom}};
 tracks.push(track);if(holdLens&&id==='rear-wide')await new Promise(r=>window.releaseLens=r);
 return {getTracks:()=>[track],getVideoTracks:()=>[track]};
},enumerateDevices:async()=>{
 if(holdEnumeration)await new Promise(r=>window.releaseEnumeration=r);
 if(opticsMode==='enumeration-error')throw Error('blocked');
 return opticsMode==='unsupported'?[]:[{kind:'videoinput',deviceId:'rear-main',label:'Back main'},{kind:'videoinput',deviceId:'rear-wide',label:'Back ultra-wide'},{kind:'videoinput',deviceId:'front',label:'Front camera'}];
}}});
function position(){return {coords:{latitude:22.6,longitude:120.5,accuracy:5},timestamp:Date.now()}}
Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
 watchPosition(ok){const id=++sequence;watches.add(id);ok(position());return id},
 clearWatch(id){watches.delete(id)},getCurrentPosition(ok){gpsCalls++;ok(position())}
}});
})();'''
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']) if engine=='chromium' else p.webkit.launch()
    ctx = browser.new_context(viewport={'width':390,'height':844},is_mobile=True,accept_downloads=True)
    ctx.add_init_script(shim)
    ctx.route('https://tile.openstreetmap.org/**',lambda r:r.abort())
    ctx.route('**/data/worker-1.json',lambda r:r.fulfill(json=fixture))
    pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
    pg.clock.set_fixed_time(QA_NOW);pg.goto(BASE+'worker-1.html');pg.wait_for_function('PSApp.state.tasks.length>0')
    pg.locator('.task-content').first.click()
    def open_camera():
        pg.click('#worker-camera');pg.wait_for_function('!document.querySelector("#shutter").disabled')
        assert pg.locator('input[type=range],#capture-again,#camera-guide').count()==0
    def ready():
        pg.wait_for_selector('#camera-optics:visible')
    def zoom(value):
        pg.locator(f'#camera-zoom-buttons [data-zoom="{value}"]').click()
        pg.wait_for_function('!document.querySelector("#shutter").disabled')
    def back():
        pg.click('#camera-back');pg.wait_for_selector('#detail-board');pg.click('#close-dialog')
        assert pg.evaluate('tracks.every(t=>t.stopped)&&watches.size===0')
    # Enumeration must not delay the shutter.
    pg.evaluate('holdEnumeration=true');open_camera()
    assert pg.evaluate('typeof releaseEnumeration==="function"')
    pg.evaluate('holdEnumeration=false;releaseEnumeration()');ready()
    assert pg.locator('#camera-lens option').count()==2
    zoom('0.5');assert pg.evaluate('tracks.at(-1).getSettings().zoom')==.5
    assert pg.evaluate('requests.length')==1  # Hardware zoom avoids reopening a lens.
    zoom('1');assert pg.evaluate('tracks.at(-1).getSettings().zoom')==1
    zoom('2');pg.evaluate('failZoom=true');zoom('3')
    assert pg.evaluate('tracks.at(-1).getSettings().zoom')==2
    assert '無法套用' in pg.locator('#camera-optics-note').inner_text()
    pg.evaluate('failZoom=false')
    # A saved picture returns to the warm stream only on non-button taps.
    for w,h in [(844,390),(390,844)]:
        pg.set_viewport_size({'width':w,'height':h})
        assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert pg.locator('#shutter').is_visible()
    count=pg.evaluate('requests.length')
    pg.click('#shutter');pg.wait_for_selector('#capture-save:visible')
    pg.wait_for_function('document.querySelector("#capture-preview").naturalWidth===1600')
    assert pg.evaluate('gpsCalls')==0  # Reuse a validated watch reading <=5 seconds old.
    assert pg.evaluate('watches.size')==1
    with pg.expect_download():pg.click('#capture-save')
    assert pg.locator('#capture-preview').is_visible()
    pg.click('#capture-preview');pg.wait_for_selector('#shutter:visible')
    assert pg.evaluate('requests.length')==count
    # Stale GPS is refreshed. Pending storage cannot be discarded by tapping.
    pg.clock.set_fixed_time('2026-10-26T00:00:10Z')
    pg.evaluate('''()=>{window.realPut=Store.put;window.photoWrites=0;window.firstBlob=null;Store.put=async(s,v)=>{if(s==='photos'){photoWrites++;if(!firstBlob)firstBlob=v.blob;else if(firstBlob!==v.blob)throw Error('restamped on retry');throw Error('storage failure')}return realPut(s,v)}}''')
    pg.click('#shutter');pg.wait_for_function('document.querySelector("#capture-status").textContent.includes("storage failure")')
    assert pg.evaluate('gpsCalls')==1
    pg.click('#capture-preview');assert pg.locator('#shutter').is_hidden()
    pg.click('#capture-retry-save');pg.wait_for_function('photoWrites===2&&!document.querySelector("#capture-retry-save").disabled')
    assert pg.evaluate('gpsCalls')==1
    pg.evaluate('()=>{Store.put=realPut}');pg.click('#capture-retry-save');pg.wait_for_selector('#capture-save:visible')
    pg.click('#capture-preview');pg.wait_for_selector('#shutter:visible')
    assert pg.evaluate('requests.length')==count
    assert pg.evaluate('(async()=> (await Store.all("photos")).length)()')==2
    # Show the stamp before IDB completes, but do not allow losing a pending write.
    pg.evaluate("()=>{Store.put=async(s,v)=>{if(s==='photos')await new Promise(r=>window.releaseWrite=r);return realPut(s,v)}}")
    pg.click('#shutter');pg.wait_for_function('typeof releaseWrite==="function"')
    assert pg.locator('#capture-preview').is_visible() and pg.locator('#capture-save').is_hidden()
    pg.click('#capture-preview');assert pg.locator('#shutter').is_hidden()
    pg.evaluate('releaseWrite()');pg.wait_for_selector('#capture-save:visible')
    pg.evaluate('()=>{Store.put=realPut}');back()
    # Physical cameras with no zoom capability must switch actual devices for 0.5×.
    pg.evaluate("opticsMode='physical'");open_camera();ready();zoom('0.5');ready()
    assert pg.evaluate('tracks.at(-1).getSettings().deviceId')=='rear-wide'
    assert pg.locator('[data-zoom="0.5"]').get_attribute('aria-pressed')=='true'
    zoom('1');ready();assert pg.evaluate('tracks.at(-1).getSettings().deviceId')=='rear-main'
    pg.evaluate('failLens=true');zoom('0.5');ready()
    assert pg.evaluate('tracks.at(-1).getSettings().deviceId')=='rear-main'
    assert '回復原鏡頭' in pg.locator('#camera-optics-note').inner_text()
    back()
    pg.evaluate("opticsMode='unsupported'");open_camera();ready()
    assert pg.locator('[data-zoom="0.5"]').is_disabled()
    assert pg.locator('[data-zoom="1"]').is_enabled()
    zoom('1');assert pg.locator('[data-zoom="1"]').is_enabled()
    assert '未開放' in pg.locator('#camera-optics-note').inner_text();back()
    pg.evaluate("opticsMode='enumeration-error'");open_camera();ready();zoom('0.5')
    assert pg.evaluate('tracks.at(-1).getSettings().zoom')==.5;back()
    # A late stream after leaving must be released, too.
    pg.evaluate("opticsMode='physical';failLens=false;holdLens=true");open_camera();ready()
    pg.select_option('#camera-lens','rear-wide');pg.wait_for_function('typeof releaseLens==="function"')
    pg.click('#camera-back');pg.wait_for_selector('#detail-board');pg.evaluate('releaseLens()')
    pg.wait_for_function('tracks.every(t=>t.stopped)&&watches.size===0')
    assert not errors,errors
    print(json.dumps({'engine':engine,'tap_zoom_and_real_ultra_wide':True,'hardware_failures_recover':True,'shutter_before_enumeration':True,'warm_stream_across_photos':True,'fresh_gps_reused_stale_refreshed':True,'retry_reuses_stamp_and_location':True,'pending_photo_not_discarded':True,'buttons_do_not_resume':True,'late_stream_cleanup':True,'errors':errors},ensure_ascii=False,indent=2))
    browser.close()
