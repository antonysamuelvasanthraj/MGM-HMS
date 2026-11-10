"""Synthetic invoices only: varied columns, short expiry, tilted photo and PDF."""
from PIL import Image, ImageDraw, ImageFont
import os, sys
out=sys.argv[1]; os.makedirs(out,exist_ok=True)
font_path=next(p for p in ['C:/Windows/Fonts/arial.ttf','/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'] if os.path.exists(p))
font=ImageFont.truetype(font_path,28); title=ImageFont.truetype(font_path,36)
data=[{'Product':'Demo Alpha 500','Batch':'QA1001','Expiry':'MAR-28','Qty':'2','Pack':'1x10','Rate':'20.00','MRP':'30.00','GST':'5%'},
      {'Product':'Demo Beta 650','Batch':'QA1002','Expiry':'03/28','Qty':'5','Pack':'1x10','Rate':'80.00','MRP':'120.00','GST':'5%'}]
def invoice(columns):
    im=Image.new('RGB',(1800,1000),'white'); d=ImageDraw.Draw(im)
    d.text((35,25),'SYNTHETIC INVOICE - SOFTWARE TEST ONLY',font=title,fill='black')
    d.text((35,85),'Review Supplier | Invoice No: TEST-20261111 | Invoice Date: 11-11-2026',font=font,fill='black')
    widths={'Product':390,'Batch':200,'Expiry':190,'Qty':120,'Pack':170,'Rate':190,'MRP':190,'GST':170}
    x=30
    for key in columns:
        d.line((x,200,x,800),fill='black',width=2);d.text((x+10,220),key,font=font,fill='black')
        for i,row in enumerate(data):d.text((x+10,310+i*100),row[key],font=font,fill='black')
        x+=widths[key]
    d.line((x,200,x,800),fill='black',width=2)
    for y in [200,280,380,480,800]:d.line((30,y,x,y),fill='black',width=2)
    d.text((35,865),'Invoice amount: 462.00 | Verify all fields before receipt posting.',font=font,fill='black')
    return im
im=invoice(['Product','Batch','Expiry','Qty','Pack','Rate','MRP','GST'])
im.save(os.path.join(out,'standard.png'))
im.rotate(2,resample=Image.Resampling.BICUBIC,expand=True,fillcolor='white').save(os.path.join(out,'tilted.png'))
invoice(['Qty','Product','MRP','Rate','Pack','Expiry','GST','Batch']).save(os.path.join(out,'reordered.png'))
im.save(os.path.join(out,'invoice.pdf'),'PDF',resolution=150)
print(out)
