"""QA input locations. Original files are intentionally not included."""
import os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE=os.getenv('PHOTOSHEET_TEST_URL','http://127.0.0.1:8778/photosheet-static/').rstrip('/')+'/'
def source(env,pattern):
    if os.getenv(env):return Path(os.environ[env])
    attachment=ROOT.parent/'attachments'
    found=next(attachment.rglob(pattern),None) if attachment.exists() else None
    return found or Path('MISSING_'+env)
ZIP=source('PHOTOSHEET_TEST_KML_ZIP','T.zip')
EXCEL=source('PHOTOSHEET_TEST_EXCEL','*.xlsx')
import shutil
from datetime import datetime,timezone
CHROMIUM=os.getenv('PHOTOSHEET_CHROMIUM') or shutil.which('chromium')
QA_NOW=datetime(2026,10,26,0,0,0,tzinfo=timezone.utc)
