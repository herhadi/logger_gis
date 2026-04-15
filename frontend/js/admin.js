// ===============================
// MAP MANAGER MODULE
// ===============================
const MapManager = {
    // Configuration
    config: {
        mapCenter: [-6.9383, 109.7178],
        defaultZoom: 13,
        maxZoom: 24,
        apiKey: "dc9aa1e045f7427f9da781232e8d0544",
        debounceDelay: 300
    },

    // Layer Groups
    layers: {
        map: null,
        editableLayers: new L.FeatureGroup(),

        // --- MARKER LAYERS ---
        // Gunakan MarkerCluster untuk grup utama (3.800+ data)
        markerGroup: L.markerClusterGroup({
            chunkedLoading: true,      // Menghindari browser "freeze" saat meload ribuan titik
            disableClusteringAtZoom: 18, // Cluster pecah jadi titik biasa saat zoom dekat
            maxClusterRadius: 50       // Jarak pixel antar titik untuk digabung
        }),
        markerGroupNew: L.layerGroup(), // Tetap LayerGroup biasa untuk marker yang sedang dibuat
        markerMap: {},

        // --- PIPE LAYERS ---
        pipeGroup: L.layerGroup(),
        pipeGroupNew: L.layerGroup(),
        pipaLayers: {},

        // --- POLYGON LAYERS ---
        polygonGroup: L.layerGroup(),
        polygonGroupNew: L.layerGroup(),

        // --- UTILITY LAYERS ---
        geometryLayer: L.featureGroup(), // Induk untuk pencarian/analisis area
        selectionLayer: L.featureGroup()
    },

    // State Management
    state: {
        geomanDisabledByDraw: false,
        cachedIcons: null,
        iconOptionsLoaded: false,
        snapMarker: null,
        lastSnapPoint: null,
        searchMarker: null,
        diamtrColors: {},
        diameterList: [],
        jenisList: [],
        colorMap: {
            acc: "orange",
            reservoir: "blue",
            tank: "green",
            valve: "red"
        },
        isInitializing: true, // PATCH: Flag untuk memblokir event selama startup
        layerVisibility: {
            markers: true,
            pipes: true,
            newPipes: true,
            polygons: false,
            newPolygons: true
        },
        polygonCount: 0,
        cachedPolygonData: [],
        pipeEndpointIndex: new Map(),
        suppressMoveReloadUntil: 0
    },

    // ===============================
    // INITIALIZATION
    // ===============================
    init() {
        this.state.isInitializing = true;
        // console.log('🔍 INIT - Initial state:', this.state.layerVisibility);

        this._setupBaseLayers();
        this._setupMap();
        this._setupControls();
        this._setupEventHandlers();

        this.layers.map.whenReady(() => {
            // console.log('🗺️ Map is ready');
            this.loadLegend();

            // ✅ FIX: Load data hanya untuk layer yang visible di state awal
            this.loadAllLayers().then(() => {
                // console.log('✅ Initial data loaded');

                // Setup layer control events setelah data awal dimuat
                this._setupLayerControlEvents();

                this._checkUserSession();

                this.state.isInitializing = false;
                console.log('🎉 Map initialization completed');
            });
        });
    },


    _setupBaseLayers() {
        this.baseLayers = window.MapCoreShared.createBaseLayers();
    },

    _setupMap() {
        window.MapCoreShared.setupMap(this, {
            includeEditableLayers: true,
            includeSelectionLayer: true,
            includeNewPipeLayer: true,
            includeNewPolygonLayer: true,
            includeNewMarkerLayer: true,
            svgRendererKey: 'svgRenderer'
        });
    },

    _setupControls() {
        this._setupGeomanControls();
        this._setupDrawControl();
        this._setupLayerControl();
        this._setupGeocoder();
    },

    _setupGeomanControls() {
        // 1. Atur opsi global untuk Snapping (Magnet)
        this.layers.map.pm.setGlobalOptions({
            snappable: true,
            snapDistance: 20, // Naikkan sedikit lagi agar lebih "magnetis"
            allowSelfIntersection: false,
            continueDrawing: false,
            templineStyle: { color: 'orange', dashArray: '5, 5' },
            hintlineStyle: { color: 'orange', dashArray: '5, 5' },
        });

        // 2. Aktifkan Controls
        this.layers.map.pm.addControls({
            position: 'topleft',
            drawMarker: true,
            drawPolyline: true,
            drawPolygon: true,
            drawCircle: false,
            drawRectangle: false,
            drawCircleMarker: false,
            editMode: true,
            dragMode: false,
            cutPolygon: false,
            rotateMode: false,
            removalMode: true,
        });

        // 3. FIX: Buat Marker & Layer lain "Tembus Klik" saat menggambar
        this.layers.map.on('pm:drawstart', (e) => {
            this.layers.map.eachLayer((layer) => {
                // Hanya buat "tembus" jika itu bukan layer yang sedang digambar
                if ((layer instanceof L.Marker || layer instanceof L.Path) && layer !== e.workingLayer) {
                    if (typeof layer.getElement === 'function' && layer.getElement()) {
                        layer.getElement().style.pointerEvents = 'none';
                    }
                }
            });

            if (this.layers.map?.getContainer) {
                const container = this.layers.map.getContainer();
                container.focus?.();
                container.style.cursor = 'crosshair';
            }
        });

        // 4. FIX: Kembalikan interaksi setelah gambar selesai atau batal
        this.layers.map.on('pm:drawend', () => {
            this.layers.map.eachLayer((layer) => {
                if (typeof layer.getElement === 'function' && layer.getElement()) {
                    layer.getElement().style.pointerEvents = 'auto'; // Kembalikan interaksi
                }
            });

            if (this.layers.map?.getContainer) {
                const container = this.layers.map.getContainer();
                container.style.cursor = '';
            }
        });

        // 5. FIX: Pastikan mode edit/hapus juga tidak mengganggu interaksi layer lain
        this.layers.map.on('pm:globaleditmodetoggled pm:globalremovalmodetoggled', (e) => {
            const enabled = e.enabled;
            this.layers.map.eachLayer((layer) => {
                if (typeof layer.getElement === 'function' && layer.getElement()) {
                    // Jika mode edit/hapus ON, pastikan bisa diklik (auto)
                    // Jika OFF, biarkan default
                    layer.getElement().style.pointerEvents = enabled ? 'auto' : 'auto';
                }
            });
        });
    },

    _setupDrawControl() {
        // Configure draw control texts
        Object.assign(L.drawLocal.draw.toolbar.buttons, {
            polygon: 'Gambar Area Seleksi'
        });

        Object.assign(L.drawLocal.draw.handlers.polygon.tooltip, {
            start: 'Klik peta untuk mulai menggambar area',
            cont: 'Klik untuk menambah titik',
            end: 'Klik titik awal untuk menyelesaikan'
        });

        Object.assign(L.drawLocal.edit.handlers, {
            edit: {
                tooltip: {
                    text: 'Seret titik-titik untuk mengubah bentuk area',
                    subtext: 'Klik "Selesai" atau "Batal" untuk membatalkan'
                }
            },
            remove: {
                tooltip: { text: 'Klik pada shape untuk menghapusnya' }
            }
        });

        Object.assign(L.drawLocal.edit.toolbar.actions, {
            save: { text: 'Selesai' },
            cancel: { text: 'Batal' },
            clearAll: { text: 'Hapus Semua' }
        });

        L.drawLocal.edit.toolbar.buttons.edit = 'Ubah Polygon yang Ada';
        L.drawLocal.draw.toolbar.finish.text = 'Selesai';
        L.drawLocal.draw.toolbar.undo.text = 'Undo';

        const drawControl = new L.Control.Draw({
            position: 'bottomleft',
            draw: {
                polygon: {
                    allowIntersection: false,
                    showArea: true,
                    shapeOptions: { color: '#3388ff', fillColor: 'orange', fillOpacity: 0.3 }
                },
                rectangle: false,
                polyline: false,
                circle: false,
                marker: false,
                circlemarker: false
            },
            edit: {
                featureGroup: this.layers.selectionLayer,
                remove: true
            }
        });

        this.layers.map.addControl(drawControl);
    },

    _setupLayerControl() {
        this.layers.overlays = {
            'Tampilkan Marker': this.layers.markerGroup,
            'Marker Baru (Lokal)': this.layers.markerGroupNew, // Tambahkan ini
            'Tampilkan Pipa': this.layers.pipeGroup,
            'Pipa Baru (Lokal)': this.layers.pipeGroupNew,
            'Tampilkan Polygon': this.layers.polygonGroup,
            'Polygon Baru (Lokal)': this.layers.polygonGroupNew,
        };

        this.layerControl = L.control.layers(this.baseLayers, this.layers.overlays, { collapsed: true }).addTo(this.layers.map);

        // PATCH: Hapus pemanggilan _setInitialCheckboxStates(true); karena Layer Control 
        // akan otomatis mencentang layer yang sudah ada di peta (yang di-add di _setupMap)
    },

    _setInitialCheckboxStates() {
        // PATCH: FUNGSI INI DIKOSONGKAN/DIHAPUS KARENA SUDAH TIDAK DIBUTUHKAN.
        console.log("🔍 Setting overlay checkbox states (DEPRECATED: Automatic by Leaflet)");
    },

    _applyLayerVisibility(layerName, shouldBeVisible) {
        const layerMap = {
            'markers': this.layers.markerGroup,
            'pipes': this.layers.pipeGroup,
            'newPipes': this.layers.pipeGroupNew,
            'polygons': this.layers.polygonGroup,
            'newPolygons': this.layers.polygonGroupNew
        };

        const layer = layerMap[layerName];
        if (!layer) return;

        if (shouldBeVisible) {
            if (!this.layers.map.hasLayer(layer)) {
                this.layers.map.addLayer(layer);
                console.log('✅ Layer added to map:', layerName);
            }

            // ✅ FIX: Load data untuk layer data utama yang visible
            if (this._isDataLayer(layerName) && !this._layerHasData(layerName)) {
                console.log('📥 Loading data for:', layerName);
                this._loadLayerImmediately(layerName);
            }
        } else {
            if (this.layers.map.hasLayer(layer)) {
                this.layers.map.removeLayer(layer);
                console.log('❌ Layer removed from map:', layerName);
            }
            // Hanya clear data untuk layer yang tidak visible
            if (this._isDataLayer(layerName)) {
                this._clearLayerData(layerName);
            }
        }
    },

    _setupLayerControlEvents() {
        // Monitor perubahan visibility pada layer groups
        this.layers.markerGroup.on('add remove', (e) => {
            this.state.layerVisibility.markers = this.layers.map.hasLayer(this.layers.markerGroup);
            console.log('🔍 Marker visibility changed:', this.state.layerVisibility.markers);
        });

        this.layers.pipeGroup.on('add remove', (e) => {
            this.state.layerVisibility.pipes = this.layers.map.hasLayer(this.layers.pipeGroup);
            console.log('🔍 Pipe visibility changed:', this.state.layerVisibility.pipes);
        });

        this.layers.pipeGroupNew.on('add remove', (e) => {
            this.state.layerVisibility.newPipes = this.layers.map.hasLayer(this.layers.pipeGroupNew);
            console.log('🔍 New Pipe visibility changed:', this.state.layerVisibility.newPipes);
        });

        this.layers.polygonGroup.on('add remove', (e) => {
            this.state.layerVisibility.polygons = this.layers.map.hasLayer(this.layers.polygonGroup);
            console.log('🔍 Polygon visibility changed:', this.state.layerVisibility.polygons);

            // ✅ FIX: Load data ketika polygon layer diaktifkan
            if (this.state.layerVisibility.polygons && !this._layerHasData('polygons')) {
                console.log('🚀 Loading polygons data now...');
                this._loadLayerImmediately('polygons');
            }
        });

        this.layers.polygonGroupNew.on('add remove', (e) => {
            this.state.layerVisibility.newPolygons = this.layers.map.hasLayer(this.layers.polygonGroupNew);
            console.log('🔍 New Polygon visibility changed:', this.state.layerVisibility.newPolygons);
        });
    },

    _setupGeocoder() {
        const geoapifyGeocoder = {
            geocode: (query, cb, context) => {
                const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&limit=10&apiKey=${this.config.apiKey}`;

                return fetch(url)
                    .then(r => {
                        if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
                        return r.json();
                    })
                    .then(data => {
                        const results = (data.features || []).map(feature => {
                            const prop = feature.properties;
                            return {
                                name: prop.formatted || [prop.street, prop.city, prop.country].filter(Boolean).join(', '),
                                center: L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]),
                                bbox: feature.bbox ? L.latLngBounds(
                                    [feature.bbox[1], feature.bbox[0]],
                                    [feature.bbox[3], feature.bbox[2]]
                                ) : null,
                                properties: prop
                            };
                        });

                        // Pastikan selalu mengembalikan array, bahkan jika kosong
                        return results || [];
                    })
                    .catch(err => {
                        console.error("Geoapify error:", err);
                        // Kembalikan array kosong jika error
                        return [];
                    })
                    .then(results => {
                        // Pastikan callback dipanggil dengan hasil yang valid
                        if (typeof cb === "function") {
                            cb.call(context || this, results);
                        }
                        return results;
                    });
            },

            suggest: function (query, cb, context) {
                return this.geocode(query, cb, context);
            }
        };

        const geocoderControl = L.Control.geocoder({
            geocoder: geoapifyGeocoder,
            defaultMarkGeocode: false,
            position: 'topleft',
            placeholder: 'Cari lokasi...',
            errorMessage: 'Lokasi tidak ditemukan',
            showResultIcons: true,
            collapsed: true,
            // Tambahkan opsi untuk menangani error dengan lebih baik
            showUniqueResult: true,
            suggestTimeout: 250
        });

        geocoderControl.on('markgeocode', (e) => {
            this._handleGeocodeResult(e.geocode);
        });

        // Handle errors pada geocoder
        geocoderControl.on('error', (e) => {
            console.error('Geocoder error:', e.error);
            this.showToast('Gagal mencari lokasi', 'error');
        });

        geocoderControl.addTo(this.layers.map);
    },

    _setupEventHandlers() {
        this.layers.map.on(L.Draw.Event.CREATED, (e) => this._handleDrawCreated(e));
        this.layers.map.on('draw:edited', (e) => this._handleDrawEdited(e));
        this.layers.map.on('draw:deleted', () => {
            this.state.geomanDisabledByDraw = false;
        });
        this.layers.map.on('pm:create', (e) => this._handlePmCreate(e));

        this.layers.map.on("moveend", this.debounce(() => {
            if (Date.now() < this.state.suppressMoveReloadUntil) return;
            this.loadAllLayers();
        }, this.config.debounceDelay));

        // Per-layer "guards" in MapAdminEditShared (movestart/popupclose) 
        // will handle cancelling edit mode for polygons. 
        // No need for a broad movestart listener here that might conflict.

        // ✅ FIX: Add layer control event handlers
        this.layers.map.on('overlayadd overlayremove', (e) => {
            this._handleOverlayChange(e);
        });

        this.layers.map.on('popupopen', (e) => {
            // Avoid immediate reload/clear when popup auto-pans the map.
            if (e.popup?.options?.autoPan) {
                this.state.suppressMoveReloadUntil = Date.now() + 800;
            }
        });

        document.addEventListener("click", (e) => this._handleGlobalClick(e));

        // ✅ FIX: Setup layer control events untuk sync state
        // this._setupLayerControlEvents();
    },



    // ===============================
    // EVENT HANDLERS
    // ===============================
    _handleGeocodeResult(geocode) {
        // Clear existing markers
        this.layers.map.eachLayer(layer => {
            if (layer instanceof L.Marker) this.layers.map.removeLayer(layer);
        });

        if (geocode.bbox) {
            this.layers.map.fitBounds(geocode.bbox, { padding: [50, 50] });
        } else {
            this.layers.map.setView(geocode.center, 15);
        }

        L.marker(geocode.center)
            .addTo(this.layers.map)
            .bindPopup(`<b>${geocode.name}</b>`, { autoPan: true, closeOnClick: false })
            .openPopup();
    },

    async _handleDrawCreated(e) {
        this.state.geomanDisabledByDraw = true;
        const layer = e.layer;
        this.layers.selectionLayer.addLayer(layer);

        const resultHtml = await this._calculateGeometryInArea(layer.toGeoJSON());
        const latlngs = layer.getLatLngs()[0];
        const area = L.GeometryUtil.geodesicArea(latlngs);
        const ha = (area / 10000).toFixed(2);
        const anchor = latlngs[0];

        layer.bindPopup(`<b>Luas:</b> ${ha} ha<br>${resultHtml}`, { autoPan: true, closeOnClick: false });

        setTimeout(() => layer.openPopup(anchor), 0);
    },

    async _handleDrawEdited(e) {
        const tasks = [];
        e.layers.eachLayer(layer => {
            tasks.push((async () => {
                const resultHtml = await this._calculateGeometryInArea(layer.toGeoJSON());
                const latlngs = layer.getLatLngs()[0];
                const area = L.GeometryUtil.geodesicArea(latlngs);
                const ha = (area / 10000).toFixed(2);
                const firstLatLng = latlngs[0];

                layer.bindPopup(`<b>Luas:</b> ${ha} ha<br>${resultHtml}`, { autoPan: true, closeOnClick: false })
                    .openPopup(firstLatLng);
            })());
        });
        await Promise.all(tasks);
    },

    _handlePmCreate(e) {
        if (e.layer instanceof L.Marker) {
            this._handleNewMarkerCreation(e.layer);
            setTimeout(() => {
                if (this.layers.map.pm && typeof this.layers.map.pm.disableDraw === 'function') {
                    this.layers.map.pm.disableDraw();
                }
                if (this.layers.map?.getContainer) {
                    const container = this.layers.map.getContainer();
                    container.focus?.();
                    container.style.cursor = 'crosshair';
                }
            }, 10);
        } else if (e.layer instanceof L.Polyline && !(e.layer instanceof L.Polygon)) {
            this._handleNewPipeCreation(e.layer);
        } else if (e.layer instanceof L.Polygon) {
            this._handleNewPolygonCreation(e.layer);
        }
    },

    _handleNewMarkerCreation(marker) {
        // Set id sementara
        marker._markerId = "new";

        // Set custom icon untuk marker baru
        const markerIcon = L.divIcon({
            className: "custom-marker-new",
            html: `<div style="
            width:12px;
            height:12px;
            border-radius:50%;
            background:yellow;
            border:2px solid #fff;
            box-shadow: 0 0 5px rgba(0,0,0,0.5);
        "></div>`,
            iconSize: [12, 12],
        });

        marker.setIcon(markerIcon);

        // Masukkan ke group marker baru
        console.log("🆕 Adding new marker to markerGroupNew");
        console.log("🆕 markerGroupNew exists:", !!this.layers.markerGroupNew);
        this.layers.markerGroupNew.addLayer(marker);
        console.log("🆕 After add, markerGroupNew has layer:", this.layers.markerGroupNew.hasLayer(marker));
        console.log("🆕 markerGroupNew layer count:", this.layers.markerGroupNew.getLayers().length);
        if (marker.pm) marker.pm.disable();

        // Buat pilihan tipe marker dari colorMap (acc/reservoir/tank/valve)
        const tipeOptions = Object.keys(this.state.colorMap).map(tipe =>
            `<option value="${tipe}">${tipe.toUpperCase()}</option>`
        ).join("");

        // Bind popup form
        marker.bindPopup(`
        <div class="p-2" style="min-width:250px">                        
            <div class="fw-bold mb-2 text-center">Marker Baru</div>
            <div class="mb-2">
                <label class="form-label small mb-1">Tipe</label>
                <select class="form-select form-select-sm" id="newMarkerTipe">
                    <option value="">-- Pilih Tipe --</option>
                    ${tipeOptions}
                </select>
            </div>
            <div class="mb-2">
                <label class="form-label small mb-1">Elevasi</label>
                <input type="number" class="form-control form-control-sm" id="newMarkerElevation" placeholder="Masukkan elevasi">
            </div>
            <div class="mb-2">
                <label class="form-label small mb-1">Keterangan</label>
                <input type="text" class="form-control form-control-sm" id="newMarkerKeterangan" placeholder="Keterangan tambahan">
            </div>
            <div class="d-flex gap-1 mt-3">
                <button class="btn btn-sm btn-success flex-fill btn-save" data-type="marker" data-id="new">💾 Simpan</button>
                <button class="btn btn-sm btn-secondary flex-fill btn-cancel" data-type="marker" data-id="new">❌ Batal</button>
            </div>
            <div class="alert alert-danger mt-2 small" id="markerError" style="display:none; font-size:11px"></div>
        </div>
    `, { autoPan: true, closeOnClick: false }).openPopup();
    },

    _handleNewPipeCreation(line) {
        line._pipeId = "new";
        line.setStyle({ color: "red", dashArray: "5,5" });
        this.layers.pipeGroupNew.addLayer(line);
        if (line.pm) line.pm.disable();

        const diameterOptions = this.state.diameterList.map(d => `<option value="${d}">${d}</option>`).join("");
        const jenisOptions = this.state.jenisList.map(j => `<option value="${j}">${j}</option>`).join("");

        line.bindPopup(`
            <div class="p-2" style="min-width:250px">                        
                <div class="fw-bold mb-2 text-center">Pipa Baru</div>
                <div class="mb-2">
                    <label class="form-label small mb-1">Diameter</label>
                    <select class="form-select form-select-sm" id="newPipeDiameter">
                        <option value="">-- Pilih Diameter --</option>
                        ${diameterOptions}
                    </select>
                </div>
                <div class="mb-2">
                    <label class="form-label small mb-1">Jenis</label>
                    <select class="form-select form-select-sm" id="newPipeJenis">
                        <option value="">-- Pilih Jenis --</option>
                        ${jenisOptions}
                    </select>
                </div>
                <div class="d-flex gap-1 mt-3">
                    <button class="btn btn-sm btn-success flex-fill btn-save" data-type="pipe" data-id="new">💾 Simpan</button>
                    <button class="btn btn-sm btn-primary flex-fill btn-edit" data-type="pipe" data-id="new">✏️ Edit</button>
                    <button class="btn btn-sm btn-secondary flex-fill btn-cancel" data-type="pipe" data-id="new">❌ Batal</button>
                </div>
                <div class="alert alert-danger mt-2 small" id="pipeError" style="display:none; font-size:11px"></div>
            </div>
        `, { autoPan: true, closeOnClick: false }).openPopup();
    },

    _handleNewPolygonCreation(polygon) {
        polygon._polygonId = "new";
        polygon.setStyle({ color: "orange", dashArray: "5,5", fillOpacity: 0.3 });
        this.layers.polygonGroupNew.addLayer(polygon);
        if (polygon.pm) polygon.pm.disable();

        const initialArea = this._calculatePolygonArea(polygon.getLatLngs()[0]);

        polygon.bindPopup(`
            <div class="p-2" style="min-width:250px">                        
                <div class="fw-bold mb-2 text-center">Polygon Baru</div>
                <div class="mb-2">
                    <label class="form-label small mb-1">No Sambung</label>
                    <input type="text" class="form-control form-control-sm" id="newPolygonNosamw" placeholder="Contoh: 0101010001">
                    <div class="form-text text-danger small" id="nosamwError" style="display:none"></div>
                </div>
                <div class="mb-2">
                    <label class="form-label small mb-1">Luas (m²)</label>
                    <input type="number" class="form-control form-control-sm" id="newPolygonLuas" value="${initialArea}" readonly style="background-color:#f8f9fa">
                    <div class="form-text" style="font-size:11px">Luas dihitung otomatis dari bentuk polygon</div>
                </div>                        
                <div class="d-flex gap-1 mt-3">
                    <button class="btn btn-sm btn-success flex-fill btn-save" data-type="srpolygon" data-id="new">💾 Simpan</button>
                    <button class="btn btn-sm btn-primary flex-fill btn-edit" data-type="srpolygon" data-id="new">✏️ Edit</button>
                    <button class="btn btn-sm btn-secondary flex-fill btn-cancel" data-type="srpolygon" data-id="new">❌ Batal</button>
                </div>
                <div class="alert alert-danger mt-2 small" id="polygonError" style="display:none; font-size:11px"></div>
            </div>
        `, { autoPan: true, closeOnClick: false }).openPopup();
    },

    _handleGlobalClick(e) {
        const btn = e.target.closest("button");
        if (!btn) return;

        console.log("🖱️ Global click target:", btn);

        if (btn.classList.contains("btn-save")) {
            this._handleSave(btn);
        } else if (btn.classList.contains("btn-edit")) {
            this._handleEdit(btn);
        } else if (btn.classList.contains("btn-cancel")) {
            this._handleCancel(btn);
        } else if (btn.classList.contains("btn-hapus")) {
            this._handleDelete(btn);
        }
    },

    _handleOverlayChange(e) {
        if (this.state.isInitializing) return;

        const layerName = this._getLayerNameFromEvent(e);
        console.log('🎯 Handling overlay change for:', layerName, 'Type:', e.type);
        const isVisible = e.type === 'overlayadd';

        // Update state global agar loadAllLayers tahu apa yang harus ditarik
        this.state.layerVisibility[layerName] = isVisible;

        if (isVisible) {
            // Jika dinyalakan, picu load ulang untuk area saat ini
            this.loadAllLayers();
            console.log('📊 New visibility state:', this.state.layerVisibility);
        } else {
            // Jika dimatikan, paksa pembersihan memori untuk layer tersebut
            this._clearLayerData(layerName);
        }
    },

    _loadLayerImmediately(layerName) {
        if (!this.layers.map || !this._isDataLayer(layerName)) {
            console.log(`⚠️ Load ignored for non-data layer: ${layerName}`);
            return;
        }

        if (this._layerHasData(layerName)) {
            console.log(`✅ ${layerName} already has data, skipping load`);
            return;
        }

        const bounds = this.layers.map.getBounds();
        if (bounds.getSouthWest().equals(bounds.getNorthEast())) {
            console.log('⚠️ Map bounds belum valid, tunggu sebentar...');
            setTimeout(() => this._loadLayerImmediately(layerName), 500);
            return;
        }

        console.log(`🚀 Loading ${layerName} immediately with bounds:`, bounds);

        switch (layerName) {
            case 'markers':
                const bbox1 = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(",");
                this.loadMarkers(bbox1);
                break;

            case 'pipes':
                const bbox2 = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].join(",");
                this.loadPipa(bbox2);
                break;

            case 'polygons': // PATCH: PASTIKAN KASUS INI JALAN
                const bbox3 = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].join(",");
                this.loadPolygon(bbox3);
                break;

            case 'newPipes':
            case 'newPolygons':
                console.log(`⚠️ ${layerName} adalah layer lokal, tidak perlu load data via API.`);
                break;
        }
    },

    _isDataLayer(layerName) {
        return layerName === 'markers' || layerName === 'pipes' || layerName === 'polygons';
    },

    _layerHasData(layerName) {
        const layerMap = {
            'markers': this.layers.markerGroup,
            'pipes': this.layers.pipeGroup,
            'polygons': this.layers.polygonGroup
        };

        const layer = layerMap[layerName];
        if (!layer) return false;

        let hasData = false;
        layer.eachLayer(() => {
            hasData = true;
            return true; // break after first layer
        });

        return hasData;
    },

    _isDataLayer(layerName) {
        return ['markers', 'pipes', 'polygons'].includes(layerName);
    },

    _clearLayerData(layerName) {
        switch (layerName) {
            case 'markers':
                this.layers.markerGroup.clearLayers();
                // Jika kamu memetakan marker ke ID untuk pencarian, kosongkan juga
                this.layers.markerMap = {};
                break;
            case 'pipes':
                this.layers.pipeGroup.clearLayers();
                // KRUSIAL: Bersihkan referensi di geometryLayer agar RAM lega
                if (this.layers.geometryLayer) {
                    this.layers.geometryLayer.clearLayers();
                }
                this.state.cachedPipeData = [];
                break;
            case 'polygons':
                this.layers.polygonGroup.clearLayers();
                // Sama seperti pipa, geometryLayer harus ikut bersih
                if (this.layers.geometryLayer) {
                    this.layers.geometryLayer.clearLayers();
                }
                this.state.cachedPolygonData = [];
                break;
            // newPipes dan newPolygons tidak di-clear karena data local
        }
    },

    _getLayerNameFromEvent(e) {
        const layerMap = {
            [this.layers.markerGroup]: 'markers',
            [this.layers.pipeGroup]: 'pipes',
            [this.layers.pipeGroupNew]: 'newPipes',
            [this.layers.polygonGroup]: 'polygons',
            [this.layers.polygonGroupNew]: 'newPolygons'
        };

        return layerMap[e.layer];
    },

    _calculatePolygonArea(latLngs) {
        if (!latLngs || latLngs.length < 3) return 0;
        const R = 6371000;
        let area = 0;
        const points = latLngs.map(p => ({
            lat: p.lat * Math.PI / 180,
            lng: p.lng * Math.PI / 180
        }));

        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            area += points[i].lng * points[j].lat - points[j].lng * points[i].lat;
        }
        return Math.round(Math.abs(area) * R * R / 2);
    },

    async _calculateGeometryInArea(selectionPolygon) {
        try {
            const res = await fetch('/api/selection/stats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    geometry: selectionPolygon.geometry,
                    includePoints: this.state.layerVisibility.markers,
                    includeLines: this.state.layerVisibility.pipes,
                    includePolygons: true
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

            return `<b>Point:</b> ${data.pointCount || 0}<br><b>Line:</b> ${data.lineCount || 0}<br><b>Polygon:</b> ${data.polygonCount || 0}`;
        } catch (err) {
            console.error("Gagal menghitung statistik area:", err);
            return `<b>Point:</b> -<br><b>Line:</b> -<br><b>Polygon:</b> -`;
        }
    },

    _cloneLatLngs(latlngs) {
        // Deep-clone LatLng(s) so editing doesn't mutate the backup reference.
        if (Array.isArray(latlngs)) return latlngs.map(x => this._cloneLatLngs(x));
        if (latlngs && typeof latlngs.lat === 'number' && typeof latlngs.lng === 'number') {
            return L.latLng(latlngs.lat, latlngs.lng);
        }
        return latlngs;
    },

    _normalizeDiameterValue(raw) {
        const v = (raw || '').toString().trim();
        if (!v) return '';
        return /\bmm\b/i.test(v) ? v : `${v} mm`;
    },

    _formatLegendLabel(dia) {
        return `DN${dia}`;
    },


    _latLngKey(latlng) {
        // Round for stable endpoint matching.
        if (!latlng) return '';
        const lat = typeof latlng.lat === 'number' ? latlng.lat : latlng[0];
        const lng = typeof latlng.lng === 'number' ? latlng.lng : latlng[1];
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
        return `${lat.toFixed(6)},${lng.toFixed(6)}`;
    },

    _unindexPipeLine(line) {
        const idx = this.state.pipeEndpointIndex;
        if (!idx || !line?._endpointKeys) return;
        for (const k of [line._endpointKeys.start, line._endpointKeys.end]) {
            if (!k) continue;
            const set = idx.get(k);
            if (!set) continue;
            set.delete(line);
            if (set.size === 0) idx.delete(k);
        }
        delete line._endpointKeys;
    },

    _indexPipeLine(line) {
        const idx = this.state.pipeEndpointIndex;
        if (!idx || !line || typeof line.getLatLngs !== 'function') return;
        const latlngs = line.getLatLngs();
        if (!Array.isArray(latlngs) || latlngs.length < 2) return;

        const start = latlngs[0];
        const end = latlngs[latlngs.length - 1];
        const startKey = this._latLngKey(start);
        const endKey = this._latLngKey(end);

        line._endpointKeys = { start: startKey, end: endKey };

        for (const k of [startKey, endKey]) {
            if (!k) continue;
            let set = idx.get(k);
            if (!set) {
                set = new Set();
                idx.set(k, set);
            }
            set.add(line);
        }
    },

    _getLinkedPipesForMarker(markerLatLng, toleranceMeters = 2) {
        const key = this._latLngKey(markerLatLng);
        const idx = this.state.pipeEndpointIndex;
        const candidates = new Set();

        const direct = idx?.get(key);
        if (direct) direct.forEach(l => candidates.add(l));

        // Fallback: if no exact match, scan endpoints within tolerance (handles rounding diffs).
        if (candidates.size === 0) {
            const scanGroups = [this.layers.pipeGroup, this.layers.pipeGroupNew];
            for (const g of scanGroups) {
                if (!g) continue;
                g.eachLayer(line => {
                    if (!line || typeof line.getLatLngs !== 'function') return;
                    const ll = line.getLatLngs();
                    if (!Array.isArray(ll) || ll.length < 2) return;
                    const start = ll[0];
                    const end = ll[ll.length - 1];
                    if (start?.distanceTo && start.distanceTo(markerLatLng) <= toleranceMeters) candidates.add(line);
                    else if (end?.distanceTo && end.distanceTo(markerLatLng) <= toleranceMeters) candidates.add(line);
                });
            }
        }

        return [...candidates];
    },

    _ensureMarkerDragging(marker) {
        // Create dragging handler only when needed (avoid overhead for clustered markers).
        if (!marker || marker.dragging) return;
        if (L?.Handler?.MarkerDrag) {
            marker.dragging = new L.Handler.MarkerDrag(marker);
        }
    },

    _setMarkerEditingVisual(marker, isEditing) {
        const apply = () => {
            const el = marker?.getElement?.();
            if (!el) return false;
            if (isEditing) {
                L.DomUtil.addClass(el, 'marker-editing');
            } else {
                L.DomUtil.removeClass(el, 'marker-editing');
            }
            return true;
        };
        if (!apply()) setTimeout(apply, 0);
    },

    _setPolygonEditingVisual(polygon, isEditing) {
        if (!polygon) return;
        if (isEditing) {
            polygon._backupStyle = polygon._backupStyle || {
                color: polygon.options?.color,
                dashArray: polygon.options?.dashArray || null,
                fillOpacity: polygon.options?.fillOpacity
            };
            polygon.setStyle({ color: "orange", dashArray: "5,5", fillOpacity: 0.3 });
        } else if (polygon._backupStyle) {
            polygon.setStyle({
                color: polygon._backupStyle.color || "blue",
                dashArray: polygon._backupStyle.dashArray || null,
                fillOpacity: polygon._backupStyle.fillOpacity ?? 0.4
            });
            delete polygon._backupStyle;
        }
    },

    _findPolygonById(id) {
        let found = null;

        this.layers.polygonGroup.eachLayer(layer => {
            if (layer instanceof L.Polygon && layer._polygonId == id) found = layer;
        });

        if (!found) {
            this.layers.polygonGroupNew.eachLayer(layer => {
                if (layer instanceof L.Polygon && layer._polygonId == id) found = layer;
            });
        }

        return found;
    },

    _hasMarkerAt(latlng) {
        let found = false;
        this.layers.markerGroup.eachLayer(m => {
            if (m instanceof L.Marker) {
                const pos = m.getLatLng();
                // pakai toleransi kecil biar ga strict banget
                if (Math.abs(pos.lat - latlng.lat) < 0.00001 &&
                    Math.abs(pos.lng - latlng.lng) < 0.00001) {
                    found = true;
                }
            }
        });
        return found;
    },

    filterPipaByDiameter(diameter) {
        // Jika diameter yang diklik sama dengan yang sedang aktif, reset filter (toggle off)
        const isReset = this.state.activeFilter === diameter;
        this.state.activeFilter = isReset ? null : diameter;

        this.layers.pipeGroup.eachLayer(layer => {
            const d = layer.featureData;

            if (isReset) {
                // Kembalikan ke normal
                layer.setStyle({ opacity: 1, weight: 3, dashArray: null });
            } else if (d.diameter == diameter) {
                // Tonjolkan yang dipilih
                layer.setStyle({ opacity: 1, weight: 6, dashArray: null });
                layer.bringToFront();
            } else {
                // Samarkan yang lain
                layer.setStyle({ opacity: 0.1, weight: 1, dashArray: '5, 5' });
            }
        });

        console.log(isReset ? "🔄 Filter direset" : `🔍 Fokus ke DN${diameter}`);
    },

    // ===============================
    // METHOD UNTUK MANUAL TOGGLE LAYER
    // ===============================
    toggleLayer(layerName, isVisible) {
        const layerMap = {
            'markers': this.layers.markerGroup,
            'pipes': this.layers.pipeGroup,
            'newPipes': this.layers.pipeGroupNew,
            'polygons': this.layers.polygonGroup,
            'newPolygons': this.layers.polygonGroupNew
        };

        const layer = layerMap[layerName];
        if (!layer) return;

        if (isVisible) {
            if (!this.layers.map.hasLayer(layer)) {
                this.layers.map.addLayer(layer);
            }
        } else {
            if (this.layers.map.hasLayer(layer)) {
                this.layers.map.removeLayer(layer);
            }
        }

        this.state.layerVisibility[layerName] = isVisible;
    },

    // ===============================
    // UI UTILITIES
    // ===============================
    showToast(message, type = 'info', delay = 3000) {
        if (typeof message !== 'string') {
            message = message?.message ? message.message : String(message);
        }

        const container = document.getElementById('toastContainer');
        if (!container) {
            console.warn('Toast container tidak ditemukan');
            return;
        }

        const toastEl = document.createElement('div');
        toastEl.className = `toast align-items-center text-bg-${type} border-0`;
        toastEl.setAttribute('role', 'alert');
        toastEl.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;

        container.appendChild(toastEl);

        if (typeof bootstrap === 'undefined') {
            toastEl.classList.add('show');
            setTimeout(() => toastEl.remove(), delay);
            return;
        }

        try {
            const bsToast = new bootstrap.Toast(toastEl, { delay, autohide: true });
            bsToast.show();
            toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
        } catch (e) {
            console.error('Error inisialisasi toast:', e);
            toastEl.classList.add('show');
            setTimeout(() => toastEl.remove(), delay);
        }
    },

    _showBootstrapToast(toastId) {
        const toastEl = document.getElementById(toastId);
        if (toastEl && typeof bootstrap !== 'undefined') {
            new bootstrap.Toast(toastEl, { delay: 3000 }).show();
        }
    },

    async _checkUserSession() {
        try {
            const res = await fetch('/api/session');
            if (!res.ok) throw new Error('Belum login');

            const data = await res.json();
            const userEl = document.getElementById('user-info');
            userEl.textContent = `Login sebagai:👤 ${data.user.username} | Last login: ${this._formatWaktu(data.user.last_login) || '-'}`;
        } catch {
            alert("Anda belum login. Akan dialihkan...");
            window.location.href = "/login.html";
        }
    },

    _formatWaktu(timestamp) {
        // Implement your time formatting logic here
        return timestamp ? new Date(timestamp).toLocaleString() : '-';
    },

    async logout() {
        try {
            await fetch('/api/logout', { method: 'POST' });
            alert("Berhasil logout.");
            window.location.href = "/login.html";
        } catch {
            alert("Gagal logout.");
        }
    },

    cleanup() {
        if (this.layers.map) {
            this.layers.map.off('pm:drawstart');
            this.layers.map.off('pm:create');
            this.layers.map.off('moveend');
            this.layers.map.off('click');

            this.layers.map.removeLayer(this.layers.markerGroup);
            this.layers.map.removeLayer(this.layers.polygonGroup);
            this.layers.map.removeLayer(this.layers.editableLayers);
        }

        this.layers.markerMap = {};
        this.state.snapMarker = null;
    }
};

window.MapAdminEditShared?.apply(MapManager);
window.MapReadShared?.apply(MapManager);

// ===============================
// INITIALIZATION
// ===============================
window.addEventListener('DOMContentLoaded', () => {
    MapManager.init();
});

window.addEventListener('beforeunload', () => {
    MapManager.cleanup();
});

// Global functions for backward compatibility
window.batalBuatMarker = function () {
    MapManager.layers.markerGroup.eachLayer(layer => {
        if (layer instanceof L.Marker && !layer._id) {
            MapManager.layers.markerGroup.removeLayer(layer);
        }
    });
    if (MapManager.layers.map) MapManager.layers.map.closePopup();
};

window.logout = MapManager.logout.bind(MapManager);
