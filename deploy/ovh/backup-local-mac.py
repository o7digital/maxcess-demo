#!/usr/bin/python3
"""Private Mac copy of the latest verified Service Hub ZIP (no server credentials embedded)."""
import datetime,hashlib,json,os,pathlib,shlex,subprocess,tempfile,time,zipfile
os.umask(0o077)
root=pathlib.Path.home()/'Documents'/'ServiceHub Backups';root.mkdir(parents=True,mode=0o700,exist_ok=True);os.chmod(root,0o700)
status=root/'sync-status.json'
remote="""import pathlib,json,hashlib
p=max(pathlib.Path('/srv/maxcess-backups').glob('maxcess-*.zip'),key=lambda p:p.stat().st_mtime)
h=hashlib.sha256()
with p.open('rb') as f:
 for c in iter(lambda:f.read(1048576),b''):h.update(c)
print(json.dumps({'file':str(p),'sha256':h.hexdigest(),'mtime':p.stat().st_mtime}))
"""
ssh=['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=2','ubuntu@92.222.23.247']
report={'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':False}
try:
 meta=json.loads(subprocess.check_output(ssh+['sudo python3 -c '+shlex.quote(remote)],timeout=60))
 source=pathlib.PurePosixPath(meta['file']);assert source.parent==pathlib.PurePosixPath('/srv/maxcess-backups') and source.name.startswith('maxcess-') and source.suffix=='.zip'
 assert time.time()-meta['mtime']<3*3600,'Latest VPS2 backup is more than three hours old'
 target=root/source.name
 def digest(p):
  h=hashlib.sha256()
  with p.open('rb') as f:
   for c in iter(lambda:f.read(1048576),b''):h.update(c)
  return h.hexdigest()
 if not target.exists() or digest(target)!=meta['sha256']:
  fd,tmp=tempfile.mkstemp(prefix='.incoming-',dir=root)
  try:
   with os.fdopen(fd,'wb') as out:subprocess.run(ssh+['sudo cat '+shlex.quote(str(source))],stdout=out,check=True,timeout=300)
   pending=pathlib.Path(tmp);assert digest(pending)==meta['sha256'],'Local SHA256 mismatch'
   with zipfile.ZipFile(pending) as z:assert z.testzip() is None,'Local ZIP CRC mismatch'
   os.replace(pending,target)
  finally:
   if os.path.exists(tmp):os.unlink(tmp)
 files=sorted(root.glob('maxcess-*.zip'),reverse=True);keep=set(files[:48]);days=set()
 for p in files:
  day=p.name[8:16]
  if day not in days and len(days)<30:keep.add(p);days.add(day)
 for p in files:
  if p not in keep:p.unlink()
 report.update(passed=True,local_file=str(target),sha256=meta['sha256'],bytes=target.stat().st_size)
except Exception as e:
 report['error']=str(e);raise
finally:
 status.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
