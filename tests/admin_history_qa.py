"""Restore and reopen selected last-month tasks, preserving dates and unselected cases."""
from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[1]
CHROMIUM=shutil.which("chromium")
from playwright.sync_api import sync_playwright
from datetime import datetime,timezone
import copy,json,os,tempfile
BASE=os.getenv('HISTORY_TEST_URL','http://127.0.0.1:8800/').rstrip('/')+'/'
fixture={'settings':{}}
original={'id':'demo','type':'砍樹','row':2,'serial':'1','caseNo':'DEMO','district':'屏東市','section':'示範段','sectionCode':'','parcels':[],'items':[{'name':'砍樹','quantity':1,'unit':'式','note':''}],'resultDate':'2026-11-06','due':'','assignee':'','vendor':'示範廠商','navigation':{'point':[120.49,22.67],'source':'manual','confirmed':True}}
def task(ident,date,serial):
 t=copy.deepcopy(original);t.update(id=ident,resultDate=date,due='',completed=False,assignee='',caseNo=serial,serial=serial,district='屏東市',section='歷史段',sectionCode='');t['parcels']=[{'county':'屏東縣','district':'屏東市','section':'歷史段','lot':str(100+int(ident.split('-')[-1])) if ident.startswith('history-') else '999'}];return t
history=[task('history-'+str(i),'2026-10-'+str(i+1 if i<25 else 31).zfill(2),'HISTORY-'+str(i).zfill(2)) for i in range(26)]
history[0]['completed']=True;history[1]['assignee']='p1'
state={'id':'manager','schemaVersion':1,'people':[{'id':'p1','name':'我自己'},{'id':'p2','name':'人員二'},{'id':'p3','name':'人員三'}],'tasks':history+[task('current','2026-11-06','CURRENT'),task('older','2026-09-30','OLDER'),task('lastyear','2025-10-05','LASTYEAR'),task('nextyear','2027-01-01','NEXTYEAR'),task('missing','','MISSING')],'sectionReference':[],'settings':fixture.get('settings',{})}
state['tasks'][-1]['completed']=True
def assert_reopened_tasks(actual, baseline):
 assert len(actual)==len(baseline)
 reopened={'history-0','history-1','history-25'}
 changed={'reopenedForDispatch','reopenedAt','completed','completedAt','assignmentClosed','assignmentLockedTo','needsReshoot','workflowNote'}
 for before,after in zip(baseline,actual):
  if before['id'] in reopened:
   assert after['reopenedForDispatch'] is True and after['completed'] is False and after['assignmentClosed'] is False and not after['assignmentLockedTo']
   assert {k:v for k,v in after.items() if k not in changed}=={k:v for k,v in before.items() if k not in changed}
  else:assert after==before
