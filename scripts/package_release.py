"""Package the current built extension and source without local dependencies."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'release'
OUTPUT.mkdir(exist_ok=True)
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
MANIFEST = json.loads((ROOT / 'dist/manifest.json').read_text())
if MANIFEST['version'] != VERSION:
    raise SystemExit('Build manifest and package versions disagree; rebuild first')


def archive(path, files, base):
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as output:
        for file in sorted(files):
            info = zipfile.ZipInfo(file.relative_to(base).as_posix(), (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            output.writestr(info, file.read_bytes())


extension = OUTPUT / f'jobgen-extension-{VERSION}.zip'
source = OUTPUT / f'jobgen-source-{VERSION}.zip'
archive(extension, [p for p in (ROOT / 'dist').rglob('*') if p.is_file() and p.suffix != '.map'], ROOT / 'dist')
excluded = {'.git', 'node_modules', 'dist', 'release', '__pycache__'}
files = [p for p in ROOT.rglob('*') if p.is_file()
         and not (set(p.relative_to(ROOT).parts) & excluded)
         and p.suffix not in {'.zip', '.pyc'}
         and (not p.name.startswith('.env') or p.name == '.env.example')
         and p.name != '.DS_Store']
archive(source, files, ROOT)
checksums = ''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in [extension, source])
(OUTPUT / 'SHA256SUMS.txt').write_text(checksums)
print(f'Packaged {extension.name} and {source.name}')
