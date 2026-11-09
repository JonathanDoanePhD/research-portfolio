# New York population density

[Open the interactive demo](https://jonathandoanephd.github.io/research-portfolio/demos/ny-population-density/).

The demo plots 120,294 populated H3 cells from the November 1, 2023 [Kontur Population](https://www.kontur.io/datasets/population-dataset/) U.S. release (CC BY), with the New York shoreline from the [U.S. Census Bureau](https://www.census.gov/geographies/mapping-files/2020/geo/cartographic-boundary-file.html). Population estimates are assigned by each cell centroid. Density uses the entire hexagon area in an equal-area projection. Heights are logarithmic and colors use five fixed density bands. The map uses regular hexagonal prisms to render the data, with radius and orientation derived from each source cell.

The site has no build step. To run locally, serve the directory over HTTP (for example, `python3 -m http.server 8000`). The site bundles Three.js r160 and its MIT license. Browsers without WebGL use an interactive Canvas renderer. To regenerate `data/` from the project GeoPackage, run `python3 build_map_data.py ny_population_2023.gpkg data` with GDAL Python bindings installed.
