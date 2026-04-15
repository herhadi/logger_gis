(function attachMapReadShared(global) {
    const defaultMarkerColors = {
        acc: "orange",
        reservoir: "blue",
        tank: "green",
        valve: "red"
    };

    function getMarkerColor(ctx, tipe) {
        const fromState = ctx.state?.colorMap?.[tipe];
        if (fromState) return fromState;
        if (typeof ctx._markerColor === 'function') return ctx._markerColor(tipe);
        return defaultMarkerColors[tipe] || "gray";
    }

    function getPolygonRenderer(ctx, isSVGMode) {
        return isSVGMode ? (ctx.layers.svgRenderer || ctx.layers.polySvgRenderer) : ctx.layers.polyCanvasRenderer;
    }

    function clearLayerIfPossible(layer) {
        if (layer && typeof layer.clearLayers === 'function') layer.clearLayers();
    }

    const methods = {
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

        _renderMarkerPopupContent(d) {
            const ll = d.coords ? { lat: d.coords[0], lng: d.coords[1] } : null;
            return `
                <div class="p-2" style="min-width:220px">
                    <div class="fw-bold mb-2 text-center">Info Marker</div>
                    <div><b>ID:</b> ${d.id}</div>
                    <div><b>Tipe:</b> ${(d.tipe || '').toUpperCase()}</div>
                    <div><b>Elevasi:</b> ${d.elevation ?? '-'}</div>
                    <div><b>Lokasi:</b> ${d.lokasi ?? '-'}</div>
                    <div><b>Keterangan:</b> ${d.keterangan ?? '-'}</div>
                    ${ll ? `<div class="mt-2" style="text-align:center;">
                        <button id="lokasiBtn-${d.id}" onclick="bukaRute(${ll.lat}, ${ll.lng}, '${d.id}')" class="btn btn-sm btn-primary" style="width:100%;">
                            Lokasi
                        </button>
                    </div>` : ''}
                </div>`;
        },

        _renderPipaPopupContent(d) {
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
        },

        _renderPolygonPopupContent(d) {
            return `
                <div class="p-2" style="min-width:220px">
                    <div class="fw-bold mb-2 text-center">Info Polygon</div>
                    <div><b>ID:</b> ${d.id}</div>
                    <div><b>No SAMW:</b> ${d.nosamw ?? '-'}</div>
                    <div><b>Luas:</b> ${d.luas_hitung ?? '-'} m²</div>
                </div>`;
        },

        async _loadMarkerDetail(marker) {
            if (!marker?.featureData?.id || marker.featureData._detailLoaded) return;
            const tipe = (marker.featureData.tipe || marker._originalTipe || '').toString();
            const res = await fetch(`/api/marker/${encodeURIComponent(tipe)}/${marker.featureData.id}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            marker.featureData = { ...marker.featureData, ...data, coords: marker.featureData.coords, _detailLoaded: true };
        },

        async _loadPipaDetail(line) {
            if (!line?.featureData?.id || line.featureData._detailLoaded) return;
            const res = await fetch(`/api/pipa/${line.featureData.id}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            line.featureData = { ...line.featureData, ...data, _detailLoaded: true };
        },

        async _loadPolygonDetail(polygon) {
            if (!polygon?.featureData?.id || polygon.featureData._detailLoaded) return;
            const res = await fetch(`/api/polygon/${polygon.featureData.id}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            polygon.featureData = { ...polygon.featureData, ...data, _detailLoaded: true };
        },

        async loadAllLayers() {
            if (!this.layers.map) return;

            // Keep popup stable while panning: defer heavy layer reload until popup closes.
            const activePopup = this.layers.map._popup;
            const popupIsOpen = !!(activePopup && this.layers.map.hasLayer(activePopup));
            if (popupIsOpen) {
                this.state._reloadAfterPopupClose = true;

                if (!this.state._popupReloadListenerAttached) {
                    this.state._popupReloadListenerAttached = true;
                    this.layers.map.once('popupclose', () => {
                        this.state._popupReloadListenerAttached = false;
                        if (this.state._reloadAfterPopupClose) {
                            this.state._reloadAfterPopupClose = false;
                            this.loadAllLayers();
                        }
                    });
                }
                return;
            }

            const bounds = this.layers.map.getBounds();
            if (!bounds.isValid()) return;

            const bboxMarkers = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(",");
            const bboxSWNE = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].join(",");
            const jobs = [];

            if (this.state.layerVisibility.markers) jobs.push(this.loadMarkers(bboxMarkers));
            if (this.state.layerVisibility.pipes) jobs.push(this.loadPipa(bboxSWNE));
            if (this.state.layerVisibility.polygons) jobs.push(this.loadPolygon(bboxSWNE));

            await Promise.all(jobs);
        },

        async loadMarkers(bbox) {
            if (!this.layers.map || !this.state.layerVisibility.markers) return;

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
                            html: `<div style="width:10px;height:10px;border-radius:50%;background:${getMarkerColor(this, m.tipe)};border:1px solid #fff;"></div>`,
                            iconSize: [10, 10]
                        }),
                        pane: 'markerPane'
                    });

                    marker.featureData = { ...m, coords: [lat, lng] };
                    marker._markerId = m.id;
                    marker._originalTipe = m.tipe;

                    marker.bindPopup(`<div class="p-2 small text-muted">Memuat detail marker...</div>`, { autoPan: true, closeOnClick: false });
                    marker.on('popupopen', async () => {
                        try {
                            await this._loadMarkerDetail(marker);
                            marker.setPopupContent(this._renderMarkerPopupContent(marker.featureData));
                        } catch (err) {
                            marker.setPopupContent(`<div class="p-2 text-danger small">${err.message || 'Gagal memuat detail marker'}</div>`);
                        }
                    });

                    this.layers.markerGroup.addLayer(marker);
                });
            } catch (err) {
                console.error("Gagal load markers:", err);
            }
        },

        async loadPipa(bbox) {
            if (!this.layers.map || !this.state.layerVisibility.pipes) return;

            try {
                const currentZoom = this.layers.map.getZoom();
                const interactiveZoom = this.config.svgInteractiveZoom || 18;
                const isSVGMode = currentZoom >= interactiveZoom;
                const query = new URLSearchParams();

                if (bbox) query.set('bbox', bbox);
                query.set('zoom', currentZoom);

                if (this.layers.pipaCanvasRenderer?._container) {
                    this.layers.pipaCanvasRenderer._container.style.pointerEvents = isSVGMode ? 'none' : 'auto';
                }

                const res = await fetch(`/api/pipa?${query.toString()}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();

                clearLayerIfPossible(this.layers.pipeGroup);
                clearLayerIfPossible(this.layers.pipeGeometry);
                if (this.state.pipeEndpointIndex instanceof Map) this.state.pipeEndpointIndex = new Map();

                data.forEach(pipe => {
                    const coords = pipe.geometry || [];
                    if (!Array.isArray(coords) || coords.length < 2) return;

                    const color = this.state.diamtrColors?.[pipe.diameter] || "red";
                    const line = L.polyline(coords, {
                        color,
                        weight: 3,
                        pane: "pipaPane",
                        interactive: true,
                        renderer: isSVGMode ? this.layers.pipaSvgRenderer : this.layers.pipaCanvasRenderer
                    }).addTo(this.layers.pipeGroup);

                    line.featureData = pipe;
                    line._pipeId = pipe.id;

                    if (this.layers.pipeGeometry) this.layers.pipeGeometry.addLayer(line);
                    if (typeof this._indexPipeLine === 'function') this._indexPipeLine(line);

                    line.on('mouseover', () => {
                        this.layers.map.getContainer().style.cursor = 'pointer';
                    });
                    line.on('mouseout', () => {
                        this.layers.map.getContainer().style.cursor = '';
                    });

                    line.bindPopup(`<div class="p-2 small text-muted">Memuat detail pipa...</div>`, { autoPan: true, closeOnClick: false });
                    line.on('popupopen', async () => {
                        try {
                            await this._loadPipaDetail(line);
                            line.setPopupContent(this._renderPipaPopupContent(line.featureData));
                        } catch (err) {
                            line.setPopupContent(`<div class="p-2 text-danger small">${err.message || 'Gagal memuat detail pipa'}</div>`);
                        }
                    });
                });
            } catch (err) {
                console.error("Gagal load pipa:", err);
            }
        },

        async loadPolygon(bbox) {
            if (!this.layers.map || !this.state.layerVisibility.polygons) return;

            // Defer reload if polygon is being edited
            if (this.state._deferPolygonReload) {
                console.log('⏳ Deferring polygon reload due to active edit');
                return;
            }

            const currentZoom = this.layers.map.getZoom();
            const interactiveZoom = this.config.svgInteractiveZoom || 18;
            const isSVGMode = currentZoom >= interactiveZoom;
            const query = new URLSearchParams();

            if (bbox) query.set('bbox', bbox);
            query.set('zoom', currentZoom);

            if (this.layers.polyCanvasRenderer?._container) {
                this.layers.polyCanvasRenderer._container.style.pointerEvents = isSVGMode ? 'none' : 'auto';
            }

            if (currentZoom < 14) {
                clearLayerIfPossible(this.layers.polygonGroup);
                clearLayerIfPossible(this.layers.polyGeometry);
                clearLayerIfPossible(this.layers.geometryLayer);
                return;
            }

            try {
                const response = await fetch(`/api/polygon?${query.toString()}`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();

                // Get IDs of polygons currently in edit mode or newly created but not yet saved
                const editingIds = new Set();
                const newLocalPolygons = [];
                
                this.layers.polygonGroup.eachLayer(l => {
                    if (l._isEditing) editingIds.add(String(l._polygonId));
                });
                
                this.layers.polygonGroupNew.eachLayer(l => {
                    newLocalPolygons.push(l);
                });

                // Clear only polygons that are NOT being edited
                const layersToRemove = [];
                this.layers.polygonGroup.eachLayer(l => {
                    if (!l._isEditing) layersToRemove.push(l);
                });
                layersToRemove.forEach(l => this.layers.polygonGroup.removeLayer(l));
                
                clearLayerIfPossible(this.layers.polyGeometry);
                clearLayerIfPossible(this.layers.geometryLayer);

                data.forEach(poly => {
                    // Skip if this polygon is already being edited (to prevent overwriting its current state)
                    if (editingIds.has(String(poly.id))) return;

                    const ring = poly.geometry ? poly.geometry[0] : [];
                    if (!Array.isArray(ring) || ring.length < 3) return;

                    const polygon = L.polygon(ring, {
                        color: 'blue',
                        weight: 1,
                        fill: true,
                        fillOpacity: 0.4,
                        pane: 'polygonPane',
                        interactive: isSVGMode,
                        renderer: getPolygonRenderer(this, isSVGMode)
                    }).addTo(this.layers.polygonGroup);

                    polygon.featureData = poly;
                    polygon._polygonId = poly.id;
                    if (this.layers.polyGeometry) this.layers.polyGeometry.addLayer(polygon);

                    if (isSVGMode) {
                        polygon.on('add', function () {
                            const el = this.getElement();
                            if (el) {
                                el.style.pointerEvents = 'visiblePainted';
                                el.style.cursor = 'pointer';
                            }
                        });
                        polygon.on('mouseover', () => {
                            this.layers.map.getContainer().style.cursor = 'pointer';
                        });
                        polygon.on('mouseout', () => {
                            this.layers.map.getContainer().style.cursor = '';
                        });
                        polygon.bindPopup(`<div class="p-2 small text-muted">Memuat detail polygon...</div>`, { autoPan: true, closeOnClick: false });
                        polygon.on('popupopen', async () => {
                            try {
                                await this._loadPolygonDetail(polygon);
                                polygon.setPopupContent(this._renderPolygonPopupContent(polygon.featureData));
                            } catch (err) {
                                polygon.setPopupContent(`<div class="p-2 text-danger small">${err.message || 'Gagal memuat detail polygon'}</div>`);
                            }
                        });
                    }
                });

                this.state.cachedPolygonData = data;
            } catch (err) {
                console.error("Gagal load polygon:", err);
            }
        },

        async loadLegend() {
            try {
                const res = await fetch('/api/pipa/option');
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();

                this.state.diameterList = data.diameter || [];
                this.state.jenisList = data.jenis || [];

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
                    const label = typeof this._formatLegendLabel === 'function' ? this._formatLegendLabel(dia) : dia;
                    item.innerHTML = `<span class="legend-line" style="background:${color}; height:6px;"></span> ${label}`;
                    if (typeof this.filterPipaByDiameter === 'function') {
                        item.onclick = () => this.filterPipaByDiameter(dia);
                    }
                    legendDiv.appendChild(item);
                });
            } catch (err) {
                console.error("Gagal load legend:", err);
            }
        }
    };

    global.MapReadShared = {
        apply(target) {
            Object.entries(methods).forEach(([key, value]) => {
                const preserveCustomRenderer =
                    target[key] &&
                    ['_renderMarkerPopupContent', '_renderPipaPopupContent', '_renderPolygonPopupContent'].includes(key);

                if (!preserveCustomRenderer) {
                    target[key] = value;
                }
            });
            return target;
        }
    };
})(window);
