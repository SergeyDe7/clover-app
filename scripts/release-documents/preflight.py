#!/usr/bin/env python3
"""Read-only production prerequisite check. Does not read .env or customer records."""
import argparse,hashlib,json,pathlib,shutil,socket,subprocess,sys,urllib.request
p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--manifest',required=True);a=p.parse_args()
r=pathlib.Path(a.root).resolve(strict=True);m=json.loads(pathlib.Path(a.manifest).read_text());fail=[]
def check(label,ok):
 print(label+'='+('PASS' if ok else 'BLOCKED'))
 if not ok:fail.append(label)
check('HOST',socket.gethostname()==m['baselineHost'])
head=subprocess.run(['git','-C',str(r),'rev-parse','HEAD'],capture_output=True,text=True,check=True).stdout.strip();check('GIT_HEAD',head==m['baselineHead'])
for rel,expected in m['baselineSha256'].items():
 f=r/rel;check('BASELINE:'+rel,f.is_file() and hashlib.sha256(f.read_bytes()).hexdigest()==expected)
for executable in ['node','python3','libreoffice','tesseract','pdftoppm']:
 check('TOOL:'+executable,shutil.which(executable) is not None)
for module in ['pypdf','PIL']:
 result=subprocess.run([sys.executable,'-c','import '+module],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);check('PYTHON:'+module,result.returncode==0)
if shutil.which('tesseract'):
 langs=subprocess.run(['tesseract','--list-langs'],capture_output=True,text=True);check('RUSSIAN_OCR','rus' in langs.stdout.splitlines())
for label,url in [('API','http://127.0.0.1:4100/api/health'),('UI','http://127.0.0.1:5273/')]:
 try:
  with urllib.request.urlopen(url,timeout=10) as result:check('HEALTH:'+label,result.status==200)
 except Exception:check('HEALTH:'+label,False)
check('INSTALL_APPROVAL_GATE',m.get('installAllowed') is True)
print(json.dumps({'status':'BLOCKED' if fail else 'PASS','blockedChecks':fail}))
sys.exit(2 if fail else 0)
