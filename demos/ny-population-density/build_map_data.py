"""Pack the validated NY GeoPackage for the demo. Requires GDAL Python bindings and h3-py."""
from collections import Counter
import gzip
import json
import math
from pathlib import Path
import struct
import sys

import h3
from osgeo import ogr, osr

ORIGIN_X, ORIGIN_Y = 1_660_000, 2_405_000
STEP = 12
SQUARE_METERS_PER_SQUARE_MILE = 1609.344 ** 2
COARSER_GRIDS = ((7, 8), (6, 21), (5, 56))
PLACES = [
    ("New York City", -73.98, 40.75, 43),
    ("Buffalo", -78.87, 42.89, 54),
    ("Rochester", -77.61, 43.16, 55),
    ("Syracuse", -76.15, 43.05, 55),
    ("Albany", -73.76, 42.65, 60),
    ("Binghamton", -75.9131, 42.1008, 52),
    ("Watertown", -75.9108, 43.9748, 52),
    ("Plattsburgh", -73.4519, 44.7008, 52),
]
HOVER_CITIES = [
    ("Rome", -75.45573, 43.21285),
    ("Utica", -75.2327, 43.1009),
    ("Ithaca", -76.495, 42.4425),
    ("Jamestown", -79.2421, 42.099),
    ("Fredonia", -79.3314, 42.44),
    ("Elmira", -76.8077, 42.0898),
    ("Amsterdam", -74.1882, 42.9387),
    ("Saratoga Springs", -73.7846, 43.0831),
    ("White Plains", -73.76291, 41.03399),
    ("Poughkeepsie", -73.921, 41.7004),
    ("Lake Placid", -73.98296, 44.28233),
    ("Saranac Lake", -74.13128, 44.3295),
    ("Keene", -73.7924, 44.2563),
    ("Keene Valley", -73.78633, 44.18997),
    ("Elizabethtown", -73.59056, 44.21639),
    ("Jay", -73.7282, 44.37505),
    ("Peru", -73.53056, 44.57944),
    ("Newcomb", -74.165, 43.96944),
    ("Long Lake", -74.42028, 43.97167),
    ("Minerva", -73.9843, 43.79145),
    ("Wevertown", -73.94099, 43.6334),
    ("Pottersville", -73.8193, 43.73118),
    ("Schroon Lake", -73.76167, 43.83833),
    ("Schroon Falls", -73.74874, 43.89923),
    ("Underwood", -73.67611, 44.08783),
    ("New Russia", -73.61152, 44.16339),
    ("Wilmington", -73.81528, 44.38861),
    ("Upper Jay", -73.7757, 44.33644),
    ("St. Huberts", -73.767, 44.15),
    ("North Creek", -73.98639, 43.69778),
]


def build_parent_grids(populations, transform, output):
    levels = []
    for resolution, radius_step in COARSER_GRIDS:
        parents = Counter()
        for cell, population in populations:
            parents[h3.cell_to_parent(cell, resolution)] += population

        cells = []
        total_area = 0
        for cell, population in parents.items():
            lat, lon = h3.cell_to_latlng(cell)
            x, y, _ = transform.TransformPoint(lon, lat)
            ring = ogr.Geometry(ogr.wkbLinearRing)
            for lat, lon in h3.cell_to_boundary(cell):
                vx, vy, _ = transform.TransformPoint(lon, lat)
                ring.AddPoint_2D(vx, vy)
            ring.CloseRings()
            polygon = ogr.Geometry(ogr.wkbPolygon)
            polygon.AddGeometry(ring)
            area = polygon.GetArea() / SQUARE_METERS_PER_SQUARE_MILE
            total_area += area
            vx, vy, _ = ring.GetPoint(0)
            radius = math.hypot(vx - x, vy - y)
            angle = math.atan2(vy - y, vx - x) % (math.pi / 3)
            cells.append((round((x - ORIGIN_X) / STEP), round((ORIGIN_Y - y) / STEP),
                          population / area, population, round(radius / radius_step),
                          round(angle * 255 / (math.pi / 3))))

        assert sum(cell[3] for cell in cells) == sum(population for _, population in populations)
        cells.sort(key=lambda cell: (cell[1], cell[0]))
        name = f"cells-r{resolution}.bin"
        raw = b"".join(struct.pack("<hhfIBB", *cell) for cell in cells)
        (output / name).write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
        levels.append(dict(count=len(cells), chunks=[name], radiusStep=radius_step / 1000,
                           averageArea=total_area / len(cells), resolution=resolution))
    (output / "levels.json").write_text(json.dumps(levels, separators=(",", ":")) + "\n")


def main(source, output):
    output.mkdir(parents=True, exist_ok=True)
    dataset = ogr.Open(source)
    cells = []
    populations = []
    for f in dataset.GetLayerByName("kontur_hexagons"):
        polygon = f.GetGeometryRef()
        center = polygon.Centroid()
        x, y = center.GetX(), center.GetY()
        ring = polygon.GetGeometryRef(0)
        vx, vy, _ = ring.GetPoint(0)
        radius = math.hypot(vx - x, vy - y)
        angle = math.atan2(vy - y, vx - x) % (math.pi / 3)
        density, pop = f["people_per_sq_mi"], f["population"]
        populations.append((f["h3"], pop))
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
    build_parent_grids(populations, tx, output)
    def map_place(name, lon, lat):
        x, y, _ = tx.TransformPoint(lon, lat)
        return dict(name=name, x=round((x-ORIGIN_X)/1000, 3),
                    z=round((ORIGIN_Y-y)/1000, 3))

    places = [dict(map_place(name, lon, lat), distance=distance)
              for name, lon, lat, distance in PLACES]
    hover_cities = [map_place(name, lon, lat) for name, lon, lat in HOVER_CITIES]
    meta = dict(count=len(cells), step=STEP / 1000, chunks=chunks, outline=polygons,
                places=places, hoverCities=hover_cities)
    (output / "map.json").write_text(json.dumps(meta, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main(sys.argv[1], Path(sys.argv[2]))
