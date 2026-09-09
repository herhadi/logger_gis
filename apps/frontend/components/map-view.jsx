'use client';

import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { apiFetch } from '../lib/api';
import { pipeColorExpression } from '../lib/pipe-legend';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function MapView({ adminMode = false }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('Memuat peta...');
  const [visibility, setVisibility] = useState({ markers: true, pipa: true, polygon: true });
  const mapRef = useRef(null);

  function toggleLayer(id) {
    const next = !visibility[id];
    setVisibility(current => ({ ...current, [id]: next }));
    const layerId = id === 'markers' ? 'markers' : id;
    const map = mapRef.current;
    if (map?.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', next ? 'visible' : 'none');
  }

  useEffect(() => {
    let map;
    let disposed = false;
    const initialize = maplibregl => {
      if (disposed || !containerRef.current) return;
      console.info('[Next MapLibre] initializing', { apiUrl: API_URL, maplibreVersion: maplibregl.getVersion?.() });
      map = new maplibregl.Map({
        container: containerRef.current,
        center: [109.7178, -6.9383],
        zoom: 13,
        style: {
          version: 8,
          sources: {
            osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' },
            markers: { type: 'vector', tiles: [`${API_URL}/api/marker/tiles/{z}/{x}/{y}.pbf`] },
            pipa: { type: 'vector', tiles: [`${API_URL}/api/pipa/tiles/{z}/{x}/{y}.pbf`] },
            polygon: { type: 'vector', tiles: [`${API_URL}/api/polygon/tiles/{z}/{x}/{y}.pbf`] }
          },
          layers: [
            { id: 'osm', type: 'raster', source: 'osm' },
            { id: 'polygon', type: 'fill', source: 'polygon', 'source-layer': 'polygon', paint: { 'fill-color': '#f97316', 'fill-opacity': 0.45 } },
            { id: 'pipa', type: 'line', source: 'pipa', 'source-layer': 'pipa', paint: { 'line-color': '#dc2626', 'line-width': 2 } },
            { id: 'markers', type: 'circle', source: 'markers', 'source-layer': 'markers', paint: { 'circle-radius': 5, 'circle-color': '#1769aa', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } }
          ]
        }
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      map.on('load', () => setStatus('MapLibre aktif'));
      apiFetch('/api/pipa/option').then(data => {
        if (map.getLayer('pipa')) map.setPaintProperty('pipa', 'line-color', pipeColorExpression(data.diameter || []));
      }).catch(error => console.error('[Next MapLibre] gagal memuat warna diameter pipa', error));
      map.on('idle', () => {
        const counts = Object.fromEntries(['markers', 'pipa', 'polygon'].map(id => [id, map.queryRenderedFeatures({ layers: [id] }).length]));
        console.info('[Next MapLibre] rendered features', counts);
        setStatus(`Marker ${counts.markers} · Pipa ${counts.pipa} · Polygon ${counts.polygon}`);
      });
      map.on('error', event => console.error('[Next MapLibre] error', event.error));
    };
    import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/maplibre-gl@6.8.0/dist/maplibre-gl.mjs')
      .then(module => initialize(module.default || module))
      .catch(error => {
        console.error('[Next MapLibre] initialization failed', error);
        if (!disposed) setStatus(`Gagal memuat MapLibre: ${error.message}`);
      });
    return () => { disposed = true; map?.remove(); mapRef.current = null; };
  }, []);

  return <section className="map-shell"><div ref={containerRef} className="map" /><div className="map-status">{status}</div>
    {adminMode && <div className="layer-control"><strong>Layer</strong>{[['markers', 'Marker'], ['pipa', 'Pipa'], ['polygon', 'Polygon']].map(([id, label]) => <label key={id}><input type="checkbox" checked={visibility[id]} onChange={() => toggleLayer(id)} />{label}</label>)}</div>}
  </section>;
}
