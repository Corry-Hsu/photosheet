"""User workflows against synthetic public packages, without writing any dispatch data."""
import copy,json,os,shutil,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.getenv('DISPATCH_TEST_URL','http://127.0.0.1:8804/').rstrip('/')+'/'
ROOT=Path(__file__).resolve().parents[1]
def task(ident='job1',lot='249',town='恆春鎮',kind='圍籬'):
 return dict(id=ident,caseNo=ident,type=kind,parcels=[dict(county='屏東縣',district=town,section='城南段',sectionCode='0582',lot=lot)],items=[],resultDate='2026-11-15',due='',assignee='p2',navigation=dict(point=[120.5,22.5],source='manual',confirmed=True))
def feature(lot='249'):
 return dict(id='f'+lot,code='0582',lot=lot,lands=[dict(county='屏東縣',district='恆春鎮',section='城南段',lot=lot)],polygons=[[[[120.5,22.5],[120.51,22.5],[120.51,22.51],[120.5,22.5]]]],bbox=[120.5,22.5,120.51,22.51])
def pack(ident,tasks=None,features=None):
 p=dict(schemaVersion=1,batch='kept-batch',generatedAt='2026-11-01T00:00:00Z',person=dict(id=ident,name=ident),settings={},tasks=tasks or [],features=features or [])
 if ident[0]=='v':p['vendorType']={'v1':'雜草垃圾','v2':'砍樹','v3':'圍籬'}[ident]
 return p
