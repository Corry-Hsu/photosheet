#!/usr/bin/env python3
"""Build a small metadata index from the public ARDSWC Pingtung WMTS catalogue."""
import argparse,json,urllib.parse,urllib.request,re,math
from pathlib import Path
from datetime import date
import xml.etree.ElementTree as E
SOURCE='https://gis.ardswc.gov.tw/api/ardswc/wmts/Ortho?'+urllib.parse.urlencode({'CountyName':'屏東縣'})
def parse(raw):
 if len(raw)>5*1024*1024 or re.search(br'<!DOCTYPE|<!ENTITY',raw,re.I):raise ValueError('Unsupported WMTS XML')
 root=E.fromstring(raw);ns={'w':'http://www.opengis.net/wmts/1.0','o':'http://www.opengis.net/ows/1.1'};images=[];seen=set()
 matrix=root.find('.//w:Contents/w:TileMatrixSet',ns)
 if matrix is None or matrix.findtext('o:Identifier',namespaces=ns)!='GoogleMapsCompatible' or not matrix.findtext('o:SupportedCRS',namespaces=ns).endswith('3857'):raise ValueError('Unexpected tile matrix')
 for layer in root.findall('.//w:Layer',ns):
  title=layer.findtext('o:Title',namespaces=ns) or '';box=layer.find('o:BoundingBox',ns);tile=layer.find('w:ResourceURL',ns)
  if '屏東縣' not in title or not re.match(r'^\d{8}_',title) or box is None or box.get('crs')!='urn:ogc:def:crs:EPSG::4326' or tile is None:raise ValueError('Unexpected WMTS layer metadata')
  # EPSG:4326 official BoundingBox uses latitude, longitude order.
  south,west=map(float,box.findtext('o:LowerCorner',namespaces=ns).split());north,east=map(float,box.findtext('o:UpperCorner',namespaces=ns).split())
  bounds=[west,south,east,north]
  if not all(math.isfinite(v) for v in bounds) or not -180<=west<east<=180 or not -85<=south<north<=85:raise ValueError('Invalid bounds')
  url=tile.get('template','');pattern=r'https://storage\.geodac\.tw/Tile/v2/RSImage/UAV/Ortho/([A-Za-z0-9_-]+)/\{TileMatrix\}/\{TileRow\}/\{TileCol\}\.jpg'
  match=re.fullmatch(pattern,url)
  if not match:raise ValueError('Unexpected tile endpoint')
  if url in seen:continue
  seen.add(url);stamp=title[:8];taken=date(int(stamp[:4]),int(stamp[4:6]),int(stamp[6:8])).isoformat()
  images.append({'id':match.group(1),'title':title,'date':taken,'bounds':bounds,'url':url.replace('{TileMatrix}','{z}').replace('{TileRow}','{y}').replace('{TileCol}','{x}')})
 if not images:raise ValueError('No public Pingtung imagery found')
 return {'schemaVersion':1,'source':'農業部農村發展及水土保持署 BigGIS','sourceUrl':SOURCE,'snapshotDate':date.today().isoformat(),'images':sorted(images,key=lambda i:(i['date'],i['id']),reverse=True)}
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input',type=Path);parser.add_argument('--output',type=Path,default=Path('data/admin-orthophoto.json'));args=parser.parse_args()
 if args.input:raw=args.input.read_bytes()
 else:
  with urllib.request.urlopen(SOURCE,timeout=30) as r:raw=r.read(5*1024*1024+1)
 obj=parse(raw);args.output.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'images':len(obj['images']),'snapshot':obj['snapshotDate']},ensure_ascii=False))
if __name__=='__main__':main()
