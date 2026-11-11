#!/usr/bin/env python3
"""Whitelist Lands XML into static area JSON. Never copies ownership/identity fields."""
import argparse,csv,json,re,sys,zipfile
from pathlib import Path
from decimal import Decimal,InvalidOperation
import xml.etree.ElementTree as ET
from collections import defaultdict

def norm(s):return (s or '').strip().replace('臺','台').replace('巿','市')
def tag(e):return e.tag.split('}')[-1].split(':')[-1]
def decimal_area(s):
 s=norm(s)
 if re.fullmatch(r'\d{1,3}(,\d{3})+(\.\d{1,6})?',s):s=s.replace(',','')
 if not re.fullmatch(r'\d{1,12}(\.\d{1,6})?',s):return None
 n=format(Decimal(s),'f');return n.rstrip('0').rstrip('.') if '.' in n else n

def convert(files,output):
 groups={};input_count=0;rows=0;skipped=0
 for source in sorted(files):
  raw=source.read_bytes()
  if len(raw)>64*1024*1024:raise ValueError('XML exceeds 64MB: '+source.name)
  # Decode before DTD checking, including UTF-16; no external entity processing.
  if raw.startswith((b'\xff\xfe',b'\xfe\xff')):text=raw.decode('utf-16')
  else:
   header=raw[:200].decode('ascii',errors='ignore');m=re.search(r'encoding=["\x27]([^"\x27]+)',header,re.I);enc=m.group(1).lower() if m else 'utf-8-sig'
   if enc not in ['utf-8','utf8','utf-8-sig','big5','cp950']:raise ValueError('Unsupported encoding: '+source.name)
   text=raw.decode(enc)
  if re.search(r'<!DOCTYPE|<!ENTITY',text,re.I):raise ValueError('DTD/entities forbidden: '+source.name)
  root=ET.fromstring(text)
  if tag(root)!='Lands':raise ValueError('Expected Lands XML: '+source.name)
  input_count+=1
  for node in root.iter():
   if tag(node)!='土地標示部':continue
   # Explicitly pick direct land-description fields. Ownership subtrees are ignored.
   allowed={'縣市','鄉鎮市區','段代碼','段小段','地號','登記面積'}
   values={}
   for child in node:
    name=tag(child)
    if name in allowed:
     if name in values:raise ValueError('Duplicate land field: '+source.name)
     values[name]=norm(child.text)
   code=values.get('段代碼','');raw_lot=values.get('地號','')
   county=values.get('縣市','');district=values.get('鄉鎮市區','');section=values.get('段小段','')
   if not re.fullmatch(r'\d{1,4}',code) or not re.fullmatch(r'\d{8}',raw_lot) or not all([county,district,section]):
    skipped+=1;continue
   code=code.zfill(4);main,sub=int(raw_lot[:4]),int(raw_lot[4:]);lot=str(main)+(('-'+str(sub)) if sub else '')
   if code not in groups:groups[code]={'county':county,'district':district,'section':section,'lots':defaultdict(list)}
   group=groups[code]
   if (group['county'],group['district'],group['section'])!=(county,district,section):raise ValueError('Section code has conflicting names; no files written: '+code)
   group['lots'][lot].append(decimal_area(values.get('登記面積','')));rows+=1
 if not groups:raise ValueError('No usable land records; no files written')
 # Fully parse and validate the input before writing any outputs.
 outputs={};sections=[];conflicts=0
 for code,g in sorted(groups.items()):
  parcels=[]
  for lot,areas in sorted(g['lots'].items(),key=lambda kv:tuple(int(x) for x in kv[0].split('-'))):
   valid=set(a for a in areas if a is not None);issues=[]
   if None in areas:issues.append('invalid-area')
   if len(valid)>1:issues.append('conflicting-area')
   if issues:conflicts+=1
   parcels.append({'lot':lot,'area':next(iter(valid)) if len(valid)==1 and not issues else None,'issues':issues})
  meta={'county':g['county'],'district':g['district'],'section':g['section'],'code':code}
  outputs[code+'.json']={'schemaVersion':1,'unit':'㎡',**meta,'parcels':parcels}
  sections.append({**meta,'file':code+'.json','records':len(parcels)})
 outputs['catalog.json']={'schemaVersion':1,'unit':'㎡','sections':sections}
 output.mkdir(parents=True,exist_ok=True)
 for name,obj in outputs.items():(output/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 return {'xml_files':input_count,'land_rows':rows,'sections':len(sections),'unique_parcels':sum(x['records'] for x in sections),'duplicate_rows_collapsed':rows-sum(x['records'] for x in sections),'area_issues':conflicts,'invalid_land_rows_skipped':skipped}

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);args=p.parse_args()
 if args.output.exists() and any(args.output.iterdir()):p.error('Output folder must be empty. Choose a new output folder; original files are never overwritten.')
 if args.output.with_suffix('.zip').exists() or args.output.with_name(args.output.name+'-report.json').exists():p.error('Output archive/report already exists. Choose a new output folder.')
 if args.source.is_dir() and (args.output.resolve()==args.source.resolve() or args.source.resolve() in args.output.resolve().parents):p.error('Output must be outside the original XML folder.')
 files=[args.source] if args.source.is_file() else list(args.source.rglob('*.xml'))+list(args.source.rglob('*.XML'))
 files=list(dict.fromkeys(f.resolve() for f in files))
 if not files:p.error('No XML files found')
 try:
  audit={}
  manifest=args.source/'manifest.csv' if args.source.is_dir() else args.source.parent/'manifest.csv'
  if manifest.exists():
   with manifest.open(encoding='utf-8-sig',newline='') as f:
    reader=csv.DictReader(f)
    if not {'name','schema','description'}.issubset(reader.fieldnames or []):raise ValueError('Unexpected manifest columns')
    names=[r['name'].strip() for r in reader]
   if any(not re.fullmatch(r'[tT]_\d{4}\.xml',name,re.I) for name in names):raise ValueError('Manifest contains an unsupported filename')
   if len({n.lower() for n in names})!=len(names):raise ValueError('Manifest contains duplicate filenames')
   existing={f.name.lower() for f in files};missing=[n for n in names if n.lower() not in existing]
   if missing:raise ValueError('Manifest XML files missing ('+str(len(missing))+'): '+', '.join(missing[:10]))
   audit['manifest_entries']=len(names)
  schema=args.source/'schema-xml.csv' if args.source.is_dir() else args.source.parent/'schema-xml.csv'
  if schema.exists():
   with schema.open(encoding='utf-8-sig',newline='') as f:fields={r.get('name','') for r in csv.DictReader(f)}
   if not {'縣市','鄉鎮市區','段代碼','段小段','地號','登記面積'}.issubset(fields):raise ValueError('Required land fields missing from schema CSV')
   audit['schema_checked']=True
  report={**convert(files,args.output),**audit}
  report.update({'unit':'㎡','unit_basis':'Taiwan registered land area convention; source XML has no separate unit tag','output_fields':['county','district','section','code','lot','area','issues'],'raw_xml_included':False,'ownership_fields_included':False})
  report_name=args.output.with_name(args.output.name+'-report.json');report_name.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  catalog=json.loads((args.output/'catalog.json').read_text(encoding='utf-8'))
  archive=args.output.with_suffix('.zip')
  if archive.exists():raise ValueError('Archive already exists; choose a new output folder')
  with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
   z.write(args.output/'catalog.json','land-area/catalog.json')
   for entry in catalog['sections']:z.write(args.output/entry['file'],'land-area/'+entry['file'])
   z.write(report_name,'conversion-report.json')
  print(json.dumps(report,ensure_ascii=False,indent=2));print('OUTPUT ZIP: '+str(archive.resolve()))
 except (ValueError,ET.ParseError,UnicodeError,OSError) as e:sys.exit(str(e))
if __name__=='__main__':main()
