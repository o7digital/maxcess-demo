#!/usr/bin/python3
"""Forced SSH command: bounded ZIP input, fixed private destination, retained copies."""
import datetime,hashlib,json,os,pathlib,sys,tempfile,zipfile
os.umask(0o077)
base=pathlib.Path('/srv/maxcess-backups');base.mkdir(mode=0o700,exist_ok=True)
h=hashlib.sha256();size=0
fd,tmp=tempfile.mkstemp(prefix='.incoming-',dir=base)
try:
 with os.fdopen(fd,'wb') as out:
  while True:
   chunk=sys.stdin.buffer.read(1024*1024)
   if not chunk:break
   size+=len(chunk)
   if size>2*1024**3:raise RuntimeError('Backup exceeds receiver limit')
   out.write(chunk);h.update(chunk)
  out.flush();os.fsync(out.fileno())
 if size<1024:raise RuntimeError('Empty backup')
 with zipfile.ZipFile(tmp) as z:
  if z.testzip() is not None:raise RuntimeError('Invalid ZIP CRC')
  if not {'database.dump','manifest.json','configuration/app.env'}.issubset(z.namelist()):raise RuntimeError('Incomplete backup')
 target=base/('maxcess-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.zip');os.replace(tmp,target)
 files=sorted(base.glob('maxcess-*.zip'),reverse=True);keep=set(files[:48]);days=set()
 for p in files:
  day=p.name[8:16]
  if day not in days and len(days)<30:keep.add(p);days.add(day)
 for p in files:
  if p not in keep:p.unlink()
 print(json.dumps({'file':str(target),'sha256':h.hexdigest(),'bytes':size}))
finally:
 if os.path.exists(tmp):os.unlink(tmp)
