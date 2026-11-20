"""Diagnostic only: compare native mocked GPS with and without a fixed Date.

No physical GPS is used. A timeout is an observation, not a required outcome
across Chromium versions. This does not replace camera or device acceptance.
"""
import json
from playwright.sync_api import sync_playwright
from test_config import BASE, CHROMIUM, QA_NOW

PROBE = """async () => {
 const locate = maximumAge => new Promise(resolve =>
  navigator.geolocation.getCurrentPosition(
   p => resolve({ok:true, age:Date.now()-p.timestamp,
    latitude:p.coords.latitude, longitude:p.coords.longitude}),
   e => resolve({ok:false, code:e.code, message:e.message}),
   {maximumAge, timeout:1500, enableHighAccuracy:true}));
 return {cached:await locate(Infinity), fresh:await locate(5000)};
}"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM, args=['--no-sandbox'])
    results = {'browser':browser.version}
    for fixed in [False, True]:
        context = browser.new_context(permissions=['geolocation'], geolocation={
            'latitude':22.44, 'longitude':120.44, 'accuracy':5})
        # Same origin as a vendor page, without app/map/camera side effects.
        context.route('**/gps-clock-probe', lambda r:r.fulfill(body='<html></html>', content_type='text/html'))
        page = context.new_page()
        if fixed:
            page.clock.set_fixed_time(QA_NOW)
        page.goto(BASE+'gps-clock-probe')
        result = page.evaluate(PROBE)
        # CDP supplies a position once; test again beyond maximumAge (5s).
        page.wait_for_timeout(5100)
        result['after_5s'] = page.evaluate(PROBE)
        if not fixed:
            assert result['fresh']['ok'] and result['fresh']['latitude'] == 22.44, result
        results['fixed_date' if fixed else 'native_date'] = result
        context.close()
    print(json.dumps(results, indent=2))
    browser.close()
