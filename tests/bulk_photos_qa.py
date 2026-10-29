"""Verify real IndexedDB selection, ZIP contents, sharing, and atomic local deletion."""
from test_config import ROOT, BASE, CHROMIUM, QA_NOW
from playwright.sync_api import sync_playwright
from pathlib import Path
from PIL import Image
import base64, copy, hashlib, io, json, os, tempfile, zipfile

engine=os.getenv('PS_TEST_ENGINE','chromium')
fixture=json.loads((ROOT/'tests/fixtures/worker-1.json').read_text())
share_shim=r'''(()=>{
window.shareMode='unsupported';window.shareCalls=[];
Object.defineProperty(navigator,'canShare',{configurable:true,value:({files})=>shareMode!=='unsupported'&&files[0].type==='application/zip'});
Object.defineProperty(navigator,'share',{configurable:true,value:async({files})=>{
 shareCalls.push({name:files[0].name,type:files[0].type,size:files[0].size});
 if(shareMode==='cancel')throw new DOMException('cancel','AbortError');
 if(shareMode==='activation'){shareMode='success';throw new DOMException('gesture required','NotAllowedError')}
 window.sharedBytes=Array.from(new Uint8Array(await files[0].arrayBuffer()));
}});
})();'''
with tempfile.TemporaryDirectory() as temp, sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']) if engine=='chromium' else p.webkit.launch()
    ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,accept_downloads=True)
    ctx.add_init_script(share_shim)
    ctx.route('https://tile.openstreetmap.org/**',lambda r:r.abort())
    ctx.route('**/data/worker-1.json',lambda r:r.fulfill(json=fixture))
    pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.clock.set_fixed_time(QA_NOW)
    pg.goto(BASE+'worker-1.html');pg.wait_for_function('PSApp.state.tasks.length>0')
    expected=pg.evaluate('''async()=>{
      const task=PSApp.state.tasks[0], result={};
      for(let i=0;i<5;i++){
        const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
        const c=canvas.getContext('2d');c.fillStyle=['#356b44','#663322','#224477','#556677','#887744'][i];c.fillRect(0,0,640,360);c.fillStyle='white';c.font='22px sans-serif';c.fillText('GPS 22.6 120.5 / STAMP '+i,90,330);
        const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg'));
        const id=['photo:a','photo/a','photo-c','other-task','other-person'][i];
        await Store.put('photos',{id,person:i===4?'p2':'p1',taskId:i===3?'other-task-id':task.id,blob,original:new Blob(['ORIGINAL MUST NOT BE EXPORTED']),capturedAt:'2026-10-29T09:00:0'+i+'Z',savedAt:'2026-10-29T09:00:0'+i+'Z'});
        result[id]=Array.from(new Uint8Array(await blob.arrayBuffer()));
      }
      return result;
    }''')
    assert pg.evaluate("""async()=>{window.beforeDelete=await Store.get('photos','photo:a');await Store.updatePhotoIfPresent({...beforeDelete,uploaded:true});const db=await Store.open();return await new Promise((yes,no)=>{const r=db.transaction('photos').objectStore('photos').get('photo:a');r.onsuccess=()=>yes(r.result._photoBytes instanceof ArrayBuffer&&!r.result.blob);r.onerror=()=>no(r.error)})}""")
    pg.locator('[data-detail]').first.click();pg.wait_for_selector('[data-photo-select]')
    def rows():return pg.evaluate('(async()=> (await Store.photosFor("p1",PSApp.state.tasks[0].id)).map(p=>p.id))()')
    def validate_zip(data,ids):
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            assert len(z.namelist())==len(ids) and len(set(z.namelist()))==len(ids)
            for name,ident in zip(z.namelist(),ids):
                assert name.endswith('.jpg') and '/' not in name and '\\' not in name
                actual=z.read(name);assert actual==bytes(expected[ident]),ident
                assert Image.open(io.BytesIO(actual)).size==(640,360)
    assert pg.locator('[data-photo-select]').count()==3
    assert pg.locator('[data-photo-save],[data-photo-delete]').count()==0
    assert pg.locator('[data-photos-export]').is_disabled() and pg.locator('[data-photos-delete]').is_disabled()
    checks=pg.locator('[data-photo-select]');checks.nth(0).check();checks.nth(2).check()
    assert pg.locator('[data-photos-all]').evaluate('(c)=>c.indeterminate')
    assert pg.locator('[data-photos-count]').inner_text()=='已選 2 張'
    pg.locator('[data-photo-view]').first.click();pg.wait_for_selector('.field-image-dialog img');pg.click('.field-image-close')
    with pg.expect_download() as dl:pg.click('[data-photos-export]')
    zip_path=Path(temp)/'selected.zip';dl.value.save_as(str(zip_path));validate_zip(zip_path.read_bytes(),['photo:a','photo-c'])
    assert pg.locator('[data-photos-share]').is_hidden()
    assert len(rows())==3
    # Changing selection invalidates a prepared ZIP; all includes collision-prone IDs safely.
    pg.locator('[data-photos-all]').check();assert pg.locator('[data-photos-zip]').is_hidden()
    with pg.expect_download() as dl:pg.click('[data-photos-export]')
    dl.value.save_as(str(zip_path));validate_zip(zip_path.read_bytes(),['photo:a','photo/a','photo-c'])
    pg.locator('[data-photos-all]').uncheck();assert pg.locator('[data-photos-export]').is_disabled()
    checks.nth(1).check();pg.evaluate("shareMode='success'");pg.click('[data-photos-export]')
    pg.wait_for_function('document.querySelector("[data-photos-status]").textContent.includes("已交給")')
    validate_zip(bytes(pg.evaluate('sharedBytes')),['photo/a'])
    assert pg.evaluate('shareCalls.at(-1).type')=='application/zip'
    # A cancelled share never triggers a fallback download or changes the photos.
    downloads=[];pg.on('download',lambda d:downloads.append(d.suggested_filename))
    pg.evaluate("shareMode='cancel'");pg.click('[data-photos-share]')
    pg.wait_for_function('document.querySelector("[data-photos-status]").textContent.includes("已取消分享")')
    assert not downloads and len(rows())==3
    # An async build that loses activation exposes a ready-to-share button for a new tap.
    pg.evaluate("shareMode='activation'");pg.click('[data-photos-export]')
    pg.wait_for_function('document.querySelector("[data-photos-status]").textContent.includes("已備妥")')
    pg.click('[data-photos-share]');pg.wait_for_function('document.querySelector("[data-photos-status]").textContent.includes("已交給")')
    assert not downloads
    # ZIP failures leave all data and the selection intact, and can be retried.
    pg.evaluate("()=>{window.realZip=fflate.zipSync;fflate.zipSync=()=>{throw Error('test ZIP failure')}}")
    pg.click('[data-photos-export]');pg.wait_for_function('document.querySelector("[data-photos-status]").textContent.includes("打包失敗")')
    assert len(rows())==3 and checks.nth(1).is_checked();pg.evaluate('()=>{fflate.zipSync=realZip}')
    confirms=[]
    def cancel(d):confirms.append(d.message);d.dismiss()
    pg.on('dialog',cancel);pg.click('[data-photos-delete]');assert len(rows())==3;assert '1 張' in confirms[-1];pg.remove_listener('dialog',cancel)
    # Any deletion error aborts the entire transaction, including an already queued delete.
    checks.nth(0).check();pg.evaluate('''()=>{window.realDelete=IDBObjectStore.prototype.delete;let calls=0;IDBObjectStore.prototype.delete=function(id){if(++calls===2)throw Error('test delete failure');return realDelete.call(this,id)}}''')
    def accept(d):confirms.append(d.message);d.accept()
    pg.on('dialog',accept);pg.click('[data-photos-delete]');pg.wait_for_function('document.querySelector("[data-photos-status]").textContent.includes("刪除失敗")')
    assert set(rows())=={'photo:a','photo/a','photo-c'};assert pg.locator('[data-photo-select]:checked').count()==2
    pg.evaluate('()=>{IDBObjectStore.prototype.delete=realDelete}');pg.click('[data-photos-delete]')
    pg.wait_for_function('document.querySelectorAll("[data-photo-select]").length===1')
    assert rows()==['photo-c'] and '2 張' in confirms[-1]
    assert pg.evaluate("async()=>{await Store.updatePhotoIfPresent(beforeDelete);return !(await Store.get('photos','photo:a'))}")
    assert pg.evaluate('(async()=>!!(await Store.get("photos","other-task"))&&!!(await Store.get("photos","other-person")))()')
    for w,h in [(360,640),(390,844),(844,390)]:
        pg.set_viewport_size({'width':w,'height':h});assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
    out=ROOT/'evidence/bulk-photos';out.mkdir(parents=True,exist_ok=True);pg.screenshot(path=str(out/f'{engine}.png'))
    pg.reload();pg.wait_for_function('PSApp.state.tasks.length>0');pg.locator('[data-detail]').first.click();pg.wait_for_selector('[data-photo-select]');assert rows()==['photo-c']
    pg.locator('[data-photos-all]').check();pg.click('[data-photos-delete]');pg.wait_for_function('document.querySelector("#local-photos .photos").textContent.includes("尚未拍攝")');assert pg.locator('.field-photo-toolbar').is_hidden()
    # Vendor roles get the same selection controls, without changing completion rules.
    vendor=copy.deepcopy(fixture);vendor['person']={'id':'v1','name':'示範廠商'};vendor['vendorType']='雜草垃圾';vendor['tasks']=[{**vendor['tasks'][0],'type':'雜草垃圾'}]
    ctx.route('**/data/vendor-1.json',lambda r:r.fulfill(json=vendor));vp=ctx.new_page();vp.on('pageerror',lambda e:errors.append(str(e)));vp.clock.set_fixed_time(QA_NOW);vp.goto(BASE+'vendor-1.html');vp.wait_for_function('PSApp.state.tasks.length===1')
    vp.evaluate('''async()=>{const source=await Store.get('photos','other-person');await Store.put('photos',{...source,id:'vendor-photo',person:'v1',taskId:PSApp.state.tasks[0].id})}''')
    vp.locator('[data-detail]').first.click();vp.wait_for_selector('[data-photo-select]');assert vp.locator('[data-photo-select]').count()==1
    vp.locator('[data-photos-all]').check();assert not vp.locator('[data-photos-export]').is_disabled();assert not vp.evaluate('PSApp.state.tasks[0].completed||false')
    assert not errors,errors
    result={'engine':engine,'only_selected_stamped_jpegs_in_zip':True,'collision_safe_names':True,'all_and_partial_selection':True,'share_success_cancel_and_fresh_gesture':True,'zip_failure_retains_data':True,'atomic_delete_error_and_retry':True,'only_current_task_person_deleted':True,'late_ack_no_resurrection_and_webkit_bytes':True,'deletion_persists_after_reload':True,'empty_gallery_and_vendor':True,'responsive':True,'errors':errors}
    (out/f'{engine}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2));browser.close()
