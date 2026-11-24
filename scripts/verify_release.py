"""Verify the release archives against the exact local dist/source files."""
from pathlib import Path, PurePosixPath
import fnmatch
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
release = root / 'release'
results = {'version': version, 'checks': []}


def checked(name):
    results['checks'].append({'name': name, 'status': 'PASS'})


for kind in ['extension', 'source']:
    archive = release / f'jobgen-{kind}-{version}.zip'
    with zipfile.ZipFile(archive) as zipped:
        names = zipped.namelist()
        assert len(names) == len(set(names)), 'Duplicate archive entries'
        assert all(not PurePosixPath(name).is_absolute() and '..' not in PurePosixPath(name).parts for name in names)
        assert zipped.testzip() is None
        if kind == 'extension':
            expected = {file.relative_to(root / 'dist').as_posix(): file for file in (root / 'dist').rglob('*') if file.is_file() and file.suffix != '.map'}
            assert set(names) == set(expected), 'Extension ZIP differs from build file set'
            for name, file in expected.items():
                assert zipped.read(name) == file.read_bytes(), f'Build mismatch: {name}'
            manifest = json.loads(zipped.read('manifest.json'))
            assert manifest['version'] == version
            references = [manifest['background']['service_worker'], *manifest['icons'].values()]
            for script in manifest['content_scripts']:
                references.extend(script.get('js', []))
                references.extend(script.get('css', []))
            for item in manifest.get('web_accessible_resources', []):
                references.extend(item['resources'])
            for reference in references:
                assert any(fnmatch.fnmatch(name, reference) for name in names), reference
            checked('Extension bytes match tested dist and manifest assets exist')
        else:
            assert json.loads(zipped.read('package.json'))['version'] == version
            assert json.loads(zipped.read('package-lock.json'))['packages']['']['version'] == version
            for folder in ['src', 'tests', 'browser-tests', 'scripts', 'public']:
                for file in (root / folder).rglob('*'):
                    if file.is_file() and '__pycache__' not in file.parts:
                        name = file.relative_to(root).as_posix()
                        assert zipped.read(name) == file.read_bytes(), f'Source mismatch: {name}'
            assert not any({'node_modules', '.git', 'dist', 'release'} & set(PurePosixPath(name).parts) for name in names)
            assert not any(PurePosixPath(name).name.startswith('.env') and PurePosixPath(name).name != '.env.example' for name in names)
            checked('Source ZIP contains current code/tests/scripts; local env and dependencies excluded')
        checked(f'{kind} ZIP integrity and safe paths')

for line in (release / 'SHA256SUMS.txt').read_text().splitlines():
    digest, filename = line.split('  ')
    assert hashlib.sha256((release / filename).read_bytes()).hexdigest() == digest
checked('Published SHA-256 checksums match')
(release / 'validation.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
