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
   for directory in [root/'server/src',root/'server/data',root/'dist',root/'server/node_modules',stage/'dist',stage/'server/node_modules',package/'payload/server/src/documents',backup,templates]:directory.mkdir(parents=True,exist_ok=True)
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
   with patch.object(c,'ROOT',root),patch.object(c,'ACCEPTED_STAGE',stage),patch.object(c,'ENV',env),patch.object(c,'DROPIN',dropin),patch.object(c.socket,'gethostname',return_value='7bb07791b941'),patch.object(c.os,'geteuid',return_value=0,create=True),patch.object(c,'own',lambda *a:None),patch.object(c.subprocess,'check_output',side_effect=check_output),patch.object(c.subprocess,'run',side_effect=process),patch.object(c,'health',side_effect=health):
    with self.assertRaisesRegex(ValueError,'INJECTED_FRONTEND_HEALTH_FAILURE'):c.run(m,package,backup)
   self.assertEqual((root/'server/src/server.js').read_text(),'old-source');self.assertFalse((root/'server/src/documents/runtime.js').exists());self.assertEqual((root/'dist/index.html').read_text(),'old-dist');self.assertEqual((root/'server/node_modules/dependency.json').read_text(),'old-dependency');self.assertFalse(env.exists());self.assertFalse(dropin.exists());self.assertTrue(state['active'])
   live=sqlite3.connect(database);self.assertEqual(live.execute('SELECT count(*) FROM orders').fetchone()[0],2);self.assertIsNotNone(live.execute("SELECT name FROM sqlite_master WHERE name='additive_seed'").fetchone());live.close()
   result=next(backup.glob('contracts-*/INSTALL_RESULT.txt')).read_text();self.assertIn('Rollback=True',result);self.assertIn('Database preserved',result)
if __name__=='__main__':unittest.main()
