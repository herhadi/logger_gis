(function attachMapAdminEditShared(global) {
    const methods = {
        _escapeHtml(value) {
            return String(value ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#x27;");
        },

        _showError(prefix, err) {
            const message = err?.message || "Terjadi kesalahan";
            this.showToast(`${prefix}: ${message}`, "danger");
        },

        _getMarkerNormalIcon(tipe) {
            return L.divIcon({
                className: "custom-marker",
                html: `<div style="width:10px;height:10px;border-radius:50%;background:${this.state.colorMap?.[tipe] || "gray"};border:1px solid #fff;"></div>`,
                iconSize: [10, 10]
            });
        },

        _getMarkerEditIcon() {
            if (!this._cachedMarkerEditIcon) {
                this._cachedMarkerEditIcon = L.divIcon({
                    className: "custom-marker-edit",
                    html: `<div style="width:12px;height:12px;border-radius:50%;background:orange;border:2px solid #fff;box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`,
                    iconSize: [12, 12]
                });
            }
            return this._cachedMarkerEditIcon;
        },

        _resolvePipeLayer(id) {
            return id === "new"
                ? this.layers.pipeGroupNew.getLayers().find(l => l._pipeId === "new")
                : this.layers.pipeGroup.getLayers().find(l => l._pipeId == id);
        },

        _resolveLayer(type, id) {
            if (type === "srpolygon") return this._findPolygonById(id);
            if (type === "pipe") return this._resolvePipeLayer(id);
            if (type === "marker") return this._findMarkerById(id);
            return null;
        },

        _removeLayerByType(type, id, layer) {
            console.log("🗑️ _removeLayerByType:", { type, id, layerExists: !!layer });
            if (!layer) return;

            if (type === "srpolygon") {
                if (id === "new") {
                    this.layers.polygonGroupNew.removeLayer(layer);
                } else if (this.layers.polygonGroup?.hasLayer?.(layer)) {
                    this.layers.polygonGroup.removeLayer(layer);
                } else if (this.layers.map?.hasLayer?.(layer)) {
                    this.layers.map.removeLayer(layer);
                }

                if (this.layers.polyGeometry?.hasLayer?.(layer)) {
                    this.layers.polyGeometry.removeLayer(layer);
                }
                if (this.layers.geometryLayer?.hasLayer?.(layer)) {
                    this.layers.geometryLayer.removeLayer(layer);
                }
                if (typeof layer.remove === 'function') {
                    layer.remove();
                }
                return;
            }

            if (type === "pipe") {
                if (id === "new") this.layers.pipeGroupNew.removeLayer(layer);
                else this.layers.pipeGroup.removeLayer(layer);
                return;
            }

            if (type === "marker") {
                if (id === "new") {
                    console.log("🗑️ Removing new marker");
                    const markerGroup = this.layers.markerGroupNew;
                    markerGroup?.removeLayer(layer);
                    if (this.layers.map?.hasLayer?.(layer)) {
                        console.log("🗑️ Also removing from map");
                        this.layers.map.removeLayer(layer);
                    }
                    if (typeof layer.remove === 'function') {
                        console.log("🗑️ Removing layer directly");
                        layer.remove();
                    }
                } else {
                    if (this.layers.markerGroup?.hasLayer?.(layer)) {
                        this.layers.markerGroup.removeLayer(layer);
                    } else if (this.layers.markerGroup) {
                        this.layers.markerGroup.eachLayer(child => {
                            if (child instanceof L.Marker && child._markerId == id) {
                                console.log("🗑️ Removing matching marker by id from cluster group");
                                this.layers.markerGroup.removeLayer(child);
                            }
                        });
                    }

                    if (this.layers.map?.hasLayer?.(layer)) {
                        console.log("🗑️ Removing saved marker from map");
                        this.layers.map.removeLayer(layer);
                    }

                    if (typeof layer.remove === 'function') {
                        console.log("🗑️ Removing saved marker directly");
                        layer.remove();
                    }

                    if (typeof this.layers.markerGroup?.refreshClusters === 'function') {
                        this.layers.markerGroup.refreshClusters();
                    }
                    if (typeof this.layers.markerGroup?.redraw === 'function') {
                        this.layers.markerGroup.redraw();
                    }
                }
            }
        },

        _clearMarkerEditState(marker) {
            if (!marker) return;
            if (marker.dragging) marker.dragging.disable();
            this._setMarkerEditingVisual(marker, false);
            marker._pendingDragLatLng = null;
            marker._dragFrameScheduled = false;
            marker._linkedPipes = [];
            delete marker._backupLatLng;

            // Cleanup drag event listeners to prevent memory leaks
            if (marker._dragStartHandler) {
                marker.off('dragstart', marker._dragStartHandler);
                delete marker._dragStartHandler;
            }
            if (marker._dragHandler) {
                marker.off('drag', marker._dragHandler);
                delete marker._dragHandler;
            }
            marker._pipeFollowBound = false;
        },

        _clearShapeEditState(layer) {
            if (!layer) return;
            if (layer.pm) layer.pm.disable();
            if (typeof layer.setLatLngs === "function") delete layer._backupLatLngs;
        },

        _upsertLayerIndex(type, id, layer) {
            if (!id || !layer || id === "new") return;

            if (type === "marker") {
                if (!this.state.markerLayerIndex) this.state.markerLayerIndex = new Map();
                this.state.markerLayerIndex.set(String(id), layer);
            } else if (type === "pipe") {
                if (!this.state.pipeLayerIndex) this.state.pipeLayerIndex = new Map();
                this.state.pipeLayerIndex.set(String(id), layer);
            } else if (type === "srpolygon") {
                if (!this.state.polygonLayerIndex) this.state.polygonLayerIndex = new Map();
                this.state.polygonLayerIndex.set(String(id), layer);
            }
        },

        _removeLayerIndex(type, id) {
            if (!id || id === "new") return;

            if (type === "marker" && this.state.markerLayerIndex) {
                this.state.markerLayerIndex.delete(String(id));
            } else if (type === "pipe" && this.state.pipeLayerIndex) {
                this.state.pipeLayerIndex.delete(String(id));
            } else if (type === "srpolygon" && this.state.polygonLayerIndex) {
                this.state.polygonLayerIndex.delete(String(id));
            }
        },

        _collectLinkedPipeUpdates(marker) {
            if (!marker?._linkedPipes?.length) return [];

            const uniq = new Map();
            for (const link of marker._linkedPipes) {
                if (link?.line?._pipeId) uniq.set(String(link.line._pipeId), link.line);
            }

            return Array.from(uniq.values()).map(line => ({
                line,
                payload: {
                    dc_id: line.featureData?.dc_id,
                    dia: line.featureData?.dia,
                    jenis: line.featureData?.jenis,
                    panjang: line.featureData?.panjang_input,
                    keterangan: line.featureData?.keterangan,
                    lokasi: line.featureData?.lokasi,
                    status: line.featureData?.status,
                    diameter: line.featureData?.diameter,
                    roughness: line.featureData?.roughness,
                    zona: line.featureData?.zona
                }
            }));
        },

        async _syncLinkedPipes(marker) {
            const updates = this._collectLinkedPipeUpdates(marker);
            if (!updates.length) return false;

            let needsReload = false;
            for (const { line, payload } of updates) {
                try {
                    await this.updatePipa(line._pipeId, line, payload, { silent: true, reload: false });
                } catch (err) {
                    console.error("Failed to sync linked pipe:", line._pipeId, err);
                    needsReload = true; // Force reload if any update fails
                }
            }

            return needsReload;
        },

        _debounceReloadPipes() {
            if (this._reloadPipesTimeout) {
                clearTimeout(this._reloadPipesTimeout);
            }
            this._reloadPipesTimeout = setTimeout(() => {
                this.loadPipa();
                this._reloadPipesTimeout = null;
            }, 100); // 100ms debounce
        },

        _debounceReloadMarkers() {
            if (this._reloadMarkersTimeout) {
                clearTimeout(this._reloadMarkersTimeout);
            }
            this._reloadMarkersTimeout = setTimeout(() => {
                if (this.layers.map) {
                    const b = this.layers.map.getBounds();
                    const bbox1 = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(",");
                    this.loadMarkers(bbox1);
                }
                this._reloadMarkersTimeout = null;
            }, 100); // 100ms debounce
        },

        _debounceReloadPolygons() {
            if (this._reloadPolygonsTimeout) {
                clearTimeout(this._reloadPolygonsTimeout);
            }
            this._reloadPolygonsTimeout = setTimeout(() => {
                if (this.layers.map) {
                    const b = this.layers.map.getBounds();
                    const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].join(",");
                    this.loadPolygon(bbox);
                }
                this._reloadPolygonsTimeout = null;
            }, 150);
        },

        _renderMarkerPopupContent(d) {
            const tipeOptions = Object.keys(this.state.colorMap).map(t =>
                `<option value="${this._escapeHtml(t)}" ${t === d.tipe ? "selected" : ""}>${this._escapeHtml(t.toUpperCase())}</option>`
            ).join("");

            return `
                <div class="p-2" style="min-width:250px">
                    <div class="fw-bold mb-2 text-center">Edit Marker Aset</div>
                    <div class="mb-2">
                        <label class="form-label small mb-1">Tipe Aset</label>
                        <select class="form-select form-select-sm" name="editTipe">
                            ${tipeOptions}
                        </select>
                    </div>
                    <div class="mb-2">
                        <label class="form-label small mb-1">Elevasi</label>
                        <input type="number" class="form-control form-control-sm" name="editElevation" value="${this._escapeHtml(d.elevation || "")}">
                    </div>
                    <div class="mb-2">
                        <label class="form-label small mb-1">Lokasi</label>
                        <input type="text" class="form-control form-control-sm" name="editLokasi" value="${this._escapeHtml(d.lokasi || "")}">
                    </div>
                    <div class="mb-2">
                        <label class="form-label small mb-1">Keterangan</label>
                        <input type="text" class="form-control form-control-sm" name="editKeterangan" value="${this._escapeHtml(d.keterangan || "")}">
                    </div>
                    <div class="d-flex gap-1 mt-3">
                        <button class="btn btn-sm btn-success flex-fill btn-save" data-type="marker" data-id="${this._escapeHtml(d.id)}">💾 Simpan</button>
                        <button class="btn btn-sm btn-primary flex-fill btn-edit" data-type="marker" data-id="${this._escapeHtml(d.id)}">✏️ Edit</button>
                        <button class="btn btn-sm btn-secondary flex-fill btn-cancel" data-type="marker" data-id="${this._escapeHtml(d.id)}">❌ Batal</button>
                        <button class="btn btn-sm btn-danger flex-fill btn-hapus" data-type="marker" data-id="${this._escapeHtml(d.id)}">🗑️ Hapus</button>
                    </div>
                </div>`;
        },

        _renderPipaPopupContent(d) {
            const diameterOptions = (this.state.diameterList || []).map(opt => {
                const norm = this._normalizeDiameterValue(opt);
                const selected = this._normalizeDiameterValue(d.diameter) === norm ? "selected" : "";
                return `<option value="${this._escapeHtml(norm)}" ${selected}>${this._escapeHtml(norm)}</option>`;
            }).join("");

            const jenisOptions = (this.state.jenisList || []).map(opt => {
                const selected = (d.jenis || "") === opt ? "selected" : "";
                return `<option value="${this._escapeHtml(opt)}" ${selected}>${this._escapeHtml(opt)}</option>`;
            }).join("");

            return `
                <div class="p-2" style="min-width:250px">
                    <div class="fw-bold mb-2 text-center">Edit Pipa</div>
                    <div class="mb-2">
                        <label class="form-label small mb-1">Diameter</label>
                        <select class="form-select form-select-sm" name="editDiameter">
                            <option value="">-- Pilih Diameter --</option>
                            ${diameterOptions}
                        </select>
                    </div>
                    <div class="mb-2">
                        <label class="form-label small mb-1">Jenis</label>
                        <select class="form-select form-select-sm" name="editJenis">
                            <option value="">-- Pilih Jenis --</option>
                            ${jenisOptions}
                        </select>
                    </div>
                    <div class="d-flex gap-1 mt-3">
                        <button class="btn btn-sm btn-success flex-fill btn-save" data-type="pipe" data-id="${this._escapeHtml(d.id)}">💾 Simpan</button>
                        <button class="btn btn-sm btn-primary flex-fill btn-edit" data-type="pipe" data-id="${this._escapeHtml(d.id)}">✏️ Edit</button>
                        <button class="btn btn-sm btn-secondary flex-fill btn-cancel" data-type="pipe" data-id="${this._escapeHtml(d.id)}">❌ Batal</button>
                        <button class="btn btn-sm btn-danger flex-fill btn-hapus" data-type="pipe" data-id="${this._escapeHtml(d.id)}">🗑️ Hapus</button>
                    </div>
                </div>`;
        },

        _renderPolygonPopupContent(d) {
            return `
                <div class="p-2" style="min-width:250px">
                    <div class="fw-bold mb-2 text-center">Edit Polygon</div>
                    <div class="mb-2">
                        <label class="form-label small mb-1">No SAMW</label>
                        <input type="text" class="form-control form-control-sm" name="editNosamw" value="${this._escapeHtml(d.nosamw || "")}">
                    </div>
                    <div class="mb-2">
                        <label class="form-label small mb-1">Luas (m²)</label>
                        <input type="text" class="form-control form-control-sm" name="editLuas" value="${this._escapeHtml(d.luas_hitung || 0)}" readonly>
                    </div>
                    <div class="d-flex gap-1 mt-3">
                        <button class="btn btn-sm btn-success flex-fill btn-save" data-type="srpolygon" data-id="${this._escapeHtml(d.id)}">💾 Simpan</button>
                        <button class="btn btn-sm btn-primary flex-fill btn-edit" data-type="srpolygon" data-id="${this._escapeHtml(d.id)}">✏️ Edit</button>
                        <button class="btn btn-sm btn-secondary flex-fill btn-cancel" data-type="srpolygon" data-id="${this._escapeHtml(d.id)}">❌ Batal</button>
                        <button class="btn btn-sm btn-danger flex-fill btn-hapus" data-type="srpolygon" data-id="${this._escapeHtml(d.id)}">🗑️ Hapus</button>
                    </div>
                </div>`;
        },

        async saveMarker(payload) {
            try {
                const res = await fetch('/api/marker/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Save marker gagal");
                return data;
            } catch (err) {
                this._showError("Terjadi kesalahan saat menyimpan marker", err);
                throw err;
            }
        },

        async updateMarker(id, marker, payload, options = {}) {
            const latlng = marker.getLatLng();

            try {
                const tipe = (marker.featureData?.tipe || marker._originalTipe || payload?.tipe || '').toString();
                const dataToSend = {
                    coords: [latlng.lat, latlng.lng],
                    dc_id: payload.dc_id || null,
                    keterangan: payload.keterangan ?? marker.featureData?.keterangan ?? null,
                    zona: payload.zona || null,
                    lokasi: payload.lokasi ?? marker.featureData?.lokasi ?? null,
                    elevation: payload.elevation ?? marker.featureData?.elevation ?? null
                };

                const res = await fetch(`/api/marker/update/${encodeURIComponent(tipe)}/${id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(dataToSend)
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Gagal update marker");

                marker.featureData = { ...(marker.featureData || {}), ...payload };
                this._upsertLayerIndex("marker", id, marker);

                if (!options.silent) {
                    this.showToast("Marker berhasil diperbarui", "success");
                }

                if (options.reload !== false && this.layers.map) {
                    this._debounceReloadMarkers();
                }

                return data;
            } catch (err) {
                this._showError("Gagal update marker", err);
                throw err;
            }
        },

        async deleteMarker(id) {
            const marker = this._findMarkerById(id);
            const tipe = (marker?.featureData?.tipe || marker?._originalTipe || '').toString();

            if (!tipe) {
                throw new Error("Tipe marker tidak ditemukan");
            }

            const res = await fetch(`/api/marker/delete/${encodeURIComponent(tipe)}/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);

            this._removeLayerIndex("marker", id);
            return true;
        },

        async savePipa(id, line, payload, options = {}) {
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

                line.featureData = { ...(line.featureData || {}), ...dataToSend };
                if (data?.ogr_fid) {
                    line._pipeId = data.ogr_fid;
                    this._upsertLayerIndex("pipe", data.ogr_fid, line);
                }

                if (!options.silent) {
                    this.showToast("Pipa berhasil disimpan", "success");
                }
                if (options.reload !== false) this._debounceReloadPipes();
                return data;
            } catch (err) {
                this._showError("Terjadi kesalahan saat menyimpan pipa", err);
                throw err;
            }
        },

        async updatePipa(id, layer, formData, options = {}) {
            try {
                const coords = layer.getLatLngs().map(latlng => [latlng.lat, latlng.lng]);
                const payload = {
                    coords,
                    dc_id: formData.dc_id ?? layer.featureData?.dc_id ?? null,
                    dia: formData.dia ?? layer.featureData?.dia ?? null,
                    jenis: formData.jenis ?? layer.featureData?.jenis ?? null,
                    panjang: formData.panjang ?? layer.featureData?.panjang_input ?? null,
                    keterangan: formData.keterangan ?? layer.featureData?.keterangan ?? null,
                    lokasi: formData.lokasi ?? layer.featureData?.lokasi ?? null,
                    status: formData.status ?? layer.featureData?.status ?? null,
                    diameter: formData.diameter ?? layer.featureData?.diameter ?? null,
                    roughness: formData.roughness ?? layer.featureData?.roughness ?? null,
                    zona: formData.zona ?? layer.featureData?.zona ?? null
                };

                const res = await fetch(`/api/pipa/update/${id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Gagal update pipa");

                layer.featureData = { ...(layer.featureData || {}), ...payload };
                this._upsertLayerIndex("pipe", id, layer);

                if (!options.silent) {
                    this.showToast("Pipa berhasil diperbarui", "success");
                }
                if (options.reload !== false) this._debounceReloadPipes();
                return data;
            } catch (err) {
                this._showError("Gagal update pipa", err);
                throw err;
            }
        },

        async deletePipa(id) {
            const res = await fetch(`/api/pipa/delete/${id}`, { method: "DELETE" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || data.message || `HTTP error! Status: ${res.status}`);

            this._removeLayerIndex("pipe", id);
            return true;
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

                // Don't modify polygon directly here if we want _handleSavePolygon to manage the state
                return data;
            } catch (err) {
                this._showError("Gagal menyimpan polygon!", err);
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

                this._upsertLayerIndex("srpolygon", id, polygon);
                this.showToast("Polygon berhasil diperbarui!", "success");
                return data;
            } catch (err) {
                this._showError("Gagal memperbarui polygon!", err);
                throw err;
            }
        },

        async deletePolygon(id) {
            const res = await fetch(`/api/polygon/delete/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Gagal hapus polygon!");

            this._removeLayerIndex("srpolygon", id);
            return true;
        },

        _findMarkerById(id) {
            const key = String(id);
            console.log("🔍 _findMarkerById for id:", id);

            if (this.state.markerLayerIndex?.has(key)) {
                console.log("🔍 Found in index");
                return this.state.markerLayerIndex.get(key);
            }

            let found = null;

            this.layers.markerGroup.eachLayer(layer => {
                if (!found && layer instanceof L.Marker && layer._markerId == id) {
                    console.log("🔍 Found in main group");
                    found = layer;
                }
            });

            if (!found) {
                const markerNewGroup = this.layers.markerGroupNew;
                console.log("🔍 Checking new marker group:", !!markerNewGroup);
                markerNewGroup?.eachLayer(layer => {
                    console.log("🔍 Checking layer _markerId:", layer._markerId, "vs id:", id);
                    if (!found && layer instanceof L.Marker && layer._markerId == id) {
                        console.log("🔍 Found in new group!");
                        found = layer;
                    }
                });
            }

            console.log("🔍 Final result - found:", !!found);
            if (found && id !== "new") this._upsertLayerIndex("marker", id, found);
            return found;
        },

        _findPolygonById(id) {
            const key = String(id);
            if (this.state.polygonLayerIndex?.has(key)) {
                return this.state.polygonLayerIndex.get(key);
            }

            let found = null;

            this.layers.polygonGroup?.eachLayer?.(layer => {
                if (!found && layer._polygonId == id) found = layer;
            });

            if (!found) {
                this.layers.polygonGroupNew?.eachLayer?.(layer => {
                    if (!found && layer._polygonId == id) found = layer;
                });
            }

            if (found && id !== "new") this._upsertLayerIndex("srpolygon", id, found);
            return found;
        },

        _getLayerFromActivePopup(type, id) {
            const activePopup = this.layers.map?._popup;
            if (activePopup && activePopup._source) {
                const src = activePopup._source;
                const srcId = src._polygonId || src._markerId || src._pipeId;
                
                const matchType = 
                    (type === 'srpolygon' && src instanceof L.Polygon) ||
                    (type === 'marker' && src instanceof L.Marker) ||
                    (type === 'pipe' && src instanceof L.Polyline && !(src instanceof L.Polygon));

                if (String(srcId) === String(id) && matchType) {
                    return src;
                }
            }
            return null;
        },

        async _handleSave(button) {
            const type = button.dataset.type;
            const id = button.dataset.id;

            if (type === "srpolygon") {
                await this._handleSavePolygon(id);
            } else if (type === "pipe") {
                await this._handleSavePipe(id);
            } else if (type === "marker") {
                await this._handleSaveMarker(id);
            } else {
                console.warn("Unknown save type:", type);
            }
        },

        async _handleSaveMarker(id) {
            const marker = this.layers.markerGroupNew.getLayers().find(m => m._markerId == id) ||
                this._findMarkerById(id);

            if (!marker) return;

            const popupEl = marker.getPopup()?.getElement();
            if (!popupEl) return;

            const tipe = popupEl.querySelector('select[name="editTipe"], #newMarkerTipe')?.value;
            const elevasiRaw = popupEl.querySelector('input[name="editElevation"], #newMarkerElevation')?.value;
            const lokasi = popupEl.querySelector('input[name="editLokasi"]')?.value;
            const keterangan = popupEl.querySelector('input[name="editKeterangan"], #newMarkerKeterangan')?.value;

            if (!tipe) {
                this.showToast("Tipe wajib diisi", "danger");
                return;
            }

            const elevation = elevasiRaw === "" || elevasiRaw === undefined || elevasiRaw === null
                ? null
                : (Number.isFinite(Number(elevasiRaw)) ? Number(elevasiRaw) : null);

            const payload = {
                coords: [marker.getLatLng().lat, marker.getLatLng().lng],
                tipe: tipe.toLowerCase(),
                elevation,
                lokasi: lokasi ?? marker.featureData?.lokasi ?? null,
                keterangan: keterangan ?? marker.featureData?.keterangan ?? null
            };

            try {
                if (!id || id === "new") {
                    const saved = await this.saveMarker(payload);
                    const newId = saved.ogr_fid || saved.id;
                    marker._markerId = newId;

                    // Update marker properties berdasarkan tipe
                    marker._originalTipe = tipe.toLowerCase();
                    marker.featureData = {
                        ...marker.featureData,
                        ...payload,
                        id: newId,
                        tipe: tipe.toLowerCase()
                    };

                    // Update marker icon sesuai tipe
                    const normalIcon = this._getMarkerNormalIcon(tipe.toLowerCase());
                    marker.setIcon(normalIcon);

                    // Pindahkan dari new group ke main group
                    this.layers.markerGroupNew.removeLayer(marker);
                    this.layers.markerGroup.addLayer(marker);
                    this._upsertLayerIndex("marker", newId, marker);
                } else {
                    await this.updateMarker(id, marker, payload, { reload: false });
                    // Update icon untuk marker existing jika tipe berubah
                    const normalIcon = this._getMarkerNormalIcon(tipe.toLowerCase());
                    marker.setIcon(normalIcon);
                    marker._originalTipe = tipe.toLowerCase();
                }

                marker.featureData = { ...marker.featureData, ...payload };
                this._clearMarkerEditState(marker);
                marker.closePopup();

                // Show success toast
                this.showToast(`Marker ${id === "new" ? "baru" : id} berhasil disimpan`, "success");

                const needsPipeReload = await this._syncLinkedPipes(marker);

                // Reload markers untuk update visual - untuk marker baru maupun existing
                if (this.layers.map) {
                    this._debounceReloadMarkers();
                }
            } catch (err) {
                console.error("Gagal simpan marker:", err);
            }
        },

        async _handleSavePolygon(id) {
            const polygon = this._findPolygonById(id);
            if (!polygon) return;

            const popupEl = polygon.getPopup().getElement();
            const nosamw = popupEl.querySelector('[name="editNosamw"], #newPolygonNosamw')?.value.trim();
            const luas = parseInt(popupEl.querySelector('[name="editLuas"], #newPolygonLuas')?.value, 10) || 0;
            const coords = polygon.getLatLngs()[0].map(p => [p.lat, p.lng]);

            try {
                if (!id || id === "new") {
                    const savedPolygon = await this.savePolygon(id, polygon, { coords, nosamw, nosambckup: nosamw, luas });
                    const newId = savedPolygon.ogr_fid;
                    
                    polygon._polygonId = newId;
                    polygon.featureData = { ...(polygon.featureData || {}), id: newId, nosamw, luas_hitung: luas };
                    
                    this.layers.polygonGroupNew.removeLayer(polygon);
                    this.layers.polygonGroup.addLayer(polygon);
                    this._upsertLayerIndex("srpolygon", newId, polygon);
                    polygon.setStyle({ color: "blue", dashArray: null, fillOpacity: 0.4 });
                } else {
                    await this.updatePolygon(id, polygon, { coords, nosamw, nosambckup: polygon._backup || '', luas });
                    polygon.featureData = { ...(polygon.featureData || {}), nosamw, luas_hitung: luas };
                    polygon.setStyle({ color: "blue", dashArray: null, fillOpacity: 0.4 });
                }

                // IMPORTANT: Cleanup edit state and guards AFTER successful save
                if (typeof polygon._polygonRestoreFn === 'function') {
                    // Detach guards first so they don't trigger restore (which would revert geometry)
                    this._detachPolygonEditGuards(polygon);
                }

                if (polygon.pm) polygon.pm.disable();
                this._setPolygonEditingVisual(polygon, false);
                delete polygon._backupLatLngs;
                delete polygon._origLatLngs;
                delete polygon._isEditing;
                
                // Clear defer flag
                this.state._deferPolygonReload = false;
                
                polygon.closePopup();
                this._showBootstrapToast("saveToast");
                
                // Refresh detail and popup content
                if (typeof this._loadPolygonDetail === 'function') {
                    await this._loadPolygonDetail(polygon);
                    polygon.setPopupContent(this._renderPolygonPopupContent(polygon.featureData));
                }
            } catch (err) {
                console.error("Save SRPolygon error:", err);
            }
        },

        async _handleSavePipe(id) {
            const line = this._resolvePipeLayer(id);

            if (!line) return;

            if (!id || id === "new") {
                const startLatLng = line.getLatLngs()[0];
                if (!this._hasMarkerAt(startLatLng)) {
                    this.showToast("Pipa harus dimulai dari point (marker)", "danger");
                    return;
                }
            }

            const popupEl = line.getPopup().getElement();
            const diameterInput = popupEl.querySelector('[name="editDiameter"]')?.value ||
                popupEl.querySelector('#newPipeDiameter')?.value || '';
            const jenisInput = popupEl.querySelector('[name="editJenis"]')?.value ||
                popupEl.querySelector('#newPipeJenis')?.value || '';

            const diameterToSave = this._normalizeDiameterValue(diameterInput);

            try {
                if (!id || id === "new") {
                    const saved = await this.savePipa(id, line, { diameter: diameterToSave, jenis: jenisInput });
                    this.layers.pipeGroupNew.removeLayer(line);
                    this.layers.pipeGroup.addLayer(line);
                    this._upsertLayerIndex("pipe", saved?.ogr_fid || line._pipeId, line);
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
            // STRATEGI BARU: Ambil layer langsung dari popup yang sedang terbuka
            // Ini adalah cara paling akurat untuk mendapatkan instance yang diklik user
            let layer = this._getLayerFromActivePopup(type, id);
            
            // Fallback ke pencarian biasa jika popup tidak ditemukan
            if (!layer) {
                layer = this._resolveLayer(type, id);
            }

            if (!layer) return;

            // Bersihkan total state lama jika ada (mencegah hang)
            if (layer._isEditing || (layer.pm && typeof layer.pm.enabled === 'function' && layer.pm.enabled()) || layer._backupLatLngs) {
                console.log('ℹ️ Resetting inconsistent edit state for layer', id);
                try { if (layer.pm && typeof layer.pm.disable === 'function') layer.pm.disable(); } catch (e) {}
                this._setPolygonEditingVisual(layer, false);
                this._detachPolygonEditGuards(layer);
                delete layer._isEditing;
                delete layer._backupLatLngs;
                delete layer._origLatLngs;
                delete layer._isRestoring;
            }

            if (layer instanceof L.Marker) {
                layer._backupLatLng = layer.getLatLng();
                this._ensureMarkerDragging(layer);
                if (layer.dragging) layer.dragging.enable();
                this._setMarkerEditingVisual(layer, true);

                if (!layer._pipeFollowBound) {
                    layer._pipeFollowBound = true;

                    // Store handler references to enable cleanup
                    layer._dragStartHandler = () => {
                        const startLatLng = layer.getLatLng();
                        const linked = this._getLinkedPipesForMarker(startLatLng);
                        const moved = [];

                        for (const line of linked) {
                            if (!line || typeof line.getLatLngs !== 'function') continue;
                            const ll = line.getLatLngs();
                            if (!Array.isArray(ll) || ll.length < 2) continue;

                            const s = ll[0];
                            const e = ll[ll.length - 1];
                            const ds = s?.distanceTo ? s.distanceTo(startLatLng) : Infinity;
                            const de = e?.distanceTo ? e.distanceTo(startLatLng) : Infinity;
                            const endpoint = ds <= de ? 'start' : 'end';

                            moved.push({
                                line,
                                endpoint,
                                original: endpoint === 'start' ? L.latLng(s.lat, s.lng) : L.latLng(e.lat, e.lng)
                            });
                        }

                        layer._linkedPipes = moved;
                    };

                    layer._dragHandler = () => {
                        layer._pendingDragLatLng = layer.getLatLng();
                        if (layer._dragFrameScheduled) return;

                        layer._dragFrameScheduled = true;
                        requestAnimationFrame(() => {
                            layer._dragFrameScheduled = false;

                            const newLatLng = layer._pendingDragLatLng;
                            if (!newLatLng) return;

                            const moved = layer._linkedPipes || [];
                            if (!moved.length) return;

                            for (const link of moved) {
                                const line = link.line;
                                if (!line || typeof line.getLatLngs !== 'function') continue;
                                const ll = line.getLatLngs();
                                if (!Array.isArray(ll) || ll.length < 2) continue;

                                if (link.endpoint === 'start') ll[0] = newLatLng;
                                else ll[ll.length - 1] = newLatLng;
                                line.setLatLngs(ll);

                                const oldKey = line._endpointKeys?.[link.endpoint];
                                const newKey = this._latLngKey(newLatLng);
                                if (oldKey && oldKey !== newKey) {
                                    const set = this.state.pipeEndpointIndex.get(oldKey);
                                    if (set) {
                                        set.delete(line);
                                        if (set.size === 0) this.state.pipeEndpointIndex.delete(oldKey);
                                    }
                                    let next = this.state.pipeEndpointIndex.get(newKey);
                                    if (!next) {
                                        next = new Set();
                                        this.state.pipeEndpointIndex.set(newKey, next);
                                    }
                                    next.add(line);
                                    if (line._endpointKeys) line._endpointKeys[link.endpoint] = newKey;
                                }
                            }
                        });
                    };

                    layer.on('dragstart', layer._dragStartHandler);
                    layer.on('drag', layer._dragHandler);
                }
            } else if (typeof layer.getLatLngs === 'function') {
                const cloned = this._cloneLatLngs(layer.getLatLngs());
                layer._backupLatLngs = cloned;
                // persist an original copy so cancel still works if popupclose already cleared _backupLatLngs
                if (!layer._origLatLngs) layer._origLatLngs = this._cloneLatLngs(cloned);
            }

           // ... existing code ...
            if (!(layer instanceof L.Marker) && layer.pm) layer.pm.enable();

            if (type === "marker") {
                layer.setIcon(this._getMarkerEditIcon());
                layer.closePopup();
            } else if (type === "pipe") {
                console.log('✏️ Entering pipe edit mode for id:', id);
                if (this.layers.map) this.layers.map.closePopup();
                if (typeof layer.closePopup === 'function') layer.closePopup();
            } else if (type === "srpolygon") {
                console.log('✏️ Entering polygon edit mode for id:', layer?._polygonId, 'backupExists:', !!layer?._backupLatLngs, 'pm:', !!layer.pm);

                // Force closure of all popups on map to avoid "hang"
                if (this.layers.map) this.layers.map.closePopup();
                if (typeof layer.closePopup === 'function') layer.closePopup();

                // Use a short delay to ensure Leaflet has processed the popup closure
                setTimeout(() => {
                    try {
                        if (layer.pm && typeof layer.pm.enable === 'function') {
                            layer.pm.enable();
                            console.log('✅ PM enabled on polygon after delay');
                        }
                    } catch (err) {
                        console.warn('Failed to enable PM on polygon:', err);
                    }
                    try {
                        if (typeof layer.bringToFront === 'function') layer.bringToFront();
                        if (layer.getElement && layer.getElement()) {
                            layer.getElement().style.pointerEvents = 'auto';
                        }
                    } catch (err) { }
                    // Attach per-polygon guards so pan/popupclose restore backup reliably
                    try { this._attachPolygonEditGuards(layer); } catch (e) { console.warn('Failed to attach polygon guards', e); }
                }, 50);
            }
        },

        _attachPolygonEditGuards(layer) {
            if (!layer || !this.layers || !this.layers.map) return;

            const restoreAndCleanup = () => {
                // Use a local flag to prevent recursion if restoreAndCleanup is called multiple times
                if (layer._isRestoring) return;
                layer._isRestoring = true;

                console.log('🔧 restoreAndCleanup for polygon', layer._polygonId);
                
                // If currently moving, don't restore to avoid interrupting edit
                if (this.state._isMoving) {
                    console.log('🔧 Skipping restore during move');
                    layer._isRestoring = false;
                    return;
                }
                
                // Detach all guards immediately
                this._detachPolygonEditGuards(layer);

                try { 
                    if (layer.pm && typeof layer.pm.disable === 'function') {
                        layer.pm.disable(); 
                    }
                } catch (e) {}

                // CRITICAL: Check if we actually need to restore. 
                // If the user already SAVED, we don't want to restore old coordinates.
                // But if they PAN or CANCEL, we do.
                if (layer._isEditing) {
                    try {
                        const toRestore = (layer._backupLatLngs && typeof layer.setLatLngs === 'function')
                            ? layer._backupLatLngs
                            : (layer._origLatLngs && typeof layer.setLatLngs === 'function' ? layer._origLatLngs : null);

                        if (toRestore && typeof layer.setLatLngs === 'function') {
                            layer.setLatLngs(toRestore);
                            console.log('🔧 restored polygon latlngs');
                        }
                    } catch (e) {
                        console.warn('Failed to restore polygon backup', e);
                    }
                }

                try { this._setPolygonEditingVisual(layer, false); } catch (e) {}
                
                // Ensure popup is closed and state is cleaned
                try {
                    if (typeof layer.closePopup === 'function') layer.closePopup();
                } catch (e) {}

                delete layer._backupLatLngs;
                delete layer._origLatLngs;
                delete layer._isEditing;
                delete layer._isRestoring;

                // Clear defer flag and reload polygons if needed
                this.state._deferPolygonReload = false;
                try { 
                    const b = this.layers.map.getBounds();
                    const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].join(",");
                    this.loadPolygon(bbox);
                } catch (e) { /* ignore */ }

                // Ensure interaction is restored
                try {
                    if (layer.getElement && layer.getElement()) {
                        layer.getElement().style.pointerEvents = 'auto';
                        layer.getElement().style.cursor = 'pointer';
                    }
                } catch (e) {}
            };

            // store references so we can remove them later
            layer._polygonRestoreFn = restoreAndCleanup;

            layer._pmPopupCloseHandler = (e) => {
                if (e && e.popup && e.popup._source === layer) {
                    console.log('🔧 Guard: popupclose detected for polygon', layer._polygonId);
                    // If currently moving, don't restore
                    if (!this.state._isMoving) {
                        restoreAndCleanup();
                    }
                }
            };

            layer._pmMoveStartHandler = () => {
                console.log('🔧 Guard: movestart detected while editing polygon', layer._polygonId);
                // Set moving flag to prevent restore during pan
                this.state._isMoving = true;
                // Defer reload during move
                this.state._deferPolygonReload = true;
            };

            layer._pmRemoveHandler = () => {
                console.log('🔧 Guard: layer removed while editing polygon', layer._polygonId);
                // If currently moving, don't restore
                if (!this.state._isMoving) {
                    restoreAndCleanup();
                }
            };

            layer._pmMoveEndHandler = () => {
                // Clear moving flag
                this.state._isMoving = false;
                // Clear defer flag
                this.state._deferPolygonReload = false;
                if (layer.getElement && layer.getElement()) {
                    layer.getElement().style.pointerEvents = 'auto';
                }
            };

            this.layers.map.on('popupclose', layer._pmPopupCloseHandler);
            this.layers.map.on('movestart', layer._pmMoveStartHandler);
            this.layers.map.on('moveend', layer._pmMoveEndHandler);
            layer.on('remove', layer._pmRemoveHandler);
        },

        _detachPolygonEditGuards(layer) {
            if (!layer || !this.layers || !this.layers.map) return;
            try {
                if (layer._pmPopupCloseHandler) {
                    this.layers.map.off('popupclose', layer._pmPopupCloseHandler);
                    delete layer._pmPopupCloseHandler;
                }
            } catch (e) {}
            try {
                if (layer._pmMoveStartHandler) {
                    this.layers.map.off('movestart', layer._pmMoveStartHandler);
                    delete layer._pmMoveStartHandler;
                }
            } catch (e) {}
            try {
                if (layer._pmMoveEndHandler) {
                    this.layers.map.off('moveend', layer._pmMoveEndHandler);
                    delete layer._pmMoveEndHandler;
                }
            } catch (e) {}
            try {
                if (layer._pmRemoveHandler) {
                    layer.off('remove', layer._pmRemoveHandler);
                    delete layer._pmRemoveHandler;
                }
            } catch (e) {}
            if (layer._polygonRestoreFn) delete layer._polygonRestoreFn;
        },

        _handleCancel(button) {
            const type = button.dataset.type;
            const id = button.dataset.id;
            console.log("🔄 _handleCancel:", { type, id });

            // Gunakan deteksi dari popup aktif
            let layer = this._getLayerFromActivePopup(type, id);
            
            if (!layer) {
                layer = this._resolveLayer(type, id);
            }

            if (!layer) {
                // Fallback for new polygon: try to find in polygonGroupNew
                if (type === 'srpolygon' && id === 'new' && this.layers.polygonGroupNew) {
                    this.layers.polygonGroupNew.eachLayer(l => {
                        if (!layer && l._polygonId === 'new') layer = l;
                    });
                }
            }

            if (!layer) {
                console.log("❌ No layer found for cancel");
                return;
            }

            if (id === "new") {
                console.log("🗑️ Removing new layer:", type);
                this._removeLayerByType(type, id, layer);
                // Close popup for new markers before returning
                if (type === "marker") {
                    console.log("🗑️ Closing popup for new marker");
                    layer.closePopup();
                }
                return;
            }

            // For polygons, prefer calling the stored restore function first
            if (type === 'srpolygon' && typeof layer._polygonRestoreFn === 'function') {
                try { 
                    layer._polygonRestoreFn(); 
                    return; // restoreAndCleanup handles everything for polygons
                } catch (e) { 
                    console.warn('Error running polygon restoreFn', e); 
                }
            }

            if (layer.pm) layer.pm.disable();
            this._ensureMarkerDragging(layer);
            if (layer.dragging) layer.dragging.disable();
            if (type === "marker") this._setMarkerEditingVisual(layer, false);
            layer.closePopup();

            if (type === "marker" && layer._originalTipe) {
                layer.setIcon(this._getMarkerNormalIcon(layer._originalTipe));
            }

            if (layer._backupLatLng) {
                layer.setLatLng(layer._backupLatLng);
            }

            if (type === "srpolygon") {
                this._setPolygonEditingVisual(layer, false);
                try { if (layer.pm) layer.pm.disable(); } catch (e) {}
                // Detach guards now; actual restore happens below in the generic restore block
                try { this._detachPolygonEditGuards(layer); } catch (e) {}
            }

            if (type === "marker" && layer._linkedPipes && layer._linkedPipes.length) {
                for (const link of layer._linkedPipes) {
                    const line = link.line;
                    if (!line || typeof line.getLatLngs !== 'function') continue;
                    const ll = line.getLatLngs();
                    if (!Array.isArray(ll) || ll.length < 2) continue;

                    const oldKey = line._endpointKeys?.[link.endpoint];
                    const restoreKey = this._latLngKey(link.original);

                    if (link.endpoint === 'start') ll[0] = link.original;
                    else ll[ll.length - 1] = link.original;
                    line.setLatLngs(ll);

                    if (oldKey && oldKey !== restoreKey) {
                        const set = this.state.pipeEndpointIndex.get(oldKey);
                        if (set) {
                            set.delete(line);
                            if (set.size === 0) this.state.pipeEndpointIndex.delete(oldKey);
                        }
                        let next = this.state.pipeEndpointIndex.get(restoreKey);
                        if (!next) {
                            next = new Set();
                            this.state.pipeEndpointIndex.set(restoreKey, next);
                        }
                        next.add(line);
                        if (line._endpointKeys) line._endpointKeys[link.endpoint] = restoreKey;
                    }
                }
            }

            if (layer._backupLatLngs && typeof layer.setLatLngs === 'function') {
                layer.setLatLngs(layer._backupLatLngs);
            }

            // Ensure polygon-specific cleanup after restoring coords
            if (type === "srpolygon") {
                try { this._detachPolygonEditGuards(layer); } catch (e) {}
                if (layer._backupLatLngs) delete layer._backupLatLngs;
                if (layer._isEditing) delete layer._isEditing;
            }

            if (type === "marker") {
                this._clearMarkerEditState(layer);
            } else {
                this._clearShapeEditState(layer);
            }
        },

        async _handleDelete(button) {
            const type = button.dataset.type;
            const id = button.dataset.id;
            const layer = this._resolveLayer(type, id);

            if (!layer) return;

            const message = `Apakah Anda yakin ingin menghapus ${type} ${id === "new" ? "baru" : id}?`;
            if (!confirm(message)) {
                layer.closePopup();
                return;
            }

            try {
                if (id === "new") {
                    this._removeLayerByType(type, id, layer);
                } else if (type === "marker") {
                    await this.deleteMarker(id);
                    this._cleanupLayerAfterDelete(type, id, layer);
                    this.showToast("Marker berhasil dihapus", "success");
                    if (this.layers.markerGroup?.refreshClusters) this.layers.markerGroup.refreshClusters();
                } else if (type === "srpolygon") {
                    await this.deletePolygon(id);
                    this._cleanupLayerAfterDelete(type, id, layer);
                    this.showToast("Polygon berhasil dihapus", "success");
                } else if (type === "pipe") {
                    await this.deletePipa(id);
                    this._cleanupLayerAfterDelete(type, id, layer);
                    this.showToast("Pipa berhasil dihapus", "success");
                }

                this._showBootstrapToast("deleteToast");
            } catch (err) {
                console.error(`Delete ${type} error:`, err);
                this._showError(`Gagal menghapus ${type}`, err);
            }
        },

        // Helper baru untuk menyatukan behavior pembersihan setelah hapus
        _cleanupLayerAfterDelete(type, id, layer) {
            if (this.layers.map) this.layers.map.closePopup();
            if (typeof layer.closePopup === 'function') layer.closePopup();
            if (typeof layer.unbindPopup === 'function') layer.unbindPopup();
            
            this._removeLayerByType(type, id, layer);
            this._removeLayerIndex(type, id);
            
            if (this.layers.map?.hasLayer?.(layer)) this.layers.map.removeLayer(layer);
            if (typeof layer.remove === 'function') layer.remove();
        }

    };

    global.MapAdminEditShared = {
        apply(target) {
            Object.assign(target, methods);
            return target;
        },

        // Cleanup method to clear any pending timeouts
        cleanup(target) {
            if (target._reloadPipesTimeout) {
                clearTimeout(target._reloadPipesTimeout);
                target._reloadPipesTimeout = null;
            }
            if (target._reloadMarkersTimeout) {
                clearTimeout(target._reloadMarkersTimeout);
                target._reloadMarkersTimeout = null;
            }
            if (target._reloadPolygonsTimeout) {
                clearTimeout(target._reloadPolygonsTimeout);
                target._reloadPolygonsTimeout = null;
            }
        }
    };
})(window);
