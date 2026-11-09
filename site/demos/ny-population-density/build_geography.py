"""Build map overlays from the 3DEP GeoTIFF and the projected geography extracts."""
import json
from pathlib import Path
import sys

import numpy as np
from osgeo import gdal, ogr, osr
from PIL import Image

ORIGIN_X, ORIGIN_Y = 1_660_000, 2_405_000
STOPS = ((0, "#dce9cd"), (500, "#a0b384"), (1000, "#a58663"), (1500, "#f1e6d1"))
SOURCES = (
    ("adirondack", "Adirondack Park", "park", -74.22, 44.03),
    ("catskill", "Catskills", "park", -74.39, 42.04),
    ("plateau", "Allegheny Plateau", "region", -77.74, 42.29),
    ("erie", "Erie Canal", "canal", -76.39, 43.22),
    ("hudson", "Hudson River", "river", -73.83, 41.79),
)
LAKES = (
    ("Lake Erie", -79.15, 42.81),
    ("Lake Ontario", -77.75, 43.67),
    ("Finger Lakes", -76.86, 42.65),
    ("Lake Champlain", -73.28, 44.59),
)


def hex_rgb(value):
    return [int(value[i:i+2], 16) for i in (1, 3, 5)]


def build_elevation(source, output, outline):
    raster = gdal.Open(str(source))
    dem = raster.ReadAsArray()
    transform = raster.GetGeoTransform()
    assert transform[2] == transform[4] == 0 and transform[1] > 0 > transform[5]

    mask = gdal.GetDriverByName("MEM").Create("", raster.RasterXSize, raster.RasterYSize, 1, gdal.GDT_Byte)
    mask.SetGeoTransform(transform)
    mask.SetProjection(raster.GetProjection())
    vector = ogr.GetDriverByName("Memory").CreateDataSource("")
    layer = vector.CreateLayer("outline", raster.GetSpatialRef(), ogr.wkbMultiPolygon)
    polygons = [[[(x*1000+ORIGIN_X, y*1000+ORIGIN_Y) for x, y in ring] for ring in poly]
                for poly in outline]
    feature = ogr.Feature(layer.GetLayerDefn())
    feature.SetGeometry(ogr.CreateGeometryFromJson(json.dumps({"type":"MultiPolygon","coordinates":polygons})))
    layer.CreateFeature(feature)
    gdal.RasterizeLayer(mask, [1], layer, burn_values=[255])
    alpha = mask.ReadAsArray()
    nodata = raster.GetRasterBand(1).GetNoDataValue()
    valid = np.isfinite(dem) & (dem > -100)
    if nodata is not None:
        valid &= dem != nodata
    alpha[~valid] = 0
    dem = np.maximum(np.where(valid, dem, 0), 0)
    elevations, palette = zip(*STOPS)
    colors = np.array([hex_rgb(v) for v in palette])
    rgb = np.stack([np.interp(dem, elevations, channel) for channel in colors.T], axis=-1)
    dz_south, dz_east = np.gradient(dem, -transform[5], transform[1])
    light = (1 + 2.4 * (dz_east + dz_south)) / np.sqrt(1 + 16*(dz_east**2 + dz_south**2))
    rgb *= np.clip(.80 + .20 * light, .66, 1.19)[...,None]
    rgba = np.dstack((np.clip(rgb, 0, 255).astype(np.uint8), alpha))
    Image.fromarray(rgba).save(output / "elevation.webp", quality=89, method=6)
    width = raster.RasterXSize * transform[1] / 1000
    height = raster.RasterYSize * -transform[5] / 1000
    print(f"Elevation coverage: {np.count_nonzero(alpha):,} cells, range {dem[alpha>0].min():.0f} to {dem[alpha>0].max():.0f} m")
    return dict(left=(transform[0]-ORIGIN_X)/1000, top=(ORIGIN_Y-transform[3])/1000,
                width=width, height=height, stops=STOPS)


def paths(geometry):
    coordinates = geometry["coordinates"]
    kind = geometry["type"]
    if kind == "LineString":
        return [coordinates]
    if kind in ("MultiLineString", "Polygon"):
        return coordinates
    if kind == "MultiPolygon":
        return [ring for polygon in coordinates for ring in polygon]
    raise ValueError(kind)


def map_point(x, y, *_):
    return [round((x-ORIGIN_X)/1000, 2), round((ORIGIN_Y-y)/1000, 2)]


def build_features(source):
    wgs, albers = osr.SpatialReference(), osr.SpatialReference()
    wgs.ImportFromEPSG(4326)
    wgs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    albers.ImportFromEPSG(5070)
    tx = osr.CoordinateTransformation(wgs, albers)
    features = []
    for slug, name, kind, lon, lat in SOURCES:
        data = json.loads((source / f"{slug}.json").read_text())
        lines = [list(map(lambda p: map_point(*p), line)) for feature in data["features"]
                 for line in paths(feature["geometry"]) if len(line) > 1]
        assert lines and all(abs(x)<500 and abs(z)<500 for line in lines for x,z in line)
        features.append(dict(name=name, kind=kind, anchor=map_point(*tx.TransformPoint(lon, lat)),
                             paths=lines))
    for name, lon, lat in LAKES:
        features.append(dict(name=name, kind="lake", anchor=map_point(*tx.TransformPoint(lon, lat)),
                             paths=[]))
    return features


def main(source, output):
    outline = json.loads((output / "map.json").read_text())["outline"]
    elevation = build_elevation(source / "3dep.tif", output, outline)
    geography = build_features(source)
    (output / "geography.json").write_text(json.dumps(dict(elevation=elevation, features=geography),
                                                      separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
