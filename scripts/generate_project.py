#!/usr/bin/env python3
"""Gera uma nova pasta de projeto com toda a estrutura atual, sem copiar segredos/caches."""
from pathlib import Path
import argparse
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
EXCLUDE_DIRS = {'.git', 'node_modules', '__pycache__', '.pytest_cache', 'dist'}
EXCLUDE_NAMES = {'.DS_Store', 'Thumbs.db'}

def main() -> int:
    parser = argparse.ArgumentParser(description='Criar automaticamente a estrutura do projeto Gestão de Manutenção')
    parser.add_argument('--output-dir', default=str(ROOT.parent / 'gestao-manutencao-gerado'), help='Pasta de destino')
    parser.add_argument('--zip', action='store_true', help='Criar também um ZIP da nova pasta')
    args = parser.parse_args()
    destination = Path(args.output_dir).expanduser().resolve()
    if destination == ROOT or ROOT in destination.parents:
        print('Erro: escolha uma pasta de destino fora da pasta-fonte para evitar recursão.', file=sys.stderr)
        return 2
    if destination.exists():
        shutil.rmtree(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    def ignore(directory, names):
        excluded = set()
        for name in names:
            candidate = Path(directory) / name
            if name in EXCLUDE_NAMES or name in EXCLUDE_DIRS or (name.startswith('.env') and name != '.env.example'):
                excluded.add(name)
            elif candidate.is_file() and candidate.suffix in {'.pyc', '.log'}:
                excluded.add(name)
        return excluded
    shutil.copytree(ROOT, destination, ignore=ignore)
    print(f'Estrutura do projeto criada em: {destination}')
    print('Inclui HTML/CSS/JS separados, login, serviços cloud, SQL de segurança e README.')
    if args.zip:
        pack_script = destination / 'scripts' / 'package_project.py'
        target_zip = destination.parent / f'{destination.name}.zip'
        try:
            subprocess.run([sys.executable, str(pack_script), '--output', str(target_zip)], check=True)
        except subprocess.CalledProcessError as exc:
            return exc.returncode
        print(f'ZIP criado em: {target_zip}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
