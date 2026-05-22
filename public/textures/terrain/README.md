# Terrain ground textures

Tileable 2K maps per biome. The game loads **five map types** (plus optional rock metalness).

## File naming (`public/textures/terrain/`)

| Map | Filename pattern | Source in `models/textures/<biome>/` |
|-----|------------------|--------------------------------------|
| Color | `{biome}.jpg` | `*_Color.jpg` |
| Normal | `{biome}_normal.jpg` | `*_NormalGL.jpg` |
| Roughness | `{biome}_roughness.jpg` | `*_Roughness.jpg` |
| AO | `{biome}_ao.jpg` | `*_AmbientOcclusion.jpg` |
| Displacement | `{biome}_displacement.jpg` | `*_Displacement.jpg` |
| Metalness | `rock_metalness.jpg` | `rock/*_Metalness.jpg` (rock only) |

Biomes: `shore`, `forest`, `hills`, `rock`, `path`.

### Ground cover (hybrid grass — shader layer)

| Map | File | Source pack |
|-----|------|-------------|
| Color | `ground_cover.jpg` | `models/textures/forest-2/textures/forrest_ground_01_diff_2k.jpg` |

Roughness is a shader uniform (`TERRAIN_GROUND_COVER.ROUGHNESS`) to stay within WebGPU’s 16 texture limit.

`brown-mud-leaves` is reserved for a future shore/mud transition overlay (not wired yet).

```powershell
$src = "models/textures/forest-2/textures"
$dest = "public/textures/terrain"
Copy-Item "$src/forrest_ground_01_diff_2k.jpg" "$dest/ground_cover.jpg" -Force
```

`.png` / `.webp` also work. Missing files use 1×1 fallbacks (game still runs).

## VRAM

Full 2K sets for five biomes use significant GPU memory. You can downscale to 1K later if needed.

## Refresh copies from `models/textures`

```powershell
$biomes = @{ shore='Ground054_2K-JPG'; forest='Ground086_2K-JPG'; hills='Ground103_2K-JPG'; rock='Rock051_2K-JPG'; path='Ground086_2K-JPG' }
foreach ($b in $biomes.Keys) {
  $p = $biomes[$b]; $s = "models/textures/$b"; $d = "public/textures/terrain"
  Copy-Item "$s/${p}_Color.jpg" "$d/$b.jpg" -Force
  Copy-Item "$s/${p}_NormalGL.jpg" "$d/${b}_normal.jpg" -Force
  Copy-Item "$s/${p}_Roughness.jpg" "$d/${b}_roughness.jpg" -Force
  Copy-Item "$s/${p}_AmbientOcclusion.jpg" "$d/${b}_ao.jpg" -Force
  Copy-Item "$s/${p}_Displacement.jpg" "$d/${b}_displacement.jpg" -Force
}
Copy-Item "models/textures/rock/Rock051_2K-JPG_Metalness.jpg" "public/textures/terrain/rock_metalness.jpg" -Force
```
