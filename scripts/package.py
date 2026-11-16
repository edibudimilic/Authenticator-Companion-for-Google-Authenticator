"""Build the Web Store ZIP using only Python's standard library."""
import json
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / 'extension'
destination = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'dist' / 'chrome-web-store.zip'
destination.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
    for item in sorted(source.rglob('*')):
        if not item.is_file():
            continue
        relative = item.relative_to(source).as_posix()
        if relative == 'manifest.json':
            manifest = json.loads(item.read_text(encoding='utf-8'))
            manifest.pop('key', None)  # The store assigns its own extension ID.
            archive.writestr(relative, json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        else:
            archive.write(item, relative)
print(destination)
