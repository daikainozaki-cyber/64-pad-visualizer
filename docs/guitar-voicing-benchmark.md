# Guitar Voicing Benchmark: 64PE vs JGuitar

**Date**: 2026-03-17
**64PE Version**: V3.36.1
**Source**: jguitar.com (page 1+2, all positions)

## Summary

| Category | Match Rate | Notes |
|----------|-----------|-------|
| Basic triads (C,Am,G,D,E,F) | 6/6 (100%) | All match |
| Basic 7ths (C7,Cmaj7,Am7,G7,Dm7) | 5/5 (100%) | All match after wOpenStr tuning |
| Sharp-key triads (C#m,F#m,Bm) | 2/3 (67%) | C#m miss (fingering filter needed) |
| Sharp-key 7ths (C#m7,Bm7,F#m7) | 2/3 (67%) | C#m7 miss (same root cause) |
| sus4 triads | 4/5 (80%) | Dsus4 goes too minimal |
| 7sus4 | 1/5 (20%) | Open-string bonus too strong |
| Multi-tension (9,11,13) | 1/4 (25%) | Open-string bias pushes barre down |
| **Overall** | **21/31 (68%)** | |

## Remaining Issues

1. **C#m/C#m7**: Unplayable open-string stretch ranks above standard barre → fingering filter
2. **7sus4/tensions**: Open-string bonus too strong for complex chords → need stringCount rebalance
3. **Dsus4**: 3-note open form beats 4-note standard form

## Full Data

### JGuitar Reference (all positions, low E → high E notation)

#### Basic Triads
```
C:    x,3,2,0,1,0 | x,3,5,5,5,3 | x,3,2,0,1,3 | 8,10,10,9,8,8 | 8,7,5,5,5,8 | 8,7,5,5,8,x | x,15,14,12,13,12 | x,15,17,17,17,15 | 20,22,22,21,20,20 | x,x,10,12,13,12 | 20,19,17,17,17,20 | 20,19,17,17,20,x
Am:   x,0,2,2,1,0 | 5,7,7,5,5,5 | 5,7,7,5,5,8 | 5,3,2,2,5,x | 5,3,2,5,x,x | 17,19,19,17,17,17 | x,12,14,14,13,12 | x,x,7,9,10,8 | 17,19,19,17,17,20 | x,12,10,9,10,x | 17,15,14,14,17,x | 17,15,14,17,x,x
G:    3,2,0,0,0,3 | 3,2,0,0,3,3 | 3,5,5,4,3,3 | x,10,9,7,8,7 | x,x,5,7,8,7 | x,10,12,12,12,10 | 15,17,17,16,15,15 | 15,14,12,12,12,15 | 15,14,12,12,15,x | x,22,21,19,20,19 | x,x,17,19,20,19
D:    x,x,0,2,3,2 | x,5,4,2,3,2 | x,5,7,7,7,5 | 10,12,12,11,10,10 | 10,9,7,7,7,10 | 10,9,7,7,10,x | x,17,16,14,15,14 | x,17,19,19,19,17 | x,x,12,14,15,14 | 22,21,19,19,19,22 | 22,21,19,19,22,x
E:    0,2,2,1,0,0 | x,7,6,4,5,4 | x,x,2,4,5,4 | x,7,9,9,9,7 | 12,14,14,13,12,12 | 12,11,9,9,9,12 | 12,11,9,9,12,x | x,19,18,16,17,16 | x,19,21,21,21,19 | x,x,14,16,17,16
F:    1,3,3,2,1,1 | 1,0,3,2,1,x | x,8,7,5,6,5 | x,x,3,5,6,5 | x,8,10,10,10,8 | 13,15,15,14,13,13 | 13,12,10,10,10,13 | 13,12,10,10,13,x | x,20,19,17,18,17 | x,20,22,22,22,20 | x,x,15,17,18,17
```

#### Sharp-key Triads
```
C#m:  x,4,6,6,5,4 | 9,11,11,9,9,9 | x,4,2,1,2,x | 9,11,11,9,9,12 | 9,7,6,6,9,x | 9,7,6,9,x,x | x,16,18,18,17,16 | x,x,11,13,14,12 | x,16,14,13,14,x | 21,19,18,18,21,x | 21,19,18,21,x,x
F#m:  2,4,4,2,2,2 (64PE matches)
Bm:   x,2,4,4,3,2 (64PE matches)
```

#### Basic 7ths
```
C7:    x,3,2,3,1,0 | x,3,5,3,5,3 | 8,10,8,9,8,8 | x,3,5,5,5,6 | x,3,5,3,5,6 | 8,7,5,5,5,6 | 8,7,8,5,5,x | x,3,2,3,5,x | 8,10,8,9,11,8 | 8,7,8,9,x,x | x,x,10,9,11,8 | x,15,17,15,17,15
Cmaj7: x,3,2,0,0,0 | x,3,2,0,0,3 | x,3,5,4,5,3 | 8,10,9,9,8,8 | x,3,2,4,1,x | x,3,2,4,5,x | 8,7,9,9,x,x | 8,7,5,5,5,7 | x,x,10,12,12,12 | x,x,10,9,8,7 | x,15,14,12,12,12 | x,x,10,9,12,12
Am7:   x,0,2,0,1,0 | x,0,2,0,1,3 | x,0,2,2,1,3 | 5,7,5,5,5,5 | 5,7,5,5,8,5 | 5,7,5,5,8,8 | 5,7,7,5,8,5 | 5,7,7,5,8,8 | 5,7,5,5,5,8 | 5,3,5,5,x,x | 5,3,5,2,x,x | x,x,7,9,8,8
G7:    3,2,0,0,0,1 | 3,2,3,0,0,3 | 3,5,3,4,3,3 | 3,2,3,0,3,x | 3,2,3,0,0,1 | 3,2,0,0,3,1 | 3,5,3,4,6,3 | 3,2,3,4,x,x | x,x,5,4,6,3 | x,x,5,7,6,7 | x,x,5,4,6,7 | x,10,12,10,12,10
Dm7:   x,x,0,2,1,1 | x,5,7,5,6,5 | x,5,3,5,3,5 | 10,12,10,10,10,10 | 10,12,10,10,13,10 | 10,12,10,10,13,13 | x,5,7,5,6,8 | 10,12,12,10,13,10 | 10,12,12,10,13,13 | 10,12,10,10,10,13 | x,5,3,5,6,x | x,x,x,7,6,8
```

#### Sharp-key 7ths (Key of A)
```
Amaj7: x,0,2,1,2,0 (64PE matches)
Bm7:   x,2,0,2,0,2 (64PE close: 2,0,0,2,0,2)
C#m7:  x,4,6,4,5,4 (64PE miss: x,4,2,1,0,0)
Dmaj7: x,x,0,2,2,2 (64PE matches)
E7:    0,2,0,1,0,0 (64PE matches)
F#m7:  2,0,2,2,2,0 (64PE matches)
```

#### sus4
```
Csus4:  x,3,3,0,1,1 (64PE matches)
Dsus4:  x,x,0,2,3,3 (64PE miss: x,0,0,0,x,x)
Esus4:  0,0,2,2,0,0 (64PE matches)
Asus4:  x,0,0,2,3,0 (64PE matches)
Gsus4:  3,3,0,0,3,3 (64PE matches)
```

#### 7sus4
```
C7sus4: x,3,3,3,1,1 (64PE matches)
D7sus4: x,x,0,0,1,3 (64PE miss: x,x,0,0,1,x)
E7sus4: 0,0,0,2,0,0 (64PE miss: 0,0,0,x,0,0)
A7sus4: x,0,0,0,3,0 (64PE miss: 0,0,0,0,x,0)
G7sus4: 3,3,3,0,3,x (64PE miss: 3,3,0,0,1,1)
```

#### Multi-tension
```
Am9:   5,7,5,5,5,7 (64PE miss: 5,3,2,0,0,0 — open bias)
Cmaj9: x,3,2,4,3,x (64PE miss: x,3,0,0,0,0 — open bias)
G13:   3,2,3,0,0,0 (64PE matches)
Dm11:  x,5,3,5,3,3 (64PE miss: x,x,0,0,1,1 — open bias)
```

## Scoring Weights (current V3.36.1)

```
wRootBass    = 120
wFifthBass   = 100
wRootStr6    = 50
wRootStr5    = 30
wRootStr4    = 20
wTop4        = 30
wGuideTone   = 40
wOpenStr     = 30  (was 15, tuned 2026-03-17)
wStringCount = 30
wAvgFret     = 15
wSpan        = 10
wGaps        = 15
wFullFret    = 15
openFactor decay = 5.0 (was 2.5, tuned 2026-03-17)
```

## Next Steps

1. Fingering filter: reject physically unplayable voicings (C#m, C#m7)
2. Rebalance stringCount vs openStr for 7sus4 and multi-tension chords
3. Benchmark more keys (especially Bb, Eb, Ab — no open strings)
4. Compare with additional sites (Ultimate Guitar, ChordBank)
