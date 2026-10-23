#!/usr/bin/python3
"""Restore latest ZIP on VPS2 into a disposable network-isolated PostgreSQL 18."""
import datetime,fcntl,hashlib,json,os,pathlib,subprocess,tempfile,time,uuid,zipfile
os.umask(0o077)
base=pathlib.Path('/srv/maxcess-backups');lock=open(base/'restore-test.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
backup=max(base.glob('maxcess-*.zip'),key=lambda p:p.stat().st_mtime)
if time.time()-backup.stat().st_mtime>3*3600:raise RuntimeError('Latest backup is more than three hours old')
name='maxcess-restore-check-'+uuid.uuid4().hex[:10];started=time.monotonic();report={'backup':str(backup),'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':False}
def run(args,**kw):return subprocess.run(args,check=True,**kw)
def sql(q):return subprocess.check_output(['docker','exec',name,'psql','-X','-Atq','-v','ON_ERROR_STOP=1','-U','postgres','-d','restorecheck','-c',q],text=True).strip()
try:
 with tempfile.TemporaryDirectory(dir=base,prefix='.restore-') as tmp:
  dump=pathlib.Path(tmp)/'database.dump'
  with zipfile.ZipFile(backup) as z:
   assert z.testzip() is None
   manifest=json.loads(z.read('manifest.json'))
   with z.open('database.dump') as src,dump.open('wb') as out:
    import shutil
    shutil.copyfileobj(src,out)
  assert hashlib.file_digest(dump.open('rb'),'sha256').hexdigest()==manifest['database_sha256']
  run(['docker','run','-d','--name',name,'--network','none','--memory','384m','--memory-swap','384m','--cpus','0.5','--tmpfs','/var/lib/postgresql:rw,size=512m','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=restorecheck','postgres:18-alpine'],stdout=subprocess.DEVNULL)
  for _ in range(60):
   if subprocess.run(['docker','exec',name,'pg_isready','-U','postgres','-d','restorecheck'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
   time.sleep(1)
  else:raise RuntimeError('Isolated database did not become ready')
  with dump.open('rb') as data:run(['docker','exec','-i',name,'pg_restore','--exit-on-error','--no-owner','--no-acl','-U','postgres','-d','restorecheck'],stdin=data,timeout=300)
  for table,count in manifest['table_counts'].items():
   actual=int(sql('SELECT count(*) FROM "'+table.replace('"','""')+'";'));assert actual==count,(table,actual,count)
  for table,column in [('ticket_attachments','data'),('workspace_logos','image')]:
   assets=json.loads(sql(f"SELECT COALESCE(json_agg(json_build_object('id',id::text,'md5',md5({column}),'bytes',octet_length({column})) ORDER BY id),'[]'::json) FROM {table};"))
   assert assets==manifest['binary_assets'][table],table+' byte verification failed'
  # Demonstrate writes on the recovered DB, then roll them back.
  assert sql("BEGIN; CREATE TABLE backup_restore_probe(id int PRIMARY KEY, value text); INSERT INTO backup_restore_probe VALUES(1,'created'); UPDATE backup_restore_probe SET value='updated' WHERE id=1; SELECT value FROM backup_restore_probe WHERE id=1; ROLLBACK;")=='updated'
  report.update(passed=True,tables_verified=len(manifest['table_counts']),rows_verified=sum(manifest['table_counts'].values()),attachments_verified=len(manifest['binary_assets']['ticket_attachments']),logos_verified=len(manifest['binary_assets']['workspace_logos']),writes_verified=True,network_isolated=True)
except Exception as e:
 report['error']=str(e);raise
finally:
 subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 report['duration_seconds']=round(time.monotonic()-started,2);report['finished_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 (base/'restore-test-status.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
