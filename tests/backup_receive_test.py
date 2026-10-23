"""Receiver rejects incomplete/corrupt archives and leaves accepted backups intact."""
import io,json,pathlib,subprocess,tempfile,unittest,zipfile
SOURCE=(pathlib.Path(__file__).parents[1]/'deploy/ovh/backup-receive.py').read_text()
class ReceiverTest(unittest.TestCase):
 def archive(self,complete=True):
  out=io.BytesIO()
  with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_STORED) as z:
   z.writestr('database.dump',b'x'*2048)
   if complete:z.writestr('manifest.json','{}');z.writestr('configuration/app.env','fixture only')
  return out.getvalue()
 def invoke(self,data,folder,source=SOURCE):
  return subprocess.run(['python3','-c',source.replace('/srv/maxcess-backups',str(folder))],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 def test_valid_zip_accepted_with_exact_hash(self):
  import hashlib
  with tempfile.TemporaryDirectory() as folder:
   data=self.archive();r=self.invoke(data,folder);self.assertEqual(r.returncode,0,r.stderr);meta=json.loads(r.stdout);self.assertEqual(meta['sha256'],hashlib.sha256(data).hexdigest());self.assertEqual(pathlib.Path(meta['file']).read_bytes(),data)
 def test_incomplete_or_corrupt_zip_does_not_replace_good_copy(self):
  with tempfile.TemporaryDirectory() as folder:
   good=self.invoke(self.archive(),folder);self.assertEqual(good.returncode,0)
   corrupt=bytearray(self.archive());corrupt[100]^=1
   for data in [self.archive(False),bytes(corrupt),b'garbage'*300]:
    self.assertNotEqual(self.invoke(data,folder).returncode,0)
    self.assertEqual(len(list(pathlib.Path(folder).glob('maxcess-*.zip'))),1)
    self.assertEqual(list(pathlib.Path(folder).glob('.incoming-*')),[])
 def test_size_limit_rejects_without_partial_file(self):
  with tempfile.TemporaryDirectory() as folder:
   r=self.invoke(self.archive(),folder,SOURCE.replace('2*1024**3','1024'));self.assertNotEqual(r.returncode,0);self.assertEqual(list(pathlib.Path(folder).iterdir()),[])
if __name__=='__main__':unittest.main()
