"""Safe local conversion: synthetic Lands XML, no actual ownership data in fixtures."""
from pathlib import Path
import importlib.util,unittest,tempfile,json,subprocess,sys,zipfile
SPEC=importlib.util.spec_from_file_location('converter',Path(__file__).resolve().parents[1]/'tools/build_land_area_catalog.py');M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)
def row(lot='00240001',area='7.98',code='0582',name='關帝段'):
 return f'<土地標示部><縣市>屏東縣</縣市><鄉鎮市區>東港鎮</鄉鎮市區><段代碼>{code}</段代碼><段小段>{name}</段小段><地號>{lot}</地號><登記面積>{area}</登記面積><所有權人><統一編號>SECRET-ID-TEST</統一編號><所有權人名稱>SECRET-OWNER-TEST</所有權人名稱><管理者名稱>SECRET-MANAGER-TEST</管理者名稱></所有權人></土地標示部>'
def xml(rows):return '<?xml version="1.0" encoding="UTF-8"?><Lands><國有>'+rows+'</國有></Lands>'
class Conversion(unittest.TestCase):
 def setUp(self):self.temp=tempfile.TemporaryDirectory();self.base=Path(self.temp.name);self.source=self.base/'source';self.source.mkdir();self.output=self.base/'result'
 def tearDown(self):self.temp.cleanup()
 def write(self,text):p=self.source/'t_0582.xml';p.write_text(text,encoding='utf-8');return p
 def test_repeated_owners_and_decimal_format(self):
  p=self.write(xml(row()+row(area='7.980')+row('00240000','1,354.40')));report=M.convert([p],self.output)
  data=json.loads((self.output/'0582.json').read_text());self.assertEqual(report['unique_parcels'],2);self.assertEqual(report['duplicate_rows_collapsed'],1);self.assertEqual(data['parcels'],[{'lot':'24','area':'1354.4','issues':[]},{'lot':'24-1','area':'7.98','issues':[]}]);self.assertEqual(set(data),{'schemaVersion','unit','county','district','section','code','parcels'})
  text=''.join(f.read_text() for f in self.output.glob('*.json'));self.assertNotIn('SECRET',text);self.assertNotIn('所有權人',text);self.assertNotIn('統一編號',text)
 def test_area_conflicts_and_missing_are_explicit(self):
  p=self.write(xml(row()+row(area='8')+row('00240002','')));report=M.convert([p],self.output);self.assertEqual(report['area_issues'],2)
  data=json.loads((self.output/'0582.json').read_text());self.assertEqual([r['area'] for r in data['parcels']],[None,None]);self.assertIn('conflicting-area',data['parcels'][0]['issues']);self.assertIn('invalid-area',data['parcels'][1]['issues'])
 def test_zero_and_invalid_numeric_forms(self):
  self.assertEqual(M.decimal_area('0.00'),'0');self.assertIsNone(M.decimal_area('-1'));self.assertIsNone(M.decimal_area('NaN'));self.assertIsNone(M.decimal_area('1e2'));self.assertIsNone(M.decimal_area('1,23'));self.assertIsNone(M.decimal_area('1.1234567'))
 def test_conflicting_code_names_fail_before_writes(self):
  p=self.write(xml(row()+row(name='不同段')))
  with self.assertRaises(ValueError):M.convert([p],self.output)
  self.assertFalse(self.output.exists())
 def test_entities_and_utf16_entities_rejected(self):
  for enc in ['utf-8','utf-16']:
   p=self.source/'t_0582.xml';p.write_bytes(('<!DOCTYPE Lands [<!ENTITY a SYSTEM "file:///etc/passwd">]>'+xml(row())).encode(enc))
   with self.assertRaises(ValueError):M.convert([p],self.output)
  self.assertFalse(self.output.exists())
 def test_cli_zip_contains_only_whitelisted_json_and_report(self):
  self.write(xml(row()));p=subprocess.run([sys.executable,str(M.__file__),str(self.source),str(self.output)],capture_output=True,text=True);self.assertEqual(p.returncode,0,p.stderr)
  with zipfile.ZipFile(self.output.with_suffix('.zip')) as z:
   self.assertEqual(set(z.namelist()),{'land-area/catalog.json','land-area/0582.json','conversion-report.json'})
   for name in z.namelist():self.assertNotIn('SECRET',z.read(name).decode())
   self.assertFalse(json.loads(z.read('conversion-report.json'))['ownership_fields_included'])
  again=subprocess.run([sys.executable,str(M.__file__),str(self.source),str(self.output)],capture_output=True,text=True);self.assertNotEqual(again.returncode,0)
 def test_manifest_incomplete_input_stops_conversion(self):
  self.write(xml(row()));(self.source/'manifest.csv').write_text('name,schema,description\nt_0582.xml,schema-xml.csv,屏東縣_關帝段\nt_0583.xml,schema-xml.csv,屏東縣_不同段\n',encoding='utf-8-sig')
  p=subprocess.run([sys.executable,str(M.__file__),str(self.source),str(self.output)],capture_output=True,text=True);self.assertNotEqual(p.returncode,0);self.assertIn('missing',p.stderr);self.assertFalse(self.output.exists())
 def test_output_cannot_be_inside_original_folder(self):
  self.write(xml(row()));p=subprocess.run([sys.executable,str(M.__file__),str(self.source),str(self.source/'result')],capture_output=True,text=True);self.assertNotEqual(p.returncode,0);self.assertFalse((self.source/'result').exists())
if __name__=='__main__':unittest.main()
