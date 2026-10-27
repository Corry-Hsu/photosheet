"""Mobile field regression: dense list, reliable board files, landscape watermark."""
from test_config import ROOT, BASE, CHROMIUM, QA_NOW
from playwright.sync_api import sync_playwright
from pathlib import Path
from PIL import Image
import json,copy,fitz,os,sys
out=ROOT/'evidence/mobile-v2';out.mkdir(parents=True,exist_ok=True)
fixture=json.loads((ROOT/'tests/fixtures/worker-1.json').read_text());fixture['tasks']=[]
seed=json.loads((ROOT/'tests/fixtures/worker-1.json').read_text())['tasks'][0]
for i in range(20):
 t=copy.deepcopy(seed);t['id']='mobile-demo-'+str(i);t['serial']=str(i+1);t['parcels']=t['parcels'][:2];t['parcels'][0]['lot']=str(100+i);t['parcels'][1]['lot']=str(200+i);t['due']='2026-10-30T17:00';fixture['tasks'].append(t)
fixture['tasks'][0]['parcels']=copy.deepcopy(seed['parcels']) # twelve-lot stress board
engine=os.getenv('PS_TEST_ENGINE','chromium');results={'engine':engine};errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']) if engine=='chromium' else p.webkit.launch()
 ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,device_scale_factor=1,timezone_id='Asia/Taipei',accept_downloads=True,permissions=['geolocation'],geolocation={'latitude':22.628,'longitude':120.291,'accuracy':8})
 if engine=='chromium':ctx.grant_permissions(['camera','geolocation'])
 ctx.route('https://tile.openstreetmap.org/**',lambda r:r.abort());ctx.route('**/data/worker-1.json',lambda r:r.fulfill(json=fixture))
 pg=ctx.new_page();pg.clock.set_fixed_time(QA_NOW);pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(BASE+'worker-1.html');pg.wait_for_function('PSApp.state.tasks.length===20');pg.wait_for_function('document.querySelectorAll(".task").length===20')
 dimensions=pg.evaluate('''()=>{let rows=[...document.querySelectorAll('.task')].map(x=>x.getBoundingClientRect());return {firstTop:rows[0].top,fullVisible:rows.filter(r=>r.bottom<=innerHeight&&r.top>=0).length,rowHeight:rows[1].height,notesTop:document.querySelector('#worker-tools').getBoundingClientRect().top,listBottom:document.querySelector('.layout').getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth}}''');assert dimensions['firstTop']<=230,dimensions;assert dimensions['fullVisible']>=6,dimensions;assert dimensions['rowHeight']<=100,dimensions;assert dimensions['notesTop']>=dimensions['listBottom'],dimensions;assert not dimensions['overflow'];results['390px_list']=dimensions;pg.screenshot(path=str(out/f'{engine}-worker-list.png'))
 pg.click('#worker-filter-toggle');assert pg.locator('#type-filter').is_visible();pg.select_option('#type-filter','砍樹');pg.click('#worker-filter-toggle');assert not pg.locator('#type-filter').is_visible()
 pg.click('#worker-select-toggle');pg.click('#select-page');assert pg.locator('[data-check]:checked').count()==20;pg.click('#worker-select-toggle');assert pg.locator('[data-check]:checked').count()==0
 # A task opens by tapping its content, not only a small action button.
 pg.locator('.task-content').first.click();pg.wait_for_selector('#detail-board');pg.click('#detail-board');pg.click('#doc-print');pg.wait_for_selector('.doc-pdf-download',timeout=60000);assert pg.locator('.board-preview img').count()==1
 pg.wait_for_function('document.querySelector(".board-preview img").naturalWidth===2400');assert pg.evaluate('document.querySelector(".board-preview img").naturalWidth')==2400;assert ctx.pages==[pg], 'Generating a board must not open an empty tab'
 with pg.expect_download() as dl:pg.click('.doc-pdf-download')
 pdf=out/f'{engine}-whiteboard.pdf';dl.value.save_as(str(pdf));doc=fitz.open(pdf);assert len(doc)==1;pix=doc[0].get_pixmap();im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples);nonwhite=sum(1 for v in im.convert('L').get_flattened_data() if v<100);assert nonwhite>12000,nonwhite
 with pg.expect_download() as dl:pg.click('.doc-image-download')
 png=out/f'{engine}-whiteboard.png';dl.value.save_as(str(png));im=Image.open(png);assert im.size==(2400,1697);assert im.convert('L').getextrema()[0]<20
 results['board']={'pdf_pages':len(doc),'dark_pdf_pixels':nonwhite,'png_size':list(im.size),'blank_popup_created':False}
 pg.screenshot(path=str(out/f'{engine}-board-preview.png'))
 # Repeated exports and batch exports must remain valid in the same dialog.
 pg.click('#doc-print');pg.wait_for_selector('.doc-image-download');pg.click('#close-dialog');pg.click('#worker-select-toggle');pg.locator('[data-check]').nth(0).check();pg.locator('[data-check]').nth(1).check();pg.click('#boards');pg.click('#doc-print');pg.wait_for_function('document.querySelectorAll(".doc-image-download").length===2',timeout=60000)
 with pg.expect_download() as dl:pg.click('.doc-pdf-download')
 batch=out/f'{engine}-batch.pdf';dl.value.save_as(str(batch));assert len(fitz.open(batch))==2;pg.click('#close-dialog');pg.click('#worker-select-toggle')
 for width,height in [(360,640),(390,844),(844,390)]:
  pg.set_viewport_size({'width':width,'height':height});assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,height)
 pg.set_viewport_size({'width':390,'height':844})
 if engine=='chromium':
  pg.locator('.task-content').first.click();pg.click('#detail-camera');pg.wait_for_function('document.querySelector("#video").videoWidth>0');frame=pg.locator('#video').bounding_box();assert abs(frame['width']/frame['height']-4/3)<.01
  pg.click('#shutter');pg.wait_for_function('document.querySelector("#capture-count").textContent.startsWith("本機照片 1 張")',timeout=30000);pg.click('#camera-back');pg.wait_for_selector('[data-photo-download]')
  with pg.expect_download() as dl:pg.locator('[data-photo-download]').first.click()
  dl.value.save_as(str(out/'landscape-web-photo.jpg'));im=Image.open(out/'landscape-web-photo.jpg');assert abs(im.width/im.height-4/3)<.005
  pg.click('#detail-camera');pg.wait_for_selector('#native-file',state='attached');pg.evaluate('''()=>{window.stampedText=[];let fill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...a){stampedText.push({text,shadowColor:this.shadowColor,shadowBlur:this.shadowBlur});return fill.call(this,text,...a)}}''')
  src=Image.new('RGB',(400,800),(80,150,90));exif=Image.Exif();exif[34665]={36867:'2026:10:25 13:04:05'};src.save('/tmp/mobile-portrait.jpg',exif=exif);pg.locator('#native-file').set_input_files('/tmp/mobile-portrait.jpg');pg.wait_for_function('document.querySelector("#capture-count").textContent.startsWith("本機照片 2 張")',timeout=30000)
  stamp=pg.evaluate('stampedText');assert stamp[0]['text']=='115年10月26日 13:04:05',stamp;assert stamp[0]['shadowBlur']>0 and stamp[0]['shadowColor']!='rgba(0, 0, 0, 0)'
  pg.click('#camera-back');pg.wait_for_selector('[data-photo-download]')
  nativeId=pg.evaluate("Store.photosFor('p1',PSApp.state.tasks[0].id).then(rows=>rows.find(r=>r.timeSource==='EXIF-Taiwan').id)")
  with pg.expect_download() as dl:pg.locator('[data-photo-download=\"'+nativeId+'\"]').click()
  dl.value.save_as(str(out/'landscape-native-photo.jpg'));photo=Image.open(out/'landscape-native-photo.jpg');assert photo.size==(400,300);corner=photo.getpixel((0,299));assert max(abs(a-b) for a,b in zip(corner,(80,150,90)))<8,corner
  results['photo']={'portrait_source':[400,800],'landscape_result':list(photo.size),'transparent_corner':list(corner),'stamp':stamp}
 assert not errors,errors;results['page_errors']=errors;(out/f'{engine}-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False,indent=2));browser.close()
