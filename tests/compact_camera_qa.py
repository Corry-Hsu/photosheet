"""Compare camera space with main and check compact controls on worker/vendor pages."""
from test_config import ROOT, BASE, CHROMIUM, QA_NOW
from playwright.sync_api import sync_playwright
import ast, copy, json, subprocess

# Reuse the synthetic camera API without executing the optics test itself.
tree=ast.parse((ROOT/'tests/camera_optics_qa.py').read_text())
shim=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='shim' for t in n.targets))
fixture=json.loads((ROOT/'tests/fixtures/worker-1.json').read_text())
baseline={suffix:subprocess.check_output(['git','show','2fafde20:field-camera.'+suffix],cwd=ROOT,text=True) for suffix in ['js','css']}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
 errors=[];measurements=[]
 for role in ['baseline','worker','vendor']:
  ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True)
  ctx.add_init_script(shim);ctx.route('https://tile.openstreetmap.org/**',lambda r:r.abort())
  data=copy.deepcopy(fixture)
  if role=='vendor':
   data['person']={'id':'v1','name':'示範廠商'};data['vendorType']='雜草垃圾';data['tasks']=[{**data['tasks'][0],'type':'雜草垃圾'}]
  name='vendor-1' if role=='vendor' else 'worker-1'
  ctx.route('**/data/'+name+'.json',lambda r:r.fulfill(json=data))
  if role=='baseline':
   for suffix in ['js','css']:
    ctx.route('**/field-camera.'+suffix+'*',lambda r,request,s=suffix:r.fulfill(body=baseline[s],content_type='text/javascript' if s=='js' else 'text/css'))
  pg=ctx.new_page();pg.on('pageerror',lambda e:errors.append(str(e)));pg.clock.set_fixed_time(QA_NOW)
  pg.goto(BASE+name+'.html');pg.wait_for_function('PSApp.state.tasks.length>0');pg.locator('.task-content').first.click()
  pg.click('#worker-camera');pg.wait_for_function('!document.querySelector("#shutter").disabled');pg.wait_for_selector('#camera-optics:visible')
  for w,h in [(390,844),(844,390),(320,568)]:
   pg.set_viewport_size({'width':w,'height':h})
   rect=pg.locator('#camera-media').bounding_box();assert rect
   measurements.append({'role':role,'viewport':[w,h],'viewfinder':[round(rect['width']),round(rect['height'])]})
   if role!='baseline':
    assert pg.locator('#camera-zoom-buttons button').all_text_contents()==['0.5×','0.75×','1.0×']
    for button in pg.locator('#camera-zoom-buttons button,#shutter,#camera-back').all():
     box=button.bounding_box();assert box['height']>=44 and box['width']>=44
     assert box['x']>=0 and box['x']+box['width']<=w+1 and box['y']+box['height']<=h+1,box
    assert pg.evaluate('getComputedStyle(document.querySelector("#video")).objectFit')=='contain'
    assert not pg.locator('#camera-lens-menu').evaluate('(e)=>e.open')
    old=next(m for m in measurements if m['role']=='baseline' and m['viewport']==[w,h])
    assert rect['width']*rect['height']>old['viewfinder'][0]*old['viewfinder'][1]*1.04,(old,rect)
    out=ROOT/'evidence/compact-camera';out.mkdir(parents=True,exist_ok=True)
    pg.screenshot(path=str(out/f'{role}-{w}.png'))
  if role!='baseline':
   pg.click('#camera-lens-menu summary');assert pg.locator('#camera-lens').is_visible()
   menu=pg.locator('#camera-lens-row').bounding_box();assert menu['x']>=0 and menu['x']+menu['width']<=320
   pg.click('#camera-lens-menu summary');assert pg.locator('#camera-lens').is_hidden()
   pg.click('#shutter');pg.wait_for_selector('#capture-save:visible')
   assert pg.locator('#camera-lens-menu').is_hidden()
   pg.click('#capture-preview');pg.wait_for_selector('#shutter:visible')
  pg.click('#camera-back');ctx.close()
 assert not errors,errors
 print(json.dumps({'measurements':measurements,'touch_targets_44px':True,'fixed_three_presets':True,'full_frame_contained':True,'errors':errors},ensure_ascii=False,indent=2))
 browser.close()
