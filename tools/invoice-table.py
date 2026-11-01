"""Local ruled-table OCR. Column boundaries come from the image, not a supplier layout."""
import sys, json, subprocess, csv, io, re
from PIL import Image, ImageOps, ImageDraw

im = ImageOps.exif_transpose(Image.open(sys.argv[1])).convert('RGB')
im.thumbnail((2400,3200),Image.Resampling.LANCZOS)
# Maximise horizontal rule/text alignment on a small preview before table detection.
preview=ImageOps.grayscale(im)
preview.thumbnail((650,650))
binary=preview.point(lambda p: 0 if p<175 else 255)
def alignment(angle):
    rotated=binary.rotate(angle,resample=Image.Resampling.NEAREST,expand=True,fillcolor=255)
    return sum(rotated.crop((0,y,rotated.width,y+1)).histogram()[0]**2 for y in range(rotated.height))
angles=[i/2 for i in range(-16,17)]
best=max(angles,key=alignment)
best=max([best+i/10 for i in range(-5,6)],key=alignment)
if abs(best)>.05 and alignment(best)>alignment(0)*1.08:
    im=im.rotate(best,resample=Image.Resampling.BICUBIC,expand=True,fillcolor='white')
gray = ImageOps.grayscale(im)
w, h = im.size
px = gray.load()
runs = []
for x in range(w):
    start = None
    for y in range(h + 1):
        dark = y < h and px[x, y] < 210
        if dark and start is None: start = y
        if not dark and start is not None:
            if y - start > h * .2: runs.append((x, start, y))
            start = None
if not runs:
    print('[]'); sys.exit()
# Select the largest family of vertical rules sharing their top edge.
families = [[r for r in runs if abs(r[1]-seed[1]) < 10] for seed in runs]
family = max(families, key=len)
xs = []
for x in sorted(set(r[0] for r in family)):
    if not xs or x-xs[-1] > 5: xs.append(x)
if len(xs) < 5:
    print('[]'); sys.exit()
