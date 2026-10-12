"""Folds the tagging pass's output (inspo/.work/tags-*.json, keyed by sheet
and tile) into inspo/tags.json (keyed by block id), using the manifest the
sheets were built with. Safe to run again; existing tags are kept."""
import json
from pathlib import Path

ROOT = Path(__file__).parent
WORK = ROOT / '.work'
tags_path = ROOT / 'tags.json'
tags = json.loads(tags_path.read_text()) if tags_path.exists() else {}
added = missing = 0
expected = 0
# the top folder and every batch folder: a manifest, and tags-*.json beside it
for folder in [WORK, *sorted(WORK.glob('batch-*'))]:
  if not (folder / 'manifest.json').exists():
    continue
  manifest = json.loads((folder / 'manifest.json').read_text())
  outputs = sorted(folder.glob('tags-*.json'))
  if outputs:
    expected += sum(len(t) for t in manifest.values())
  for f in outputs:
    for sheet, tiles in json.loads(f.read_text()).items():
        for tile, line in tiles.items():
            bid = manifest.get(sheet, {}).get(str(int(tile)))
            if bid is None:
                missing += 1
                continue
            line = line.strip().lower()
            if line and line != 'unreadable':
                tags[str(bid)] = line
                added += 1
tags_path.write_text(json.dumps(tags, ensure_ascii=False, indent=0, sort_keys=True))
print(f'{added} tagged of {expected} on the sheets; {missing} tiles not in the manifest; {len(tags)} in tags.json')
