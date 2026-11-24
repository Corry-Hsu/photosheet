"""Manager selection overview: actual Leaflet geometries, navigation and IDB safety."""
import copy
import json
from datetime import datetime, timezone
from io import BytesIO
from PIL import Image
from playwright.sync_api import sync_playwright
from test_config import BASE, CHROMIUM

def parcel(lot):
    return dict(county='屏東縣',district='東港鎮',section='示例段',sectionCode='0582',lot=str(lot))

def feature(lot,x,y,ident=None):
    ring=[[x,y],[x+.01,y],[x+.01,y+.01],[x,y+.01],[x,y]]
    return dict(id=ident or f'f{lot}',code='0582',lot=str(lot),lands=[parcel(lot)],
                polygons=[[ring]],bbox=[x,y,x+.01,y+.01])

features=[feature(1,120.4,22.4),feature(2,120.5,22.5),feature(3,120.6,22.6),
          feature(4,120.7,22.7,'ambiguous-a'),feature(4,120.71,22.71,'ambiguous-b'),
          feature(6,120.9,22.9),feature(9,121,23)]
features[0]['polygons'][0].append([[120.402,22.402],[120.402,22.404],[120.404,22.404],[120.404,22.402],[120.402,22.402]])
features[0]['polygons'].append([[[120.412,22.4],[120.414,22.4],[120.414,22.402],[120.412,22.4]]])
features[0]['bbox'][2]=120.414
tasks=[]
for i in range(26):
    lots={0:[1,2],1:[2,3],2:[4,5],3:[7],25:[6]}.get(i,[1])
    tasks.append(dict(id=f'task-{i:02}',type=['雜草垃圾','砍樹','圍籬'][i%3],serial=str(i),
                      district='東港鎮',section='示例段',sectionCode='0582',parcels=[parcel(n) for n in lots],
                      items=[],resultDate='2026-11-24',due='',assignee='p2',
                      navigation=dict(point=[120.45+i*.001,22.45],source='manual',confirmed=True)))
