import * as maplibregl from 'https://cdn.jsdelivr.net/npm/maplibre-gl@6.8.0/dist/maplibre-gl.mjs';

(() => {
  const status = document.getElementById('map-status');
  const map = new maplibregl.Map({
    container: 'map',
    center: [109.7178, -6.9383],
    zoom: 13,
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        },
        markers: { type: 'vector', tiles: [`${location.origin}/api/marker/tiles/{z}/{x}/{y}.pbf`] },
        pipa: { type: 'vector', tiles: [`${location.origin}/api/pipa/tiles/{z}/{x}/{y}.pbf`] },
        polygon: { type: 'vector', tiles: [`${location.origin}/api/polygon/tiles/{z}/{x}/{y}.pbf`] }
      },
      layers: [
        { id: 'osm', type: 'raster', source: 'osm' },
        { id: 'polygon', type: 'fill', source: 'polygon', 'source-layer': 'polygon', paint: { 'fill-color': '#f97316', 'fill-opacity': 0.5 } },
        { id: 'polygon-outline', type: 'line', source: 'polygon', 'source-layer': 'polygon', paint: { 'line-color': '#7c2d12', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.5, 18, 3], 'line-opacity': 0.9 } },
        { id: 'pipa', type: 'line', source: 'pipa', 'source-layer': 'pipa', paint: { 'line-color': '#dc2626', 'line-width': 2 } },
        { id: 'markers', type: 'circle', source: 'markers', 'source-layer': 'markers', paint: { 'circle-radius': 5, 'circle-color': '#1769aa', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } }
      ]
    }
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  map.on('load', () => {
    status.textContent = 'Vector tile marker, pipa, polygon aktif';
    console.info('[MapLibre] map loaded', { center: map.getCenter().toArray(), zoom: map.getZoom() });
  });
  map.on('sourcedata', event => {
    if (!event.isSourceLoaded || !['markers', 'pipa', 'polygon'].includes(event.sourceId)) return;
    console.info('[MapLibre] source loaded', { source: event.sourceId, zoom: map.getZoom() });
  });
  map.on('idle', () => {
    const counts = {};
    for (const layerId of ['markers', 'pipa', 'polygon']) {
      counts[layerId] = map.queryRenderedFeatures({ layers: [layerId] }).length;
    }
    console.info('[MapLibre] rendered features', counts);
    status.textContent = `Marker: ${counts.markers} | Pipa: ${counts.pipa} | Polygon: ${counts.polygon}`;
  });
  map.on('click', 'markers', event => {
    const feature = event.features?.[0];
    if (!feature) return;
    new maplibregl.Popup().setLngLat(event.lngLat).setHTML(`<strong>${feature.properties?.tipe || 'marker'}</strong><br>ID: ${feature.properties?.id || '-'}`).addTo(map);
  });
  map.on('mouseenter', 'markers', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'markers', () => { map.getCanvas().style.cursor = ''; });
  map.on('error', event => {
    if (event.error) {
      console.error('[MapLibre] error', event.error);
      status.textContent = `Error peta: ${event.error.message}`;
    }
  });
})();
