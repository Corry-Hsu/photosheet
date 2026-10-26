from test_config import ROOT, BASE, ZIP, EXCEL, CHROMIUM, QA_NOW
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,platform
book=EXCEL;out=ROOT/'evidence'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);c=b.new_context();pg=c.new_page();pg.clock.set_fixed_time(QA_NOW);pg.route('https://tile.openstreetmap.org/**',lambda r:r.abort());pg.goto(BASE);pg.wait_for_function('PSApp && document.querySelector("#person-filter").options.length===5');pg.locator('#excel-file').set_input_files(str(book));pg.wait_for_selector('#commit-import');pg.click('#commit-import');pg.wait_for_function('PSApp.state.tasks.length===847');pg.wait_for_function('!document.querySelector("#dialog").open')
 pg.route('**/qa-excel-fixture.xlsx',lambda route:route.fulfill(body=book.read_bytes(),content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
 times=pg.evaluate("""async()=>{let raw=await fetch('qa-excel-fixture.xlsx').then(r=>r.arrayBuffer()),parse=[];for(let i=0;i<5;i++){let start=performance.now(),parsed=await readExcel(raw);if(parsed.tasks.length!==847)throw Error('count');parse.push(performance.now()-start)}return parse}""");assert max(times)<=10000
 search=[]
 for q in ['香揚','752','圍籬','新南','']:
  start=pg.evaluate('performance.now()');pg.locator('#search').fill(q);pg.wait_for_timeout(1);search.append(pg.evaluate('performance.now()')-start)
 assert max(search)<=500
 d={'environment':{'browser':b.version,'platform':platform.platform(),'processor':platform.processor(),'viewport':'1280x720','headless':True},'excel_parse_ms_5_runs':times,'search_ms_5_runs':search};(out/'performance-results.json').write_text(json.dumps(d,ensure_ascii=False,indent=2));print(json.dumps(d,ensure_ascii=False,indent=2));b.close()
