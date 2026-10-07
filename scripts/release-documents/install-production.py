#!/usr/bin/env python3
"""Production documents installer. Root runs only from an operator's SSH tty.
Never restores the live SQLite snapshot: rollback preserves new business writes.
"""
import argparse,datetime,fcntl,getpass,hashlib,json,os,pathlib,pwd,shutil,socket,sqlite3,subprocess,sys,time,urllib.request
UNITS=['clover-api.service','clover-ui.service']
ROOT=pathlib.Path('/opt/clover/clover-app')
ACCEPTED_STAGE=pathlib.Path('/opt/clover/contracts-test-staging-20261007/staging')
ENV=pathlib.Path('/etc/clover/contracts.env')
DROPIN=pathlib.Path('/etc/systemd/system/clover-api.service.d/contracts.conf')

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def under(root,rel):
 p=pathlib.PurePosixPath(rel)
 if p.is_absolute() or '..' in p.parts or not p.parts:raise ValueError('UNSAFE_RELATIVE_PATH')
 target=root.joinpath(*p.parts)
 for parent in [target,*target.parents]:
  if parent==root.parent:break
  if parent.is_symlink():raise ValueError('SYMLINK_PATH_REFUSED')
 if root.resolve() not in target.resolve().parents:raise ValueError('PATH_ESCAPE')
 return target

def source_allowed(rel):
 return rel.startswith(('server/src/documents/','src/screens/documents/','src/shared/contracts/')) or rel in ['package-lock.json','server/src/server.js','server/src/staffPolicy.js','server/package.json','server/package-lock.json','src/screens/manager/ManagerScreen.jsx','src/serverApi.js','src/shared/appHelpers.js','src/shared/i18n/uiCatalog.js','server/scripts/backup-documents.mjs','server/scripts/extract-document-local.py','server/scripts/migrate-documents.mjs']

def tree_hashes(root):
 return {p.relative_to(root).as_posix():digest(p) for p in sorted(root.rglob('*')) if p.is_file() and not p.is_symlink()}

def verify_tree(root,expected):
 for link in root.rglob('*'):
  if link.is_symlink() and root.resolve() not in link.resolve().parents:raise ValueError('ARTIFACT_SYMLINK_ESCAPE')
 for rel,hash in expected.items():
  p=under(root,rel)
  if not p.is_file() or digest(p)!=hash:raise ValueError('ARTIFACT_HASH_FAILED:'+rel)
 if set(tree_hashes(root))!=set(expected):raise ValueError('ARTIFACT_UNEXPECTED_FILES')

def backup_database(database,backup):
 source=sqlite3.connect('file:'+str(database)+'?mode=ro',uri=True)
 dest=sqlite3.connect(backup)
 try:source.backup(dest)
 finally:dest.close();source.close()
 os.chmod(backup,0o600)
 restored=backup.with_name('restore-verification.sqlite')
 shutil.copy2(backup,restored)
 db=sqlite3.connect('file:'+str(restored)+'?mode=ro',uri=True)
 try:
  if db.execute('PRAGMA integrity_check').fetchall()!=[('ok',)]:raise ValueError('BACKUP_INTEGRITY_FAILED')
  if db.execute('PRAGMA foreign_key_check').fetchall():raise ValueError('BACKUP_FOREIGN_KEY_FAILED')
 finally:db.close()
 if digest(backup)!=digest(restored):raise ValueError('RESTORE_COPY_HASH_FAILED')
 return digest(backup)

def control(verb):subprocess.run(['systemctl',verb,*UNITS],check=True)
def health():
 for label,url in [('backend','http://127.0.0.1:4100/api/health'),('frontend','http://127.0.0.1:5273/')]:
  for retry in range(45):
   try:
    with urllib.request.urlopen(url,timeout=2) as result:
     if result.status==200:break
   except Exception:pass
   time.sleep(1)
  else:raise ValueError('HEALTH_FAILED:'+label)

