"""Create new private formatting-only candidates; never mutate existing versions."""
import argparse
import copy
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZipFile
from lxml import etree as E
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS={'w':W}
def tag(name):return '{'+W+'}'+name
def text(node):return ''.join(node.xpath('.//w:t/text()',namespaces=NS))
def property_node(parent,name):
 node=parent.find(tag(name))
 if node is None:node=E.SubElement(parent,tag(name))
 return node
def format_props(props,bold=None):
 fonts=property_node(props,'rFonts')
 for name in ['ascii','hAnsi','eastAsia','cs']:fonts.set(tag(name),'Times New Roman')
 for name in ['asciiTheme','hAnsiTheme','eastAsiaTheme','cstheme']:fonts.attrib.pop(tag(name),None)
 for name in ['sz','szCs']:property_node(props,name).set(tag('val'),'21')
 for node in props.findall(tag('highlight')):props.remove(node)
 if bold is not None:
  for name in ['b','bCs']:property_node(props,name).set(tag('val'),'1' if bold else '0')
def paragraph(value,bold=False):
 p=E.Element(tag('p'));pp=E.SubElement(p,tag('pPr'));spacing=E.SubElement(pp,tag('spacing'))
 for k,v in [('before','0'),('after','0'),('line','240'),('lineRule','auto')]:spacing.set(tag(k),v)
 E.SubElement(pp,tag('jc')).set(tag('val'),'left')
 r=E.SubElement(p,tag('r'));format_props(E.SubElement(r,tag('rPr')),bold)
 E.SubElement(r,tag('t')).text=value
 return p
def transform(document):
 root=E.fromstring(document)
 old_paragraphs=[text(p) for p in root.xpath("//w:p",namespaces=NS)]
 for h in root.xpath('//w:highlight',namespaces=NS):h.getparent().remove(h)
 for r in root.xpath('//w:r[w:t]',namespaces=NS):
  rp=r.find(tag('rPr'))
  if rp is None:rp=E.Element(tag('rPr'));r.insert(0,rp)
  format_props(rp)
 matches=root.xpath('//w:tr[w:tc//w:t[contains(.,"BUYER_EMAIL")]]',namespaces=NS)
 if len(matches)!=1:raise ValueError('ONE_CONTACT_ROW_REQUIRED')
 row=matches[0];table=row.getparent();cells=row.findall(tag('tc'))
 if len(cells)!=2:raise ValueError('TWO_PARTIES_REQUIRED')
 after=[]
 for cell in cells:
  paragraphs=cell.findall(tag('p'));sig=[p for p in paragraphs if '_SIGNER_FULL_NAME}}' in text(p)]
  if len(sig)!=1:raise ValueError('ONE_SIGNATURE_REQUIRED')
  index=paragraphs.index(sig[0]);tail=paragraphs[index+1:]
  if any(text(p).strip() not in ['','М.П.','М. П.'] for p in tail):raise ValueError('UNEXPECTED_SIGNATURE_TAIL')
  prefix='SUPPLIER' if '{{SUPPLIER_SIGNER_FULL_NAME}}' in text(sig[0]) else 'BUYER'
  after.append((prefix,[copy.deepcopy(p) for p in tail if text(p).strip()]))
  for p in paragraphs[index:]:cell.remove(p)
  # Both parties use regular-weight requisites; keep headings/company name bold.
  for p in cell.findall(tag('p')):
   heading=any(key in text(p) for key in ['ПОСТАВЩИК','Поставщик','ПОКУПАТЕЛЬ','Покупатель','Банковские реквизиты','ПРЕДПРИНИМАТЕЛЬ','FULL_NAME}}'])
   for props in p.xpath('./w:pPr/w:rPr | ./w:r/w:rPr',namespaces=NS):format_props(props,heading)
  tcpr=property_node(cell,'tcPr');property_node(property_node(tcpr,'tcBorders'),'bottom').set(tag('val'),'nil')
 # Names and signature lines have separate common rows so wrapping cannot shift one line.
 position=table.index(row)+1
 for kind in ['names','lines']:
  newrow=E.Element(tag('tr'));E.SubElement(E.SubElement(newrow,tag('trPr')),tag('cantSplit'))
  for source,(prefix,tail) in zip(cells,after):
   cell=E.SubElement(newrow,tag('tc'));pr=copy.deepcopy(source.find(tag('tcPr')));cell.append(pr)
   borders=property_node(pr,'tcBorders');property_node(borders,'top').set(tag('val'),'nil')
   if kind=='lines':
    bottom=borders.find(tag('bottom'))
    if bottom is not None:borders.remove(bottom)
   property_node(pr,'vAlign').set(tag('val'),'top')
   signature=paragraph('{{'+prefix+'_SIGNER_FULL_NAME}}' if kind=='names' else '____________________________',kind=='names')
   if kind=='lines':signature.find('w:pPr/w:spacing',NS).set(tag('after'),'120')
   cell.append(signature)
   if kind=='lines':
    for p in tail:cell.append(p)
  table.insert(position,newrow);position+=1
 # Compare all original words, ignoring only signature underscores/spacing.
 def semantic(value):return ''.join(value.replace('_','').split())
 if sorted(filter(None,map(semantic,old_paragraphs)))!=sorted(filter(None,(semantic(text(p)) for p in root.xpath('//w:p',namespaces=NS)))):raise ValueError('TEXT_CHANGED')
 serialized=E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True).decode('utf-8')
 # The existing run-preserving renderer expects explicit empty text/paragraph tags.
 serialized=re.sub(r'<w:(t|p)(\s[^>]*?)?/>',lambda m:'<w:'+m[1]+(m[2] or '')+'></w:'+m[1]+'>',serialized)
 E.fromstring(serialized.encode('utf-8'))
 return serialized.encode('utf-8')
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
 if args.output.exists():raise ValueError('OUTPUT_ALREADY_EXISTS')
 sources=sorted(p for p in args.source.iterdir() if p.is_dir())
 if len(sources)!=8:raise ValueError('EIGHT_TEMPLATES_REQUIRED')
 for source in sources:
  manifest=json.loads((source/'manifest.private.json').read_text(encoding='utf-8'));templates=list(source.glob('*.template.docx'))
  if len(templates)!=1 or hashlib.sha256(templates[0].read_bytes()).hexdigest()!=manifest['templateSha256']:raise ValueError('HASH_MISMATCH')
  target=args.output/source.name;target.mkdir(parents=True)
  with ZipFile(templates[0]) as z, ZipFile(target/templates[0].name,'w') as out:
   for entry in z.infolist():out.writestr(entry,transform(z.read(entry.filename)) if entry.filename=='word/document.xml' else z.read(entry.filename))
  manifest['formatBaseTemplateSha256']=manifest['templateSha256'];manifest['templateSha256']=hashlib.sha256((target/templates[0].name).read_bytes()).hexdigest()
  manifest['formatChanges']={'font':'Times New Roman','halfPoints':21,'highlightRemoved':True,'contactWeight':'regular except headings','signatureRows':'shared name row and shared signature-line row','legalTextUnchanged':True}
  (target/'manifest.private.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
  (target/'synthetic-values.private.json').write_bytes((source/'synthetic-values.private.json').read_bytes())
 print(json.dumps({'variants':8,'output':str(args.output),'legalTextUnchanged':True}))
if __name__=='__main__':main()
