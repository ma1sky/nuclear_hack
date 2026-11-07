import tempfile
from pathlib import Path
from score_benchmark import der,wer
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'ref.rttm'; p.write_text('SPEAKER x 1 0.0 1.0 <NA> <NA> a <NA> <NA>\nSPEAKER x 1 1.0 1.0 <NA> <NA> b <NA> <NA>\n')
 hyp=[dict(speaker_id='other-b',start_ms=0,end_ms=1000),dict(speaker_id='other-a',start_ms=1000,end_ms=2000)]
 assert der(p,hyp,2)['der']==0, 'Speaker IDs must be permutation-invariant'
 assert der(p,[dict(speaker_id='one',start_ms=0,end_ms=2000)],2)['der']==.5
 p.write_text('SPEAKER x 1 0.0 1.0 <NA> <NA> a <NA> <NA>\nSPEAKER x 1 0.0 1.0 <NA> <NA> b <NA> <NA>\n')
 assert der(p,[dict(speaker_id='one',start_ms=0,end_ms=1000)],1)['der']==.5, 'Overlap miss must count'
 assert wer('Ёж, идёт!','еж идет')['wer']==0
 assert wer('раз два три','раз три')['edit_distance']==1
print('Scoring self-checks passed')

# Cross-check polynomial matching against independent brute-force assignments.
import numpy as np,itertools
from speaker_assignment import maximum_overlap
rng=np.random.default_rng(7)
for rows in range(1,5):
 for cols in range(1,6):
  a=rng.integers(0,20,size=(rows,cols))
  padded=np.pad(a,((0,0),(0,max(0,rows-cols))))
  expected=max(sum(int(padded[i,j]) for i,j in enumerate(p)) for p in itertools.permutations(range(padded.shape[1]),rows))
  assert maximum_overlap(a)==expected
a=np.zeros((3,64),dtype=int); a[0,63]=7; a[1,32]=9; a[2,0]=11
assert maximum_overlap(a)==27
print('Large-cluster and exhaustive matching checks passed')