def own(path):
 user=pwd.getpwnam('clover');os.chown(path,user.pw_uid,user.pw_gid)
 if path.is_dir():
  for p in path.rglob('*'):
   if not p.is_symlink():os.chown(p,user.pw_uid,user.pw_gid)

def switch_tree(target,candidate,saved):
 if target.is_symlink():raise ValueError('LIVE_TREE_SYMLINK_REFUSED')
 existed=target.exists()
 if existed:target.rename(saved)
 try:candidate.rename(target)
 except BaseException:
  if existed:saved.rename(target)
  raise
 return existed

def restore_tree(target,saved,existed,failed):
 if target.exists():target.rename(failed)
 if existed:saved.rename(target)

def run(m,package,backup_parent,with_ai=False):
 if os.geteuid()!=0:raise ValueError('ROOT_REQUIRED_USE_SUDO_IN_SAME_TTY')
 if socket.gethostname()!=m['baselineHost'] or m['baselineHost']!='7bb07791b941':raise ValueError('WRONG_HOST')
 root=pathlib.Path(m['appRoot']).resolve(strict=True)
 if root!=ROOT or pathlib.Path(m['database']).resolve(strict=True)!=root/'server/data/clover.sqlite':raise ValueError('WRONG_APP_OR_DATABASE')
 for gate in ['installAllowed','linuxAcceptancePassed','publicBuildParityPassed','privateSeedReady','dependenciesReady']:
  if m.get(gate) is not True:raise ValueError('ACCEPTANCE_GATE_REQUIRED:'+gate)
 if subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()!=m['baselineHead']:raise ValueError('HEAD_DRIFT')
 for rel,hash in m['baselineSha256'].items():
  if digest(under(root,rel))!=hash:raise ValueError('BASELINE_DRIFT:'+rel)
 if m.get('aiModel')!='gpt-4.1-mini-2025-04-14':raise ValueError('ACCEPTED_AI_MODEL_REQUIRED')
 hashes={rel:hash for rel,hash in m['payloadSha256'].items() if source_allowed(rel)}
 if not hashes or 'server/src/documents/runtime.js' not in hashes:raise ValueError('SOURCE_PAYLOAD_REQUIRED')
 for rel,hash in hashes.items():
  if digest(under(package/'payload',rel))!=hash:raise ValueError('SOURCE_HASH_FAILED:'+rel)
 stage=pathlib.Path(m['acceptedStage']).resolve(strict=True)
 if stage!=ACCEPTED_STAGE:raise ValueError('WRONG_STAGE')
 verify_tree(stage/'dist',m['distSha256'])
 verify_tree(stage/'server/node_modules',m['dependenciesSha256'])
 templates=pathlib.Path(m['templatesRoot']).resolve(strict=True);verify_tree(templates,m['privateTemplatesSha256'])
 storage=pathlib.Path(m['storageRoot'])
 if storage.is_symlink() or storage.exists() and any(storage.iterdir()):raise ValueError('NEW_EMPTY_PRIVATE_STORAGE_REQUIRED')
 if str(storage) in [str(root/'dist'),str(root/'public')] or root in storage.resolve().parents:raise ValueError('STORAGE_MUST_BE_OUTSIDE_APP')
 parent=backup_parent.resolve(strict=True)
 if root in parent.parents or parent==root or package in parent.parents:raise ValueError('PRIVATE_BACKUP_OUTSIDE_APP_REQUIRED')
 if os.stat(root).st_dev!=os.stat(parent).st_dev:raise ValueError('ATOMIC_BACKUP_SAME_FILESYSTEM_REQUIRED')
 for unit in UNITS:
  config=subprocess.check_output(['systemctl','cat',unit])
  if hashlib.sha256(config).hexdigest()!=m['serviceUnitsSha256'][unit]:raise ValueError('SERVICE_CONFIG_DRIFT:'+unit)
  if subprocess.run(['systemctl','is-active','--quiet',unit]).returncode!=0:raise ValueError('ACTIVE_SERVICE_REQUIRED:'+unit)
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 backup=parent/('contracts-'+stamp);backup.mkdir(mode=0o700)
 key=getpass.getpass('Optional OpenAI API key (empty = AI unavailable, contracts remain available): ') if with_ai else ''
 if key and not all(ch.isascii() and (ch.isalnum() or ch in '_-') for ch in key):raise ValueError('INVALID_KEY')
 # Prepare complete trees before stopping production, leaving old dependencies intact.
 candidate=root/('.contracts-candidate-'+stamp);candidate.mkdir(mode=0o700)
 shutil.copytree(stage/'dist',candidate/'dist',symlinks=False)
 shutil.copytree(stage/'server/node_modules',candidate/'node_modules',symlinks=True)
 own(candidate)
 originals={};trees=[];changed=[];was_stopped=False;database_touched=False
 try:
  control('stop');was_stopped=True
  if any(subprocess.run(['systemctl','is-active','--quiet',unit]).returncode==0 for unit in UNITS):raise ValueError('WRITERS_NOT_STOPPED')
  backup_hash=backup_database(pathlib.Path(m['database']),backup/'database.sqlite')
  for unit in UNITS:
   saved=backup/(unit+'.config.private');saved.write_bytes(subprocess.check_output(['systemctl','cat',unit]));os.chmod(saved,0o600)
  for rel in hashes:
   target=under(root,rel);saved=under(backup/'source',rel);originals[rel]=target.exists()
   if target.exists():saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
  for name,target in [('contracts.env',ENV),('contracts.conf',DROPIN)]:
   if target.is_symlink():raise ValueError('SERVICE_CONFIG_SYMLINK_REFUSED')
   originals[name]=target.exists()
   if target.exists():shutil.copy2(target,backup/name)
  for rel in hashes:
   target=under(root,rel);target.parent.mkdir(parents=True,exist_ok=True);changed.append(rel);shutil.copy2(under(package/'payload',rel),target);own(target)
  for name,target in [('dist',root/'dist'),('node_modules',root/'server/node_modules')]:
   saved=backup/('original-'+name);existed=switch_tree(target,candidate/name,saved);trees.append((name,target,saved,existed))
  storage.mkdir(mode=0o700,parents=True,exist_ok=True);own(storage)
  config=storage/'runtime.json';config.write_text(json.dumps(m['runtimeConfig'])+'\n');os.chmod(config,0o600);own(config)
  python=m['pythonExecutable']
  env=['CLOVER_DOCUMENTS_ENABLED=true','CLOVER_DOCUMENTS_STORAGE_DIR='+str(storage),'CLOVER_DOCUMENTS_CONFIG_FILE='+str(config),'CLOVER_DOCUMENTS_CONVERTER=/usr/bin/libreoffice','CLOVER_DOCUMENTS_FILE_VALIDATOR_PYTHON='+python,'CLOVER_DOCUMENTS_FNS_ENABLED=true','CLOVER_DOCUMENTS_FNS_REQUIRED=true','CLOVER_DOCUMENTS_AI_AUTO_RECOGNITION=true','CLOVER_DOCUMENTS_AI_MODEL='+m['aiModel'],'CLOVER_DOCUMENTS_AI_ONLY_WHEN_NEEDED=false','CLOVER_DOCUMENTS_AI_ENABLED='+('true' if key else 'false'),'CLOVER_DOCUMENTS_AI_EXTERNAL_CONSENT='+('true' if key else 'false')]
  if key:env.append('CLOVER_DOCUMENTS_AI_API_KEY='+key)
  ENV.parent.mkdir(mode=0o755,parents=True,exist_ok=True);ENV.write_text('\n'.join(env)+'\n');os.chmod(ENV,0o600)
  DROPIN.parent.mkdir(mode=0o755,parents=True,exist_ok=True);DROPIN.write_text('[Service]\nEnvironmentFile='+str(ENV)+'\n')
  seed_input=backup/'seed-input.private.json';seed_input.write_text(json.dumps({'appRoot':str(root),'database':m['database'],'templatesRoot':str(templates),'storageRoot':str(storage),'adminId':m['adminId']}));os.chmod(seed_input,0o600)
  database_touched=True
  subprocess.run(['node',str(package/'seed-approved.mjs'),str(seed_input)],check=True,env={'PATH':'/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8'})
  own(storage)
  subprocess.run(['systemctl','daemon-reload'],check=True);control('start');health()
  api_pid=int(subprocess.check_output(['systemctl','show','clover-api.service','--property=MainPID','--value'],text=True).strip())
  if api_pid<=0:raise ValueError('API_PID_REQUIRED')
  runtime_input=backup/'runtime-check.private.json';runtime_input.write_text(json.dumps({'appRoot':str(root),'database':m['database'],'adminId':m['adminId'],'apiPid':api_pid,'expectAI':bool(key)}));os.chmod(runtime_input,0o600)
  subprocess.run(['node',str(package/'verify-runtime.mjs'),str(runtime_input)],check=True,env={'PATH':'/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8'})
  (backup/'ROLLBACK.md').write_text('Source/config/dist/dependency rollback preserves live SQLite and private documents.\nDo not restore database.sqlite over orders or documents written after this cutover.\nOriginal dist/node_modules and source snapshots are retained privately in this directory.\n')
  (backup/'INSTALL_RESULT.txt').write_text('PASS\nBackend health PASS\nFrontend health PASS\nDatabase snapshot/restore-copy integrity PASS\nAdditive schema/seed PASS\nAI='+('configured' if key else 'unavailable; generation remains available')+'\n')
  (backup/'SHA256.json').write_text(json.dumps({'database.sqlite':backup_hash,'source':tree_hashes(backup/'source')},indent=2)+'\n')
  print('PASS: install; backup='+str(backup))
 except BaseException as error:
  rollback_ok=True
  try:control('stop')
  except Exception:rollback_ok=False
  for name,target,saved,existed in reversed(trees):
   try:restore_tree(target,saved,existed,backup/('failed-'+name))
   except Exception:rollback_ok=False
  for rel in reversed(changed):
   try:
    target=under(root,rel)
    if originals[rel]:shutil.copy2(under(backup/'source',rel),target)
    elif target.exists():target.unlink()
   except Exception:rollback_ok=False
  for name,target in [('contracts.env',ENV),('contracts.conf',DROPIN)]:
   if name not in originals:continue
   try:
    if originals[name]:shutil.copy2(backup/name,target)
    elif target.exists():target.unlink()
   except Exception:rollback_ok=False
  # The additive database and private files are retained even after a failed seed/start.
  # Never overwrite orders or generated contracts with the earlier database snapshot.
  try:subprocess.run(['systemctl','daemon-reload'],check=True);control('start');health()
  except Exception:rollback_ok=False
  (backup/'INSTALL_RESULT.txt').write_text('FAIL\nRollback='+str(rollback_ok)+'\nDatabase preserved; additive state='+str(database_touched)+'\nError='+type(error).__name__+'\n')
  raise
 finally:key=''

def main():
 p=argparse.ArgumentParser();p.add_argument('--manifest',required=True);p.add_argument('--package-root',required=True);p.add_argument('--backup-root',required=True);p.add_argument('--approval',required=True);p.add_argument('--configure-ai',action='store_true');a=p.parse_args()
 if a.approval!='PRODUCTION_DOCUMENTS_APPROVED':raise ValueError('APPROVAL_REQUIRED')
 package=pathlib.Path(a.package_root).resolve(strict=True);m=json.loads(pathlib.Path(a.manifest).read_text())
 parent=pathlib.Path(a.backup_root)
 with (parent/'.contracts-install.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);run(m,package,parent,a.configure_ai)
if __name__=='__main__':main()
