from test_config import ROOT,BASE,CHROMIUM,QA_NOW
from playwright.sync_api import sync_playwright
from pathlib import Path
from openpyxl import Workbook
import json,copy,datetime,os
seed=json.loads((ROOT/'tests/fixtures/worker-1.json').read_text())['tasks'][0]
towns=['屏東市','九如鄉','里港鄉','高樹鄉','鹽埔鄉','長治鄉','麟洛鄉','內埔鄉','三地門鄉','霧台鄉','瑪家鄉','東港鎮','恆春鎮']
book=Workbook();sheet=book.active;sheet.title='雜草垃圾';sheet.append(['header']*32)
for i,town in enumerate(towns):
 row=[None]*32;row[0]=i+1;row[1]='DEMO-'+str(i);row[3]=town;row[7]=datetime.datetime(2026,10,27);row[8]=datetime.datetime(2026,10,30);row[10]='示例段';row[11]='1';row[12]='2';sheet.append(row)
book.save('/tmp/auto-dispatch-fixture.xlsx')
engine=os.getenv('PS_TEST_ENGINE','chromium')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']) if engine=='chromium' else p.webkit.launch();c=b.new_context(accept_downloads=True,viewport={'width':390,'height':844});c.route('https://tile.openstreetmap.org/**',lambda r:r.abort());pg=c.new_page();pg.clock.set_fixed_time(QA_NOW);errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE);pg.wait_for_function('document.querySelector("#person-filter").options.length===5')
 pg.locator('#excel-file').set_input_files('/tmp/auto-dispatch-fixture.xlsx');pg.wait_for_selector('#commit-import');assert '地號' not in pg.locator('#dialog-body>p').first.inner_text();pg.click('#commit-import');pg.wait_for_function('PSApp.state.tasks.length===13&&!document.querySelector("#dialog").open');assert pg.evaluate('PSApp.state.tasks.map(t=>t.assignee)')==['p1']*11+['p2']*2;assert '地號' not in pg.locator('#summary').inner_text()
 tasks=[]
 for i,patch in enumerate([{'district':'屏東市','assignee':'p2'},{'district':'東港鎮','assignee':'p1'},{'district':'屏東市','assignee':'p3'},{'district':'東港鎮','assignee':'p3'},{'district':'屏東市','assignee':'p2','completed':True},{'district':'屏東市','assignee':'p2','resultDate':'2026-09-30'},{'district':'東港鎮','assignee':'p1','assignmentClosed':True},{'district':'屏東市','assignee':'p2','resultDate':'2027-01-01'},{'district':'','assignee':'','parcels':[{'district':'','section':'示例段','lot':'2'}]}]):
  t=copy.deepcopy(seed);t.update(id='auto-'+str(i),assignee='',resultDate='2026-10-27',due='2026-10-30T17:00',**{k:v for k,v in patch.items() if k not in ['assignee','resultDate']});t.update({k:v for k,v in patch.items() if k in ['assignee','resultDate']});tasks.append(t)
 pg.evaluate("async tasks=>{await Store.put('state',{...PSApp.state,tasks})}",tasks);pg.reload();pg.wait_for_function('PSApp.state.tasks.length===9');pg.click('#auto-assign');assert '更新 2 筆' in pg.locator('#dialog-body').inner_text();pg.click('#confirm-auto-assign');pg.wait_for_function('!document.querySelector("#dialog").open');expected=['p1','p2','p3','p3','p2','p2','p1','p2',''];assert pg.evaluate('PSApp.state.tasks.map(t=>t.assignee)')==expected;pg.reload();pg.wait_for_function('PSApp.state.tasks.length===9');assert pg.evaluate('PSApp.state.tasks.map(t=>t.assignee)')==expected
 # Manual assignment to person 3 survives subsequent automatic assignment.
 pg.locator('[data-detail="auto-0"]').click();pg.click('#detail-edit');pg.select_option('#assign-person','p3');pg.click('#commit-assign');pg.wait_for_function('!document.querySelector("#dialog").open');pg.click('#auto-assign');pg.click('#confirm-auto-assign');pg.wait_for_function('!document.querySelector("#dialog").open');assert pg.evaluate('PSApp.state.tasks[0].assignee')=='p3'
 # A failed persistence operation restores the original in-memory and saved owner.
 pg.evaluate("()=>{PSApp.state.tasks[1].assignee='p1';window.originalPut=Store.put;Store.put=async()=>{throw Error('測試儲存失敗')}}");pg.click('#auto-assign');pg.click('#confirm-auto-assign');pg.wait_for_function('document.querySelector("#message").textContent.includes("測試儲存失敗")');assert pg.evaluate('PSApp.state.tasks[1].assignee')=='p1';pg.evaluate('()=>{Store.put=originalPut}');pg.click('#close-dialog')
 # Only selected people produce JSON links, even if another person's task is invalid.
 pg.evaluate("()=>{PSApp.state.tasks[0].resultDate=''}");pg.click('#publish');pg.locator('[data-publish-person="p1"]').uncheck();pg.locator('[data-publish-person="p3"]').uncheck();pg.locator('[data-publish-person="p2"]').uncheck();pg.click('#confirm-publish');assert '至少勾選' in pg.locator('#message').inner_text();pg.locator('[data-publish-person="p2"]').check();pg.click('#confirm-publish');assert pg.locator('.dispatch-download').count()==1
 with pg.expect_download() as dl:pg.locator('.dispatch-download').click()
 assert dl.value.suggested_filename=='worker-2.json';dl.value.save_as('/tmp/auto-person2.json');d=json.loads(Path('/tmp/auto-person2.json').read_text());assert d['person']['id']=='p2' and all(t['assignee']=='p2' and not t.get('completed') for t in d['tasks']);assert len(d['tasks'])==2
 assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors
 report={'engine':engine,'import_auto_assign_11_self_2_other':True,'existing_tasks_update':True,'manual_person3_preserved':True,'old_completed_locked_preserved':True,'storage_failure_rollback':True,'selected_person_json_only':True,'unselected_invalid_tasks_do_not_block':True,'mobile_no_overflow':True,'parcel_counts_hidden':True,'errors':errors};(ROOT/'evidence'/f'auto-dispatch-{engine}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2));b.close()
