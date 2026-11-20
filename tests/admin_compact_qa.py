"""Measure manager density using synthetic tasks; preserve usable controls."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright
from test_config import BASE, CHROMIUM

baseline = '--baseline' in sys.argv
phase = 'before' if baseline else 'after'
tasks = [dict(id=f'manual:compact-{i}',source='manual',type=['雜草垃圾','砍樹','圍籬'][i%3],
              serial=f'示例-{i}',district='東港鎮',section='示範段',sectionCode='0582',
              parcels=[dict(county='屏東縣',district='東港鎮',section='示範段',lot=str(i*2+j+1)) for j in range(2)],
              items=[],resultDate='2026-11-20',due='2026-11-25T17:00',assignee='p2') for i in range(12)]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
    context=browser.new_context(accept_downloads=True)
    context.route('https://**/*',lambda r:r.abort())
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.clock.set_fixed_time(datetime(2026,11,20,tzinfo=timezone.utc))
    page.goto(BASE);page.wait_for_function('window.PSApp && PSApp.map')
    page.evaluate('async tasks=>{await Store.replaceManager({...PSApp.state,tasks},{id:"catalogue",features:[],counts:{kml:0,xml:0}})}',tasks)
    page.reload();page.wait_for_selector('[data-id="manual:compact-0"]')
    report={}
    for width in [320,390,844,1440]:
        page.set_viewport_size(dict(width=width,height=960))
        page.evaluate('window.scrollTo(0,0)')
        metrics=page.evaluate('''()=>{
          const rect=s=>document.querySelector(s).getBoundingClientRect();
          const controls=[...document.querySelectorAll('#admin-tools button,#statistics-month,.admin-filters select,.admin-filters button')].filter(e=>e.getClientRects().length);
          return {first_task_top:rect('.task').top,task_height:rect('.task').height,
            tools_height:rect('#admin-tools').height,statistics_height:rect('#monthly-stats').height,
            overflow:document.documentElement.scrollWidth>innerWidth,
            min_control_height:Math.min(...controls.map(e=>e.getBoundingClientRect().height)),
            tools_buttons:document.querySelectorAll('#admin-tools > .toolbar button').length,
            same_top:Math.abs(rect('#admin-tools').top-rect('#monthly-stats').top)<2};
        }''')
        report[str(width)]=metrics
        if not baseline:
            assert not metrics['overflow'],(width,metrics)
            assert metrics['min_control_height'] >= (44 if width<=980 else 36)
            assert metrics['tools_buttons']==10
            assert metrics['statistics_height']<260
            if width==1440:
                assert metrics['same_top'] and metrics['first_task_top']<500,metrics
            else:
                assert metrics['first_task_top']<850,metrics
        if width in [390,1440]:
            page.screenshot(path=f'/tmp/admin-compact-{phase}-{width}.png')
    if not baseline:
        assert not page.locator('#admin-tools > p,#monthly-stats > p').count()
        assert page.locator('#summary').inner_text().startswith('12')
        assert page.locator('#monthly-stats tr').last.inner_text().replace('\t',' ').strip()=='合計 12件 地號24筆'
        page.locator('#date-filters summary').click()
        page.fill('#date-from','2026-11-21');assert page.locator('.task').count()==0
        page.fill('#date-from','');page.locator('#date-filters summary').click()
        page.select_option('#complete-filter','open');assert page.locator('.task').count()==12
        page.select_option('#complete-filter','')
        page.locator('.vendor-entrances summary').click();assert page.locator('.vendor-entrances a').count()==3
        page.locator('.vendor-entrances summary').click()
        page.click('#manual-task');assert page.locator('#commit-manual').is_visible();page.click('#close-dialog')
        page.click('#publish');assert '公開' in page.locator('#dialog-body').inner_text();page.click('#close-dialog')
        dialogs=[]
        page.once('dialog',lambda d:(dialogs.append(d.message),d.dismiss()))
        page.locator('[data-delete-task="manual:compact-0"]').click()
        assert dialogs and '整理發布資料' in dialogs[0]
        assert page.evaluate('PSApp.state.tasks.length')==12
        for width in [320,390,844,1440]:
            page.set_viewport_size(dict(width=width,height=960))
            page.locator('#date-filters summary').click()
            assert page.locator('#date-from').is_visible()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.locator('#date-filters summary').click()
            if width<=980:page.click('button[data-tab="map"]')
            assert page.locator('#admin-basemap').is_visible()
            assert page.locator('#pin-mode').is_visible()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            if width<=980:page.click('button[data-tab="list"]')
    assert not errors,errors
    Path(f'/tmp/admin-compact-{phase}.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
    browser.close()
