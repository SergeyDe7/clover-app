#!/usr/bin/env python3
"""Guarded Linux source cutover; never migrates SQLite, seeds data or installs packages.
Operator approval and successful AI/schema/dependency/backup acceptance are separate gates.
"""
import argparse,datetime,hashlib,json,pathlib,shutil,subprocess,socket,time,urllib.request,sys

def safe_file(root,relative):
 parts=pathlib.PurePosixPath(relative)
 if parts.is_absolute() or '..' in parts.parts or not parts.parts or any(p in ['.env','data','uploads','node_modules'] for p in parts.parts):raise ValueError('PAYLOAD_PATH_FORBIDDEN')
 candidate=root.joinpath(*parts.parts)
 if candidate.is_symlink() or root not in candidate.resolve().parents:raise ValueError('PAYLOAD_PATH_ESCAPE')
 return candidate

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()

def cutover(root,payload,backup,hashes,restart,health,stop=lambda: None):
 """Testable source transaction. Backup is a new private operator-owned directory."""
 backup.mkdir(mode=0o700,parents=False,exist_ok=False);changed=[];original={}
 try:
  for relative,expected in hashes.items():
   source=safe_file(payload,relative);target=safe_file(root,relative)
   if digest(source)!=expected:raise ValueError('PAYLOAD_CHECKSUM_MISMATCH')
   original[relative]=target.exists()
   if target.exists():
    saved=safe_file(backup,relative);saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
  stop()
  for relative in hashes:
   target=safe_file(root,relative);target.parent.mkdir(parents=True,exist_ok=True);changed.append(relative);shutil.copy2(safe_file(payload,relative),target)
  restart();health()
  (backup/'INSTALL_RESULT.txt').write_text('PASS; source installed; schema/data untouched\n')
 except BaseException:
  ok=True
  try:stop()
  except Exception:ok=False
  for relative in reversed(changed):
   try:
    target=safe_file(root,relative)
    if original[relative]:shutil.copy2(safe_file(backup,relative),target)
    elif target.exists():target.unlink()
   except Exception:ok=False
  try:restart();health()
  except Exception:ok=False
  (backup/'INSTALL_RESULT.txt').write_text('FAIL; rollback='+str(ok)+'; schema/data untouched\n')
  raise

def main():
 p=argparse.ArgumentParser();p.add_argument('--app-root',required=True);p.add_argument('--package-root',required=True);p.add_argument('--backup-root',required=True);p.add_argument('--approval',required=True);a=p.parse_args()
 package=pathlib.Path(a.package_root).resolve(strict=True);root=pathlib.Path(a.app_root).resolve(strict=True);m=json.loads((package/'manifest.json').read_text())
 if a.approval!='PRODUCTION_DOCUMENTS_APPROVED':raise ValueError('SEPARATE_PRODUCTION_APPROVAL_REQUIRED')
 # These facts must be filled by operator after recorded acceptance; shipped manifest refuses installation.
 for gate in ['installAllowed','paidAiAcceptancePassed','schemaReady','privateSeedReady','dependenciesReady','backupRestorePassed','publicBuildParityPassed']:
  if m.get(gate) is not True:raise ValueError('ACCEPTANCE_REQUIRED:'+gate)
 if socket.gethostname()!=m['baselineHost']:raise ValueError('WRONG_HOST')
 if subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()!=m['baselineHead']:raise ValueError('BASELINE_HEAD_DRIFT')
 for rel,expected in m['baselineSha256'].items():
  if digest(safe_file(root,rel))!=expected:raise ValueError('BASELINE_HASH_DRIFT:'+rel)
 if 'dist/index.html' not in m['payloadSha256']:raise ValueError('PREPARED_FRONTEND_PAYLOAD_REQUIRED')
 # Never treat booleans alone as runtime readiness; invoke independent prerequisites.
 subprocess.run([sys.executable,str(package/'scripts/release-documents/preflight.py'),'--root',str(root),'--manifest',str(package/'manifest.json')],check=True)
 parent=pathlib.Path(a.backup_root).resolve(strict=True)
 if parent==root or root in parent.parents or parent==package or package in parent.parents:raise ValueError('PRIVATE_BACKUP_ROOT_REQUIRED')
 import fcntl
 with (parent/'.documents-cutover.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
  backup=parent/('documents-'+stamp)
  def restart():subprocess.run(['sudo','-n','systemctl','restart','clover-api.service','clover-ui.service'],check=True)
  def health():
   for url in ['http://127.0.0.1:4100/api/health','http://127.0.0.1:5273/']:
    ready=False
    for _ in range(120):
     try:
      with urllib.request.urlopen(url,timeout=2) as r:ready=r.status==200
      if ready:break
     except Exception:pass
     time.sleep(1)
    if not ready:raise ValueError('HEALTH_FAILED')
  def stop():subprocess.run(['sudo','-n','systemctl','stop','clover-api.service','clover-ui.service'],check=True)
  cutover(root,package/'payload',backup,m['payloadSha256'],restart,health,stop)
if __name__=='__main__':main()
