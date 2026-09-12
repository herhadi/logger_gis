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
                "circle-radius": [
                  "step",
                  ["get", "point_count"],
                  16,
                  20,
                  21,
                  100,
                  27,
                ],
                "circle-stroke-color": "#fff",
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
          window.dispatchEvent(
            new CustomEvent("gis:draw-created", { detail: event.features[0] }),
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
          const feature = event.features?.[0];
          if (!feature?.properties?.id || !feature.geometry) return;
          const drawFeature = {
            type: "Feature",
            id: `edit-pipa-${feature.properties.id}`,
            geometry: feature.geometry,
            properties: {
              ...feature.properties,
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
          const feature = event.features?.[0];
          if (!feature?.properties?.id || !feature.geometry) return;
          const drawFeature = {
            type: "Feature",
            id: `edit-marker-${feature.properties.tipe}-${feature.properties.id}`,
            geometry: feature.geometry,
            properties: {
              ...feature.properties,
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
          const feature = event.features?.[0];
          if (!feature?.properties?.id || !feature.geometry) return;
          const drawFeature = {
            type: "Feature",
            id: `edit-polygon-${feature.properties.id}`,
            geometry: feature.geometry,
            properties: {
              ...feature.properties,
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
      <div className="map-status">{status}</div>
      {adminMode && (
        <>
          <div className="draw-toolbar" aria-label="Editor geometri">
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
