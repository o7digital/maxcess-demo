#!/usr/bin/python3
"""Root-only backup of the isolated Maxcess service, with pinned off-host transfer."""
import datetime,fcntl,hashlib,json,os,pathlib,subprocess,tarfile,tempfile
os.umask(0o077)
base=pathlib.Path('/opt/o7/apps/maxcess');dest=pathlib.Path('/mnt/maildata/maxcess/backups')
lock=open(base/'backup.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
with tempfile.TemporaryDirectory(dir=dest,prefix='.backup-') as tmp:
 root=pathlib.Path(tmp)
 with (root/'database.dump').open('wb') as out:
  subprocess.run(['docker','exec','maxcess-postgres','pg_dump','-U','maxcess','-d','maxcess','-Fc','--no-owner','--no-acl'],stdout=out,check=True,timeout=300)
 target=dest/('maxcess-'+stamp+'.tgz')
 with tarfile.open(target,'w:gz') as archive:
  archive.add(root/'database.dump',arcname='database.dump')
  for name in ['app.env','postgres.env','compose.yml','nginx-location.conf']:
   archive.add(base/name,arcname=name)
 def digest(path):
  h=hashlib.sha256()
  with path.open('rb') as f:
   for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
  return h.hexdigest()
 with target.open('rb') as data:
  result=subprocess.run(['ssh','-T','-i',str(base/'backup_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(base/'backup_known_hosts'),'-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=2','ubuntu@92.222.23.247'],stdin=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=300)
 remote=json.loads(result.stdout)
 assert remote['sha256']==digest(target),'Off-host backup hash mismatch'
 report={'finished_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'local_file':str(target),'offsite_host':'92.222.23.247','offsite_file':remote['file'],'sha256_verified':True,'bytes':target.stat().st_size}
 (base/'backup-status.json').write_text(json.dumps(report,indent=2)+'\n')
 for old in sorted(dest.glob('maxcess-*.tgz'))[:-7]:old.unlink()
 print(json.dumps(report))
