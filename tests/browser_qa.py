from test_config import ROOT, BASE, ZIP, EXCEL, CHROMIUM, QA_NOW
from playwright.sync_api import sync_playwright
from pathlib import Path
import json,time
book=EXCEL
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROMIUM,headless=True,args=['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
 ctx=browser.new_context(viewport={'width':1440,'height':1000},permissions=['camera','geolocation'],geolocation={'latitude':22.628,'longitude':120.291,'accuracy':8},timezone_id='Asia/Taipei',accept_downloads=True)
 page=ctx.new_page();page.clock.set_fixed_time(QA_NOW);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://tile.openstreetmap.org/**',lambda r:r.abort());page.goto(BASE);page.wait_for_function('window.PSApp && document.querySelector("#person-filter").options.length===5')
 start=time.time();page.locator('#excel-file').set_input_files(str(book));page.wait_for_selector('#commit-import',timeout=30000);preview=page.locator('#dialog-body>p').first.inner_text();print('excel',preview,'seconds',round(time.time()-start,2),flush=True);assert '847' in preview and '1529' in preview;page.click('#commit-import');page.wait_for_function('PSApp.state.tasks.length===847');
 # Excel parse parity with authoritative importer, without exposing source in evidence.
 from reference_importer import parse_workbook
 expected=parse_workbook(book.read_bytes());actual=page.evaluate('PSApp.state.tasks');exp={r['key']:r for r in expected['records'] if r['serial']!='未編號'}
 for t in actual:
  if t['serial']=='未編號':continue
  e=exp[t['id']];assert t['parcels']==[{**v,'lot':'-'.join(str(int(x)) for x in v['lot'].split('-')),'county':'屏東縣'} for v in e['parcels']],(t['id'],t['parcels'],e['parcels']);assert t['resultDate']==e['notice'],(t['id'],t['resultDate'],e['notice']);assert t['items']==e['items'],(t['id'],t['items'],e['items'])
 print('excel parity PASS',flush=True)
 start=time.time();page.locator('#geo-files').set_input_files(str(ZIP));page.wait_for_function('!document.querySelector("#cancel-geo").hidden');page.wait_for_function('document.querySelector("#cancel-geo").hidden',timeout=240000);assert page.evaluate('PSApp.features.length')>100000,page.locator('#message').inner_text();seconds=round(time.time()-start,2);print('geo seconds',seconds,flush=True)
 stats=page.evaluate('''()=>{let m={all:0,partial:0,none:0,ambiguous:0,parcelsMatched:0};let i=PSApp.index;for(let t of PSApp.state.tasks){let groups=t.parcels.map(p=>PSCore.match(p,i));let ok=groups.filter(g=>g.length===1).length;m.parcelsMatched+=ok;let s=groups.some(g=>g.length>1)?'ambiguous':ok===groups.length?'all':ok?'partial':'none';m[s]++}return {features:PSApp.features.length,m,counts:document.querySelector('#progress').textContent}}''');print(json.dumps(stats,ensure_ascii=False),flush=True)
 # Use one current-month task so existing old-task policy remains active.
 task=next(t for t in actual if t['resultDate']>='2026-10-01' and t['parcels']);tid=task['id'];page.evaluate('(id)=>{let t=PSApp.state.tasks.find(t=>t.id===id);t.assignee="p1"}',tid)
 page.locator('#search').fill(task['parcels'][0]['lot']);page.locator('[data-detail]').first.click();page.wait_for_selector('#detail-board');page.screenshot(path=str(ROOT/'evidence/admin-desktop.png'));page.locator('#close-dialog').click()
 # Whiteboard and editable Excel.
 page.evaluate('(id)=>{PSApp.selected.clear();PSApp.selected.add(id)}',tid);page.locator('#search').fill('');page.click('#boards');
 with ctx.expect_page() as pop:page.click('#doc-print')
 board=pop.value;board.wait_for_timeout(400);assert board.locator('.board').count()==1
 fit=board.evaluate('''()=>[...document.querySelectorAll('.main')].every(x=>x.scrollHeight<=x.clientHeight+1&&x.scrollWidth<=x.clientWidth+1)''');assert fit
 board.pdf(path=str(ROOT/'evidence/whiteboard.pdf'),prefer_css_page_size=True,print_background=True);board.close()
 with page.expect_download() as dl:page.click('#doc-xlsx')
 dl.value.save_as(str(ROOT/'evidence/whiteboard.xlsx'));page.click('#close-dialog')
 # Published ZIP validation and worker view.
 page.click('#publish');
 with page.expect_download() as dl:page.click('#confirm-publish')
 pack=Path('/tmp/static-published.zip');dl.value.save_as(str(pack));import zipfile
 with zipfile.ZipFile(pack) as z:
  payloads=[json.loads(z.read('data/worker-'+str(i)+'.json')) for i in range(1,4)];assert len(set(d['batch'] for d in payloads))==1
  assert len(payloads[0]['tasks'])==1 and not payloads[1]['tasks'];assert '統一編號' not in json.dumps(payloads,ensure_ascii=False);assert len(payloads[0]['features'])<20
 for i,d in enumerate(payloads,1):ctx.route('**/data/worker-'+str(i)+'.json',lambda r,request,d=d:r.fulfill(json=d))
 wp=ctx.new_page();wp.clock.set_fixed_time(QA_NOW);wp.on('pageerror',lambda e:errors.append(str(e)));wp.goto(BASE+'worker-1.html');wp.wait_for_function('PSApp.state.tasks.length===1');wp.set_viewport_size({'width':390,'height':844});wp.screenshot(path=str(ROOT/'evidence/worker-mobile.png'));assert wp.evaluate('document.documentElement.scrollWidth<=innerWidth')
 wp.locator('[data-detail]').first.click();wp.click('#detail-camera');wp.wait_for_function('document.querySelector("#video").videoWidth>0');wp.click('#shutter');wp.wait_for_function('document.querySelector("#capture-count").textContent.includes("1 張")',timeout=30000);wp.click('#shutter');wp.wait_for_function('document.querySelector("#capture-count").textContent.includes("2 張")',timeout=30000);wp.screenshot(path=str(ROOT/'evidence/camera-mobile.png'));wp.click('#camera-back');wp.wait_for_selector('[data-photo-download]');assert wp.locator('[data-photo-download]').count()==2
 with wp.expect_download() as dl:wp.locator('[data-photo-download]').first.click()
 dl.value.save_as(str(ROOT/'evidence/watermarked-test.jpg'));wp.reload();wp.wait_for_function('PSApp.state.tasks.length===1');wp.locator('[data-detail]').first.click();wp.wait_for_selector('[data-photo-download]');assert wp.locator('[data-photo-download]').count()==2
 # Failed update keeps previous tasks and shows failure.
 ctx.route('**/data/worker-1.json',lambda r:r.fulfill(status=500,body='failure'));wp.click('#close-dialog');wp.click('#reload-worker');wp.wait_for_function('document.querySelector("#worker-version").textContent.includes("更新失敗")');assert wp.evaluate('PSApp.state.tasks.length')==1
 for width in [360,390,768,1440]:
  page.set_viewport_size({'width':width,'height':900});page.screenshot(path=str(ROOT/'evidence'/f'admin-{width}.png'));assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
 assert not errors,errors
 report={'excel_tasks':len(actual),'excel_parcels':sum(len(t['parcels']) for t in actual),'geo_seconds':seconds,'geographic_results':stats,'published_bytes':pack.stat().st_size,'page_errors':errors,'photo_reload_persistence':True,'widths':[360,390,768,1440]}
 (ROOT/'evidence/browser-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('BROWSER PASS',flush=True);browser.close()
