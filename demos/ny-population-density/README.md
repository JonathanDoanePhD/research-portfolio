# New York population

[Open the interactive demo](https://jonathandoanephd.github.io/research-portfolio/demos/ny-population-density/).

The demo plots 120,294 populated H3 cells from the November 1, 2023 [Kontur Population](https://www.kontur.io/datasets/population-dataset/) U.S. release (CC BY), with the New York shoreline from the [U.S. Census Bureau](https://www.census.gov/geographies/mapping-files/2020/geo/cartographic-boundary-file.html). Population estimates are assigned by each cell centroid. Density uses the entire hexagon area in an equal-area projection. Towers show total population per hexagon. Tower heights use a shared square-root scale across all granularity levels, with a proportional Linear option. The tower-height slider starts at 360% and extends to 700%. Colors follow three fixed population stops, from green at zero through orange at 3,000 and red at 30,000 people or more. The granularity slider switches between the original H3 resolution 8 and parent resolutions 7, 6, and 5. Each parent sums the New York source-cell populations and divides that sum by the full parent area. The source population total stays the same at each resolution. The map uses regular hexagonal prisms to render the data, with radius and orientation derived from each source cell.

Wheel zoom follows the pointer, and touch zoom follows the midpoint of a pinch. The site has no build step. To run locally, serve the directory over HTTP (for example, `python3 -m http.server 8000`). The site bundles Three.js r160 and its MIT license. Browsers without WebGL use an interactive Canvas renderer. A point light is fixed in view coordinates. Tilting, rotating, and panning change how the map sits relative to that light. WebGL casts shadows on raised terrain. Canvas projects shadows on flat ground only. Geographic labels and outlines can be obscured by towers at least one-quarter as tall as the tallest tower at the current granularity. The tower must also rise by at least two screen pixels to count, so broad, low columns leave the overlay visible. Each tower starts in green and reaches its population color at the tip. To regenerate `data/` from the project GeoPackage, run `python3 build_map_data.py ny_population_2023.gpkg data` with GDAL Python bindings and h3-py installed.

## Geographic overlays

**Geographic features** shows selected parks, landforms, and waterways. The Catskills outline represents the Catskill Park boundary. The Allegheny Plateau outline represents the regional boundary mapped by NYSDOT. Waterway lines are generalized for the statewide display.

| Feature | Source |
| --- | --- |
| Adirondack Park | [Adirondack Park Agency Blue Line polygon](https://services2.arcgis.com/8krRUWgifzA4cgL3/arcgis/rest/services/BluelinePolygon/FeatureServer/0) |
| Catskill Park | [Catskill Park Boundary](https://services6.arcgis.com/DZHaqZm9cxOD4CWM/ArcGIS/rest/services/Catskill_Park_Boundary/FeatureServer/7) |
| Allegheny Plateau | [NYSDOT Physiographic Provinces](https://gisportaldev.dot.ny.gov/server/rest/services/Environmental/Geology/MapServer/3) |
| Erie Canal | [NYS Canal Corporation navigation map](https://www.canals.ny.gov/Navigation-Information/Canal-Map) and its [canal footprint KMZ](https://edge.sitecorecloud.io/newyorkpowe2bd0-canalsf418-productionbf60-c829/media/Files/Integrations/Kmz-Files/canal.kmz) |
| Hudson River | [Natural Earth 1:10m Rivers and Lake Centerlines](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-rivers-lake-centerlines/) |
| Elevation | [USGS 3DEP bare-earth elevation service](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer), sampled on a 1 km EPSG:5070 grid |

The base map is colored by elevation. **Elevation relief** raises the ground beneath the towers. Terrain heights are sampled on a roughly 4 km mesh and exaggerated 14×. Each tower starts at the terrain height sampled at its center. Tower height above the terrain represents population. Tooltips show population and density. Viewing the layers together lets you compare settlement patterns with elevation.

To rebuild, export the 3DEP GeoTIFF as `3dep.tif` using EPSG:5070, extent `1320000,2144000,1998000,2664000`, size `678,520`, and bilinear resampling. Export the listed feature geometries as EPSG:5070 GeoJSON, using the filenames in `build_geography.py`. Run `python3 build_geography.py SOURCES data` with GDAL Python bindings, NumPy, and Pillow installed.

## Adirondack road loops

The **Adirondack road loops** toggle shows the large Long Lake–High Peaks loop, the Elizabethtown loop, and the Wilmington–Jay loop. Where highways share pavement, the map follows the shared centerline. The lines are generalized for the visualization.

Road geometry comes from the [NYSDOT State Touring Inventory](https://gisdev.dot.ny.gov/hostingny/rest/services/Roadways/RoadwayData/FeatureServer/1). To regenerate the overlay, export the nine signed routes as Esri JSON in EPSG:5070, intersecting the WGS84 envelope `-74.7,43.57,-73.50,44.49`. Keep `Route_Display_Value`, `Route_ID`, and `From_Measure`. Run `python3 build_road_loops.py roads.json data/road-loops.json` with GDAL Python bindings.
