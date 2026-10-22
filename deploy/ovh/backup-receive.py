#!/usr/bin/python3
"""Forced SSH command: accepts one bounded backup, never a caller-supplied path."""
import datetime,hashlib,json,os,pathlib,sys,tempfile
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
 target=base/('maxcess-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.tgz')
 os.replace(tmp,target)
 for old in sorted(base.glob('maxcess-*.tgz'))[:-7]:old.unlink()
 print(json.dumps({'file':str(target),'sha256':h.hexdigest(),'bytes':size}))
finally:
 if os.path.exists(tmp):os.unlink(tmp)
