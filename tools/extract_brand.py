# Developer tool: extracts the supplied PDF's original paths; never generates logos.
# Optional dependencies: PyMuPDF and lxml. Run from the repository root.
from pathlib import Path
from lxml import etree as E
import fitz, copy, json, hashlib
import sys
if len(sys.argv) != 2:
    raise SystemExit('Uso: python tools/extract_brand.py "ruta/Manual de marca.pdf" (desde la raíz del proyecto)')
source = Path(sys.argv[1])
pdf = fitz.open(source)
out = Path('public/brand')
ns = 'http://www.w3.org/2000/svg'
records = []
for name, page, color, scope, B in [('thordy-logotipo-vinotinto', 7, '#6a0b07', None, 36.49), ('thordy-isotipo-vinotinto', 8, '#6a0b07', None, 45.81), ('thordy-logotipo-beige', 13, '#fdf2e3', fitz.Rect(278.24, 211.42, 611.72, 371.9), 17.051), ('thordy-isotipo-beige', 14, '#fdf2e3', fitz.Rect(138.44, 285.8, 325.96, 473.32), 16.704)]:
    original = E.fromstring(pdf[page - 1].get_svg_image().encode())
    group = original[-1][-1]
    paths = [c for c in group if c.tag == f'{{{ns}}}path']
    staging = E.Element(f'{{{ns}}}svg', nsmap={None: ns}, width='841.89', height='595.276', viewBox='0 0 841.89 595.276')
    for path in paths:
        staging.append(copy.deepcopy(path))
    doc = fitz.open(stream=fitz.open(stream=E.tostring(staging), filetype='svg').convert_to_pdf(), filetype='pdf')
    drawings = doc[0].get_drawings()
    assert len(drawings) == len(paths)
    chosen = [(path, d['rect']) for path, d in zip(paths, drawings) if path.get('fill') == color and (scope.contains(d['rect']) if scope else d['rect'].x0 > 120)]
    assert len(chosen) == (16 if 'logotipo' in name else 12), (name, len(chosen))
    bounds = fitz.Rect(chosen[0][1])
    for _, r in chosen[1:]:
        bounds |= r
    viewport = bounds + (-B, -B, B, B)
    root = E.Element(f'{{{ns}}}svg', nsmap={None: ns}, viewBox=' '.join((f'{v:.6f}' for v in [viewport.x0, viewport.y0, viewport.width, viewport.height])), width=f'{viewport.width:.6f}', height=f'{viewport.height:.6f}')
    title = E.SubElement(root, f'{{{ns}}}title')
    title.text = 'THORDY AL BARRIL — ' + ('Logotipo' if 'logotipo' in name else 'Isotipo')
    for path, _ in chosen:
        root.append(copy.deepcopy(path))
    E.cleanup_namespaces(root)
    asset = E.tostring(root, xml_declaration=True, encoding='UTF-8')
    (out / (name + '.svg')).write_bytes(asset)
    records.append({'file': name + '.svg', 'manual_page': page, 'paths': len(chosen), 'safety_B_pdf_points': B, 'viewBox': root.get('viewBox'), 'sha256': hashlib.sha256(asset).hexdigest()})

def raster(svg_path, dest, size, background):
    root = E.parse(str(svg_path)).getroot()
    v = list(map(float, root.get('viewBox').split()))
    rect = E.Element(f'{{{ns}}}rect', x=str(v[0]), y=str(v[1]), width=str(v[2]), height=str(v[3]), fill=background)
    root.insert(1, rect)
    svg = fitz.open(stream=E.tostring(root), filetype='svg')
    page = fitz.open(stream=svg.convert_to_pdf(), filetype='pdf')[0]
    page.get_pixmap(matrix=fitz.Matrix(size / page.rect.width, size / page.rect.width), alpha=False).save(str(dest))
raster(out / 'thordy-logotipo-vinotinto.svg', out / 'thordy-logotipo-exportacion.png', 1000, '#fdf2e3')
root = E.parse(str(out / 'thordy-isotipo-beige.svg')).getroot()
v = list(map(float, root.get('viewBox').split()))
side = max(v[2:])
v[0] -= (side - v[2]) / 2
v[1] -= (side - v[3]) / 2
root.set('viewBox', f'{v[0]} {v[1]} {side} {side}')
root.set('width', str(side))
root.set('height', str(side))
root.insert(1, E.Element(f'{{{ns}}}rect', x=str(v[0]), y=str(v[1]), width=str(side), height=str(side), fill='#6a0b07'))
E.cleanup_namespaces(root)
(out / 'favicon.svg').write_bytes(E.tostring(root, xml_declaration=True, encoding='UTF-8'))
for size, name in [(32, 'favicon-32.png'), (180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]:
    raster(out / 'favicon.svg', out / name, size, '#6a0b07')
Path('docs/brand/recursos.json').write_text(json.dumps({'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'source': 'Manual de marca.pdf', 'assets': records}, indent=2) + '\n')
print([(r['file'], r['paths']) for r in records])
