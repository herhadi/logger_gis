// Read-only map for user view (markers/pipes/polygons).
// Keeps the same rendering strategy as admin.js, without edit/create controls.

const UserMap = {
    config: {
        mapCenter: [-6.9383, 109.7178],
        defaultZoom: 13,
        maxZoom: 24,
        debounceDelay: 300,
        svgInteractiveZoom: 18
    },

    layers: {
        map: null,
        markerGroup: null,
        pipeGroup: L.layerGroup(),
        polygonGroup: L.layerGroup(),
        pipeGeometry: null,
        polyGeometry: null,
        polyCanvasRenderer: null,
        polySvgRenderer: null,
        pipaCanvasRenderer: null,
        pipaSvgRenderer: null
    },

    state: {
        layerVisibility: {
            markers: true,
            pipes: true,
            polygons: false
        },
        diamtrColors: {},
        diameterList: [],
        jenisList: []
    },

    init() {
        this._setupBaseLayers();
        this._setupMap();
        this._setupLayerControl();
        this._setupEventHandlers();
        this.loadLegend();

        this.layers.map.whenReady(() => {
            this.loadAllLayers();
        });
    },

    _setupBaseLayers() {
        // Base layers (match admin.js options where possible)
        this.baseLayers = {
            "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap',
                maxZoom: 23,
                maxNativeZoom: 19
            }),
            "Citra Satelit": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri',
                maxZoom: 23,
                maxNativeZoom: 19,
                noWrap: true
            }),
            "Google Hybrid": L.tileLayer('http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
                maxZoom: 23,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: '&copy; Google Hybrid'
            })
        };
    },

    _setupMap() {
        this.layers.map = L.map('map', {
            center: this.config.mapCenter,
            zoom: this.config.defaultZoom,
            layers: [this.baseLayers["Citra Satelit"]],
            maxZoom: this.config.maxZoom,
            preferCanvas: true
        });

        // Panes (zIndex order)
        this.layers.map.createPane('polygonPane').style.zIndex = 400;
        this.layers.map.createPane('pipaPane').style.zIndex = 500;
        this.layers.map.createPane('markerPane').style.zIndex = 600;

        // Renderers bound to panes (prevents event issues when mixing SVG/Canvas)
        this.layers.polyCanvasRenderer = L.canvas({ padding: 0.5, pane: 'polygonPane' });
        this.layers.polySvgRenderer = L.svg({ padding: 0.5, pane: 'polygonPane' });
        this.layers.pipaCanvasRenderer = L.canvas({ padding: 0.5, pane: 'pipaPane' });
        this.layers.pipaSvgRenderer = L.svg({ padding: 0.5, pane: 'pipaPane' });

        // Clustered markers for performance
        this.layers.markerGroup = L.markerClusterGroup({
            chunkedLoading: true,
            disableClusteringAtZoom: 18,
            maxClusterRadius: 50
        });

        // Separate geometry holders (mirrors admin.js)
        this.layers.pipeGeometry = L.layerGroup().addTo(this.layers.map);
        this.layers.polyGeometry = L.layerGroup().addTo(this.layers.map);

        if (this.state.layerVisibility.markers) this.layers.map.addLayer(this.layers.markerGroup);
        if (this.state.layerVisibility.pipes) this.layers.map.addLayer(this.layers.pipeGroup);
        if (this.state.layerVisibility.polygons) this.layers.map.addLayer(this.layers.polygonGroup);
    },

    _setupLayerControl() {
        const overlays = {
            "Tampilkan Marker": this.layers.markerGroup,
            "Tampilkan Pipa": this.layers.pipeGroup,
            "Tampilkan Polygon": this.layers.polygonGroup
        };

        this.layerControl = L.control.layers(this.baseLayers, overlays, { collapsed: true }).addTo(this.layers.map);
    },

    _setupEventHandlers() {
        this.layers.map.on("moveend", this.debounce(() => {
            this.loadAllLayers();
        }, this.config.debounceDelay));

        this.layers.map.on('overlayadd overlayremove', (e) => {
            if (e.layer === this.layers.markerGroup) this.state.layerVisibility.markers = e.type === 'overlayadd';
            if (e.layer === this.layers.pipeGroup) this.state.layerVisibility.pipes = e.type === 'overlayadd';
            if (e.layer === this.layers.polygonGroup) this.state.layerVisibility.polygons = e.type === 'overlayadd';
            this.loadAllLayers();
        });
    },

    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    },

    _getLatLng(m) {
        if (m.coords && m.coords.length === 2) return { lat: parseFloat(m.coords[0]), lng: parseFloat(m.coords[1]) };
        if (m.y && m.x) return { lat: parseFloat(m.y), lng: parseFloat(m.x) };
        return { lat: null, lng: null };
    },

    async loadAllLayers() {
        if (!this.layers.map) return;

        const bounds = this.layers.map.getBounds();
        if (!bounds.isValid()) return;

        // markers: West, South, East, North
        const bboxMarkers = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(",");
        // pipa/polygon: South, West, North, East (admin.js convention)
        const bboxSWNE = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].join(",");

        const jobs = [];
        if (this.state.layerVisibility.markers) jobs.push(this.loadMarkers(bboxMarkers));
        if (this.state.layerVisibility.pipes) jobs.push(this.loadPipa(bboxSWNE));
        if (this.state.layerVisibility.polygons) jobs.push(this.loadPolygon(bboxSWNE));

        await Promise.all(jobs);
    },

    async loadMarkers(bbox) {
        try {
            this.layers.markerGroup.clearLayers();

            const res = await fetch(`/api/marker?bbox=${bbox}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            data.forEach(m => {
                const { lat, lng } = this._getLatLng(m);
                if (!lat || !lng) return;

                const marker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: "custom-marker",
                        html: `<div style="
                            width:10px;
                            height:10px;
                            border-radius:50%;
                            background:${this._markerColor(m.tipe)};
                            border:1px solid #fff;
                        "></div>`,
                        iconSize: [10, 10]
                    }),
                    pane: 'markerPane'
                });

                marker.featureData = m;
                marker._markerId = m.id;

                marker.bindPopup(() => {
                    const d = marker.featureData;
                    const ll = marker.getLatLng();
                    return `
                        <div class="p-2" style="min-width:220px">
                            <div class="fw-bold mb-2 text-center">Info Marker</div>
                            <div><b>ID:</b> ${d.id}</div>
                            <div><b>Tipe:</b> ${(d.tipe || '').toUpperCase()}</div>
                            <div><b>Elevasi:</b> ${d.elevation ?? '-'}</div>
                            <div><b>Lokasi:</b> ${d.lokasi ?? '-'}</div>
                            <div><b>Keterangan:</b> ${d.keterangan ?? '-'}</div>
                            <div class="mt-2" style="text-align:center;">
                                <button id="lokasiBtn-${d.id}" onclick="bukaRute(${ll.lat}, ${ll.lng}, '${d.id}')" class="btn btn-sm btn-primary" style="width:100%;">
                                    Lokasi
                                </button>
                            </div>
                        </div>`;
                }, { autoPan: false });

                this.layers.markerGroup.addLayer(marker);
            });
        } catch (err) {
            console.error("Gagal load markers:", err);
        }
    },

    _markerColor(tipe) {
        const map = {
            acc: "orange",
            reservoir: "blue",
            tank: "green",
            valve: "red"
        };
        return map[tipe] || "gray";
    },

    async loadPipa(bbox) {
        try {
            const currentZoom = this.layers.map.getZoom();
            const isSVGMode = currentZoom >= this.config.svgInteractiveZoom;

            // If a canvas renderer exists, it can cover SVG polygons. Disable events in SVG mode.
            if (this.layers.pipaCanvasRenderer?._container) {
                this.layers.pipaCanvasRenderer._container.style.pointerEvents = isSVGMode ? 'none' : 'auto';
            }

            const res = await fetch(`/api/pipa?bbox=${bbox}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            this.layers.pipeGroup.clearLayers();
            this.layers.pipeGeometry.clearLayers();

            data.forEach(pipe => {
                const coords = pipe.geometry || [];
                if (!Array.isArray(coords) || coords.length < 2) return;

                const color = this.state.diamtrColors[pipe.diameter] || "red";
                const line = L.polyline(coords, {
                    color,
                    weight: 3,
                    pane: "pipaPane",
                    interactive: true,
                    renderer: isSVGMode ? this.layers.pipaSvgRenderer : this.layers.pipaCanvasRenderer
                }).addTo(this.layers.pipeGroup);

                line.featureData = pipe;
                line._pipeId = pipe.id;
                this.layers.pipeGeometry.addLayer(line);

                line.on('mouseover', () => {
                    this.layers.map.getContainer().style.cursor = 'pointer';
                });
                line.on('mouseout', () => {
                    this.layers.map.getContainer().style.cursor = '';
                });

                line.bindPopup(() => {
                    const d = line.featureData;
                    return `
                        <div class="p-2" style="min-width:220px">
                            <div class="fw-bold mb-2 text-center">Info Pipa</div>
                            <div><b>ID:</b> ${d.id}</div>
                            <div><b>Diameter:</b> ${d.diameter ?? '-'}</div>
                            <div><b>Jenis:</b> ${d.jenis ?? '-'}</div>
                            <div><b>Panjang:</b> ${d.panjang_hitung ?? d.panjang_input ?? '-'} m</div>
                            <div><b>Lokasi:</b> ${d.lokasi ?? '-'}</div>
                            <div><b>Keterangan:</b> ${d.keterangan ?? '-'}</div>
                        </div>`;
                }, { autoPan: false });
            });
        } catch (err) {
            console.error("Gagal load pipa:", err);
        }
    },

    async loadPolygon(bbox) {
        try {
            const currentZoom = this.layers.map.getZoom();
            const isSVGMode = currentZoom >= this.config.svgInteractiveZoom;

            // For performance: polygons are only interactive in SVG mode.
            if (this.layers.polyCanvasRenderer?._container) {
                this.layers.polyCanvasRenderer._container.style.pointerEvents = isSVGMode ? 'none' : 'auto';
            }

            const res = await fetch(`/api/polygon?bbox=${bbox}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            this.layers.polygonGroup.clearLayers();
            this.layers.polyGeometry.clearLayers();

            data.forEach(poly => {
                const ring = poly.geometry ? poly.geometry[0] : [];
                if (!Array.isArray(ring) || ring.length < 3) return;

                const polygon = L.polygon(ring, {
                    color: 'blue',
                    weight: 1,
                    fill: true,
                    fillOpacity: 0.4,
                    pane: 'polygonPane',
                    interactive: isSVGMode,
                    renderer: isSVGMode ? this.layers.polySvgRenderer : this.layers.polyCanvasRenderer
                }).addTo(this.layers.polygonGroup);

                polygon.featureData = poly;
                polygon._polygonId = poly.id;
                this.layers.polyGeometry.addLayer(polygon);

                if (isSVGMode) {
                    polygon.on('add', function () {
                        const el = this.getElement();
                        if (el) el.style.pointerEvents = 'visiblePainted';
                    });
                    polygon.on('mouseover', () => {
                        this.layers.map.getContainer().style.cursor = 'pointer';
                    });
                    polygon.on('mouseout', () => {
                        this.layers.map.getContainer().style.cursor = '';
                    });

                    polygon.bindPopup(() => {
                        const d = polygon.featureData;
                        return `
                            <div class="p-2" style="min-width:220px">
                                <div class="fw-bold mb-2 text-center">Info Polygon</div>
                                <div><b>ID:</b> ${d.id}</div>
                                <div><b>No SAMW:</b> ${d.nosamw ?? '-'}</div>
                                <div><b>Luas:</b> ${d.luas_hitung ?? '-'} m²</div>
                            </div>`;
                    }, { autoPan: false });
                }
            });
        } catch (err) {
            console.error("Gagal load polygon:", err);
        }
    },

    async loadLegend() {
        try {
            const res = await fetch('/api/pipa/option');
            if (!res.ok) return;
            const data = await res.json();

            this.state.diameterList = data.diameter || [];
            this.state.jenisList = data.jenis || [];

            // Same palette as admin.js (stable, readable)
            const colorPalette = [
                '#0077ff', '#28a745', '#dc3545', '#ffc107',
                '#6c757d', '#ff6600', '#00ccff', '#8e44ad',
                '#00aa00', '#fd7e14', '#e83e8c'
            ];

            const legendDiv = document.getElementById('legend');
            if (!legendDiv) return;
            legendDiv.innerHTML = '<h4>Diameter Pipa</h4>';

            this.state.diameterList.forEach((dia, i) => {
                const color = i < colorPalette.length ? colorPalette[i] : `hsl(${(i * 40) % 360}, 70%, 50%)`;
                this.state.diamtrColors[dia] = color;

                const item = document.createElement('div');
                item.innerHTML = `<span class="legend-line" style="background:${color}; height:6px;"></span> ${dia}`;
                legendDiv.appendChild(item);
            });
        } catch (err) {
            console.error("Gagal load legend:", err);
        }
    }
};

window.addEventListener('DOMContentLoaded', () => {
    UserMap.init();
});

// Open external maps app (Google Maps in a new tab).
window.bukaRute = function bukaRute(lat, lng, id) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        alert("Koordinat tujuan tidak ditemukan.");
        return;
    }

    const btn = document.getElementById(`lokasiBtn-${id}`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Membuka...";
    }

    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');

    if (btn) {
        setTimeout(() => {
            btn.disabled = false;
            btn.textContent = "Lokasi";
        }, 1000);
    }
};
