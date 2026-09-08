import * as maplibregl from 'https://cdn.jsdelivr.net/npm/maplibre-gl@6.8.0/dist/maplibre-gl.mjs';

(() => {
  const status = document.getElementById('map-status');
  const map = new maplibregl.Map({
    container: 'map',
    center: [106.8, -6.2],
    zoom: 11,
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        },
        markers: { type: 'vector', tiles: [`${location.origin}/api/marker/tiles/{z}/{x}/{y}.pbf`] }
      },
      layers: [
        { id: 'osm', type: 'raster', source: 'osm' },
        { id: 'markers', type: 'circle', source: 'markers', 'source-layer': 'markers', paint: { 'circle-radius': 5, 'circle-color': '#1769aa', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } }
      ]
    }
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  map.on('load', () => { status.textContent = 'Vector tile marker aktif'; });
  map.on('click', 'markers', event => {
    const feature = event.features?.[0];
    if (!feature) return;
    new maplibregl.Popup().setLngLat(event.lngLat).setHTML(`<strong>${feature.properties?.tipe || 'marker'}</strong><br>ID: ${feature.properties?.id || '-'}`).addTo(map);
  });
  map.on('mouseenter', 'markers', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'markers', () => { map.getCanvas().style.cursor = ''; });
  map.on('error', event => { if (event.error) status.textContent = `Error peta: ${event.error.message}`; });
})();
