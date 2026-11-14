#!/usr/bin/env python3
"""
Builds europe-countries.geojson for the Geo-Spacerace Europe mode from REAL
Natural Earth country borders (public domain).  No extra packages needed.

USAGE (run in the same folder as index.html):
    python3 build-europe-geojson.py                 # downloads 50m data (recommended)
    python3 build-europe-geojson.py --res 10m       # even more detail (bigger file)
    python3 build-europe-geojson.py --input my_ne_file.geojson   # use a file you downloaded

Output: europe-countries.geojson  (47 countries, each with "name" and "abbr")
"""
import argparse, json, sys, urllib.request

URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_{res}_admin_0_countries.geojson"

# Natural Earth ADM0_A3 code -> (game name, 2-letter label)
COUNTRIES = {
 'PRT':('Portugal','PT'),'ESP':('Spain','ES'),'AND':('Andorra','AD'),'FRA':('France','FR'),
 'MCO':('Monaco','MC'),'BEL':('Belgium','BE'),'LUX':('Luxembourg','LU'),'NLD':('Netherlands','NL'),
 'DEU':('Germany','DE'),'DNK':('Denmark','DK'),'CHE':('Switzerland','CH'),'LIE':('Liechtenstein','LI'),
 'AUT':('Austria','AT'),'ITA':('Italy','IT'),'SMR':('San Marino','SM'),'VAT':('Vatican City','VA'),
 'MLT':('Malta','MT'),'SVN':('Slovenia','SI'),'HRV':('Croatia','HR'),'BIH':('Bosnia and Herzegovina','BA'),
 'SRB':('Serbia','RS'),'MNE':('Montenegro','ME'),'KOS':('Kosovo','XK'),'ALB':('Albania','AL'),
 'MKD':('North Macedonia','MK'),'GRC':('Greece','GR'),'BGR':('Bulgaria','BG'),'ROU':('Romania','RO'),
 'MDA':('Moldova','MD'),'HUN':('Hungary','HU'),'SVK':('Slovakia','SK'),'CZE':('Czechia','CZ'),
 'POL':('Poland','PL'),'LTU':('Lithuania','LT'),'LVA':('Latvia','LV'),'EST':('Estonia','EE'),
 'BLR':('Belarus','BY'),'UKR':('Ukraine','UA'),'RUS':('Russia','RU'),'FIN':('Finland','FI'),
 'SWE':('Sweden','SE'),'NOR':('Norway','NO'),'ISL':('Iceland','IS'),'IRL':('Ireland','IE'),
 'GBR':('United Kingdom','GB'),'CYP':('Cyprus','CY'),'TUR':('Turkey','TR'),
}
# extra Natural Earth pieces that belong to a game country
MERGE = {'CYN':'CYP','CNM':'CYP','WSB':'CYP','ESB':'CYP'}   # northern Cyprus, UN zone, UK bases
ALT = {'SRB':['SRB'],'KOS':['KOS','XKX'],'MKD':['MKD']}

# micro nations: drawn BIGGER than reality so they can be seen and clicked
# code -> (target size in degrees of the longest side, minimum thickness in degrees)
MICRO = {'AND':(1.0,0.6),'MCO':(0.8,0.55),'LIE':(0.8,0.5),'SMR':(0.85,0.6),'VAT':(0.8,0.55),'MLT':(1.1,0.65)}

# only keep land inside this window (drops overseas territories, Svalbard, far-east Russia ...)
WEST, SOUTH, EAST, NORTH = -25.0, 34.0, 62.0, 72.0

def clip_ring(ring):
    """Sutherland-Hodgman clip of one ring against the Europe window."""
    def clip(pts, inside, inter):
        out = []
        if not pts: return out
        prev = pts[-1]
        for cur in pts:
            if inside(cur):
                if not inside(prev): out.append(inter(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(inter(prev, cur))
            prev = cur
        return out
    def ix(x):
        return lambda a, b: (x, a[1] + (b[1]-a[1]) * (x-a[0]) / (b[0]-a[0]))
    def iy(y):
        return lambda a, b: (a[0] + (b[0]-a[0]) * (y-a[1]) / (b[1]-a[1]), y)
    pts = [tuple(p[:2]) for p in ring[:-1]] if ring[0] == ring[-1] else [tuple(p[:2]) for p in ring]
    pts = clip(pts, lambda p: p[0] >= WEST,  ix(WEST))
    pts = clip(pts, lambda p: p[0] <= EAST,  ix(EAST))
    pts = clip(pts, lambda p: p[1] >= SOUTH, iy(SOUTH))
    pts = clip(pts, lambda p: p[1] <= NORTH, iy(NORTH))
    if len(pts) < 3: return None
    return pts + [pts[0]]

def rdp(pts, eps):
    """Douglas-Peucker simplify (iterative)."""
    if eps <= 0 or len(pts) < 5: return pts
    keep = [False]*len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts)-1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx-ax, by-ay; d2 = dx*dx + dy*dy
        best, idx = -1, -1
        for i in range(a+1, b):
            px, py = pts[i]
            if d2 == 0: dist = (px-ax)**2 + (py-ay)**2
            else:
                t = max(0, min(1, ((px-ax)*dx + (py-ay)*dy) / d2))
                dist = (px-(ax+t*dx))**2 + (py-(ay+t*dy))**2
            if dist > best: best, idx = dist, i
        if best > eps*eps:
            keep[idx] = True; stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]

