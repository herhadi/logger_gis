(function attachMapCoreShared(global) {
    function createBaseLayers() {
        return {
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
            }),
            "Google Satelit": L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
                maxZoom: 21,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: '&copy; Google Satellite'
            })
        };
    }

    function ensureMarkerGroup(ctx) {
        if (!ctx.layers.markerGroup) {
            ctx.layers.markerGroup = L.markerClusterGroup({
                chunkedLoading: true,
                disableClusteringAtZoom: 18,
                maxClusterRadius: 50
            });
        }
    }

    function setupMap(ctx, options = {}) {
        const {
            initialBaseLayer = "Citra Satelit",
            includeEditableLayers = false,
            includeSelectionLayer = false,
            includeNewPipeLayer = false,
            includeNewPolygonLayer = false,
            includeNewMarkerLayer = false,
            svgRendererKey = 'svgRenderer'
        } = options;

        ctx.layers.map = L.map('map', {
            center: ctx.config.mapCenter,
            zoom: ctx.config.defaultZoom,
            layers: [ctx.baseLayers[initialBaseLayer]],
            maxZoom: ctx.config.maxZoom,
            preferCanvas: true,
            closePopupOnClick: false
        });
        if (ctx.layers.map.getContainer) {
            ctx.layers.map.getContainer().setAttribute('tabindex', '0');
        }

        ctx.layers.map.createPane('polygonPane').style.zIndex = 400;
        ctx.layers.map.createPane('pipaPane').style.zIndex = 500;
        ctx.layers.map.createPane('markerPane').style.zIndex = 600;

        ctx.layers.polyCanvasRenderer = L.canvas({ padding: 0.5, pane: 'polygonPane' });
        ctx.layers[svgRendererKey] = L.svg({ padding: 0.5, pane: 'polygonPane' });
        ctx.layers.pipaCanvasRenderer = L.canvas({ padding: 0.5, pane: 'pipaPane' });
        ctx.layers.pipaSvgRenderer = L.svg({ padding: 0.5, pane: 'pipaPane' });

        ensureMarkerGroup(ctx);

        ctx.layers.pipeGeometry = L.layerGroup().addTo(ctx.layers.map);
        ctx.layers.polyGeometry = L.layerGroup().addTo(ctx.layers.map);

        if (includeEditableLayers && ctx.layers.editableLayers) ctx.layers.map.addLayer(ctx.layers.editableLayers);
        if (includeSelectionLayer && ctx.layers.selectionLayer) ctx.layers.map.addLayer(ctx.layers.selectionLayer);

        if (ctx.state.layerVisibility.markers && ctx.layers.markerGroup) ctx.layers.map.addLayer(ctx.layers.markerGroup);
        if (ctx.state.layerVisibility.pipes && ctx.layers.pipeGroup) ctx.layers.map.addLayer(ctx.layers.pipeGroup);
        if (ctx.state.layerVisibility.polygons && ctx.layers.polygonGroup) ctx.layers.map.addLayer(ctx.layers.polygonGroup);

        if (includeNewPipeLayer && ctx.state.layerVisibility.newPipes && ctx.layers.pipeGroupNew) ctx.layers.map.addLayer(ctx.layers.pipeGroupNew);
        if (includeNewPolygonLayer && ctx.state.layerVisibility.newPolygons && ctx.layers.polygonGroupNew) ctx.layers.map.addLayer(ctx.layers.polygonGroupNew);
        if (includeNewMarkerLayer && ctx.layers.markerGroupNew) ctx.layers.map.addLayer(ctx.layers.markerGroupNew);
    }

    function setupBasicLayerControl(ctx) {
        const overlays = {
            "Tampilkan Marker": ctx.layers.markerGroup,
            "Tampilkan Pipa": ctx.layers.pipeGroup,
            "Tampilkan Polygon": ctx.layers.polygonGroup
        };

        ctx.layerControl = L.control.layers(ctx.baseLayers, overlays, { collapsed: true }).addTo(ctx.layers.map);
    }

    function setupReadOnlyMapEvents(ctx) {
        ctx.layers.map.on("moveend", ctx.debounce(() => {
            ctx.loadAllLayers();
        }, ctx.config.debounceDelay));

        ctx.layers.map.on('overlayadd overlayremove', (e) => {
            if (e.layer === ctx.layers.markerGroup) ctx.state.layerVisibility.markers = e.type === 'overlayadd';
            if (e.layer === ctx.layers.pipeGroup) ctx.state.layerVisibility.pipes = e.type === 'overlayadd';
            if (e.layer === ctx.layers.polygonGroup) ctx.state.layerVisibility.polygons = e.type === 'overlayadd';
            ctx.loadAllLayers();
        });
    }

    function setupGeocoder(ctx) {
        const geoapifyGeocoder = {
            geocode: (query, cb, context) => {
                const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&limit=15&apiKey=${ctx.config.apiKey}`;

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
                        return results || [];
                    })
                    .catch(err => {
                        console.error("Geoapify error:", err);
                        return [];
                    })
                    .then(results => {
                        if (typeof cb === "function") {
                            cb.call(context || ctx, results);
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
            showUniqueResult: true,
            suggestTimeout: 250
        });

        geocoderControl.on('markgeocode', (e) => {
            const geocode = e.geocode;
            // Clear existing search markers on map (not GIS data)
            ctx.layers.map.eachLayer(layer => {
                if (layer instanceof L.Marker && layer._isSearchMarker) {
                    ctx.layers.map.removeLayer(layer);
                }
            });

            if (geocode.bbox) {
                ctx.layers.map.fitBounds(geocode.bbox, { padding: [50, 50] });
            } else {
                ctx.layers.map.setView(geocode.center, 15);
            }

            const m = L.marker(geocode.center)
                .addTo(ctx.layers.map)
                .bindPopup(`<b>${geocode.name}</b>`, { autoPan: true, closeOnClick: false })
                .openPopup();
            m._isSearchMarker = true;
        });

        geocoderControl.addTo(ctx.layers.map);

        // Fix for search results collapse when scrolling (CSS injection)
        const style = document.createElement('style');
        style.innerHTML = `
            .leaflet-control-geocoder-results {
                max-height: 300px;
                overflow-y: auto !important;
                -webkit-overflow-scrolling: touch;
            }
            /* Prevent Leaflet Control from intercepting scroll events as clicks that collapse the UI */
            .leaflet-control-geocoder-results ul {
                pointer-events: auto;
            }
        `;
        document.head.appendChild(style);
    }

    global.MapCoreShared = {
        createBaseLayers,
        setupMap,
        setupBasicLayerControl,
        setupReadOnlyMapEvents,
        setupGeocoder
    };
})(window);
