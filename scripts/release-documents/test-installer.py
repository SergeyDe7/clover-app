import importlib.util,pathlib,tempfile,sqlite3,sys,types,unittest,hashlib
from unittest.mock import patch
if sys.platform=='win32':
 sys.modules.setdefault('fcntl',types.SimpleNamespace(LOCK_EX=1,LOCK_NB=2,flock=lambda *a:None))
 sys.modules.setdefault('pwd',types.SimpleNamespace())
spec=importlib.util.spec_from_file_location('cutover',pathlib.Path(__file__).with_name('install-production.py'));c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
class Checks(unittest.TestCase):
 def test_sqlite_snapshot_and_restore_copy_preserve_new_writes(self):
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td);database=p/'live.sqlite';db=sqlite3.connect(database);db.execute('CREATE TABLE orders(id INTEGER)');db.execute('INSERT INTO orders VALUES(1)');db.commit()
   hash=c.backup_database(database,p/'backup.sqlite');db.execute('INSERT INTO orders VALUES(2)');db.commit()
   self.assertEqual(db.execute('SELECT count(*) FROM orders').fetchone()[0],2)
   snapshot=sqlite3.connect(p/'restore-verification.sqlite');self.assertEqual(snapshot.execute('SELECT count(*) FROM orders').fetchone()[0],1);snapshot.close();db.close();self.assertEqual(hash,c.digest(p/'backup.sqlite'))
 def test_switch_and_rollback_preserve_original(self):
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td);target=p/'live';candidate=p/'candidate';target.mkdir();candidate.mkdir();(target/'file').write_text('old');(candidate/'file').write_text('new');saved=p/'saved';existed=c.switch_tree(target,candidate,saved);self.assertEqual((target/'file').read_text(),'new');c.restore_tree(target,saved,existed,p/'failed');self.assertEqual((target/'file').read_text(),'old');self.assertEqual((p/'failed/file').read_text(),'new')
 def test_failed_switch_restores_immediately(self):
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td);target=p/'live';target.mkdir();(target/'file').write_text('old')
   with self.assertRaises(FileNotFoundError):c.switch_tree(target,p/'missing',p/'saved')
   self.assertEqual((target/'file').read_text(),'old')
 def test_checksum_and_path_guards(self):
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td);(p/'file').write_text('source');c.verify_tree(p,{'file':c.digest(p/'file')})
   with self.assertRaises(ValueError):c.verify_tree(p,{'file':'bad'})
   with self.assertRaises(ValueError):c.under(p,'../escape')
   self.assertFalse(c.source_allowed('server/.env'));self.assertFalse(c.source_allowed('server/data/live.sqlite'));self.assertTrue(c.source_allowed('server/src/documents/runtime.js'))
 def test_full_health_failure_rolls_back_source_dist_deps_env_without_database_restore(self):
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td);root=p/'app';stage=p/'stage';package=p/'package';backup=p/'backups';storage=p/'private-storage';templates=p/'templates'
   for directory in [root/'server/src',root/'src/screens/documents',root/'src/shared/contracts',root/'server/data',root/'dist',root/'server/node_modules',stage/'dist',stage/'server/node_modules',package/'payload/server/src/documents',backup,templates]:directory.mkdir(parents=True,exist_ok=True)
   (root/'server/src/server.js').write_text('old-source');(root/'dist/index.html').write_text('old-dist');(root/'server/node_modules/dependency.json').write_text('old-dependency')
   (stage/'dist/index.html').write_text('new-dist');(stage/'server/node_modules/dependency.json').write_text('new-dependency')
   (package/'payload/server/src/server.js').write_text('new-source');(package/'payload/server/src/documents/runtime.js').write_text('new-runtime')
   database=root/'server/data/clover.sqlite';db=sqlite3.connect(database);db.execute('CREATE TABLE orders(id INTEGER)');db.execute('INSERT INTO orders VALUES(1)');db.commit();db.close()
   env=p/'etc/contracts.env';dropin=p/'etc/contracts.conf';config=b'fixture-unit-config';state={'active':True,'health':0}
   m={'appRoot':str(root),'database':str(database),'baselineHost':'7bb07791b941','baselineHead':'fixture-head','baselineSha256':{'server/src/server.js':c.digest(root/'server/src/server.js')},'payloadSha256':c.tree_hashes(package/'payload'),'acceptedStage':str(stage),'distSha256':c.tree_hashes(stage/'dist'),'dependenciesSha256':c.tree_hashes(stage/'server/node_modules'),'templatesRoot':str(templates),'privateTemplatesSha256':{},'storageRoot':str(storage),'runtimeConfig':{},'pythonExecutable':'/fixture/python','adminId':'fixture-admin','aiModel':'gpt-4.1-mini-2025-04-14','serviceUnitsSha256':{u:hashlib.sha256(config).hexdigest() for u in c.UNITS}}
   m.update({gate:True for gate in ['installAllowed','linuxAcceptancePassed','publicBuildParityPassed','privateSeedReady','dependenciesReady']})
   def check_output(args,**kw):
    if args[0]=='git':return 'fixture-head\n'
    if args[:2]==['systemctl','cat']:return config
    return '123\n'
   def process(args,**kw):
    if args[0]=='systemctl' and args[1] in ['stop','start']:state['active']=args[1]=='start'
    if args[:2]==['systemctl','is-active']:return types.SimpleNamespace(returncode=0 if state['active'] else 3)
    if args[0]=='node' and 'seed-approved.mjs' in args[1]:
     live=sqlite3.connect(database);live.execute('CREATE TABLE additive_seed(id INTEGER)');live.execute('INSERT INTO orders VALUES(2)');live.commit();live.close()
    return types.SimpleNamespace(returncode=0)
   def health():
    state['health']+=1
    if state['health']==1:raise ValueError('INJECTED_FRONTEND_HEALTH_FAILURE')
   with patch.object(c,'ROOT',root),patch.object(c,'ACCEPTED_STAGE',stage),patch.object(c,'ENV',env),patch.object(c,'DROPIN',dropin),patch.object(c.socket,'gethostname',return_value='7bb07791b941'),patch.object(c.os,'geteuid',return_value=0,create=True),patch.object(c,'PRIVATE_PARENT',storage.parent),patch.object(c,'prepare_private_parent',lambda *a:None),patch.object(c,'own',lambda *a:None),patch.object(c.subprocess,'check_output',side_effect=check_output),patch.object(c.subprocess,'run',side_effect=process),patch.object(c,'health',side_effect=health):
    with self.assertRaisesRegex(ValueError,'INJECTED_FRONTEND_HEALTH_FAILURE'):c.run(m,package,backup)
   self.assertEqual((root/'server/src/server.js').read_text(),'old-source');self.assertFalse((root/'server/src/documents/runtime.js').exists());self.assertEqual((root/'dist/index.html').read_text(),'old-dist');self.assertEqual((root/'server/node_modules/dependency.json').read_text(),'old-dependency');self.assertFalse(env.exists());self.assertFalse(dropin.exists());self.assertTrue(state['active'])
   live=sqlite3.connect(database);self.assertEqual(live.execute('SELECT count(*) FROM orders').fetchone()[0],2);self.assertIsNotNone(live.execute("SELECT name FROM sqlite_master WHERE name='additive_seed'").fetchone());live.close()
   result=next(backup.glob('contracts-*/INSTALL_RESULT.txt')).read_text();self.assertIn('Rollback=True',result);self.assertIn('Database preserved',result)
 def test_root700_private_parent_gets_only_clover_group_traverse(self):
  parent=types.SimpleNamespace(is_symlink=lambda:False,mkdir=lambda **kw:None,stat=lambda:types.SimpleNamespace(st_uid=0))
  with patch.object(c,'PRIVATE_PARENT',parent),patch.object(c.pwd,'getpwnam',return_value=types.SimpleNamespace(pw_uid=123,pw_gid=456),create=True),patch.object(c.os,'chown',create=True) as chown,patch.object(c.os,'chmod') as chmod:
   c.prepare_private_parent(parent);chown.assert_called_once_with(parent,0,456);chmod.assert_called_once_with(parent,0o750)
 def test_private_ai_key_file_requires_fixed_path_owner_and_private_mode(self):
  keyfile=types.SimpleNamespace(is_symlink=lambda:False,is_file=lambda:True,stat=lambda:types.SimpleNamespace(st_uid=123,st_mode=0o100600,st_size=99),read_text=lambda:'{"apiKey":"synthetic-test-key"}')
  with patch.object(c,'AI_KEY_FILE',keyfile),patch.object(c.pwd,'getpwnam',return_value=types.SimpleNamespace(pw_uid=123),create=True):
   self.assertEqual(c.read_ai_key_file(keyfile),'synthetic-test-key')
   keyfile.stat=lambda:types.SimpleNamespace(st_uid=123,st_mode=0o100644,st_size=99)
   with self.assertRaisesRegex(ValueError,'UNSAFE_AI_KEY_FILE_PERMISSIONS'):c.read_ai_key_file(keyfile)
 def test_new_contract_permissions_are_scoped_and_public_dist_readable(self):
  with tempfile.TemporaryDirectory() as td:
   root=pathlib.Path(td);trees=['server/src/documents','src/screens/documents','src/shared/contracts']
   for rel in trees:
    tree=root/rel;tree.mkdir(parents=True);(tree/'module.js').write_text('public source')
   unrelated=root/'server/src/unrelated.js';unrelated.write_text('unchanged')
   dist=root/'dist/assets';dist.mkdir(parents=True);(dist/'bundle.js').write_text('public asset')
   touched=[]
   with patch.object(c,'own',side_effect=lambda p:touched.append(p)),patch.object(c.os,'chmod') as chmod:
    c.prepare_contract_source_permissions(root);c.prepare_public_dist_permissions(root)
   self.assertEqual(touched,[root/rel for rel in trees]);self.assertFalse(any(call.args[0]==unrelated for call in chmod.call_args_list))
   self.assertIn(unittest.mock.call(root/'dist',0o755),chmod.call_args_list);self.assertIn(unittest.mock.call(dist/'bundle.js',0o644),chmod.call_args_list)
 def test_module_import_runs_actual_clover_uid_before_restart(self):
  with patch.object(c.subprocess,'run') as run:c.verify_clover_module_import(pathlib.Path.cwd().resolve())
  args=run.call_args.args[0];self.assertEqual(args[:4],['runuser','-u','clover','--']);self.assertIn('--input-type=module',args);self.assertIn('runtime.js',args[-1]);self.assertTrue(run.call_args.kwargs['check'])
 def test_slow_backend_startup_over45seconds_is_not_restarted(self):
  state={'time':0.0,'requests':0}
  class Ready:
   status=200
   def __enter__(self):return self
   def __exit__(self,*a):return False
  def urlopen(*a,**kw):
   state['requests']+=1
   if state['requests']<=75:raise OSError('synthetic slow startup')
   return Ready()
  def sleep(seconds):state['time']+=seconds
  with patch.object(c.time,'monotonic',side_effect=lambda:state['time']),patch.object(c.time,'sleep',side_effect=sleep),patch.object(c.urllib.request,'urlopen',side_effect=urlopen),patch('builtins.print') as log:
   c.health()
  self.assertEqual(state['time'],75.0);self.assertEqual(state['requests'],77);self.assertEqual(log.call_count,2)
  self.assertIn('elapsed=30s',log.call_args_list[0].args[0]);self.assertIn('elapsed=60s',log.call_args_list[1].args[0])
 def test_health_failure_waits_full_monotonic180seconds(self):
  state={'time':0.0}
  def sleep(seconds):state['time']+=seconds
  with patch.object(c.time,'monotonic',side_effect=lambda:state['time']),patch.object(c.time,'sleep',side_effect=sleep),patch.object(c.urllib.request,'urlopen',side_effect=OSError('synthetic unavailable')),patch('builtins.print'):
   with self.assertRaisesRegex(ValueError,'HEALTH_FAILED:backend'):c.health()
  self.assertEqual(state['time'],180.0)
if __name__=='__main__':unittest.main()