def area(ring):
    return abs(sum(ring[i][0]*ring[i+1][1] - ring[i+1][0]*ring[i][1] for i in range(len(ring)-1))) / 2

def polygons_of(geom):
    if geom['type'] == 'Polygon': return [geom['coordinates']]
    if geom['type'] == 'MultiPolygon': return geom['coordinates']
    return []

def enlarge(rings_list, target, thick):
    allpts = [p for r in rings_list for p in r]
    xs = [p[0] for p in allpts]; ys = [p[1] for p in allpts]
    w, h = max(xs)-min(xs), max(ys)-min(ys)
    cx, cy = (max(xs)+min(xs))/2, (max(ys)+min(ys))/2
    s = target / max(w, h, 1e-9)
    sx = max(s, thick / max(w, 1e-9)) if w*s < thick else s
    sy = max(s, thick / max(h, 1e-9)) if h*s < thick else s
    return [[(cx + (x-cx)*sx, cy + (y-cy)*sy) for x, y in r] for r in rings_list]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--res', default='50m', choices=['50m', '10m'])
    ap.add_argument('--input', help='use a local Natural Earth admin_0_countries .geojson instead of downloading')
    ap.add_argument('--simplify', type=float, default=None, help='Douglas-Peucker tolerance in degrees (default 0 for 50m, 0.003 for 10m)')
    ap.add_argument('--out', default='europe-countries.geojson')
    a = ap.parse_args()
    eps = a.simplify if a.simplify is not None else (0.003 if a.res == '10m' else 0.0)

    if a.input:
        data = json.load(open(a.input, encoding='utf-8'))
    else:
        url = URL.format(res=a.res)
        print('Downloading', url, '...')
        data = json.load(urllib.request.urlopen(url, timeout=120))

    parts = {}   # game code -> list of polygons (each = list of rings)
    for f in data['features']:
        p = f.get('properties', {})
        code = p.get('ADM0_A3') or p.get('adm0_a3') or p.get('ISO_A3') or ''
        if code == 'XKX': code = 'KOS'
        code = MERGE.get(code, code)
        if code not in COUNTRIES: continue
        for poly in polygons_of(f['geometry']):
            outer = clip_ring(poly[0])          # outer ring only (no holes needed for this game)
            if not outer: continue
            outer = rdp(outer, eps)
            if len(outer) < 4: continue
            parts.setdefault(code, []).append(outer)

    missing = [c for c in COUNTRIES if c not in parts]
    if missing:
        print('WARNING: not found in data:', missing)

    feats, micro_feats = [], []
    for code, (name, abbr) in COUNTRIES.items():
        if code not in parts: continue
        rings = parts[code]
        if code in MICRO:
            rings = enlarge(rings, *MICRO[code])
        # drop specks smaller than a tiny area (keeps the file light) but never drop a country's biggest piece
        biggest = max(area(r) for r in rings)
        rings = [r for r in rings if area(r) >= 0.002 or area(r) == biggest]
        coords = [[[[round(x, 3), round(y, 3)] for x, y in r]] for r in rings]
        geom = {'type': 'MultiPolygon', 'coordinates': coords} if len(coords) > 1 else {'type': 'Polygon', 'coordinates': coords[0]}
        feat = {'type': 'Feature', 'properties': {'name': name, 'abbr': abbr}, 'geometry': geom}
        (micro_feats if code in MICRO else feats).append(feat)

    out = feats + micro_feats          # micro nations LAST so they draw on top and are clickable
    for i, f in enumerate(out): f['id'] = str(i+1).zfill(2)
    json.dump({'type': 'FeatureCollection', 'features': out}, open(a.out, 'w'), separators=(',', ':'))
    verts = sum(len(r) for f in out for poly in (f['geometry']['coordinates'] if f['geometry']['type']=='MultiPolygon' else [f['geometry']['coordinates']]) for r in poly)
    print(f'Wrote {a.out}: {len(out)} countries, {verts} points')

if __name__ == '__main__':
    main()