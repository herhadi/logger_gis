'use client';

import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function MapView() {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('Memuat peta...');

  useEffect(() => {
    let map;
    let disposed = false;
    import('maplibre-gl').then(module => {
      if (disposed || !containerRef.current) return;
      const maplibregl = module.default || module;
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
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      map.on('load', () => setStatus('MapLibre aktif'));
      map.on('idle', () => {
        const counts = Object.fromEntries(['markers', 'pipa', 'polygon'].map(id => [id, map.queryRenderedFeatures({ layers: [id] }).length]));
        console.info('[Next MapLibre] rendered features', counts);
        setStatus(`Marker ${counts.markers} · Pipa ${counts.pipa} · Polygon ${counts.polygon}`);
      });
      map.on('error', event => console.error('[Next MapLibre] error', event.error));
    }).catch(error => {
      console.error('[Next MapLibre] initialization failed', error);
      if (!disposed) setStatus(`Gagal memuat MapLibre: ${error.message}`);
    });
    return () => { disposed = true; map?.remove(); };
  }, []);

  return <section className="map-shell"><div ref={containerRef} className="map" /><div className="map-status">{status}</div></section>;
}