with tempfile.TemporaryDirectory() as tmp,sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,accept_downloads=True)
 for host in ['tile.openstreetmap.org','wmts.nlsc.gov.tw']:ctx.route('https://'+host+'/**',lambda r:r.abort())
 pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.clock.set_fixed_time(datetime(2026,11,5,0,0,tzinfo=timezone.utc))
 if os.getenv('HISTORY_ADMIN_PASSWORD'):
  assert pg.request.post(BASE+'api/login',data={'password':os.environ['HISTORY_ADMIN_PASSWORD']}).ok
 pg.goto(BASE if os.getenv('HISTORY_ADMIN_PASSWORD') else BASE+'index.html');pg.wait_for_function('window.PSApp&&window.AdminHistory&&PSApp.map')
 pg.evaluate('async s=>{await Store.put("state",s)}',state);pg.reload();pg.wait_for_function('PSApp.state.tasks.length===31&&document.querySelectorAll(".task").length===1')
 assert pg.locator('.task').count()==1
 baseline=pg.evaluate('structuredClone(PSApp.state.tasks)');release=pg.evaluate('(PSCore.dispatchTasks ? PSCore.dispatchTasks(PSApp.state.tasks,"v2") : PSApp.state.tasks.filter(t=>!t.completed&&t.type==="砍樹"&&!(t.assignmentClosed&&!t.assignee))).map(t=>t.id)')
 assert pg.evaluate('AdminHistory.period("2027-01-15")')=={'start':'2026-12-01','end':'2027-01-01'}
 assert pg.evaluate('AdminHistory.period("2028-03-01")')=={'start':'2028-02-01','end':'2028-03-01'}
 assert pg.evaluate('AdminHistory.find({...PSApp.state,tasks:[{...PSApp.state.tasks[0],id:"leap",resultDate:"2028-02-29"}]},"","2028-03-01").map(t=>t.id)')==['leap']
 pg.select_option('#type-filter','砍樹');pg.locator('#date-filters summary').click();pg.fill('#date-from','2026-11-01');pg.fill('#date-to','2026-11-30');pg.select_option('#complete-filter','open')
 pg.click('#find-last-month');assert pg.locator('[data-history-restore]').count()==20;assert '26' in pg.locator('#history-count').inner_text();pg.click('#history-next');assert pg.locator('[data-history-restore]').count()==6
 pg.fill('#history-query','屏東市 歷史段 125');assert pg.locator('[data-history-restore]').count()==1;assert pg.locator('[data-history-restore]').get_attribute('data-history-restore')=='history-25'
 pg.locator('[data-history-restore]').click();pg.wait_for_function('document.querySelector("#history-status").textContent.includes("已將")');assert pg.locator('.task').count()==2;assert pg.locator('#date-from').input_value()=='' and pg.locator('#type-filter').input_value()=='';assert pg.locator('[data-history-restore]').count()==0
 lock=pg.evaluate('()=>{const task=PSApp.state.tasks.find(t=>t.id==="history-25");try{return {assigned:PSCore.assign(task,"p2"),task}}catch(e){return {error:e.message,task}}}')
 assert lock.get('assigned',{}).get('assignee')=='p2',lock
 assert pg.evaluate('PSCore.monthPolicy({...PSApp.state.tasks.find(t=>t.id==="history-25")}).assignmentClosed') is False
 assert pg.evaluate('()=>{try{PSCore.assign(PSApp.state.tasks.find(t=>t.id==="history-2"),"p2");return false}catch(e){return true}}')
 available=pg.evaluate('(PSCore.dispatchTasks ? PSCore.dispatchTasks(PSApp.state.tasks,"v2") : PSApp.state.tasks.filter(t=>!t.completed&&t.type==="砍樹"&&!(t.assignmentClosed&&!t.assignee))).map(t=>t.id)')
 assert 'history-25' in available and set(release)<=set(available)
 pg.fill('#history-query','HISTORY-00');pg.locator('[data-history-restore]').click();pg.wait_for_function('document.querySelector("#history-status").textContent.includes("HISTORY-00")');assert not pg.evaluate('PSApp.state.tasks.find(t=>t.id==="history-0").completed')
 # A failed save must leave the task hidden and permit a retry.
 pg.fill('#history-query','HISTORY-01');pg.evaluate('()=>{window.realStatePut=Store.put;Store.put=async(s,v)=>{if(s==="state")throw Error("test save failure");return realStatePut.call(Store,s,v)}}');pg.locator('[data-history-restore]').click();pg.wait_for_function('document.querySelector("#history-status").textContent.includes("儲存失敗")');assert pg.locator('[data-history-restore]').count()==1;assert not pg.evaluate('PSApp.state.adminRestoredTaskIds.includes("history-1")')
 pg.evaluate('()=>{Store.put=realStatePut}');pg.locator('[data-history-restore]').click();pg.wait_for_function('document.querySelector("#history-status").textContent.includes("HISTORY-01")')
 assert_reopened_tasks(pg.evaluate('PSApp.state.tasks'),baseline)
 pg.fill('#history-query','OLDER');assert pg.locator('[data-history-restore]').count()==0;pg.fill('#history-query','');assert pg.locator('#history-count').inner_text()=='找到 23 筆未顯示的任務'
 for width,height in [(360,640),(390,844),(844,390),(1440,900)]:
  pg.set_viewport_size({'width':width,'height':height});assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
 pg.click('#history-back');assert pg.locator('.task').count()==4
 # The restoration selection belongs to management state, not the task objects.
 assert set(pg.evaluate('PSApp.state.adminRestoredTaskIds'))=={'history-0','history-1','history-25'}
 with pg.expect_download() as dl:pg.click('#backup')
 path=Path(tmp)/'backup.json';dl.value.save_as(str(path));backup=json.loads(path.read_text());assert set(backup['state']['adminRestoredTaskIds'])=={'history-0','history-1','history-25'}
 pg.reload();pg.wait_for_function('PSApp.state.tasks.length===31&&document.querySelectorAll(".task").length===4');assert pg.locator('.task').count()==4;assert_reopened_tasks(pg.evaluate('PSApp.state.tasks'),baseline)
 pg.click('#find-last-month');pg.fill('#history-query','HISTORY-25');assert pg.locator('[data-history-restore]').count()==0
 pg.click('#history-back')
 pg.locator('[data-check="history-25"]').check();pg.click('#batch-assign');pg.select_option('#assign-person','p2');pg.click('#commit-assign');pg.wait_for_function('PSApp.state.tasks.find(t=>t.id==="history-25").assignee==="p2"&&!document.querySelector("#dialog").open')
 assert pg.evaluate('PSApp.state.tasks.find(t=>t.id==="history-25").resultDate')=='2026-10-31'
 pg.click('#publish')
 for box in pg.locator('[data-publish-person]').all():box.uncheck()
 pg.locator('[data-publish-person="p2"]').check();pg.locator('[data-publish-person="v2"]').check()
 if os.getenv('HISTORY_ADMIN_PASSWORD'):
  with pg.expect_request('**/api/publish') as request:pg.click('#confirm-publish')
  pg.wait_for_function('document.querySelector("#message").textContent.includes("發布完成")')
  packages=request.value.post_data_json['packages']
 else:
  pg.click('#confirm-publish');packages=[]
  for recipient in ['worker-2.json','vendor-2.json']:
   with pg.expect_download() as dl:pg.locator('.dispatch-download[download="'+recipient+'"]').click()
   path=Path(tmp)/recipient;dl.value.save_as(str(path));packages.append(json.loads(path.read_text()))
 for package in packages:
  dispatched=next(t for t in package['tasks'] if t['id']=='history-25');assert dispatched['resultDate']=='2026-10-31' and dispatched['reopenedForDispatch'] and not dispatched['completed'] and dispatched['assignee']=='p2'
 if not os.getenv('HISTORY_ADMIN_PASSWORD'):
  worker=ctx.new_page();worker.on('pageerror',lambda e:errors.append(str(e)));worker.goto(BASE+'worker-1.html');worker.wait_for_function('window.PSApp&&PSApp.map');assert worker.locator('#find-last-month').count()==0;assert not worker.evaluate('!!window.AdminHistory')
 assert not errors,errors
 result={'backend':bool(os.getenv('HISTORY_ADMIN_PASSWORD')),'previous_month_only_search_and_pagination':True,'january_and_leap_year_boundaries':True,'restored_task_visible_filters_reset':True,'dates_parcels_and_unselected_tasks_unchanged':True,'selected_tasks_reopened_reassignable_and_publishable':True,'unselected_old_tasks_stay_locked':True,'ui_reassign_and_actual_person_vendor_publish':True,'save_failure_rollback_retry':True,'state_and_backup_persist_after_reload':True,'no_duplicate_restore':True,'responsive':True,'errors':errors};print(json.dumps(result));browser.close()
