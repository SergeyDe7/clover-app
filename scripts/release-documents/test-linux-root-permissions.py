#!/usr/bin/env python3
"""Actual-root Linux permission regression in a new isolated TEST directory only."""
import importlib.util,pathlib,shutil,subprocess,os,pwd,datetime
from unittest.mock import patch
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('cutover',HERE/'install-production.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
if os.geteuid()!=0:raise ValueError('ROOT_TEST_REQUIRED')
stage=pathlib.Path('/opt/clover/contracts-test-staging-20261007/staging')
parent=pathlib.Path('/tmp')
root=parent/('clover-contract-root-permission-fixture-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
root.mkdir(mode=0o755,exist_ok=False)
shutil.copytree(stage/'server/src',root/'server/src');shutil.copytree(stage/'src',root/'src');shutil.copytree(stage/'dist',root/'dist')
shutil.copy2(stage/'package.json',root/'package.json');shutil.copy2(stage/'server/package.json',root/'server/package.json')
(root/'server/node_modules').symlink_to(stage/'server/node_modules',target_is_directory=True)
# Existing application ancestors and unrelated source are public/readable in this fixture.
for p in [root,*root.rglob('*')]:
 if not p.is_symlink():os.chmod(p,0o755 if p.is_dir() else 0o644)
for rel in ['server/src/documents','src/screens/documents','src/shared/contracts']:
 tree=root/rel
 for p in [tree,*tree.rglob('*')]:
  if not p.is_symlink():os.chown(p,0,0);os.chmod(p,0o700 if p.is_dir() else 0o600)
failed=False
actual_run=subprocess.run
try:
 with patch.object(c.subprocess,'run',side_effect=lambda *a,**kw:actual_run(*a,**kw,stdout=subprocess.PIPE,stderr=subprocess.PIPE)):
  c.verify_clover_module_import(root)
except subprocess.CalledProcessError:failed=True
if not failed:raise ValueError('ROOT700_FIXTURE_DID_NOT_REPRODUCE')
c.prepare_contract_source_permissions(root);c.prepare_public_dist_permissions(root);c.verify_clover_module_import(root)
subprocess.run(['runuser','-u','clover','--','test','-r',str(root/'server/src/documents/runtime.js')],check=True)
# Nobody represents a public reverse proxy outside the clover owner/group.
subprocess.run(['runuser','-u','nobody','--','test','-r',str(root/'dist/index.html')],check=True)
(root/'ROOT_PERMISSION_ACCEPTANCE.txt').write_text('PASS root700 failure reproduced; scoped clover ownership repaired; actual-clover Node runtime import PASS; public dist read as nobody PASS\n')
print('PASS isolated ROOT_PERMISSION_ACCEPTANCE; fixture='+str(root))
