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
        markerMap: {},
        markerGroup: L.layerGroup(),
        markerLayer: L.layerGroup(),
        markerGroupNew: L.layerGroup(),
        pipaLayers: {},
        pipeGroup: L.layerGroup(),
        pipeGroupNew: L.layerGroup(),
        polygonGroup: L.layerGroup(),
        polygonGroupNew: L.layerGroup(),
        geometryLayer: L.featureGroup(),
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
        markerGroupNew: L.layerGroup()
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
        this.baseLayers = {
            "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap',
                maxZoom: 23,
                maxNativeZoom: 19
            }),
            "Citra Satelit": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
                maxZoom: 23,
                maxNativeZoom: 19,
                noWrap: true
            }),
            "Google Hybrid": L.tileLayer('http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
                maxZoom: 23,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: '&copy; Google Hybrid'
            }),
            "Google Satelit": L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
                maxZoom: 21,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: '&copy; Google Satellite'
            })
        };
    },

    _setupMap() {
        this.layers.map = L.map('map', {
            center: this.config.mapCenter,
            zoom: this.config.defaultZoom,
            layers: [this.baseLayers["Citra Satelit"]],
            maxZoom: this.config.maxZoom,
            renderer: L.canvas({ padding: 0.5 })
        });

        // **SIMPLE: Add layer groups yang selalu visible saja**
        this.layers.map.addLayer(this.layers.editableLayers);
        this.layers.map.addLayer(this.layers.geometryLayer);
        this.layers.map.addLayer(this.layers.selectionLayer);

        // **PATCH PENTING:** Tambahkan layer yang true di state awal ke peta
        if (this.state.layerVisibility.markers) {
            this.layers.map.addLayer(this.layers.markerGroup);
        }
        if (this.state.layerVisibility.pipes) {
            this.layers.map.addLayer(this.layers.pipeGroup);
        }
        if (this.state.layerVisibility.newPipes) {
            this.layers.map.addLayer(this.layers.pipeGroupNew);
        }
        if (this.state.layerVisibility.newPolygons) {
            this.layers.map.addLayer(this.layers.polygonGroupNew);
        }

        // Tambahkan layer untuk marker baru
        this.layers.map.addLayer(this.state.markerGroupNew);

        // Create panes
        this.layers.map.createPane('polygonPane').style.zIndex = 400;
        this.layers.map.createPane('pipaPane').style.zIndex = 450;
        this.layers.map.createPane('markerPane').style.zIndex = 500;
    },

    _setupControls() {
        this._setupGeomanControls();
        this._setupDrawControl();
        this._setupLayerControl();
        this._setupGeocoder();
    },

    _setupGeomanControls() {
        this.layers.map.pm.addControls({
            position: 'topleft',
            drawCircle: false,
            drawRectangle: false,
            drawCircleMarker: false,
            drawMarker: true,
            drawPolyline: true,
            drawPolygon: true,
            editMode: false,
            dragMode: false,
            cutPolygon: false,
            rotateMode: false,
            removalMode: false,
            drawMarker: { cursorMarker: false }
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
            'Marker Baru (Lokal)': this.state.markerGroupNew, // Tambahkan ini
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
            this.loadAllLayers();
        }, this.config.debounceDelay));

        // ✅ FIX: Add layer control event handlers
        this.layers.map.on('overlayadd overlayremove', (e) => {
            this._handleOverlayChange(e);
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
            .bindPopup(`<b>${geocode.name}</b>`)
            .openPopup();
    },

    _handleDrawCreated(e) {
        this.state.geomanDisabledByDraw = true;
        const layer = e.layer;
        this.layers.selectionLayer.addLayer(layer);

        const resultHtml = this._calculateGeometryInArea(layer.toGeoJSON());
        const latlngs = layer.getLatLngs()[0];
        const area = L.GeometryUtil.geodesicArea(latlngs);
        const ha = (area / 10000).toFixed(2);
        const anchor = latlngs[0];

        layer.bindPopup(`<b>Luas:</b> ${ha} ha<br>${resultHtml}`);

        setTimeout(() => layer.openPopup(anchor), 0);
    },

    _handleDrawEdited(e) {
        e.layers.eachLayer(layer => {
            const resultHtml = this._calculateGeometryInArea(layer.toGeoJSON());
            const latlngs = layer.getLatLngs()[0];
            const area = L.GeometryUtil.geodesicArea(latlngs);
            const ha = (area / 10000).toFixed(2);
            const firstLatLng = latlngs[0];

            layer.bindPopup(`<b>Luas:</b> ${ha} ha<br>${resultHtml}`)
                .openPopup(firstLatLng);
        });
    },

    _handlePmCreate(e) {
        if (e.layer instanceof L.Marker) {
            this._handleNewMarkerCreation(e.layer);
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
        this.layers.markerGroupNew.addLayer(marker);
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
    `).openPopup();
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
        `).openPopup();
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
        `).openPopup();
    },

    // _handleGlobalClick(e) {
    //     const saveBtn = e.target.closest(".btn-save");
    //     const editBtn = e.target.closest(".btn-edit");
    //     const cancelBtn = e.target.closest(".btn-cancel");
    //     const deleteBtn = e.target.closest(".btn-hapus");

    //     if (saveBtn) this._handleSave(saveBtn);
    //     if (editBtn) this._handleEdit(editBtn);
    //     if (cancelBtn) this._handleCancel(cancelBtn);
    //     if (deleteBtn) this._handleDelete(deleteBtn);
    // },

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
        // PATCH: BLOKIR EVENT SELAMA INISIALISASI
        if (this.state.isInitializing) {
            console.log('⚠️ Overlay change ignored during initialization.');
            return;
        }

        const layerName = this._getLayerNameFromEvent(e);
        console.log('🎯 Handling overlay change for:', layerName, 'Type:', e.type);

        if (layerName) {
            const isVisible = e.type === 'overlayadd';
            // this.state.layerVisibility[layerName] = isVisible;

            // // ✅ FIX: Untuk polygon layer, load data jika diaktifkan
            // if (layerName === 'polygons' && isVisible && !this._layerHasData('polygons')) {
            //     console.log('🚀 Triggering immediate load for polygons...');
            //     this._loadLayerImmediately('polygons');
            // }

            console.log('📊 New visibility state:', this.state.layerVisibility);
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
                break;
            case 'pipes':
                this.layers.pipeGroup.clearLayers();
                break;
            case 'polygons':
                this.layers.polygonGroup.clearLayers();
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

    // ===============================
    // UTILITY FUNCTIONS
    // ===============================
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
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

    _calculateGeometryInArea(selectionPolygon) {
        let totalPoint = 0, totalLine = 0, totalPolygon = 0;

        // 1. Dapatkan BBox dari area seleksi (Sangat cepat)
        const selectionLayer = L.geoJSON(selectionPolygon);
        const selectionBounds = selectionLayer.getBounds();

        // 2. Iterasi semua layer di geometryLayer
        this.layers.geometryLayer.eachLayer(layer => {
            // Cek apakah layer ini memiliki koordinat/bounds
            const itemBounds = layer.getBounds ? layer.getBounds() : L.latLngBounds(layer.getLatLng(), layer.getLatLng());

            // FILTER TAHAP 1: Cek apakah BBox item ada di dalam BBox seleksi
            // Ini operasi matematika sederhana (jauh lebih cepat dari Turf)
            if (selectionBounds.intersects(itemBounds)) {

                // FILTER TAHAP 2: Jika lolos BBox, baru jalankan kalkulasi presisi Turf
                const feature = layer.toGeoJSON();

                try {
                    switch (feature.geometry.type) {
                        case 'Point':
                            if (turf.booleanPointInPolygon(feature, selectionPolygon)) totalPoint++;
                            break;
                        case 'LineString':
                            // Gunakan booleanIntersects untuk pipa agar lebih akurat
                            if (turf.booleanIntersects(feature, selectionPolygon)) totalLine++;
                            break;
                        case 'Polygon':
                            // Hanya hitung jika poligon benar-benar di dalam atau berpotongan
                            if (this.state.layerVisibility.polygons && turf.booleanIntersects(feature, selectionPolygon)) {
                                totalPolygon++;
                            }
                            break;
                    }
                } catch (e) {
                    console.warn("Kalkulasi spasial gagal untuk satu item:", e);
                }
            }
        });

        // 3. Analisis dari CACHE (Jika layer poligon tidak aktif)
        // Gunakan logika yang sama: Cek BBox dulu baru Turf
        if (!this.state.layerVisibility.polygons && this.state.cachedPolygonData.length > 0) {
            this.state.cachedPolygonData.forEach(polyData => {
                if (polyData.polygon && polyData.polygon.length >= 3) {
                    // Konversi cepat ke Lng/Lat untuk Turf
                    const turfCoords = [polyData.polygon.map(coord => [coord[1], coord[0]])];
                    const polygonFeature = turf.polygon(turfCoords);

                    // Gunakan turf.bboxPolygon untuk pengecekan cepat sebelum booleanWithin
                    if (turf.booleanIntersects(polygonFeature, selectionPolygon)) {
                        totalPolygon++;
                    }
                }
            });
        }

        return `<b>Point:</b> ${totalPoint}<br><b>Line:</b> ${totalLine}<br><b>Polygon:</b> ${totalPolygon}`;
    },

    _getLatLng(m) {
        if (m.coords && m.coords.length === 2) {
            return { lat: parseFloat(m.coords[0]), lng: parseFloat(m.coords[1]) };
        }
        if (m.y && m.x) {
            return { lat: parseFloat(m.y), lng: parseFloat(m.x) };
        }
        return { lat: null, lng: null };
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

    // ===============================
    // DATA LOADING FUNCTIONS
    // ===============================
    async loadAllLayers() {
        if (!this.layers.map) return;

        console.log('🔍 Loading layers with visibility:', this.state.layerVisibility);

        const bounds = this.layers.map.getBounds();

        // ✅ FIX: Pastikan bounds valid sebelum melanjutkan
        if (!bounds.isValid()) {
            console.log('⚠️ Map bounds belum valid, tunggu...');
            setTimeout(() => this.loadAllLayers(), 500);
            return;
        }

        const bbox1 = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(",");
        const bbox2 = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].join(",");

        const loadPromises = [];

        if (this.state.layerVisibility.markers) {
            // console.log('📌 Loading markers...');
            loadPromises.push(this.loadMarkers(bbox1));
        } else {
            console.log('⏭️  Markers skipped (not visible)');
        }

        if (this.state.layerVisibility.pipes) {
            // console.log('📌 Loading pipes...');
            loadPromises.push(this.loadPipa(bbox2));
        } else {
            console.log('⏭️  Pipes skipped (not visible)');
        }

        if (this.state.layerVisibility.polygons) {
            // console.log('📌 Loading polygons...');
            loadPromises.push(this.loadPolygon(bbox2));
        } else {
            console.log('⏭️  Polygons skipped (not visible)');
        }

        await Promise.all(loadPromises);
        // console.log('✅ All visible layers loaded');
    },

    async loadMarkers(bbox) {
        if (!this.layers.map || !this.state.layerVisibility.markers) {
            return;
        }

        try {
            this.layers.geometryLayer.clearLayers();
            this.layers.markerGroup.clearLayers();

            const res = await fetch(`/api/marker?bbox=${bbox}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            data.forEach(m => {
                const { lat, lng } = this._getLatLng(m);
                if (lat && lng) {
                    const markerIcon = L.divIcon({
                        className: "custom-marker",
                        html: `<div style="
                        width:10px;
                        height:10px;
                        border-radius:50%;
                        background:${this.state.colorMap[m.tipe] || "gray"};
                        border:1px solid #fff;
                    "></div>`,
                        iconSize: [10, 10],
                    });

                    const marker = L.marker([lat, lng], { icon: markerIcon })
                        .bindPopup(`
                        <div class="p-2" style="min-width:250px">
                            <div class="fw-bold mb-2 text-center">Edit Marker</div>
                            <div class="mb-2">
                                <label class="form-label small mb-1">Tipe</label>
                                <select class="form-select form-select-sm" name="editTipe">
                                    ${Object.keys(this.state.colorMap).map(tipe =>
                            `<option value="${tipe}" ${tipe === m.tipe ? "selected" : ""}>${tipe.toUpperCase()}</option>`
                        ).join("")}
                                </select>
                            </div>
                            <div class="mb-2">
                                <label class="form-label small mb-1">Elevasi</label>
                                <input type="number" class="form-control form-select-sm" name="editElevation" value="${m.elevation || ''}">
                            </div>
                            <div class="mb-2">
                                <label class="form-label small mb-1">Keterangan</label>
                                <input type="text" class="form-control form-select-sm" name="editKeterangan" value="${m.keterangan || ''}">
                            </div>
                            <div class="d-flex gap-1 mt-3">
                                <button class="btn btn-sm btn-success flex-fill btn-save" data-type="marker" data-id="${m.id}">💾 Simpan</button>
                                <button class="btn btn-sm btn-primary flex-fill btn-edit" data-type="marker" data-id="${m.id}">✏️ Edit</button>
                                <button class="btn btn-sm btn-secondary flex-fill btn-cancel" data-type="marker" data-id="${m.id}">❌ Batal</button>
                                <button class="btn btn-sm btn-danger flex-fill btn-hapus" data-type="marker" data-id="${m.id}">🗑️ Hapus</button>
                            </div>
                        </div>
                    `);

                    // Simpan informasi marker
                    marker._markerId = m.id;
                    marker._originalTipe = m.tipe;

                    this.layers.markerGroup.addLayer(marker);
                    this.layers.geometryLayer.addLayer(marker);
                }
            });

            console.log(`✅ Point loaded: ${data.length}`);
        } catch (err) {
            console.error("⚠️ Gagal load markers:", err);
        }
    },

    // async loadMarkers(bbox) {
    //     if (!this.layers.map || !this.state.layerVisibility.markers) {
    //         return; // Jangan load jika layer tidak visible
    //     }

    //     try {
    //         this.layers.geometryLayer.clearLayers();
    //         this.layers.markerGroup.clearLayers();

    //         const res = await fetch(`/api/marker?bbox=${bbox}`);
    //         if (!res.ok) throw new Error(`HTTP ${res.status}`);
    //         const data = await res.json();

    //         data.forEach(m => {
    //             const { lat, lng } = this._getLatLng(m);
    //             if (lat && lng) {
    //                 const markerIcon = L.divIcon({
    //                     className: "custom-marker",
    //                     html: `<div style="
    //                         width:10px;
    //                         height:10px;
    //                         border-radius:50%;
    //                         background:${this.state.colorMap[m.tipe] || "gray"};
    //                         border:1px solid #fff;
    //                     "></div>`,
    //                     iconSize: [10, 10],
    //                 });

    //                 const marker = L.marker([lat, lng], { icon: markerIcon })
    //                     .bindPopup(`
    //                         <b>${m.tipe?.toUpperCase() || "-"}</b><br>
    //                         ID: ${m.id || "-"}<br>
    //                         Elev: ${m.elevation || "-"}
    //                     `);

    //                 this.layers.markerGroup.addLayer(marker);
    //                 this.layers.geometryLayer.addLayer(marker);
    //             }
    //         });

    //         console.log(`✅ Point loaded: ${data.length}`);
    //     } catch (err) {
    //         console.error("⚠️ Gagal load markers:", err);
    //     }
    // },

    async loadPipa(bbox) {
        if (!this.layers.map || !this.state.layerVisibility.pipes) return;

        try {
            const res = await fetch(`/api/pipa?bbox=${bbox}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            this.layers.pipeGroup.clearLayers();

            data.forEach(pipe => {
                const validCoords = (pipe.line || []).filter(pt => pt.length === 2);
                if (validCoords.length < 2) return;

                const color = this.state.diamtrColors[pipe.diameter] || "red";
                const line = L.polyline(validCoords, {
                    color,
                    weight: 3,
                    pane: "pipaPane"
                }).addTo(this.layers.pipeGroup);

                // SIMPAN DATA MENTAH DI PROPERTI LAYER
                line.featureData = pipe;
                line._pipeId = pipe.id;

                this.layers.geometryLayer.addLayer(line);
                this.layers.pipaLayers[pipe.id] = line;

                // LAZY POPUP: Fungsi ini hanya jalan saat diklik
                line.bindPopup(() => {
                    const d = line.featureData;
                    const diameterOptions = this.state.diameterList.map(dia =>
                        `<option value="${dia}" ${dia === d.diameter ? "selected" : ""}>DN${dia}</option>`
                    ).join("");

                    const jenisOptions = this.state.jenisList.map(j =>
                        `<option value="${j}" ${j === d.jenis ? "selected" : ""}>${j}</option>`
                    ).join("");

                    return `
                    <div class="p-2" style="min-width:250px">
                        <div class="fw-bold mb-2 text-center">Edit Pipa</div>
                        <div class="mb-2">
                            <label class="form-label small mb-1">Diameter</label>
                            <select class="form-select form-select-sm" name="editDiameter">${diameterOptions}</select>
                        </div>
                        <div class="mb-2">
                            <label class="form-label small mb-1">Jenis</label>
                            <select class="form-select form-select-sm" name="editJenis">${jenisOptions}</select>
                        </div>
                        <div class="d-flex gap-1 mt-3">
                            <button class="btn btn-sm btn-success flex-fill btn-save" data-type="pipe" data-id="${d.id}">💾 Simpan</button>
                            <button class="btn btn-sm btn-primary flex-fill btn-edit" data-type="pipe" data-id="${d.id}">✏️ Edit</button>
                            <button class="btn btn-sm btn-danger flex-fill btn-hapus" data-type="pipe" data-id="${d.id}">🗑️ Hapus</button>
                        </div>
                    </div>`;
                });
            });
            console.log(`✅ Line loaded & Lazy Popup applied: ${data.length}`);
        } catch (err) {
            console.error("⚠️ Gagal load pipa:", err);
        }
    },

    async loadPolygon(bbox) {
        if (!this.layers.map || !this.state.layerVisibility.polygons) return;
        try {
            this.layers.polygonGroup.clearLayers();

            const response = await fetch(`/api/polygon?bbox=${bbox}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            data.forEach(poly => {
                const validCoords = (poly.polygon || []).filter(pt => pt.length === 2);
                if (validCoords.length < 3) return;

                const polygon = L.polygon(validCoords, {
                    color: 'blue',
                    weight: 1,
                    fillOpacity: 0.4,
                    pane: 'polygonPane'
                }).addTo(this.layers.polygonGroup);

                // SIMPAN DATA MENTAH
                polygon.featureData = poly;
                polygon._polygonId = poly.id;

                this.layers.geometryLayer.addLayer(polygon);

                // LAZY POPUP
                polygon.bindPopup(() => {
                    const d = polygon.featureData;
                    return `
                    <div class="p-2" style="min-width:250px">
                        <div class="fw-bold mb-2 text-center">Edit Polygon</div>
                        <div class="mb-2">
                            <label class="form-label small mb-1">No SAMW</label>
                            <input type="text" class="form-control form-control-sm" name="editNosamw" value="${d.nosamw || ''}">
                        </div>
                        <div class="mb-2">
                            <label class="form-label small mb-1">Luas (m²)</label>
                            <input type="text" class="form-control form-control-sm" name="editLuas" value="${d.lsval || 0}" readonly>
                        </div>
                        <div class="d-flex gap-1 mt-3">
                            <button class="btn btn-sm btn-success flex-fill btn-save" data-type="srpolygon" data-id="${d.id}">💾 Simpan</button>
                            <button class="btn btn-sm btn-primary flex-fill btn-edit" data-type="srpolygon" data-id="${d.id}">✏️ Edit</button>
                            <button class="btn btn-sm btn-danger flex-fill btn-hapus" data-type="srpolygon" data-id="${d.id}">🗑️ Hapus</button>
                        </div>
                    </div>`;
                }, { autoPan: false });
            });

            this.state.cachedPolygonData = data;
            console.log(`✅ Polygon loaded & Lazy Popup applied: ${data.length}`);
        } catch (err) {
            console.error('Gagal load polygon:', err);
        }
    },

    async loadLegend() {
        try {
            const res = await fetch('/api/pipa/option');
            const data = await res.json();
            this.state.diameterList = data.diameter;
            this.state.jenisList = data.jenis;

            const colorPalette = [
                '#0077ff', '#28a745', '#dc3545', '#ffc107',
                '#6c757d', '#ff6600', '#00ccffff', '#8e44ad',
                '#00ff00ff', '#fd7e14', '#e83e8c'
            ];

            const legendDiv = document.getElementById('legend');
            legendDiv.innerHTML = '<h4>Diameter Pipa</h4>';

            this.state.diameterList.forEach((dia, i) => {
                const color = i < colorPalette.length ? colorPalette[i] : `hsl(${(i * 40) % 360}, 70%, 50%)`;
                this.state.diamtrColors[dia] = color;

                const item = document.createElement('div');
                item.innerHTML = `<span class="legend-line" style="background:${color}; height:6px;"></span> DN${dia}`;
                legendDiv.appendChild(item);
            });
        } catch (err) {
            console.error("Gagal load legend:", err);
        }
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
    // CRUD OPERATIONS
    // ===============================
    async saveMarker(payload) {
        try {
            const res = await fetch('/api/marker/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal simpan marker!");

            this.showToast("Marker berhasil disimpan!", "success");
            return data;
        } catch (err) {
            this.showToast(err.message || "Gagal simpan marker!", "danger");
            throw err;
        }
    },

    async updateMarker(id, marker, payload) {
        const latlng = marker.getLatLng();

        try {
            const payload = {
                coords: [latlng.lat, latlng.lng],
                tipe: payload.tipe || null,
                elevation: payload.elevation || null,
                keterangan: payload.keterangan || null
            };

            const res = await fetch(`/api/marker/update/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal update marker");

            this.showToast("Marker berhasil diperbarui", "success");
            this.loadMarkers();
        } catch (err) {
            this.showToast("Gagal update marker: " + err.message, "danger");
        }
    },

    async deleteMarker(id) {
        if (!confirm("Yakin hapus marker ini?")) return;

        try {
            const res = await fetch(`/api/marker/delete/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);

            // Hapus dari semua layer groups
            this.layers.markerGroup.eachLayer(layer => {
                if (layer._markerId == id) this.layers.markerGroup.removeLayer(layer);
            });

            this.state.markerGroupNew.eachLayer(layer => {
                if (layer._markerId == id) this.state.markerGroupNew.removeLayer(layer);
            });

            this.showToast("Marker berhasil dihapus", "success");
        } catch (err) {
            this.showToast("Gagal menghapus marker", "danger");
        }
    },

    // Fungsi untuk mencari marker berdasarkan ID
    _findMarkerById(id) {
        let found = null;

        // Cari di marker group utama
        this.layers.markerGroup.eachLayer(layer => {
            if (layer instanceof L.Marker && layer._markerId == id) found = layer;
        });

        // Jika tidak ditemukan, cari di marker group baru
        if (!found) {
            this.state.markerGroupNew.eachLayer(layer => {
                if (layer instanceof L.Marker && layer._markerId == id) found = layer;
            });
        }

        return found;
    },

    async savePipa(id, line, payload) {
        const coords = line.getLatLngs().map(p => [p.lat, p.lng]);
        const dataToSend = {
            coords,
            dc_id: payload.dc_id || null,
            dia: payload.dia || null,
            jenis: payload.jenis || null,
            panjang: payload.panjang || null,
            keterangan: payload.keterangan || null,
            lokasi: payload.lokasi || null,
            status: payload.status || null,
            diameter: payload.diameter || null,
            roughness: payload.roughness || null,
            zona: payload.zona || null
        };

        try {
            const res = await fetch('/api/pipa/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSend)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Save pipa gagal");

            this.showToast("Pipa berhasil disimpan", "success");
            this.loadPipa();
            return data;
        } catch (err) {
            this.showToast("error", err.message || "Terjadi kesalahan saat menyimpan pipa");
            throw err;
        }
    },

    async updatePipa(id, layer, formData) {
        try {
            const coords = layer.getLatLngs().map(latlng => [latlng.lat, latlng.lng]);
            const payload = {
                coords,
                dc_id: formData.dc_id || null,
                dia: formData.dia || null,
                jenis: formData.jenis || null,
                panjang: formData.panjang || null,
                keterangan: formData.keterangan || null,
                lokasi: formData.lokasi || null,
                status: formData.status || null,
                diameter: formData.diameter || null,
                roughness: formData.roughness || null,
                zona: formData.zona || null
            };

            const res = await fetch(`/api/pipa/update/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal update pipa");

            this.showToast("Pipa berhasil diperbarui", "success");
            this.loadPipa();
        } catch (err) {
            this.showToast("Gagal update pipa: " + err.message, "danger");
        }
    },

    async deletePipa(id) {
        try {
            const res = await fetch(`/api/pipa/delete/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);

            if (this.layers.pipaLayers[id]) {
                this.layers.map.removeLayer(this.layers.pipaLayers[id]);
                delete this.layers.pipaLayers[id];
            }

            this.showToast("Pipa berhasil dihapus", "success");
        } catch (err) {
            this.showToast("Gagal menghapus pipa", "danger");
        }
    },

    async savePolygon(id, polygon, payload, nosamwNew) {
        try {
            const res = await fetch('/api/polygon/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal menyimpan polygon!");

            polygon._polygonId = data.ogr_fid;
            polygon._nosamw = nosamwNew;
            polygon.lsval = payload.luas;

            this.showToast("Polygon berhasil disimpan!", "success");
            return data;
        } catch (err) {
            this.showToast(err.message || "Gagal menyimpan polygon!", "danger");
            throw err;
        }
    },

    async updatePolygon(id, polygon, payload) {
        try {
            const res = await fetch('/api/polygon/update/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            this.showToast("Polygon berhasil diperbarui!", "success");
            return data;
        } catch (err) {
            this.showToast("Gagal memperbarui polygon!", "danger");
            throw err;
        }
    },

    async deletePolygon(id) {
        if (!confirm("Yakin hapus polygon ini?")) return;

        try {
            const res = await fetch(`/api/polygon/delete/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Gagal hapus polygon!");

            this.layers.polygonGroup.eachLayer(layer => {
                if (layer._polygonId == id) this.layers.polygonGroup.removeLayer(layer);
            });

            this.showToast("Polygon berhasil dihapus!", "success");
        } catch (err) {
            this.showToast(err.message || "Gagal hapus polygon!", "danger");
        }
    },

    // ===============================
    // BUTTON HANDLERS
    // ===============================
    async _handleSave(button) {
        const type = button.dataset.type;
        const id = button.dataset.id;

        console.log("💾 Save triggered for type:", type, "id:", id);

        if (type === "srpolygon") {
            await this._handleSavePolygon(id);
        } else if (type === "pipe") {
            await this._handleSavePipe(id);
        } else if (type === "marker") {
            await this._handleSaveMarker(id);
        } else {
            console.warn("⚠️ Unknown save type:", type);
        }
    },

    async _handleSaveMarker(id) {
        console.log("➡️ _handleSaveMarker running with id:", id);

        // Cari marker di markerGroupNew
        let marker = this.layers.markerGroupNew.getLayers().find(m => m._markerId == id);
        console.log("📍 Marker found:", marker);

        if (!marker) {
            console.error("❌ No marker found for id:", id);
            return;
        }

        const popupEl = marker.getPopup()?.getElement();
        if (!popupEl) {
            console.error("❌ Popup element not found");
            return;
        }

        // Ambil nilai dari form popup
        const tipe = popupEl.querySelector('#newMarkerTipe')?.value.trim().toLowerCase();
        const elevasi = popupEl.querySelector('#newMarkerElevation')?.value || null;
        const keterangan = popupEl.querySelector('#newMarkerKeterangan')?.value.trim() || null;

        // Validasi wajib
        if (!tipe) {
            this.showToast("❌ Tipe marker wajib dipilih!", "danger");
            return;
        }

        const payload = {
            coords: [marker.getLatLng().lat, marker.getLatLng().lng],
            tipe,
            elevasi,
            keterangan
        };

        try {
            if (!id || id === "new") {
                const saved = await this.saveMarker(payload);

                // Update id marker setelah disimpan
                marker._markerId = saved.ogr_fid;

                // Pindahkan marker dari group "baru" ke group utama
                this.layers.markerGroupNew.removeLayer(marker);
                this.layers.markerGroup.addLayer(marker);
            } else {
                await this.updateMarker(id, marker, payload);
            }

            marker.closePopup();
            this._showBootstrapToast("saveToast");
        } catch (err) {
            console.error("Save Marker error:", err);
        }
    },

    async _handleSavePolygon(id) {
        const polygon = this._findPolygonById(id);
        if (!polygon) return;

        const popupEl = polygon.getPopup().getElement();
        const nosamw = popupEl.querySelector('[name="editNosamw"], #newPolygonNosamw')?.value.trim();
        const luas = parseInt(popupEl.querySelector('[name="editLuas"], #newPolygonLuas')?.value) || 0;
        const coords = polygon.getLatLngs()[0].map(p => [p.lat, p.lng]);

        try {
            if (!id || id === "new") {
                const savedPolygon = await this.savePolygon(id, polygon, { coords, nosamw, nosambckup: nosamw, luas });
                polygon._polygonId = savedPolygon.ogr_fid;
                this.layers.polygonGroupNew.removeLayer(polygon);
                this.layers.polygonGroup.addLayer(polygon);
                polygon.setStyle({ color: "blue", dashArray: null, fillOpacity: 0.4 });
            } else {
                await this.updatePolygon(id, polygon, { coords, nosamw, nosambckup: polygon._backup || '', luas });
                polygon.setStyle({ color: "blue", dashArray: null, fillOpacity: 0.4 });
            }

            polygon.pm.disable();
            polygon.closePopup();
            this._showBootstrapToast("saveToast");
        } catch (err) {
            console.error("Save SRPolygon error:", err);
        }
    },

    async _handleSavePipe(id) {
        let line = !id || id === "new"
            ? this.layers.pipeGroupNew.getLayers().find(l => l._pipeId === "new")
            : this.layers.pipeGroup.getLayers().find(l => l._pipeId == id);

        if (!line) return;

        // ✅ CEK TITIK AWAL
        const startLatLng = line.getLatLngs()[0];
        if (!this._hasMarkerAt(startLatLng)) {
            this.showToast("❌ Pipa harus dimulai dari point (marker)!", "danger");
            return; // hentikan simpan
        }

        const popupEl = line.getPopup().getElement();
        let diameterInput = popupEl.querySelector('[name="editDiameter"]')?.value ||
            popupEl.querySelector('#newPipeDiameter')?.value || '';
        let jenisInput = popupEl.querySelector('[name="editJenis"]')?.value ||
            popupEl.querySelector('#newPipeJenis')?.value || '';

        const diameterToSave = diameterInput ? diameterInput.trim() + ' mm' : '';

        try {
            if (!id || id === "new") {
                await this.savePipa(id, line, { diameter: diameterToSave, jenis: jenisInput });
                this.layers.pipeGroupNew.removeLayer(line);
                this.layers.pipeGroup.addLayer(line);
            } else {
                await this.updatePipa(id, line, { diameter: diameterToSave, jenis: jenisInput });
            }

            line.closePopup();
            if (line.pm && line.pm.enabled()) line.pm.disable();

            line.setStyle({
                color: this.state.diamtrColors[diameterToSave] || line.options.color || "blue",
                dashArray: null
            });

            this._showBootstrapToast("saveToast");
        } catch (err) {
            console.error("Save/update pipe error:", err);
        }
    },

    _handleEdit(button) {
        const type = button.dataset.type;
        const id = button.dataset.id;
        let layer;

        if (type === "srpolygon") {
            layer = this._findPolygonById(id);
        } else if (type === "pipe") {
            layer = id === "new"
                ? this.layers.pipeGroupNew.getLayers().find(l => l._pipeId === "new")
                : this.layers.pipeGroup.getLayers().find(l => l._pipeId == id);
        } else if (type === "marker") {
            layer = this._findMarkerById(id); // Tambahkan ini
        }

        if (!layer) return;

        layer._backupLatLng = layer.getLatLng();
        if (layer.pm) layer.pm.enable();

        // Set style edit untuk marker
        if (type === "marker") {
            const editIcon = L.divIcon({
                className: "custom-marker-edit",
                html: `<div style="
                width:12px;
                height:12px;
                border-radius:50%;
                background:orange;
                border:2px solid #fff;
                box-shadow: 0 0 5px rgba(0,0,0,0.5);
            "></div>`,
                iconSize: [12, 12],
            });
            layer.setIcon(editIcon);
        }

        layer.closePopup();
    },

    _handleCancel(button) {
        const type = button.dataset.type;
        const id = button.dataset.id;
        let layer;

        if (type === "srpolygon") {
            layer = this._findPolygonById(id);
        } else if (type === "pipe") {
            layer = id === "new"
                ? this.layers.pipeGroupNew.getLayers().find(l => l._pipeId === "new")
                : this.layers.pipeGroup.getLayers().find(l => l._pipeId == id);
        } else if (type === "marker") {
            layer = this._findMarkerById(id); // Tambahkan ini
        }

        if (!layer) return;

        if (id === "new") {
            if (type === "srpolygon") this.layers.polygonGroupNew.removeLayer(layer);
            else if (type === "pipe") this.layers.pipeGroupNew.removeLayer(layer);
            else if (type === "marker") this.state.markerGroupNew.removeLayer(layer); // Tambahkan ini
        } else {
            if (layer.pm) layer.pm.disable();
            layer.closePopup();

            // Kembalikan style normal untuk marker
            if (type === "marker" && layer._originalTipe) {
                const normalIcon = L.divIcon({
                    className: "custom-marker",
                    html: `<div style="
                    width:10px;
                    height:10px;
                    border-radius:50%;
                    background:${this.state.colorMap[layer._originalTipe] || "gray"};
                    border:1px solid #fff;
                "></div>`,
                    iconSize: [10, 10],
                });
                layer.setIcon(normalIcon);
            }

            if (layer._backupLatLng) {
                layer.setLatLng(layer._backupLatLng);
                delete layer._backupLatLng;
            }
        }
    },

    async _handleDelete(button) {
        const type = button.dataset.type;
        const id = button.dataset.id;
        let layer;

        if (type === "srpolygon") {
            layer = this._findPolygonById(id);
        } else if (type === "pipe") {
            layer = id === "new"
                ? this.layers.pipeGroupNew.getLayers().find(l => l._pipeId === "new")
                : this.layers.pipeGroup.getLayers().find(l => l._pipeId == id);
        } else if (type === "marker") {
            layer = this._findMarkerById(id); // Tambahkan ini
        }

        if (!layer) return;

        const message = `Apakah Anda yakin ingin menghapus ${type} ${id === "new" ? "baru" : id}?`;
        if (!confirm(message)) {
            layer.closePopup();
            return;
        }

        try {
            if (type === "srpolygon") {
                if (id === "new") {
                    this.layers.polygonGroupNew.removeLayer(layer);
                } else {
                    await this.deletePolygon(id);
                    this.layers.map.removeLayer(layer);
                }
            } else if (type === "pipe") {
                if (id === "new") {
                    this.layers.pipeGroupNew.removeLayer(layer);
                } else {
                    await this.deletePipa(id);
                    this.layers.pipeGroup.removeLayer(layer);
                }
            } else if (type === "marker") {
                if (id === "new") {
                    this.state.markerGroupNew.removeLayer(layer);
                } else {
                    await this.deleteMarker(id);
                    this.layers.markerGroup.removeLayer(layer);
                }
            }
            this._showBootstrapToast("deleteToast");
        } catch (err) {
            console.error(`Delete ${type} error:`, err);
        }
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