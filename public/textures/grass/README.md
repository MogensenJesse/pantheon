# Grass textures

## Bermuda (procedural blades)

**Source:** [grass_bermuda_01 on Poly Haven](https://polyhaven.com/a/grass_bermuda_01) (CC0).  
Authoring files live in `models/textures/grass-bermuda/` (gitignored).

| File | Source |
|------|--------|
| `bermuda_diffuse.jpg` | `textures/grass_bermuda_01_diff_1k.jpg` |
| `bermuda_alpha.png` | `textures/grass_bermuda_01_alpha_1k.png` |

Refresh from models:

```powershell
Copy-Item models/textures/grass-bermuda/textures/grass_bermuda_01_diff_1k.jpg public/textures/grass/bermuda_diffuse.jpg -Force
Copy-Item models/textures/grass-bermuda/textures/grass_bermuda_01_alpha_1k.png public/textures/grass/bermuda_alpha.png -Force
```

Normal/rough EXRs stay in `models/` until Phase 3 (web needs JPG/PNG conversion).

## Foliage001 (legacy — unused)

Former billboard textures for removed `GrassImpostor.ts`; safe to delete if disk space matters.

**Source:** [Foliage001 on ambientCG](https://ambientcg.com/view?id=Foliage001) (CC0).

| File | ambientCG original |
|------|-------------------|
| `foliage_color.jpg` | `Foliage001_1K-JPG_Color.jpg` |
| `foliage_opacity.jpg` | `Foliage001_1K-JPG_Opacity.jpg` |

## Refresh from download

```powershell
# 1K JPG pack (~4 MB)
Invoke-WebRequest -Uri "https://ambientcg.com/get?file=Foliage001_1K-JPG.zip" -OutFile "Foliage001_1K-JPG.zip"
Expand-Archive Foliage001_1K-JPG.zip -DestinationPath extracted -Force
Copy-Item extracted/Foliage001_1K-JPG_Color.jpg foliage_color.jpg -Force
Copy-Item extracted/Foliage001_1K-JPG_Opacity.jpg foliage_opacity.jpg -Force
```

2K/4K packs are optional if you want sharper blades up close.
