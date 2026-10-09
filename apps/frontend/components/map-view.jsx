"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { apiFetch } from "../lib/api";
import { pipeColorExpression } from "../lib/pipe-legend";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { useToast } from "./toast-provider";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function MapView({ adminMode = false }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState("Memuat peta...");
  const [visibility, setVisibility] = useState(() => {
    if (typeof window === "undefined")
      return { markers: true, pipa: true, polygon: true };
    try {
      return {
        markers: true,
        pipa: true,
        polygon: true,
        ...JSON.parse(localStorage.getItem("gis-layer-visibility") || "{}"),
      };
    } catch {
      return { markers: true, pipa: true, polygon: true };
    }
  });
  const [baseLayer, setBaseLayer] = useState(() => {
    if (typeof window === "undefined") return "satellite";
    return localStorage.getItem("gis-basemap") || "satellite";
  });
  const [activeDrawMode, setActiveDrawMode] = useState(null);
  const [areaAnalysisMode, setAreaAnalysisMode] = useState(false);
  const [areaPoints, setAreaPoints] = useState([]);
  const [areaStats, setAreaStats] = useState(null);
  const [areaStatsLoading, setAreaStatsLoading] = useState(false);
  const areaAnalysisModeRef = useRef(false);
  const areaPointsRef = useRef([]);
  const visibilityRef = useRef(visibility);
  const [geoQuery, setGeoQuery] = useState("");
  const [geoResults, setGeoResults] = useState([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoSearchOpen, setGeoSearchOpen] = useState(false);
  const googleTiles = (layer) =>
    ["mt0", "mt1", "mt2", "mt3"].map(
      (server) =>
        `https://${server}.google.com/vt/lyrs=${layer}&x={x}&y={y}&z={z}`,
    );
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const snappingRef = useRef(false);
  const expandedClusterRef = useRef(false);
  const { showToast } = useToast();

  useEffect(() => { visibilityRef.current = visibility; }, [visibility]);
  useEffect(() => { areaAnalysisModeRef.current = areaAnalysisMode; }, [areaAnalysisMode]);

  function updateAreaPreview(points) {
    const source = mapRef.current?.getSource("area-analysis");
    if (!source) return;
    const features = points.map((coordinate, index) => ({ type: "Feature", properties: { role: "vertex", index }, geometry: { type: "Point", coordinates: coordinate } }));
    if (points.length >= 2) features.push({ type: "Feature", properties: { role: "outline" }, geometry: { type: "LineString", coordinates: points } });
    if (points.length >= 3) features.push({ type: "Feature", properties: { role: "fill" }, geometry: { type: "Polygon", coordinates: [[...points, points[0]]] } });
    source.setData({ type: "FeatureCollection", features });
  }

  function startAreaAnalysis() {
    const map = mapRef.current;
    if (!adminMode || !map) return;
    if (areaAnalysisModeRef.current) {
      areaAnalysisModeRef.current = false;
      setAreaAnalysisMode(false);
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
      showToast("Analisis area dibatalkan.", "info");
      return;
    }
    drawRef.current?.changeMode("simple_select");
    setActiveDrawMode(null);
    setAreaPoints([]);
    setAreaStats(null);
    updateAreaPreview([]);
    areaPointsRef.current = [];
    areaAnalysisModeRef.current = true;
    setAreaAnalysisMode(true);
    map.doubleClickZoom.disable();
    map.getCanvas().style.cursor = "crosshair";
    showToast("Klik peta untuk menentukan titik area, minimal 3 titik.", "info");
  }

  async function finishAreaAnalysis() {
    const points = areaPointsRef.current;
    if (points.length < 3) { showToast("Area harus memiliki minimal 3 titik.", "error"); return; }
    const ring = [...points, points[0]];
    const geometry = { type: "Polygon", coordinates: [ring] };
    areaAnalysisModeRef.current = false;
    setAreaAnalysisMode(false);
    mapRef.current?.doubleClickZoom.enable();
    if (mapRef.current?.getCanvas()) mapRef.current.getCanvas().style.cursor = "";
    setAreaStatsLoading(true);
    try {
      const stats = await apiFetch("/api/selection/stats", { method: "POST", body: JSON.stringify({ geometry, includePoints: visibilityRef.current.markers, includeLines: visibilityRef.current.pipa, includePolygons: true }) });
      const radians = points.map(([lng, lat]) => ({ lat: lat * Math.PI / 180, lng: lng * Math.PI / 180 }));
      let sum = 0;
      for (let i = 0; i < radians.length; i++) { const a = radians[i]; const b = radians[(i + 1) % radians.length]; sum += a.lng * b.lat - b.lng * a.lat; }
      const areaHa = Math.abs(sum) * 6371000 * 6371000 / 2 / 10000;
      setAreaStats({ ...stats, areaHa: areaHa.toFixed(2) });
      showToast("Statistik area berhasil dihitung.", "success");
    } catch (error) {
      showToast(error.message || "Gagal menghitung statistik area.", "error");
    } finally { setAreaStatsLoading(false); }
  }

  function clearAreaAnalysis() {
    areaPointsRef.current = [];
    setAreaPoints([]);
    setAreaStats(null);
    updateAreaPreview([]);
  }

  function popupPositionAt(point) {
    const rect = mapRef.current?.getContainer().getBoundingClientRect();
    if (!rect || !point) return { left: 80, top: 64 };
    return { left: rect.left + point.x + 14, top: rect.top + point.y + 14 };
  }

  function popupPositionForFeature(feature) {
    const geometry = feature?.geometry;
    if (!geometry) return { left: 80, top: 64 };
    let coordinate;
    if (geometry.type === "Point") coordinate = geometry.coordinates;
    else if (geometry.type === "LineString") coordinate = geometry.coordinates[Math.floor(geometry.coordinates.length / 2)];
    else if (geometry.type === "Polygon") {
      const ring = geometry.coordinates?.[0] || [];
      coordinate = ring[Math.floor(ring.length / 2)];
    }
    if (!coordinate || !mapRef.current) return { left: 80, top: 64 };
    return popupPositionAt(mapRef.current.project(coordinate));
  }

  async function searchLocation(event, quiet = false) {
    event?.preventDefault?.();
    const query = geoQuery.trim();
    if (!query) { setGeoResults([]); return; }
    const key = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;
    if (!key) { if (!quiet) showToast("Atur NEXT_PUBLIC_GEOAPIFY_API_KEY untuk pencarian lokasi.", "error"); return; }
    setGeoLoading(true);
    try {
      const formatted = query.length <= 10 && !/[ ,0-9]/.test(query) ? query + " Batang" : query;
      const url = new URL("https://api.geoapify.com/v1/geocode/search");
      url.search = new URLSearchParams({ text: formatted, limit: "10", filter: "countrycode:id", bias: "proximity:109.7280,-6.8974", apiKey: key }).toString();
      const response = await fetch(url);
      if (!response.ok) throw new Error("Pencarian lokasi gagal");
      const data = await response.json();
      const priority = { village: 5, suburb: 4, city_district: 4, town: 3, city: 2, state: 1 };
      const results = (data.features || []).map(feature => ({ name: feature.properties.formatted || feature.properties.name, center: feature.geometry.coordinates, bbox: feature.bbox, properties: feature.properties })).sort((a,b) => (priority[b.properties.result_type] || 0) - (priority[a.properties.result_type] || 0) || (b.properties.rank?.confidence || 0) - (a.properties.rank?.confidence || 0));
      setGeoResults(results);
      if (!results.length && !quiet) showToast("Lokasi tidak ditemukan.", "info");
    } catch (error) { if (!quiet) showToast(error.message || "Gagal mencari lokasi", "error"); setGeoResults([]); }
    finally { setGeoLoading(false); }
  }
  useEffect(() => {
    if (!geoSearchOpen || !geoQuery.trim()) { setGeoResults([]); return; }
    const timer = setTimeout(() => searchLocation(null, true), 350);
    return () => clearTimeout(timer);
  }, [geoQuery, geoSearchOpen]);

  function chooseGeoResult(result) {
    const map = mapRef.current;
    if (!map) return;
    if (result.bbox && result.bbox.length === 4) map.fitBounds([[result.bbox[0], result.bbox[1]], [result.bbox[2], result.bbox[3]]], { padding: { top: 70, bottom: 40, left: 40, right: 40 } });
    else map.flyTo({ center: result.center, zoom: 15 });
    setGeoResults([]); setGeoQuery(result.name || geoQuery);
  }

  function toggleLayer(id) {
    const next = !visibility[id];
    setVisibility((current) => {
      const nextVisibility = { ...current, [id]: next };
      localStorage.setItem(
        "gis-layer-visibility",
        JSON.stringify(nextVisibility),
      );
      return nextVisibility;
    });
    const map = mapRef.current;
    const layerIds =
      id === "markers"
        ? [
            "markers",
            "marker-clusters",
            "marker-cluster-count",
            "markers-expanded",
          ]
        : [id];
    layerIds.forEach((layerId) => {
      if (map?.getLayer(layerId))
        map.setLayoutProperty(layerId, "visibility", next ? "visible" : "none");
    });
    if (id === "markers" && next) map?.fire("moveend");
  }

  function changeBaseLayer(id) {
    setBaseLayer(id);
    localStorage.setItem("gis-basemap", id);
    const map = mapRef.current;
    if (!map) return;
    ["osm", "satellite", "googleHybrid", "googleSatellite"].forEach(
      (layerId) => {
        if (map.getLayer(layerId))
          map.setLayoutProperty(
            layerId,
            "visibility",
            layerId === id ? "visible" : "none",
          );
      },
    );
  }

  function startDraw(mode) {
    if (!drawRef.current) {
      console.warn("[Next Draw] editor belum siap");
      return;
    }
    if (areaAnalysisModeRef.current) {
      areaAnalysisModeRef.current = false;
      setAreaAnalysisMode(false);
      mapRef.current?.doubleClickZoom.enable();
      updateAreaPreview([]);
      areaPointsRef.current = [];
      setAreaPoints([]);
    }
    if (mode === "trash") {
      drawRef.current.trash();
      return;
    }
    drawRef.current.changeMode(mode);
    setDrawCursor(mode);
    console.info("[Next Draw] mode", mode);
  }

  function setDrawCursor(mode) {
    const map = mapRef.current;
    const canvas = map?.getCanvas();
    if (!canvas) return;
    const drawingMode = ["draw_point", "draw_line_string", "draw_polygon"].includes(
      mode,
    );
    canvas.style.cursor = drawingMode ? "crosshair" : "";
    setActiveDrawMode(drawingMode ? mode : null);

    const buttonModes = {
      ".mapbox-gl-draw_point": "draw_point",
      ".mapbox-gl-draw_line": "draw_line_string",
      ".mapbox-gl-draw_polygon": "draw_polygon",
      ".mapbox-gl-draw_trash": "trash",
    };
    Object.entries(buttonModes).forEach(([selector, buttonMode]) => {
      map
        ?.getContainer()
        ?.querySelector(selector)
        ?.classList.toggle("draw-tool-active", buttonMode === mode);
    });
  }

  useEffect(() => {
    let map;
    let disposed = false;
    const initialize = (maplibregl) => {
      if (disposed || !containerRef.current) return;
      console.info("[Next MapLibre] initializing", {
        apiUrl: API_URL,
        maplibreVersion: maplibregl.getVersion?.(),
      });
      map = new maplibregl.Map({
        container: containerRef.current,
        center: [109.7178, -6.9383],
        zoom: 13,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
            satellite: {
              type: "raster",
              tiles: [
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              ],
              tileSize: 256,
              attribution: "© Esri",
            },
            googleHybrid: {
              type: "raster",
              tiles: googleTiles("s,h"),
              tileSize: 256,
              attribution: "© Google Hybrid",
            },
            googleSatellite: {
              type: "raster",
              tiles: googleTiles("s"),
              tileSize: 256,
              attribution: "© Google Satellite",
            },
            markers: {
              type: "vector",
              tiles: [`${API_URL}/api/marker/tiles/{z}/{x}/{y}.pbf`],
            },
            markerClusters: {
              type: "geojson",
              data: { type: "FeatureCollection", features: [] },
              cluster: true,
              clusterMaxZoom: 17,
              clusterRadius: 50,
            },
            markerExpanded: {
              type: "geojson",
              data: { type: "FeatureCollection", features: [] },
            },
            pipa: {
              type: "vector",
              tiles: [`${API_URL}/api/pipa/tiles/{z}/{x}/{y}.pbf`],
            },
            polygon: {
              type: "vector",
              tiles: [`${API_URL}/api/polygon/tiles/{z}/{x}/{y}.pbf`],
            },
          },
          layers: [
            {
              id: "osm",
              type: "raster",
              source: "osm",
              layout: { visibility: "none" },
            },
            { id: "satellite", type: "raster", source: "satellite" },
            {
              id: "googleHybrid",
              type: "raster",
              source: "googleHybrid",
              layout: { visibility: "none" },
            },
            {
              id: "googleSatellite",
              type: "raster",
              source: "googleSatellite",
              layout: { visibility: "none" },
            },
            {
              id: "polygon",
              type: "fill",
              source: "polygon",
              "source-layer": "polygon",
              paint: { "fill-color": "#f97316", "fill-opacity": 0.45 },
            },
            {
              id: "pipa",
              type: "line",
              source: "pipa",
              "source-layer": "pipa",
              paint: { "line-color": "#dc2626", "line-width": 2 },
            },
            {
              id: "marker-clusters",
              type: "circle",
              source: "markerClusters",
              filter: ["has", "point_count"],
              paint: {
                "circle-color": [
                  "step",
                  ["get", "point_count"],
                  "#8bc34a",
                  20,
                  "#ffc107",
                  100,
                  "#f97316",
                ],
                // Ukuran cluster seragam seperti tampilan Leaflet lama.
                // Jumlah marker dibedakan melalui warna, bukan ukuran lingkaran.
                "circle-radius": 19,
                // Menyamai marker cluster Leaflet lama: warna transparan
                // sehingga pipa dan citra satelit tetap terlihat di bawahnya.
                "circle-opacity": 0.68,
                "circle-stroke-color": "#fff",
                "circle-stroke-opacity": 0.7,
                "circle-stroke-width": 1,
              },
            },
            {
              id: "marker-cluster-count",
              type: "symbol",
              source: "markerClusters",
              filter: ["has", "point_count"],
              layout: {
                "text-field": ["get", "point_count_abbreviated"],
                "text-size": 11,
              },
              paint: { "text-color": "#263238" },
            },
            {
              id: "markers",
              type: "circle",
              source: "markerClusters",
              filter: ["!", ["has", "point_count"]],
              paint: {
                "circle-radius": 5,
                "circle-color": [
                  "match",
                  ["get", "tipe"],
                  "acc",
                  "#f59e0b",
                  "reservoir",
                  "#2563eb",
                  "tank",
                  "#16a34a",
                  "valve",
                  "#dc2626",
                  "#1769aa",
                ],
                "circle-opacity": 0.9,
                "circle-stroke-color": "#fff",
                "circle-stroke-width": 1,
              },
            },
            {
              id: "markers-expanded",
              type: "circle",
              source: "markerExpanded",
              paint: {
                "circle-radius": 5,
                "circle-color": [
                  "match",
                  ["get", "tipe"],
                  "acc",
                  "#f59e0b",
                  "reservoir",
                  "#2563eb",
                  "tank",
                  "#16a34a",
                  "valve",
                  "#dc2626",
                  "#1769aa",
                ],
                "circle-opacity": 0.9,
                "circle-stroke-color": "#fff",
                "circle-stroke-width": 1,
              },
              layout: { visibility: "none" },
            },
          ],
        },
      });
      mapRef.current = map;
      map.addControl(
        new maplibregl.NavigationControl({
          showCompass: false,
          showZoom: true,
        }),
        "top-left",
      );
      if (adminMode) {
        const draw = new MapboxDraw({
          // Ikuti pola contoh resmi: hanya tampilkan tool yang memang dipakai.
          displayControlsDefault: false,
          controls: {
            point: true,
            line_string: true,
            polygon: true,
            trash: true,
          },
          // Pola sample resmi: admin langsung siap menggambar polygon.
          // Pengguna tetap dapat berpindah ke line/point dari toolbar.
          defaultMode: "draw_polygon",
          styles: [
            {
              id: "gl-draw-polygon-fill-inactive",
              type: "fill",
              filter: [
                "all",
                ["==", "active", "false"],
                ["==", "$type", "Polygon"],
              ],
              paint: { "fill-color": "#f97316", "fill-opacity": 0.35 },
            },
            {
              id: "gl-draw-polygon-fill-active",
              type: "fill",
              filter: [
                "all",
                ["==", "active", "true"],
                ["==", "$type", "Polygon"],
              ],
              paint: { "fill-color": "#f59e0b", "fill-opacity": 0.45 },
            },
            {
              id: "gl-draw-polygon-stroke-inactive",
              type: "line",
              filter: [
                "all",
                ["==", "active", "false"],
                ["==", "$type", "Polygon"],
              ],
              paint: { "line-color": "#f97316", "line-width": 2 },
            },
            {
              id: "gl-draw-polygon-stroke-active",
              type: "line",
              filter: [
                "all",
                ["==", "active", "true"],
                ["==", "$type", "Polygon"],
              ],
              paint: {
                "line-color": "#ea580c",
                "line-width": 3,
                "line-dasharray": [1.5, 1.5],
              },
            },
            {
              id: "gl-draw-line-inactive",
              type: "line",
              filter: [
                "all",
                ["==", "active", "false"],
                ["==", "$type", "LineString"],
              ],
              paint: { "line-color": "#dc2626", "line-width": 3 },
            },
            {
              id: "gl-draw-line-active",
              type: "line",
              filter: [
                "all",
                ["==", "active", "true"],
                ["==", "$type", "LineString"],
              ],
              paint: {
                "line-color": "#f59e0b",
                "line-width": 4,
                "line-dasharray": [1.5, 1.5],
              },
            },
            {
              id: "gl-draw-point-active",
              type: "circle",
              filter: [
                "all",
                ["==", "active", "true"],
                ["==", "$type", "Point"],
              ],
              paint: {
                "circle-radius": 8,
                "circle-color": "#f59e0b",
                "circle-stroke-color": "#fff",
                "circle-stroke-width": 2,
              },
            },
            {
              id: "gl-draw-point-inactive",
              type: "circle",
              filter: [
                "all",
                ["==", "active", "false"],
                ["==", "$type", "Point"],
              ],
              paint: {
                "circle-radius": 6,
                "circle-color": "#2563eb",
                "circle-stroke-color": "#fff",
                "circle-stroke-width": 2,
              },
            },
            {
              id: "gl-draw-vertex-active",
              type: "circle",
              filter: [
                "all",
                ["==", "meta", "vertex"],
                ["==", "active", "true"],
              ],
              paint: {
                "circle-radius": 5,
                "circle-color": "#fff",
                "circle-stroke-color": "#ea580c",
                "circle-stroke-width": 2,
              },
            },
            {
              id: "gl-draw-midpoint",
              type: "circle",
              filter: ["all", ["==", "meta", "midpoint"]],
              paint: {
                "circle-radius": 4,
                "circle-color": "#fff",
                "circle-stroke-color": "#f97316",
                "circle-stroke-width": 2,
              },
            },
          ],
        });
        drawRef.current = draw;
        map.addControl(draw, "top-left");
        map.on("draw.create", (event) => {
          console.info("[Next Draw] create", event.features);
          const createdFeature = {
            ...event.features[0],
            properties: {
              ...event.features[0].properties,
              __popupPosition: popupPositionForFeature(event.features[0]),
            },
          };
          window.dispatchEvent(
            new CustomEvent("gis:draw-created", { detail: createdFeature }),
          );
          showToast("Geometri baru dibuat. Isi detail lalu simpan.", "info");
        });
        const snapLineToExisting = (feature) => {
          if (
            !feature ||
            feature.geometry?.type !== "LineString" ||
            snappingRef.current
          )
            return feature;
          const coordinates = feature.geometry.coordinates.map((point) => [
            ...point,
          ]);
          let changed = false;
          [0, coordinates.length - 1].forEach((index) => {
            const pixel = map.project(coordinates[index]);
            const nearby = map.queryRenderedFeatures(
              [
                [pixel.x - 18, pixel.y - 18],
                [pixel.x + 18, pixel.y + 18],
              ],
              { layers: ["pipa"] },
            );
            const candidates = nearby.flatMap((item) =>
              item.geometry?.type === "LineString"
                ? item.geometry.coordinates
                : item.geometry?.type === "MultiLineString"
                  ? item.geometry.coordinates.flat()
                  : [],
            );
            let closest = null;
            let closestDistance = 25;
            candidates.forEach((candidate) => {
              const distance = Math.hypot(
                map.project(candidate).x - pixel.x,
                map.project(candidate).y - pixel.y,
              );
              if (distance < closestDistance) {
                closest = candidate;
                closestDistance = distance;
              }
            });
            if (closest) {
              coordinates[index] = [...closest];
              changed = true;
              console.info("[Next Snap] endpoint pipa menempel", {
                index,
                distance: closestDistance,
              });
            }
          });
          if (!changed) return feature;
          const snapped = {
            ...feature,
            geometry: { ...feature.geometry, coordinates },
          };
          try {
            snappingRef.current = true;
            draw.set({
              type: "FeatureCollection",
              features: draw
                .getAll()
                .features.map((item) =>
                  item.id === feature.id ? snapped : item,
                ),
            });
          } finally {
            snappingRef.current = false;
          }
          return snapped;
        };
        const handleDrawGeometry = (event) => {
          console.info("[Next Draw] update", event.features);
          const feature = event.features?.[0];
          if (!feature) return;
          const snapped = snapLineToExisting(feature);
          window.dispatchEvent(
            new CustomEvent("gis:geometry-updated", { detail: snapped }),
          );
        };
        map.on("draw.update", handleDrawGeometry);
        map.on("draw.create", handleDrawGeometry);
        map.on("draw.delete", (event) =>
          console.info("[Next Draw] delete", event.features),
        );
        map.on("click", "pipa", (event) => {
          if (areaAnalysisModeRef.current) return;
          const feature = event.features?.[0];
          if (!feature?.properties?.id || !feature.geometry) return;
          const drawFeature = {
            type: "Feature",
            id: `edit-pipa-${feature.properties.id}`,
            geometry: feature.geometry,
            properties: {
              ...feature.properties,
              __popupPosition: popupPositionAt(event.point),
              __editorType: "pipa",
              __editorId: feature.properties.id,
            },
          };
          window.dispatchEvent(
            new CustomEvent("gis:pipa-selected", { detail: drawFeature }),
          );
          try {
            const result = drawRef.current?.add(drawFeature);
            const drawId = Array.isArray(result) ? result[0] : result;
            if (drawId)
              drawRef.current.changeMode("direct_select", {
                featureId: drawId,
              });
          } catch (error) {
            console.error("[Next Draw] gagal membuka edit pipa", error);
          }
        });
        map.on("mouseenter", "pipa", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "pipa", () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("click", "markers", (event) => {
          if (areaAnalysisModeRef.current) return;
          const feature = event.features?.[0];
          if (!feature?.properties?.id || !feature.geometry) return;
          const drawFeature = {
            type: "Feature",
            id: `edit-marker-${feature.properties.tipe}-${feature.properties.id}`,
            geometry: feature.geometry,
            properties: {
              ...feature.properties,
              __popupPosition: popupPositionAt(event.point),
              __editorType: "marker",
              __editorId: feature.properties.id,
            },
          };
          window.dispatchEvent(
            new CustomEvent("gis:marker-selected", { detail: drawFeature }),
          );
          try {
            const result = drawRef.current?.add(drawFeature);
            const drawId = Array.isArray(result) ? result[0] : result;
            if (drawId)
              drawRef.current.changeMode("simple_select", {
                featureIds: [drawId],
              });
          } catch (error) {
            console.error("[Next Draw] gagal membuka edit marker", error);
          }
        });
        map.on("mouseenter", "markers", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "markers", () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("click", "polygon", (event) => {
          if (areaAnalysisModeRef.current) return;
          const feature = event.features?.[0];
          if (!feature?.properties?.id || !feature.geometry) return;
          const drawFeature = {
            type: "Feature",
            id: `edit-polygon-${feature.properties.id}`,
            geometry: feature.geometry,
            properties: {
              ...feature.properties,
              __popupPosition: popupPositionAt(event.point),
              __editorType: "polygon",
              __editorId: feature.properties.id,
            },
          };
          window.dispatchEvent(
            new CustomEvent("gis:polygon-selected", { detail: drawFeature }),
          );
          try {
            const result = drawRef.current?.add(drawFeature);
            const drawId = Array.isArray(result) ? result[0] : result;
            if (drawId)
              drawRef.current.changeMode("direct_select", {
                featureId: drawId,
              });
          } catch (error) {
            console.error("[Next Draw] gagal membuka edit polygon", error);
          }
        });
        map.on("mouseenter", "polygon", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "polygon", () => {
          map.getCanvas().style.cursor = "";
        });
        const refreshAfterCrud = (event) => {
          const sourceIds =
            event.detail?.type === "pipa"
              ? ["pipa"]
              : event.detail?.type === "marker"
                ? ["markers"]
                : ["polygon"];
          if (drawRef.current) drawRef.current.deleteAll();
          sourceIds.forEach((sourceId) => {
            const source = map.getSource(sourceId);
            if (source?.setTiles)
              source.setTiles([
                `${API_URL}/api/${sourceId === "markers" ? "marker" : sourceId}/tiles/{z}/{x}/{y}.pbf`,
              ]);
          });
          map.triggerRepaint();
        };
        window.addEventListener("gis:crud-saved", refreshAfterCrud);
        map.once("remove", () =>
          window.removeEventListener("gis:crud-saved", refreshAfterCrud),
        );
      }
      let activeDiameterFilter = null;
      const onDiameterFilter = event => {
        const diameter = String(event.detail?.diameter ?? "");
        if (!map.getLayer("pipa")) return;
        activeDiameterFilter = activeDiameterFilter === diameter ? null : diameter;
        if (activeDiameterFilter === null) {
          map.setPaintProperty("pipa", "line-opacity", 1);
          map.setPaintProperty("pipa", "line-width", 2);
        } else {
          map.setPaintProperty("pipa", "line-opacity", ["case", ["==", ["to-string", ["get", "diameter"]], activeDiameterFilter], 1, 0.12]);
          map.setPaintProperty("pipa", "line-width", ["case", ["==", ["to-string", ["get", "diameter"]], activeDiameterFilter], 5, 1]);
        }
      };
      window.addEventListener("gis:filter-diameter", onDiameterFilter);
      map.once("remove", () => window.removeEventListener("gis:filter-diameter", onDiameterFilter));
      map.on("load", () => {
        map.addSource("area-analysis", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "area-analysis-fill", type: "fill", source: "area-analysis", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#0ea5e9", "fill-opacity": 0.18 } });
        map.addLayer({ id: "area-analysis-outline", type: "line", source: "area-analysis", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#0284c7", "line-width": 3, "line-dasharray": [2, 1] } });
        map.addLayer({ id: "area-analysis-points", type: "circle", source: "area-analysis", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": "#0284c7", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      });
      map.on("click", (event) => {
        if (!areaAnalysisModeRef.current) return;
        const points = [...areaPointsRef.current, [event.lngLat.lng, event.lngLat.lat]];
        areaPointsRef.current = points;
        setAreaPoints(points);
        updateAreaPreview(points);
      });
      map.on("load", () => setStatus("MapLibre aktif"));
      map.on("load", () => {
        ["osm", "satellite", "googleHybrid", "googleSatellite"].forEach(
          (layerId) => {
            if (map.getLayer(layerId))
              map.setLayoutProperty(
                layerId,
                "visibility",
                layerId === baseLayer ? "visible" : "none",
              );
          },
        );
        const layerVisibility = {
          markers: [
            "markers",
            "marker-clusters",
            "marker-cluster-count",
            "markers-expanded",
          ],
          pipa: ["pipa"],
          polygon: ["polygon"],
        };
        Object.entries(layerVisibility).forEach(([key, layerIds]) => {
          layerIds.forEach((layerId) => {
            if (map.getLayer(layerId))
              map.setLayoutProperty(
                layerId,
                "visibility",
                visibility[key] ? "visible" : "none",
              );
          });
        });
      });
      const loadMarkerClusters = () => {
        if (expandedClusterRef.current) {
          expandedClusterRef.current = false;
          return;
        }
        if (!visibility.markers) {
          [
            "marker-clusters",
            "marker-cluster-count",
            "markers",
            "markers-expanded",
          ].forEach((id) => {
            if (map.getLayer(id))
              map.setLayoutProperty(id, "visibility", "none");
          });
          return;
        }
        ["marker-clusters", "marker-cluster-count", "markers"].forEach((id) => {
          if (map.getLayer(id))
            map.setLayoutProperty(id, "visibility", "visible");
        });
        if (map.getLayer("markers-expanded"))
          map.setLayoutProperty("markers-expanded", "visibility", "none");
        const bounds = map.getBounds();
        const bbox = [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ].join(",");
        apiFetch(`/api/marker?bbox=${encodeURIComponent(bbox)}`)
          .then((rows) => {
            const features = (rows || [])
              .filter((row) => row.geometry?.type === "Point")
              .map((row) => ({
                type: "Feature",
                geometry: row.geometry,
                properties: { id: row.id, tipe: row.tipe },
              }));
            map
              .getSource("markerClusters")
              ?.setData({ type: "FeatureCollection", features });
            console.info("[Next MapLibre] marker cluster loaded", {
              points: features.length,
            });
          })
          .catch((error) =>
            console.error("[Next MapLibre] gagal load marker cluster", error),
          );
      };
      map.on("load", loadMarkerClusters);
      map.on("moveend", loadMarkerClusters);
      map.on("click", "marker-clusters", (event) => {
        if (areaAnalysisModeRef.current) return;
        const cluster = event.features?.[0];
        const source = map.getSource("markerClusters");
        if (!cluster || !source?.getClusterExpansionZoom) return;
        Promise.all([
          source.getClusterExpansionZoom(cluster.properties.cluster_id),
          source.getClusterLeaves(
            cluster.properties.cluster_id,
            cluster.properties.point_count,
            0,
          ),
        ])
          .then(([zoom, leaves]) => {
            map
              .getSource("markerExpanded")
              ?.setData({ type: "FeatureCollection", features: leaves });
            expandedClusterRef.current = true;
            ["marker-clusters", "marker-cluster-count", "markers"].forEach(
              (id) => {
                if (map.getLayer(id))
                  map.setLayoutProperty(id, "visibility", "none");
              },
            );
            if (map.getLayer("markers-expanded"))
              map.setLayoutProperty(
                "markers-expanded",
                "visibility",
                "visible",
              );
            map.easeTo({ center: cluster.geometry.coordinates, zoom });
            console.info("[Next Cluster] marker asli ditampilkan", {
              count: leaves.length,
              zoom,
            });
          })
          .catch((error) =>
            console.error("[Next Cluster] gagal membuka marker cluster", error),
          );
      });
      map.on("mouseenter", "marker-clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "marker-clusters", () => {
        map.getCanvas().style.cursor = "";
      });
      apiFetch("/api/pipa/option")
        .then((data) => {
          if (map.getLayer("pipa"))
            map.setPaintProperty(
              "pipa",
              "line-color",
              pipeColorExpression(data.diameter || []),
            );
        })
        .catch((error) =>
          console.error(
            "[Next MapLibre] gagal memuat warna diameter pipa",
            error,
          ),
        );
      map.on("idle", () => {
        const markerCount = [
          "markers",
          "marker-clusters",
          "marker-cluster-count",
          "markers-expanded",
        ]
          .filter((id) => map.getLayer(id))
          .reduce(
            (total, id) =>
              total + map.queryRenderedFeatures({ layers: [id] }).length,
            0,
          );
        const counts = {
          markers: markerCount,
          pipa: map.queryRenderedFeatures({ layers: ["pipa"] }).length,
          polygon: map.queryRenderedFeatures({ layers: ["polygon"] }).length,
        };
        console.info("[Next MapLibre] rendered features", counts);
        setStatus(
          `Marker ${counts.markers} · Pipa ${counts.pipa} · Polygon ${counts.polygon}`,
        );
      });
      map.on("error", (event) =>
        console.error("[Next MapLibre] error", event.error),
      );
    };
    import(
      /* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/maplibre-gl@6.8.0/dist/maplibre-gl.mjs"
    )
      .then((module) => initialize(module.default || module))
      .catch((error) => {
        console.error("[Next MapLibre] initialization failed", error);
        if (!disposed) setStatus(`Gagal memuat MapLibre: ${error.message}`);
      });
    return () => {
      disposed = true;
      if (map && drawRef.current) map.removeControl(drawRef.current);
      map?.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
  }, [adminMode, showToast]);

  return (
    <section className="map-shell">
      <div ref={containerRef} className="map" />
      <div className={"geo-search " + (geoSearchOpen ? "is-open" : "")}>
        <button className="geo-search-toggle" type="button" aria-label={geoSearchOpen ? "Tutup pencarian lokasi" : "Cari lokasi"} title="Cari lokasi" onClick={() => { setGeoSearchOpen(open => !open); if (geoSearchOpen) { setGeoQuery(""); setGeoResults([]); } }}>⌕</button>
        {geoSearchOpen && <div className="geo-search-content"><input autoFocus aria-label="Cari desa atau kecamatan" placeholder="Cari desa/kecamatan..." value={geoQuery} onChange={event => setGeoQuery(event.target.value)} />{geoLoading && <span className="geo-search-loading">…</span>}{geoResults.length > 0 && <div className="geo-results">{geoResults.map((result,index) => <button type="button" key={result.name + "-" + index} onClick={() => chooseGeoResult(result)}>{result.name}</button>)}</div>}</div>}
      </div>
      <div className="map-status">{status}</div>
      {adminMode && (
        <>
          <div className="draw-toolbar" aria-label="Editor geometri">
            <button className={areaAnalysisMode ? "draw-tool-active" : ""} title="Analisis area" aria-label="Analisis area" type="button" onClick={startAreaAnalysis}>⌗</button>
            <button
              className={activeDrawMode === "draw_line_string" ? "draw-tool-active" : ""}
              title="Pipa baru"
              aria-label="Pipa baru"
              type="button"
              onClick={() => startDraw("draw_line_string")}
            >
              ╱
            </button>
            <button
              className={activeDrawMode === "draw_point" ? "draw-tool-active" : ""}
              title="Marker baru"
              aria-label="Marker baru"
              type="button"
              onClick={() => startDraw("draw_point")}
            >
              ●
            </button>
            <button
              className={activeDrawMode === "draw_polygon" ? "draw-tool-active" : ""}
              title="Polygon baru"
              aria-label="Polygon baru"
              type="button"
              onClick={() => startDraw("draw_polygon")}
            >
              ⬠
            </button>
            <button
              title="Pilih atau edit"
              aria-label="Pilih atau edit"
              type="button"
              onClick={() => startDraw("simple_select")}
            >
              ↖
            </button>
            <button
              title="Hapus"
              aria-label="Hapus"
              type="button"
              className="draw-trash"
              onClick={() => startDraw("trash")}
            >
              ⌫
            </button>
          </div>
          {areaAnalysisMode && (
            <div className="area-analysis-actions">
              <span>Titik area: {areaPoints.length} (minimal 3)</span>
              <button type="button" onClick={clearAreaAnalysis}>Ulangi</button>
              <button type="button" disabled={areaPoints.length < 3 || areaStatsLoading} onClick={finishAreaAnalysis}>{areaStatsLoading ? "Menghitung..." : "Hitung"}</button>
              <button type="button" onClick={startAreaAnalysis}>Batal</button>
            </div>
          )}
          {areaStats && (
            <div className="area-analysis-results" role="status">
              <strong>Hasil Analisis Area</strong>
              <span>Luas: {areaStats.areaHa} ha</span>
              <span>Point: {areaStats.pointCount ?? 0}</span>
              <span>Line: {areaStats.lineCount ?? 0}</span>
              <span>Polygon: {areaStats.polygonCount ?? 0}</span>
              <button type="button" onClick={() => { clearAreaAnalysis(); }}>Tutup</button>
            </div>
          )}
          <div className="layer-control">
            <button
              className="layer-toggle"
              type="button"
              aria-label="Tampilkan kontrol layer"
            >
              ☰
            </button>
            <div className="layer-options">
              <strong>Basemap</strong>
              {[
                ["osm", "OpenStreetMap"],
                ["satellite", "Citra Satelit"],
                ["googleHybrid", "Google Hybrid"],
                ["googleSatellite", "Google Satelit"],
              ].map(([id, label]) => (
                <label key={id}>
                  <input
                    type="radio"
                    name="basemap"
                    checked={baseLayer === id}
                    onChange={() => changeBaseLayer(id)}
                  />
                  {label}
                </label>
              ))}
              <hr />
              <strong>Layer</strong>
              {[
                ["markers", "Tampilkan Marker"],
                ["pipa", "Tampilkan Pipa"],
                ["polygon", "Tampilkan Polygon"],
              ].map(([id, label]) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={visibility[id]}
                    onChange={() => toggleLayer(id)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
