"""Format staged source files; never silently stage unrelated edits."""
import os
from pathlib import Path
import subprocess
import sys


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def main():
    root = Path(run(['git', 'rev-parse', '--show-toplevel'], capture_output=True).stdout.decode().strip())
    os.chdir(root)
    paths = run(['git', 'diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], capture_output=True).stdout.decode('utf-8').split('\0')
    frontend_extensions = {'.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html'}
    files = [p for p in paths if p and (
        (p.startswith('frontend/') and Path(p).suffix in frontend_extensions)
        or (p.startswith('backend/') and Path(p).suffix == '.py')
    )]
    if not files:
        return
    # Check all files before touching any of them.
    for path in files:
        if Path(path).is_symlink():
            sys.exit(f'Formatting skipped: source file is a symlink: {path}')
        result = subprocess.run(['git', 'diff', '--quiet', '--', path])
        if result.returncode != 0:
            sys.exit(f'Cannot auto-format partially staged file: {path}\nStage its remaining changes or stash them, then retry.')
    prettier = root / 'frontend/node_modules/prettier/bin/prettier.cjs'
    js_files = [p for p in files if p.startswith('frontend/')]
    py_files = [p for p in files if p.startswith('backend/')]
    if js_files and not prettier.exists():
        sys.exit('Prettier is missing. Run npm ci in frontend first.')
    if js_files:
        run(['node', str(prettier), '--write', '--', *js_files])
    if py_files:
        run(['uv', 'run', '--project', 'backend', 'ruff', 'format', '--', *py_files])
    run(['git', 'add', '--', *files])


if __name__ == '__main__':
    try:
        main()
    except (subprocess.CalledProcessError, OSError) as error:
        sys.exit(f'Formatting failed; commit stopped. Review git diff before retrying.\n{error}')
