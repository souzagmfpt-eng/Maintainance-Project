#!/usr/bin/env python3
"""Empacota o repositório numa distribuição ZIP, excluindo segredos e caches locais."""
from pathlib import Path
import argparse, zipfile

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_DIRS = {'.git', 'node_modules', '__pycache__', '.pytest_cache', 'dist'}
EXCLUDED_NAMES = {'.DS_Store', 'Thumbs.db'}
EXCLUDED_SUFFIXES = {'.pyc', '.log'}

def main():
    parser = argparse.ArgumentParser(description='Gerar ZIP do projeto Gestão de Manutenção')
    parser.add_argument('--output', default=str(ROOT / 'dist' / 'gestao-manutencao-github-pages.zip'), help='Caminho do ZIP a gerar')
    args = parser.parse_args()
    output = Path(args.output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    root_name = ROOT.name
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=8) as archive:
        for path in sorted(ROOT.rglob('*')):
            rel = path.relative_to(ROOT)
            if any(part in EXCLUDED_DIRS for part in rel.parts) or path.name in EXCLUDED_NAMES or path.suffix in EXCLUDED_SUFFIXES:
                continue
            if path.resolve() == output:
                continue
            # Evitar enviar exports pessoais ou ficheiros .env por engano.
            if path.name.startswith('.env') and path.name != '.env.example':
                continue
            if path.is_file():
                archive.write(path, Path(root_name) / rel)
    print(f'ZIP criado: {output}')
    print(f'Tamanho: {output.stat().st_size:,} bytes')

if __name__ == '__main__':
    main()
