#!/usr/bin/python3
"""Consistent Service Hub ZIP, owner-only, with verified transfer to VPS2."""
import datetime, fcntl, hashlib, json, os, pathlib, subprocess, tempfile, zipfile
os.umask(0o077)
base=pathlib.Path('/opt/o7/apps/maxcess');dest=pathlib.Path('/mnt/maildata/maxcess/backups')
dest.mkdir(mode=0o700,parents=True,exist_ok=True)
lock=open(base/'backup.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')

def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()

def retain():
 files=sorted(dest.glob('maxcess-*.zip'),reverse=True);keep=set(files[:48]);days=set()
 for p in files:
  day=p.name[8:16]
  if day not in days and len(days)<30:keep.add(p);days.add(day)
 for p in files:
  if p not in keep:p.unlink()

with tempfile.TemporaryDirectory(dir=dest,prefix='.backup-') as tmp:
 root=pathlib.Path(tmp)
 # Keep a read-only exported snapshot open while pg_dump takes the same snapshot.
 session=subprocess.Popen(['docker','exec','-i','maxcess-postgres','psql','-X','-Atq','-v','ON_ERROR_STOP=1','-U','maxcess','-d','maxcess'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
 def query(sql):
  session.stdin.write(sql+'\n');session.stdin.flush()
  result=session.stdout.readline().strip()
  if not result:raise RuntimeError('Snapshot session failed')
  return result
 try:
  snapshot=query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot();')
  tables=json.loads(query("SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public';"))
  counts={t:int(query('SELECT count(*) FROM "'+t.replace('"','""')+'";')) for t in tables}
  assets={}
  for table,column in [('ticket_attachments','data'),('workspace_logos','image')]:
   assets[table]=json.loads(query(f"SELECT COALESCE(json_agg(json_build_object('id',id::text,'md5',md5({column}),'bytes',octet_length({column})) ORDER BY id),'[]'::json) FROM {table};"))
  with (root/'database.dump').open('wb') as out:
   subprocess.run(['docker','exec','maxcess-postgres','pg_dump','-U','maxcess','-d','maxcess','-Fc','--no-owner','--no-acl','--snapshot='+snapshot],stdout=out,check=True,timeout=300)
 finally:
  session.stdin.close();session.wait(timeout=30)
 manifest={'format':1,'created_utc':stamp,'database':'PostgreSQL 18','snapshot_consistent':True,'table_counts':counts,'binary_assets':assets,'database_sha256':digest(root/'database.dump')}
 partial=root/'backup.zip';hashes={}
 with zipfile.ZipFile(partial,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
  def add(path,name):
   archive.write(path,name);hashes[name]=digest(path)
  add(root/'database.dump','database.dump')
  for name in ['app.env','postgres.env','compose.yml','nginx-location.conf']:add(base/name,'configuration/'+name)
  for tree in ['source','tls']:
   folder=base/'source' if tree=='source' else pathlib.Path('/opt/o7/mailcow/data/assets/ssl/maxcess/letsencrypt')
   if folder.exists():
    for p in sorted(folder.rglob('*')):
     if p.is_file() and not any(x in p.parts for x in ['node_modules','.git','.local']):add(p,tree+'/'+str(p.relative_to(folder)))
  edge=pathlib.Path('/opt/o7/mailcow/data/conf/nginx/maxcess-servicehub.conf')
  if edge.exists():add(edge,'configuration/edge/maxcess-servicehub.conf')
  manifest['files_sha256']=hashes
  archive.writestr('manifest.json',json.dumps(manifest,indent=2))
  archive.writestr('RESTORE.txt','PRIVATE OPERATOR BACKUP — all workspaces and server secrets. Do not share with a customer.\nRestore database.dump with PostgreSQL 18 pg_restore into an isolated empty database.\nDisable email, jobs, connectors and Stripe webhooks in a restored test environment.\nCompare table counts and attachment/logo byte hashes with manifest.json.\nUse configuration/ and source/ for controlled service reconstruction; never overwrite a live database without a recovery plan.\n')
 with zipfile.ZipFile(partial) as archive:assert archive.testzip() is None,'ZIP CRC failure'
 target=dest/('maxcess-'+stamp+'.zip');os.replace(partial,target);sha=digest(target)
 with target.open('rb') as data:
  result=subprocess.run(['ssh','-T','-i',str(base/'backup_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(base/'backup_known_hosts'),'-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=2','ubuntu@92.222.23.247'],stdin=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=300)
 remote=json.loads(result.stdout);assert remote['sha256']==sha,'Off-host hash mismatch'
 report={'finished_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'local_file':str(target),'offsite_host':'92.222.23.247','offsite_file':remote['file'],'sha256':sha,'sha256_verified':True,'snapshot_consistent':True,'bytes':target.stat().st_size}
 status=base/'backup-status.json';pending=base/'backup-status.json.tmp';pending.write_text(json.dumps(report,indent=2)+'\n');os.replace(pending,status)
 retain();print(json.dumps(report))
