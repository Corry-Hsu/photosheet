"""Monthly totals use all local cases, and refresh after real manager edits."""
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
from test_config import BASE, CHROMIUM

def task(ident, kind, date, lots):
    return dict(id=ident, type=kind, serial='同案號', caseNo='', row=1,
                district='東港鎮', section='測試段', sectionCode='0582',
                parcels=[dict(county='屏東縣', district='東港鎮', section='測試段', lot=str(i+1)) for i in range(lots)],
                items=[], resultDate=date, due='', assignee='p2')

tasks = [task('manual:current','雜草垃圾','2026-11-01',2),
         task('tree','砍樹','2026-11-30',2), task('fence','圍籬','2026-11-15',1)]
tasks[0]['source'] = 'manual'
tasks[1]['completed'] = True
for kind, count, parcels in [('雜草垃圾',58,130),('砍樹',12,20),('圍籬',2,3)]:
    for i in range(count):
        t = task(f'{kind}:{i}', kind, '2026-10-01' if i%2 else '2026-10-31',
                 parcels-count+1 if i==0 else 1)
        t['completed'] = i%2==0
        tasks.append(t)
tasks += [task('future','圍籬','2026-12-01',4),task('old','雜草垃圾','2025-11-01',3),task('missing','砍樹','',2)]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
    ctx = browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
    ctx.route('https://**/*',lambda r:r.abort())
    pg = ctx.new_page()
    errors=[]
    pg.on('pageerror',lambda e:errors.append(str(e)))
    pg.clock.set_fixed_time(datetime(2026,11,20,tzinfo=timezone.utc))
    pg.goto(BASE)
    pg.wait_for_function('window.PSApp && PSApp.map')

    def seed(rows):
        pg.evaluate('''async tasks=>{
          await Store.replaceManager({...PSApp.state,tasks},
            {id:'catalogue',features:[],counts:{xml:0,kml:0}})
        }''',rows)
        pg.reload()
        pg.wait_for_function('window.PSApp && PSApp.map')

    def totals(expected):
        actual=pg.locator('#monthly-stats tbody tr').evaluate_all(
            '(rows)=>rows.map(r=>[...r.cells].map(c=>c.textContent))')
        assert actual==[[kind,f'{cases}件',f'地號{lots}筆'] for kind,cases,lots in expected],actual

    current=[('雜草垃圾',1,2),('砍樹',1,2),('圍籬',1,1),('合計',3,5)]
    seed(tasks)
    assert pg.locator('#statistics-month').input_value()=='2026-11'
    totals(current)
    pg.select_option('#statistics-month','2026-10')
    assert '民國115年10月' in pg.locator('#statistics-month option:checked').inner_text()
    totals([('雜草垃圾',58,130),('砍樹',12,20),('圍籬',2,3),('合計',72,153)])
    pg.locator('#monthly-stats').screenshot(path='/tmp/photosheet-monthly-stats.png')
    before=pg.evaluate('JSON.stringify(PSApp.state)')
    # Search/status/type/pagination are deliberately independent of monthly totals.
    pg.fill('#search','沒有這個案件');pg.select_option('#type-filter','圍籬');pg.select_option('#complete-filter','open')
    totals([('雜草垃圾',58,130),('砍樹',12,20),('圍籬',2,3),('合計',72,153)])
    assert pg.evaluate('JSON.stringify(PSApp.state)')==before
    pg.fill('#search','');pg.select_option('#type-filter','');pg.select_option('#complete-filter','')
    pg.select_option('#statistics-month','2026-11')
    pg.locator('[data-complete="manual:current"]').click()
    pg.wait_for_function('PSApp.state.tasks[0].completed')
    totals(current)
    pg.locator('[data-complete="manual:current"]').click()
    pg.wait_for_function('!PSApp.state.tasks[0].completed')

    # Real add/edit/delete pathways must refresh counts, without reload.
    pg.click('#manual-task')
    pg.select_option('#manual-type','雜草垃圾')
    row=pg.locator('[data-manual-parcel]').first
    for field,value in [('district','東港鎮'),('section','測試段'),('sectionCode','0582'),('lots','11、12')]:
        row.locator(f'[data-field="{field}"]').fill(value)
    pg.click('#commit-manual')
    pg.wait_for_function('!document.querySelector("#dialog").open')
    totals([('雜草垃圾',2,4),('砍樹',1,2),('圍籬',1,1),('合計',4,7)])
    added=pg.evaluate('PSApp.state.tasks.at(-1).id')
    pg.locator(f'[data-detail="{added}"]').click();pg.click('#edit-parcels');pg.click('#add-parcel')
    pg.locator('[data-parcel-edit]').last.locator('[data-field=lot]').fill('13')
    pg.click('#save-parcels');pg.wait_for_selector('#edit-parcels')
    totals([('雜草垃圾',2,5),('砍樹',1,2),('圍籬',1,1),('合計',4,8)])
    pg.click('#close-dialog')
    pg.evaluate('()=>{window.originalPut=Store.put;Store.put=async()=>{throw Error("stats-test-quota")}}')
    pg.once('dialog',lambda d:d.accept());pg.locator(f'[data-delete-task="{added}"]').click()
    pg.wait_for_function('document.querySelector("#message").textContent.includes("stats-test-quota")')
    totals([('雜草垃圾',2,5),('砍樹',1,2),('圍籬',1,1),('合計',4,8)])
    pg.evaluate('()=>{Store.put=originalPut}')
    pg.once('dialog',lambda d:d.accept());pg.locator(f'[data-delete-task="{added}"]').click()
    pg.wait_for_selector(f'[data-id="{added}"]',state='detached');totals(current)
    # Moving a result date changes its statistical month immediately.
    pg.check('[data-check="manual:current"]');pg.click('#batch-assign')
    pg.fill('#assign-date','2026-12-01');pg.click('#commit-assign')
    pg.wait_for_function('!document.querySelector("#dialog").open')
    totals([('雜草垃圾',0,0),('砍樹',1,2),('圍籬',1,1),('合計',2,3)])
    pg.click('#batch-assign');pg.fill('#assign-date','2026-11-01');pg.click('#commit-assign')
    pg.wait_for_function('!document.querySelector("#dialog").open');totals(current)
    pg.reload();pg.wait_for_function('window.PSApp && PSApp.map');totals(current)
    for width in [320,390,844,1440]:
        pg.set_viewport_size({'width':width,'height':900})
        assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth'),width

    # Live month boundary and relative "last month" choice; January crosses years.
    pg.clock.set_fixed_time(datetime(2026,12,31,16,0,tzinfo=timezone.utc))
    pg.evaluate('window.dispatchEvent(new Event("focus"))')
    assert pg.locator('#statistics-month').input_value()=='2027-01'
    totals([('雜草垃圾',0,0),('砍樹',0,0),('圍籬',0,0),('合計',0,0)])
    pg.select_option('#statistics-month','2026-12')
    totals([('雜草垃圾',0,0),('砍樹',0,0),('圍籬',1,4),('合計',1,4)])
    pg.clock.set_fixed_time(datetime(2027,1,31,16,0,tzinfo=timezone.utc))
    pg.evaluate('window.dispatchEvent(new Event("focus"))')
    assert pg.locator('#statistics-month').input_value()=='2027-01'

    # Field entry does not load or show manager totals.
    pack=dict(schemaVersion=1,batch='stats-test',person=dict(id='p2',name='示例'),settings={},tasks=[tasks[0]],features=[])
    ctx.route('**/data/worker-2.json*',lambda r:r.fulfill(json=pack))
    pg.goto(BASE+'worker-2.html');pg.wait_for_function('window.PSApp && PSApp.state.tasks.length===1')
    assert pg.locator('#monthly-stats').count()==0
    assert pg.evaluate('typeof window.AdminMonthlyStats')=='undefined'
    assert not errors,errors
    browser.close()
    print('PASS: 72 cases/153 parcels example, current/last month, hidden/completed cases, filter independence, add/edit/delete/rollback, reload, zero month, Taiwan year rollover, 320–1440px, worker isolation')
