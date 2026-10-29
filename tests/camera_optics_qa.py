"""Capability-aware zoom/lens UI, failure recovery and camera lifecycle (synthetic hardware)."""
from test_config import ROOT, BASE, CHROMIUM, QA_NOW
from playwright.sync_api import sync_playwright
import json, os

engine = os.getenv('PS_TEST_ENGINE', 'chromium')
fixture = json.loads((ROOT/'tests/fixtures/worker-1.json').read_text())
shim = r'''(()=>{
window.opticsMode='supported';window.tracks=[];window.requests=[];window.zoomCalls=[];window.failZoom=false;window.failLens=false;window.holdLens=false;
Object.defineProperty(HTMLVideoElement.prototype,'videoWidth',{get:()=>1600});
Object.defineProperty(HTMLVideoElement.prototype,'videoHeight',{get:()=>900});
Object.defineProperty(HTMLVideoElement.prototype,'srcObject',{configurable:true,get(){return this._fake},set(v){this._fake=v}});
HTMLVideoElement.prototype.play=async()=>{};
const draw=CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage=function(img,...args){if(img instanceof HTMLVideoElement){const c=document.createElement('canvas');c.width=1600;c.height=900;c.getContext('2d').fillRect(0,0,1600,900);img=c}return draw.call(this,img,...args)};
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
getUserMedia:async constraints=>{
 requests.push(constraints);const id=constraints.video.deviceId?.exact||'rear-main';
 if(failLens&&id==='rear-wide')throw Error('lens unavailable');
 const settings={deviceId:id,zoom:1,facingMode:'environment'};
 const track={stopped:false,stop(){this.stopped=true},getSettings:()=>({...settings}),getCapabilities:()=>opticsMode==='unsupported'?{}:{zoom:{min:.5,max:4,step:.1}},applyConstraints:async c=>{zoomCalls.push(c);await new Promise(r=>setTimeout(r,30));if(failZoom)throw Error('zoom rejected');settings.zoom=c.advanced[0].zoom}};
 tracks.push(track);if(holdLens&&id==='rear-wide')await new Promise(r=>window.releaseLens=r);
 return {getTracks:()=>[track],getVideoTracks:()=>[track]};
},enumerateDevices:async()=>{
 if(opticsMode==='enumeration-error')throw Error('blocked');
 return opticsMode==='unsupported'?[]:[{kind:'videoinput',deviceId:'rear-main',label:'Back main'},{kind:'videoinput',deviceId:'rear-wide',label:'Back ultra-wide'},{kind:'videoinput',deviceId:'front',label:'Front camera'}];
}}});
Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok){ok({coords:{latitude:22.6,longitude:120.5,accuracy:5},timestamp:Date.now()})}}});
})();'''
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']) if engine=='chromium' else p.webkit.launch()
    ctx = browser.new_context(viewport={'width':390,'height':844},is_mobile=True)
    ctx.add_init_script(shim)
    ctx.route('https://tile.openstreetmap.org/**',lambda r:r.abort())
    ctx.route('**/data/worker-1.json',lambda r:r.fulfill(json=fixture))
    pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
    pg.clock.set_fixed_time(QA_NOW);pg.goto(BASE+'worker-1.html');pg.wait_for_function('PSApp.state.tasks.length>0')
    pg.locator('.task-content').first.click()
    def open_camera():
        pg.click('#worker-camera');pg.wait_for_function('!document.querySelector("#shutter").disabled')
        assert pg.locator('#camera-guide').count()==0
    def back():
        pg.click('#camera-back');pg.wait_for_selector('#detail-board');pg.click('#close-dialog')
        assert pg.evaluate('tracks.every(t=>t.stopped)')
    open_camera()
    assert pg.locator('#camera-zoom').is_visible() and pg.locator('#camera-lens').is_visible()
    assert pg.locator('#camera-lens option').count()==2
    assert pg.locator('#camera-zoom').get_attribute('min')=='0.5'
    # Rapid slider events serialize and preserve the last requested hardware value.
    pg.evaluate("()=>{const s=document.querySelector('#camera-zoom');for(const value of [.5,1.5,2]){s.value=value;s.dispatchEvent(new Event('input'))}}")
    pg.wait_for_function('document.querySelector("#camera-zoom-value").textContent==="2×"')
    assert pg.evaluate('tracks.at(-1).getSettings().zoom')==2
    pg.evaluate("()=>{failZoom=true;const s=document.querySelector('#camera-zoom');s.value=3;s.dispatchEvent(new Event('input'))}")
    pg.wait_for_function('document.querySelector("#camera-optics-note").textContent.includes("無法套用")')
    assert pg.locator('#camera-zoom').input_value()=='2'
    pg.evaluate('failZoom=false')
    pg.select_option('#camera-lens','rear-wide');pg.wait_for_function('!document.querySelector("#shutter").disabled&&tracks.at(-1).getSettings().deviceId==="rear-wide"')
    assert pg.evaluate('requests.at(-1).video.deviceId.exact')=='rear-wide'
    assert pg.evaluate('tracks.slice(0,-1).every(t=>t.stopped)')
    for w,h in [(390,844),(844,390)]:
        pg.set_viewport_size({'width':w,'height':h})
        assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert pg.locator('#shutter').is_visible()
    out=ROOT/'evidence/camera-optics';out.mkdir(parents=True,exist_ok=True)
    pg.screenshot(path=str(out/f'{engine}-wide.png'))
    pg.click('#shutter');pg.wait_for_function('!document.querySelector("#capture-save").hidden')
    assert pg.locator('#camera-optics').is_hidden()
    assert pg.evaluate('document.querySelector("#capture-preview").naturalWidth===1600&&document.querySelector("#capture-preview").naturalHeight===900')
    pg.click('#capture-again');pg.wait_for_function('!document.querySelector("#shutter").disabled')
    assert pg.locator('#camera-lens').input_value()=='rear-wide'
    assert pg.locator('#camera-optics').is_visible()
    # A rejected switch can restart the last working lens.
    pg.select_option('#camera-lens','rear-main');pg.wait_for_function('!document.querySelector("#shutter").disabled')
    pg.evaluate('failLens=true');pg.select_option('#camera-lens','rear-wide')
    pg.wait_for_selector('#camera-restart:visible');assert pg.locator('#shutter').is_disabled()
    pg.click('#camera-restart');pg.wait_for_function('!document.querySelector("#shutter").disabled')
    assert pg.locator('#camera-lens').input_value()=='rear-main'
    back();pg.set_viewport_size({'width':390,'height':844})
    # Permission-limited browsers remain usable without fake controls.
    pg.evaluate("opticsMode='unsupported'");open_camera()
    assert pg.locator('#camera-zoom-row').is_hidden() and pg.locator('#camera-lens-row').is_hidden()
    assert '未開放' in pg.locator('#camera-optics-note').inner_text();back()
    # Device enumeration failure must not disable available zoom or capture.
    pg.evaluate("opticsMode='enumeration-error'");open_camera()
    assert pg.locator('#camera-zoom-row').is_visible() and pg.locator('#camera-lens-row').is_hidden();back()
    # Leaving during an asynchronous lens switch must stop the late-arriving stream.
    pg.evaluate("opticsMode='supported';failLens=false;holdLens=true");open_camera()
    pg.select_option('#camera-lens','rear-wide');pg.wait_for_function('typeof releaseLens==="function"')
    back_while_pending=pg.evaluate('tracks.length')
    pg.click('#camera-back');pg.wait_for_selector('#detail-board');pg.evaluate('releaseLens()')
    pg.wait_for_function('tracks.every(t=>t.stopped)');pg.click('#close-dialog')
    assert pg.evaluate('tracks.length')==back_while_pending
    assert not errors,errors
    result={'engine':engine,'guide_removed':True,'capability_zoom_and_rapid_input':True,'lens_switch_exact_device':True,'zoom_and_lens_failure_recovery':True,'unsupported_and_enumeration_failure':True,'same_lens_after_capture':True,'landscape_1600x900_retained':True,'late_stream_cleanup':True,'responsive':True,'errors':errors}
    (out/f'{engine}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2));browser.close()
