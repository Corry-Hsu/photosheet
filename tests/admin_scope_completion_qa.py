from test_config import ROOT,BASE,CHROMIUM,QA_NOW
from playwright.sync_api import sync_playwright
import json,copy,zipfile
seed=json.loads((ROOT/'tests/fixtures/worker-1.json').read_text())['tasks'][0]
dates=['2026-10-01','2026-11-01','2026-12-31','2026-10-27','2026-09-30','2025-12-31','2027-01-01','']
tasks=[]
for i,date in enumerate(dates):
 t=copy.deepcopy(seed);t.update(id='scope-'+str(i),serial=str(i),notice=date,resultDate=date,assignee='p1' if i<4 else '',completed=i==3);tasks.append(t)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);c=b.new_context(accept_downloads=True);pg=c.new_page();pg.clock.set_fixed_time(QA_NOW);errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));c.route('https://tile.openstreetmap.org/**',lambda r:r.abort());pg.goto(BASE);pg.wait_for_function('document.querySelector("#person-filter").options.length===5');pg.evaluate('''async tasks=>{const state={...PSApp.state,tasks};await Store.replaceManager(state,{id:'catalogue',features:[],counts:{xml:0,kml:0}})}''',tasks);pg.reload();pg.wait_for_function('PSApp.state.tasks.length===8');pg.wait_for_function('document.querySelectorAll(".task").length===4');assert '4 筆其他' in pg.locator('#task-date-scope').inner_text()
 pg.evaluate("PSApp.selected.add('scope-4')");pg.locator('#search').fill('示例');assert pg.evaluate('PSApp.selected.size')==0;pg.locator('#search').fill('')
 pg.locator('[data-complete="scope-0"]').click();pg.wait_for_function('PSApp.state.tasks[0].completed===true');pg.wait_for_timeout(100);pg.reload();pg.wait_for_function('PSApp.state.tasks.length===8&&PSApp.state.tasks[0].completed===true');assert pg.evaluate('!!PSApp.state.tasks[0].completedAt')
 pg.select_option('#complete-filter','done');assert pg.locator('.task').count()==2;pg.select_option('#complete-filter','open');assert pg.locator('.task').count()==2;pg.select_option('#complete-filter','')
 pg.locator('[data-detail="scope-0"]').click();pg.click('#detail-complete');pg.wait_for_function('PSApp.state.tasks[0].completed===false');pg.click('#close-dialog');pg.click('#select-page');assert pg.locator('[data-check]:checked').count()==4;pg.click('#batch-complete');pg.wait_for_function('PSApp.state.tasks.slice(0,4).every(t=>t.completed)');pg.wait_for_timeout(100)
 # Completion must allow publishing empty lists to remove all finished dispatches.
 pg.click('#publish')
 with pg.expect_download() as dl:pg.click('#confirm-publish')
 dl.value.save_as('/tmp/finished-dispatch.zip')
 with zipfile.ZipFile('/tmp/finished-dispatch.zip') as z:
  counts=[len(json.loads(z.read(f'data/worker-{i}.json'))['tasks']) for i in range(1,4)]
 assert counts==[0,0,0],counts
 pg.click('#batch-assign');pg.select_option('#assign-complete','no');pg.click('#commit-assign');pg.wait_for_function('!document.querySelector("#dialog").open');assert pg.evaluate('PSApp.state.tasks.slice(0,4).every(t=>!t.completed)')
 # A failed write must leave both the screen state and database incomplete.
 pg.evaluate('''()=>{window.savePut=Store.put;Store.put=async function(name,value){if(name==='state')throw Error('測試儲存失敗');return savePut.call(this,name,value)}}''');pg.locator('[data-complete="scope-0"]').click();pg.wait_for_function('document.querySelector("#message").textContent.includes("儲存失敗")');assert pg.evaluate('PSApp.state.tasks[0].completed')==False;pg.evaluate('()=>{Store.put=savePut}')
 # A prior-month task already dispatched to a field worker still remains readable.
 old=copy.deepcopy(tasks[4]);old['assignee']='p2';package={'schemaVersion':1,'batch':'scope-test','generatedAt':'2026-10-27T00:00:00Z','person':{'id':'p2','name':'示例人員'},'settings':{},'tasks':[old],'features':[]};c.route('**/data/worker-2.json',lambda r:r.fulfill(json=package));field=c.new_page();field.clock.set_fixed_time(QA_NOW);field.goto(BASE+'worker-2.html');field.wait_for_function('PSApp.state.tasks.length===1');assert field.locator('.task').count()==1
 assert pg.evaluate('PSApp.state.tasks.length')==8;assert not errors,errors;report={'stored_tasks':8,'visible_current_year_from_current_month':4,'old_future_year_missing_dates_hidden':4,'completed_persists':True,'completion_filter':True,'batch_complete_and_undo':True,'empty_dispatch_after_completion':counts,'failed_write_rollback':True,'old_worker_dispatch_preserved':True,'errors':errors};(ROOT/'evidence/admin-scope-completion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2));b.close()
