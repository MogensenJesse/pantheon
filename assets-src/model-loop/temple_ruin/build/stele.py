"""Part 'stele': short carved stone pillar (ref: chipped overhanging cap slab, recessed neck, shaft with one big spiral-key panel and a fluted strip
under it, moss patches). Built on column.py. stele_a is whole; stele_b has a mirrored key, no flutes and a corner knocked off its cap."""
import column

VARIANTS = {
    "stele_a": dict(seed=113, shaft=(0.3, 0.3), shaft_h=0.86, neck=(0.27, 0.27, 0.12), caps=[(0.42, 0.4, 0.2)], panels=(0.62,), flutes=(0.2, 0.2), moss=0.34,
                    spots=[((0.2, -0.18, 1.16), 0.42), ((-0.15, -0.15, 0.3), 0.42), ((-0.15, 0.15, 0.9), 0.3)]),
    "stele_b": dict(seed=112, shaft=(0.3, 0.3), shaft_h=0.7, neck=(0.27, 0.27, 0.12), caps=[(0.4, 0.42, 0.2)], panels=(0.52,), flutes=None, moss=0.32, mirror0=True,
                    spots=[((-0.18, 0.18, 1.0), 0.42), ((0.15, -0.15, 0.25), 0.4)]),
}


def build_all():
    for name, v in VARIANTS.items():
        column.build(name, v["seed"], v["shaft"], v["shaft_h"], neck=v["neck"], caps=v["caps"], panels=v["panels"], panel_size=0.24, bar=0.036, relief=0.02,
                     mirror0=v.get("mirror0", False), faces=1, flutes=v["flutes"], moss=v["moss"], spots=v["spots"])
    return list(VARIANTS)