names={'p1':'worker-1.json','p2':'worker-2.json','p3':'worker-3.json','v1':'vendor-1.json','v2':'vendor-2.json','v3':'vendor-3.json'}
remote={i:pack(i) for i in names}
remote['p2']=pack('p2',[task()],[feature()]);remote['v3']=pack('v3',[task()],[feature()])
removed=task('remove','300','林邊鄉','雜草垃圾');retained=task('keep','301','恆春鎮','雜草垃圾')
remote['p2']['tasks'] += [removed,retained];remote['v1']=pack('v1',[removed,retained],[])
errors=[];blocked=set();writes=[]
with tempfile.TemporaryDirectory() as temp,sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,accept_downloads=True)
 for host in ['tile.openstreetmap.org','wmts.nlsc.gov.tw']:ctx.route('https://'+host+'/**',lambda r:r.abort())
 def data_route(route):
  file=route.request.url.split('?')[0].split('/')[-1];ident=next((i for i,n in names.items() if n==file),None)
  if ident in blocked:route.fulfill(status=503,body='offline');return
  route.fulfill(status=200,content_type='application/json',body=json.dumps(remote[ident],ensure_ascii=False))
 ctx.route('**/data/*.json*',data_route)
 ctx.on('request',lambda r:writes.append(r.method+' '+r.url) if r.method not in ['GET','HEAD'] else None)
 pg=ctx.new_page();pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE);pg.wait_for_function('window.PSApp&&PSApp.map')
 manager_before=pg.evaluate('JSON.stringify(PSApp.state)')
 pg.click('#dispatch-tools');pg.wait_for_function('document.querySelector("#dt-status").textContent.includes("已讀取")')
 assert pg.locator('[data-recipient]:checked').count()==0
 pg.check('[data-recipient=p2]');pg.check('[data-recipient=v1]')
 pg.select_option('#dt-town','林邊鄉');assert pg.locator('[data-task]').count()==2
 pg.click('#dt-select');pg.click('#dt-remove');assert pg.locator('[data-undo]').count()==2
 assert '尚未更新網站' in pg.locator('#dt-status').inner_text()
 pg.click('#dt-export');pg.wait_for_selector('.dt-download');assert pg.locator('.dt-download').count()==2
 def downloads():
  out={}
  for a in pg.locator('.dt-download').all():
   with pg.expect_download() as d:a.click()
   dl=d.value;path=Path(temp)/dl.suggested_filename;dl.save_as(path);out[dl.suggested_filename]=json.loads(path.read_text())
  return out
 out=downloads();assert [t['id'] for t in out['vendor-1.json']['tasks']]==['keep'];assert 'remove' not in [t['id'] for t in out['worker-2.json']['tasks']]
 assert out['worker-2.json']['tasks'][0]['navigation']['confirmed'] is True
 # Restore one removal, preview invalidation, then restore it to keep batch semantics.
 pg.locator('[data-undo]').first.click();assert pg.locator('.dt-download').count()==0
 pg.select_option('#dt-town','林邊鄉');pg.click('#dt-select');pg.click('#dt-remove')
 # Incoming repair + new task; changed dates/navigation remain unchanged unless selected.
 incoming=pack('p2',[task(),task('new','500')],[feature(),feature('240'),feature('500')]);incoming['tasks'][0]['parcels'][0]['lot']='240';incoming['tasks'][0]['navigation']=None;incoming['tasks'][0]['resultDate']='2026-12-01'
 incoming['tasks'].append(copy.deepcopy(incoming['tasks'][1]))
 pg.locator('#dt-file').set_input_files({'name':'worker-2 (1).json','mimeType':'application/json','buffer':json.dumps(incoming).encode()})
 pg.wait_for_function('document.querySelector("#dt-status").textContent.includes("已匯入")')
 article=pg.locator('[data-entry=p2]');article.locator('summary').filter(has_text='逐欄差異').click()
 parcel=article.locator('.dt-conflict').filter(has_text='地段地號').first
 parcel.locator('input').check()
 assert article.locator('details').filter(has=pg.locator('.dt-conflicts')).get_attribute('open') is not None
 parcel=article.locator('.dt-conflict').filter(has_text='地段地號').first;parcel.locator('[data-sync]').click()
 assert pg.locator('[data-recipient=v3]').is_checked()
 pg.click('#dt-export');pg.wait_for_selector('.dt-download');out=downloads()
 for n in ['worker-2.json','vendor-3.json']:
  job=next(t for t in out[n]['tasks'] if t['id']=='job1');assert job['parcels'][0]['lot']=='240';assert job['navigation']['confirmed'] is True;assert job['resultDate']=='2026-11-15';assert '240' in [f['lot'] for f in out[n]['features']];assert '249' not in [f['lot'] for f in out[n]['features']]
 assert len([t for t in out['worker-2.json']['tasks'] if t['id']=='new'])==1
 # Remote changes block all previously prepared downloads. Rebase keeps new remote work.
 remote['p2']['tasks'].append(task('remote','600'));remote['p2']['tasks'][0]['parcels'][0]['lot']='241';remote['p2']['features']=[feature('241')]
 pg.click('#dt-export');pg.wait_for_function('document.querySelector("#dt-status").textContent.includes("無法匯出")');assert pg.locator('.dt-download').count()==0
 pg.click('#dt-load');pg.wait_for_function('document.querySelector("#dt-status").textContent.includes("已重新讀取")')
 assert '需重新確認' in pg.locator('#dt-diffs').inner_text()
 pg.click('#dt-export');pg.wait_for_selector('.dt-download');out=downloads();w=out['worker-2.json'];assert any(t['id']=='remote' for t in w['tasks']);assert next(t for t in w['tasks'] if t['id']=='job1')['parcels'][0]['lot']=='241'
 # A batch containing invalid vendor data is rejected in full.
 valid=pack('p1',[{**task('should-not-appear'), 'assignee':'p1'}],[]);bad=pack('v1',[task('wrong-vendor')],[])
 pg.locator('#dt-file').set_input_files([{'name':'worker-1.json','mimeType':'application/json','buffer':json.dumps(valid).encode()},{'name':'vendor-1.json','mimeType':'application/json','buffer':json.dumps(bad).encode()}]);pg.wait_for_function('document.querySelector("#dt-status").textContent.includes("標籤")')
 assert not pg.locator('[data-recipient=p1]').is_checked();assert 'should-not-appear' not in pg.locator('#dt-diffs').inner_text()
 # A failed network check cannot produce downloads.
 blocked.add('p2');pg.click('#dt-export');pg.wait_for_function('document.querySelector("#dt-status").textContent.includes("無法匯出")');assert pg.locator('.dt-download').count()==0;blocked.clear()
 # Draft is isolated from the manager source, and survives a browser reload.
 assert pg.evaluate('JSON.stringify(PSApp.state)')==manager_before
 pg.wait_for_function('document.querySelector("#dt-saved").textContent.includes("已存")');pg.reload();pg.wait_for_function('window.PSApp&&PSApp.map');pg.click('#dispatch-tools');pg.wait_for_function('document.querySelector("#dt-status").textContent.includes("已恢復")');assert pg.locator('[data-recipient=v3]').is_checked()
 for width in [360,390,844,1440]:
  pg.set_viewport_size({'width':width,'height':900});assert pg.evaluate('document.querySelector("#dispatch-tools-dialog").scrollWidth<=document.querySelector("#dispatch-tools-dialog").clientWidth+1'),width
 pg.set_viewport_size({'width':390,'height':844});pg.screenshot(path=str(ROOT/'evidence/dispatch-tools-mobile.png'))
 # Bringing in current manager tasks uses its assignment and tag rules, preserving live tasks.
 pg.click('#dt-close');current=task('manager-new','800','屏東市','雜草垃圾');current['assignee']='p1'
 pg.evaluate('async t=>{const s=structuredClone(PSApp.state);s.tasks=[t];await Store.put("state",s)}',current);pg.reload();pg.wait_for_function('PSApp.state.tasks.length===1');pg.click('#dispatch-tools');pg.wait_for_selector('[data-recipient]');pg.check('[data-recipient=p1]');pg.click('#dt-manager');pg.wait_for_function('document.querySelector("#dt-status").textContent.includes("已匯入")');pg.click('#dt-export');pg.wait_for_selector('.dt-download');out=downloads();assert out['worker-1.json']['tasks'][0]['id']=='manager-new'
 # No workbench appears on field pages.
 pg.click('#dt-close');pg.goto(BASE+'worker-2.html');pg.wait_for_function('window.PSApp&&PSApp.map');assert pg.locator('#dispatch-tools').count()==0;assert pg.locator('#dispatch-tools-dialog').count()==0
 assert not writes,writes
 assert not errors,errors
 print('PASS: filtering/removal, safe merge, per-field repair and sync, actual JSON downloads, stale-version and network blocks, atomic validation, draft isolation/reload, manager import, responsive layouts, field-page isolation')
 browser.close()