top = sorted(r[1] for r in family)[len(family)//2]
bottom = sorted(r[2] for r in family)[len(family)//2]
columns = []
crops = []
# large phone photos are already big: zoom less so the digits are not blown up into noise
zoom = 4 if im.width <= 2200 else max(1, round(4 * 2200 / im.width))
def read_lines(filename, extra=()):
    out = subprocess.run([sys.argv[3], filename, 'stdout', '-l', 'eng', '--psm', '6', *extra, 'tsv'], capture_output=True, text=True, check=True, timeout=15)
    words = [r for r in csv.DictReader(io.StringIO(out.stdout), delimiter='	') if r['level']=='5' and r['text'].strip()]
    groups = {}
    for r in words:
        groups.setdefault((r['block_num'],r['par_num'],r['line_num']), []).append(r)
    return [{'text':' '.join(r['text'] for r in group), 'confidence':min(float(r['conf']) for r in group), 'y':sum(int(r['top'])+int(r['height'])/2 for r in group)/len(group)/zoom+top+3} for group in groups.values()]
for left, right in zip(xs, xs[1:]):
    crop = im.crop((left+3, top+3, right-2, bottom-2))
    cp = ImageOps.grayscale(crop)
    draw = ImageDraw.Draw(crop)
    for cy in range(cp.height):
        if sum(cp.getpixel((cx,cy))<210 for cx in range(cp.width)) > cp.width*.8:
            draw.rectangle((0,max(0,cy-1),cp.width,min(cp.height,cy+1)),fill='white')
    crop = crop.resize((crop.width*zoom,crop.height*zoom))
    filename = sys.argv[2] + '/column%d.png' % len(crops)
    crop.save(filename)
    crops.append(filename)
    columns.append(read_lines(filename))
aliases = {'name':r'product|description|\bitems?\b', 'batch_no':r'batch', 'expiry':r'exp', 'qty':r'^qty|quantity', 'units_per_pack':r'^unit|pack', 'rate':r'^rate|^dp$|price\s*/?\s*unit', 'mrp':r'mrp', 'hsn':r'hsn', 'gst_pct':r'tax\s*/?\s*unit|gst', 'discount_pct':r'disc'}
mapped = {}
for index, lines in enumerate(columns):
    header = ' '.join(l['text'] for l in lines if l['y'] < top+110)
    for key, pattern in aliases.items():
        if re.search(pattern, header, re.I):
            header_lines = [l for l in lines if l['y'] < top+110 and re.search(pattern,l['text'],re.I)]
            cutoff = min(l['y'] for l in header_lines)+8 if header_lines else top+75
            mapped[key] = [l for l in lines if l['y'] > cutoff]
            # number columns are read again as digits only: general text OCR confuses 5/9/2 and 0/8
            if key in ('qty', 'rate', 'mrp', 'gst_pct', 'discount_pct'):
                try:
                    digits = read_lines(crops[index], ('-c', 'tessedit_char_whitelist=0123456789.,%'))
                    mapped[key] = [l for l in digits if l['y'] > cutoff] or mapped[key]
                except Exception:
                    pass
            break
rows = []
if '--debug' in sys.argv: print(json.dumps({'top':top,'columns':columns,'mapped':mapped}),file=sys.stderr)
product_positions = sorted(l['y'] for l in mapped.get('name', []))
gaps = sorted(b-a for a,b in zip(product_positions,product_positions[1:]) if b-a>5)
tolerance = max(7, min(30, gaps[len(gaps)//2]*.3)) if gaps else 7
for product in mapped.get('name', []):
    if not re.search('[a-zA-Z]{3}', product['text']): continue
    if re.search(r'^(discount|total|received|due|balance)\b', product['text'], re.I): continue
    row = {'name':product['text'], 'source':product['text'], 'warnings':[]}
    for key, lines in mapped.items():
        if key=='name': continue
        matches = [l for l in lines if abs(l['y']-product['y']) < tolerance]
        if len(matches)!=1: continue
        value = matches[0]['text'].strip(' |[]')
        if matches[0]['confidence']<75: row['warnings'].append('Check '+key+': uncertain OCR')
        if key in ('batch_no','hsn'): row[key]=value
        elif key=='expiry':
            m=re.fullmatch(r'(\d{1,2}|[A-Za-z]{3,9})[-/. ](\d{4}|\d{2})',value)
            if m:
                months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
                month=int(m[1]) if m[1].isdigit() else (months.index(m[1][:3].lower())+1 if m[1][:3].lower() in months else 0)
                year='20'+m[2] if len(m[2])==2 else m[2]
                if 1<=month<=12: row[key]=year+'-'+str(month).zfill(2)
        elif key=='units_per_pack':
            m=re.fullmatch(r'\(?1\s*[xX×]\s*(\d+)\)?',value)
            if m: row[key]=int(m[1])
        elif key=='gst_pct':
            m=re.search(r'(\d+(?:\.\d+)?)\s*%',value)
            if m: row[key]=float(m[1])
        elif key=='qty':
            m=re.fullmatch(r'(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?',value)
            if m:
                row[key]=float(m[1])
                if m[2]: row['quantity_unit']=m[2]
        elif key in ('rate','mrp'):
            m=re.fullmatch(r'(?:Rs\.?|INR|₹)?\s*(\d[\d,]*(?:\.\d+)?)',value,re.I)
            if m: row[key]=float(m[1].replace(',',''))
        elif re.fullmatch(r'\d+(?:\.\d+)?',value): row[key]=float(value)
    if row.get('mrp',0) and row.get('rate',0)>row['mrp']: row['warnings'].append('Purchase rate exceeds MRP; verify numbers and pack units')
    if 'rate' in row or 'qty' in row or 'expiry' in row: rows.append(row)
print(json.dumps(rows))