tasks[0]['source']='manual'
png=BytesIO();Image.new('RGB',(256,256),'#d8e4d9').save(png,format='PNG')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
    ctx=browser.new_context(viewport=dict(width=1440,height=960))
    ctx.route('https://**/*',lambda r:r.fulfill(content_type='image/png',body=png.getvalue()))
    pg=ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
    pg.clock.set_fixed_time(datetime(2026,11,24,tzinfo=timezone.utc))
    pg.goto(BASE);pg.wait_for_function('window.PSApp && PSApp.map')
    pg.evaluate('''async o=>{
      await Store.replaceManager({...PSApp.state,tasks:o.tasks},{id:'catalogue',features:o.features,counts:{kml:7,xml:0}});
      await Store.put('photos',{id:'keep-photo',person:'manager',taskId:'task-00',blob:new Blob(['keep'],{type:'image/jpeg'})});
    }''',dict(tasks=tasks,features=features))
    pg.reload();pg.wait_for_selector('[data-check="task-00"]')
    before=pg.evaluate('JSON.stringify(PSApp.state)')

    def shapes():
        return pg.evaluate('''()=>{const out=[];PSApp.map.eachLayer(l=>{
          if(l instanceof L.Path && l.feature)out.push(l.feature.properties.id);
        });return out.sort()}''')

    def choose(ident):pg.check(f'[data-check="{ident}"]')
    choose('task-00');assert shapes()==['f1','f2']
    pg.click('#pin-mode');assert 'active' in pg.locator('#pin-mode').get_attribute('class')
    choose('task-01');assert shapes()==['f1','f2','f3']
    assert pg.locator('#pin-mode').is_disabled()
    assert pg.evaluate('()=>{let n=0;PSApp.map.eachLayer(l=>{if(l instanceof L.Marker)n++});return n}')==0
    # Shared geometry is one layer; preserve the hole and second polygon.
    actual=pg.evaluate('''()=>{let found;PSApp.map.eachLayer(l=>{if(l.feature?.properties.id==='f1')found=l.feature.geometry.coordinates});return found}''')
    assert actual==features[0]['polygons']
    assert pg.evaluate('()=>{let ok=true;PSApp.map.eachLayer(l=>{if(l instanceof L.Path)ok&&=l.options.color==="#ff0000"&&l.options.fillColor==="#ff9800"&&l.options.fillOpacity===.25});return ok}')
    assert pg.evaluate('PSApp.map.getBounds().contains([22.4,120.4]) && PSApp.map.getBounds().contains([22.61,120.61])')
    pg.locator('[data-id="task-02"] h3').click();assert shapes()==['f1','f2','f3']
    pg.evaluate('PSApp.map.fire("click",{latlng:L.latLng(23,121)})')
    assert pg.evaluate('JSON.stringify(PSApp.state)')==before
    choose('task-02');assert shapes()==['f1','f2','f3']
    assert '缺少唯一範圍' in pg.locator('#map-status').inner_text()
    pg.click('#next');choose('task-25');assert shapes()==['f1','f2','f3','f6']
    pg.click('#batch-map');assert pg.locator('#fit-map').inner_text()=='縮放至選取任務'
    assert pg.evaluate('PSApp.map.getBounds().contains([22.91,120.91])')
    pg.fill('#search','no-match');assert pg.locator('.task').count()==0
    assert shapes()==['f1','f2','f3','f6']
    pg.fill('#search','');pg.click('#clear-select')
    pg.locator('[data-id="task-00"] h3').click();assert shapes()==['f1','f2']
    assert not pg.locator('#pin-mode').is_disabled()
    assert pg.evaluate('JSON.stringify(PSApp.state)')==before
    pg.click('#select-page');assert shapes()==['f1','f2','f3']
    assert pg.evaluate('PSApp.selected.size')==25
    pg.click('#next');pg.click('#select-page');assert shapes()==['f1','f2','f3','f6']
    assert pg.evaluate('PSApp.selected.size')==26
    pg.click('#clear-select');pg.click('#prev')
    choose('task-02');choose('task-03');assert shapes()==[]
    assert '無可顯示' in pg.locator('#map-status').inner_text()
    assert pg.evaluate('()=>{let n=0;PSApp.map.eachLayer(l=>{if(l instanceof L.Marker)n++});return n}')==0
    pg.click('#clear-select');choose('task-00');choose('task-01')
    for width in [320,390,844,1440]:
        pg.set_viewport_size(dict(width=width,height=960))
        if width<=980:pg.click('button[data-tab="list"]')
        pg.click('#batch-map')
        assert pg.locator('#map').is_visible()
        assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert pg.evaluate('PSApp.map.getBounds().contains([22.4,120.4]) && PSApp.map.getBounds().contains([22.61,120.61])')
        assert shapes()==['f1','f2','f3']
        pg.click('#fit-map');assert shapes()==['f1','f2','f3']
    pg.locator('.map-panel').screenshot(path='/tmp/selected-task-map-overview.png')
    # A deleted selected case disappears, while shared geo and local photos remain.
    pg.once('dialog',lambda d:d.accept());pg.locator('[data-delete-task="task-00"]').click()
    pg.wait_for_function('!PSApp.state.tasks.some(t=>t.id==="task-00")')
    assert shapes()==['f2','f3'] and pg.evaluate('PSApp.selected.size')==1
    assert pg.evaluate('async()=>!!(await Store.get("photos","keep-photo"))')
    assert pg.evaluate('PSApp.features.length')==7
    pg.reload();pg.wait_for_function('window.PSApp && PSApp.map')
    assert pg.evaluate('PSApp.selected.size')==0

    # Field pages keep their existing single-task map even with multiple checked rows.
    pack=dict(schemaVersion=1,batch='selection-test',person=dict(id='p2',name='示例'),settings={},tasks=tasks[:2],features=features[:3])
    ctx.route('**/data/worker-2.json*',lambda r:r.fulfill(json=pack))
    pg.goto(BASE+'worker-2.html');pg.wait_for_function('PSApp.state.tasks.length===2')
    pg.locator('.task-content').first.click();pg.click('#worker-select-toggle')
    pg.check('[data-check="task-00"]');pg.check('[data-check="task-01"]')
    assert shapes()==['f2','f3']
    assert pg.locator('#batch-map').count()==0
    assert not errors,errors
    browser.close()
    print(json.dumps(dict(result='PASS',multi_parcel_shared_dedup=True,holes_multipolygons=True,
                         cross_page_and_filter_selection=True,missing_ambiguous_no_guess=True,
                         fit_bounds_and_mobile=True,navigation_protected=True,delete_cleanup_photos_retained=True,
                         field_single_task_preserved=True,page_errors=errors)))
