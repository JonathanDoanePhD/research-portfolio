"""Build the Adirondack loops from a projected NYSDOT State Touring Inventory JSON extract."""
import json
import math
from pathlib import Path
import sys

from osgeo import ogr, osr

# Approximate longitude and latitude used to select each verified route junction.
JUNCTIONS = {
    "Long Lake": (-74.41871, 43.96850),
    "Tupper Lake": (-74.46411, 44.22398),
    "Saranac Lake": (-74.12720, 44.32444),
    "Lake Placid": (-73.98019, 44.27955),
    "Keene north": (-73.79210, 44.25615),
    "Keene south": (-73.78269, 44.23365),
    "Underwood": (-73.68618, 44.10128),
    "Chestertown": (-73.86596, 43.66922),
    "Wevertown": (-73.94112, 43.63340),
    "North Creek": (-73.98868, 43.69711),
    "Elizabethtown": (-73.59820, 44.21255),
    "Jay": (-73.72768, 44.37530),
}

# NY 9N supplies the centerline where it runs concurrently with NY 73.
LOOPS = (
    (
        ("NY28N", "Long Lake", "North Creek"),
        ("NY28", "North Creek", "Wevertown"),
        ("NY8", "Wevertown", "Chestertown"),
        ("US9", "Chestertown", "Underwood"),
        ("NY73", "Underwood", "Keene south"),
        ("NY9N", "Keene south", "Keene north"),
        ("NY73", "Keene north", "Lake Placid"),
        ("NY86", "Lake Placid", "Saranac Lake"),
        ("NY3", "Saranac Lake", "Tupper Lake"),
        ("NY30", "Tupper Lake", "Long Lake"),
    ),
    (
        ("NY73", "Keene south", "Underwood"),
        ("US9", "Underwood", "Elizabethtown"),
        ("NY9N", "Elizabethtown", "Keene south"),
    ),
    (
        ("NY73", "Lake Placid", "Keene north"),
        ("NY9N", "Keene north", "Jay"),
        ("NY86", "Jay", "Lake Placid"),
    ),
)


def route_segment(lines, start, end):
    indexed = [(index, point) for index, line in enumerate(lines) for point in line]
    a, b = (min(range(len(indexed)), key=lambda i: math.dist(indexed[i][1], anchor))
            for anchor in (start, end))
    assert math.dist(indexed[a][1], start) < 40
    assert math.dist(indexed[b][1], end) < 40
    lo, hi = sorted((a, b))
    for index in range(indexed[lo][0], indexed[hi][0]):
        assert math.dist(lines[index][-1], lines[index + 1][0]) < 30
    points = [point for _, point in indexed[lo:hi + 1]]
    return points if a <= b else points[::-1]


def simplify(points):
    geometry = ogr.Geometry(ogr.wkbLineString)
    for x, y in points:
        geometry.AddPoint_2D(x, y)
    return geometry.Simplify(40).GetPoints()


def main(source, destination):
    wgs, albers = osr.SpatialReference(), osr.SpatialReference()
    wgs.ImportFromEPSG(4326)
    wgs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    albers.ImportFromEPSG(5070)
    tx = osr.CoordinateTransformation(wgs, albers)
    anchors = {name: tx.TransformPoint(*location)[:2] for name, location in JUNCTIONS.items()}
    data = json.loads(source.read_text())
    assert data["spatialReference"]["wkid"] == 5070

    def route_order(feature):
        attrs = feature["attributes"]
        return attrs["Route_ID"], attrs["From_Measure"]

    routes = {}
    for feature in sorted(data["features"], key=route_order):
        route = feature["attributes"]["Route_Display_Value"].strip()
        routes.setdefault(route, []).extend(feature["geometry"]["paths"])

    paths = []
    for loop in LOOPS:
        path = []
        for route, start, end in loop:
            segment = simplify(route_segment(routes[route], anchors[start], anchors[end]))
            assert not path or math.dist(path[-1], segment[0]) < 40
            path.extend(segment)
        assert math.dist(path[0], path[-1]) < 40
        path.append(path[0])
        paths.append([[round((x - 1660000)/1000, 3), round((2405000 - y)/1000, 3)]
                      for x, y in path])
    destination.write_text(json.dumps(paths, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
