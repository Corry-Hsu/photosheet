"""Compatibility entry point: field capture failure tests moved to the new photo flow.
Native EXIF selection was intentionally removed from field pages; the admin camera
is unchanged. GPS/storage failure, pending-image retry and stamped output are now
covered by field_photo_flow_qa.py.
"""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name("field_photo_flow_qa.py")),run_name="__main__")
