"""Synthetic regressions for private template formatting; no customer data."""
import importlib.util
from pathlib import Path
import unittest
from lxml import etree as E
spec=importlib.util.spec_from_file_location('contract_format',Path(__file__).with_name('prepare-contract-format.py'))
helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
class FormatChecks(unittest.TestCase):
 def test_shared_signature_rows_and_explicit_empty_nodes(self):
  fixture='<w:document xmlns:w="'+helper.W+'"><w:body><w:p><w:r><w:t>Условия неизменны</w:t></w:r></w:p><w:tbl><w:tr>'
  for prefix in ['SUPPLIER','BUYER']:
   fixture+='<w:tc><w:tcPr/><w:p><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>{{'+prefix+'_EMAIL}}</w:t></w:r><w:r><w:t/></w:r></w:p><w:p><w:r><w:t>{{'+prefix+'_SIGNER_FULL_NAME}} __________</w:t></w:r></w:p></w:tc>'
  fixture+='</w:tr></w:tbl></w:body></w:document>'
  result=helper.transform(fixture.encode());root=E.fromstring(result)
  self.assertNotIn(b'<w:t/>',result);self.assertNotIn(b'<w:p/>',result)
  self.assertEqual(len(root.xpath('//w:highlight',namespaces=helper.NS)),0)
  rows=root.xpath('//w:tbl/w:tr',namespaces=helper.NS)
  self.assertEqual(len(rows),3)
  self.assertEqual([helper.text(c) for c in rows[2].findall(helper.tag('tc'))],['_'*28,'_'*28])
  self.assertEqual(root.xpath('//w:sz/@w:val',namespaces=helper.NS),['21']*len(root.xpath('//w:sz',namespaces=helper.NS)))
 def test_unrecognized_structure_fails_closed(self):
  with self.assertRaisesRegex(ValueError,'ONE_CONTACT_ROW_REQUIRED'):helper.transform(('<w:document xmlns:w="'+helper.W+'"><w:body/></w:document>').encode())
if __name__=='__main__':unittest.main()
