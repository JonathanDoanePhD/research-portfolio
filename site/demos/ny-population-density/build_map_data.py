"""Pack the validated NY GeoPackage for the demo. Requires GDAL Python bindings."""
import gzip
import json
import math
from pathlib import Path
import struct
import sys

from osgeo import ogr, osr

ORIGIN_X, ORIGIN_Y = 1_660_000, 2_405_000
STEP = 12
PLACES = [
    ("New York City", -73.98, 40.75, 43),
    ("Buffalo", -78.87, 42.89, 54),
    ("Rochester", -77.61, 43.16, 55),
    ("Syracuse", -76.15, 43.05, 55),
    ("Albany", -73.76, 42.65, 60),
    ("Tupper Lake", -74.46, 44.23, 56),
]


def main(source, output):
    output.mkdir(parents=True, exist_ok=True)
    dataset = ogr.Open(source)
    cells = []
    for f in dataset.GetLayerByName("kontur_hexagons"):
        polygon = f.GetGeometryRef()
        center = polygon.Centroid()
        x, y = center.GetX(), center.GetY()
        ring = polygon.GetGeometryRef(0)
        vx, vy, _ = ring.GetPoint(0)
        radius = math.hypot(vx - x, vy - y)
        angle = math.atan2(vy - y, vx - x) % (math.pi / 3)
        density, pop = f["people_per_sq_mi"], f["population"]
        cells.append((round((x - ORIGIN_X) / STEP), round((ORIGIN_Y - y) / STEP),
                      density, pop, round(radius / 3), round(angle * 255 / (math.pi / 3))))
    cells.sort(key=lambda cell: (cell[1], cell[0]))
    chunks = []
    for start in range(0, len(cells), 30_000):
        name = f"cells-{len(chunks)}.bin"
        raw = b"".join(struct.pack("<hhfHBB", *cell) for cell in cells[start:start+30_000])
        (output / name).write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
        chunks.append(name)

    outline_layer = dataset.GetLayerByName("ny_cartographic_outline")
    outline_feature = next(iter(outline_layer))
    shape = outline_feature.GetGeometryRef().SimplifyPreserveTopology(220)
    polygons = []
    for polygon in json.loads(shape.ExportToJson())["coordinates"]:
        rings = []
        for ring in polygon:
            rings.append([[round((x-ORIGIN_X)/1000, 3), round((y-ORIGIN_Y)/1000, 3)]
                          for x, y in ring])
        polygons.append(rings)

    wgs = osr.SpatialReference()
    wgs.ImportFromEPSG(4326)
    wgs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    tx = osr.CoordinateTransformation(wgs, outline_layer.GetSpatialRef())
    places = []
    for name, lon, lat, distance in PLACES:
        x, y, _ = tx.TransformPoint(lon, lat)
        places.append(dict(name=name, x=round((x-ORIGIN_X)/1000, 3),
                           z=round((ORIGIN_Y-y)/1000, 3), distance=distance))
    meta = dict(count=len(cells), step=STEP / 1000, chunks=chunks, outline=polygons, places=places)
    (output / "map.json").write_text(json.dumps(meta, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main(sys.argv[1], Path(sys.argv[2]))
