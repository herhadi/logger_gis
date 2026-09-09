'use client';

import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { apiFetch } from '../lib/api';
import { pipeColorExpression } from '../lib/pipe-legend';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { useToast } from './toast-provider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function MapView({ adminMode = false }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('Memuat peta...');
  const [visibility, setVisibility] = useState({ markers: true, pipa: true, polygon: true });
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const { showToast } = useToast();

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
      if (adminMode) {
        const draw = new MapboxDraw({
          displayControlsDefault: false,
          controls: { point: true, line_string: true, polygon: true, trash: true },
          defaultMode: 'simple_select',
          styles: [
            { id: 'gl-draw-polygon-fill-inactive', type: 'fill', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']], paint: { 'fill-color': '#f97316', 'fill-opacity': 0.35 } },
            { id: 'gl-draw-polygon-fill-active', type: 'fill', filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']], paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.45 } },
            { id: 'gl-draw-polygon-stroke-inactive', type: 'line', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']], paint: { 'line-color': '#f97316', 'line-width': 2 } },
            { id: 'gl-draw-polygon-stroke-active', type: 'line', filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']], paint: { 'line-color': '#ea580c', 'line-width': 3, 'line-dasharray': [1.5, 1.5] } },
            { id: 'gl-draw-line-inactive', type: 'line', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString']], paint: { 'line-color': '#dc2626', 'line-width': 3 } },
            { id: 'gl-draw-line-active', type: 'line', filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'LineString']], paint: { 'line-color': '#f59e0b', 'line-width': 4, 'line-dasharray': [1.5, 1.5] } },
            { id: 'gl-draw-point-active', type: 'circle', filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Point']], paint: { 'circle-radius': 8, 'circle-color': '#f59e0b', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
            { id: 'gl-draw-point-inactive', type: 'circle', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Point']], paint: { 'circle-radius': 6, 'circle-color': '#2563eb', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
            { id: 'gl-draw-vertex-active', type: 'circle', filter: ['all', ['==', 'meta', 'vertex'], ['==', 'active', 'true']], paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': '#ea580c', 'circle-stroke-width': 2 } },
            { id: 'gl-draw-midpoint', type: 'circle', filter: ['all', ['==', 'meta', 'midpoint']], paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': '#f97316', 'circle-stroke-width': 2 } }
          ]
        });
        drawRef.current = draw;
        map.addControl(draw, 'top-left');
        map.on('draw.create', event => { console.info('[Next Draw] create', event.features); window.dispatchEvent(new CustomEvent('gis:draw-created', { detail: event.features[0] })); showToast('Geometri baru dibuat. Isi detail lalu simpan.', 'info'); });
        map.on('draw.update', event => { console.info('[Next Draw] update', event.features); const feature = event.features?.[0]; if (feature) window.dispatchEvent(new CustomEvent('gis:geometry-updated', { detail: feature })); });
        map.on('draw.delete', event => console.info('[Next Draw] delete', event.features));
        map.on('click', 'pipa', event => {
          const feature = event.features?.[0];
          if (!feature?.properties?.id || !feature.geometry) return;
          const drawFeature = { ...feature, id: `edit-pipa-${feature.properties.id}`, properties: { ...feature.properties, __editorType: 'pipa', __editorId: feature.properties.id } };
          const [drawId] = drawRef.current.add(drawFeature); drawRef.current.changeMode('direct_select', { featureId: drawId });
          window.dispatchEvent(new CustomEvent('gis:pipa-selected', { detail: drawFeature }));
        });
        map.on('mouseenter', 'pipa', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'pipa', () => { map.getCanvas().style.cursor = ''; });
        map.on('click', 'markers', event => {
          const feature = event.features?.[0];
          if (!feature?.properties?.id || !feature.geometry) return;
          const drawFeature = { ...feature, id: `edit-marker-${feature.properties.tipe}-${feature.properties.id}`, properties: { ...feature.properties, __editorType: 'marker', __editorId: feature.properties.id } };
          const [drawId] = drawRef.current.add(drawFeature); drawRef.current.changeMode('direct_select', { featureId: drawId });
          window.dispatchEvent(new CustomEvent('gis:marker-selected', { detail: drawFeature }));
        });
        map.on('mouseenter', 'markers', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'markers', () => { map.getCanvas().style.cursor = ''; });
        map.on('click', 'polygon', event => {
          const feature = event.features?.[0];
          if (!feature?.properties?.id || !feature.geometry) return;
          const drawFeature = { ...feature, id: `edit-polygon-${feature.properties.id}`, properties: { ...feature.properties, __editorType: 'polygon', __editorId: feature.properties.id } };
          const [drawId] = drawRef.current.add(drawFeature); drawRef.current.changeMode('direct_select', { featureId: drawId });
          window.dispatchEvent(new CustomEvent('gis:polygon-selected', { detail: drawFeature }));
        });
        map.on('mouseenter', 'polygon', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'polygon', () => { map.getCanvas().style.cursor = ''; });
        const refreshAfterCrud = event => {
          const sourceIds = event.detail?.type === 'pipa' ? ['pipa'] : event.detail?.type === 'marker' ? ['markers'] : ['polygon'];
          if (drawRef.current) drawRef.current.deleteAll();
          sourceIds.forEach(sourceId => {
            const source = map.getSource(sourceId);
            if (source?.setTiles) source.setTiles([`${API_URL}/api/${sourceId === 'markers' ? 'marker' : sourceId}/tiles/{z}/{x}/{y}.pbf?refresh=${Date.now()}`]);
          });
          map.triggerRepaint();
        };
        window.addEventListener('gis:crud-saved', refreshAfterCrud);
        map.once('remove', () => window.removeEventListener('gis:crud-saved', refreshAfterCrud));
      }
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
    return () => { disposed = true; if (map && drawRef.current) map.removeControl(drawRef.current); map?.remove(); mapRef.current = null; drawRef.current = null; };
  }, [adminMode, showToast]);

  return <section className="map-shell"><div ref={containerRef} className="map" /><div className="map-status">{status}</div>
    {adminMode && <div className="layer-control"><strong>Layer</strong>{[['markers', 'Marker'], ['pipa', 'Pipa'], ['polygon', 'Polygon']].map(([id, label]) => <label key={id}><input type="checkbox" checked={visibility[id]} onChange={() => toggleLayer(id)} />{label}</label>)}</div>}
  </section>;
}
