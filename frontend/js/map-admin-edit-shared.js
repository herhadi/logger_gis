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
            if (!layer) return;

            if (type === "srpolygon") {
                if (id === "new") this.layers.polygonGroupNew.removeLayer(layer);
                else if (this.layers.polygonGroup?.hasLayer?.(layer)) this.layers.polygonGroup.removeLayer(layer);
                else if (this.layers.map?.hasLayer?.(layer)) this.layers.map.removeLayer(layer);
                return;
            }

            if (type === "pipe") {
                if (id === "new") this.layers.pipeGroupNew.removeLayer(layer);
                else this.layers.pipeGroup.removeLayer(layer);
                return;
            }

            if (type === "marker") {
                if (id === "new") this.state.markerGroupNew.removeLayer(layer);
                else this.layers.markerGroup.removeLayer(layer);
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

                polygon._polygonId = data.ogr_fid;
                polygon._nosamw = nosamwNew;
                polygon.lsval = payload.luas;
                this._upsertLayerIndex("srpolygon", data.ogr_fid, polygon);

                this.showToast("Polygon berhasil disimpan!", "success");
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
            if (this.state.markerLayerIndex?.has(key)) {
                return this.state.markerLayerIndex.get(key);
            }

            let found = null;

            this.layers.markerGroup.eachLayer(layer => {
                if (!found && layer instanceof L.Marker && layer._markerId == id) found = layer;
            });

            if (!found) {
                this.state.markerGroupNew.eachLayer(layer => {
                    if (!found && layer instanceof L.Marker && layer._markerId == id) found = layer;
                });
            }

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
                    marker._markerId = saved.ogr_fid;

                    this.layers.markerGroupNew.removeLayer(marker);
                    this.layers.markerGroup.addLayer(marker);
                    this._upsertLayerIndex("marker", saved.ogr_fid, marker);
                } else {
                    await this.updateMarker(id, marker, payload, { reload: false });
                }

                marker.featureData = { ...marker.featureData, ...payload };
                this._clearMarkerEditState(marker);
                marker.closePopup();

                const needsPipeReload = await this._syncLinkedPipes(marker);

                if (!needsPipeReload && id && id !== "new" && this.layers.map) {
                    this._debounceReloadMarkers();
                } else if (id && id !== "new" && this.layers.map) {
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
                    polygon._polygonId = savedPolygon.ogr_fid;
                    this.layers.polygonGroupNew.removeLayer(polygon);
                    this.layers.polygonGroup.addLayer(polygon);
                    this._upsertLayerIndex("srpolygon", savedPolygon.ogr_fid, polygon);
                    polygon.setStyle({ color: "blue", dashArray: null, fillOpacity: 0.4 });
                } else {
                    await this.updatePolygon(id, polygon, { coords, nosamw, nosambckup: polygon._backup || '', luas });
                    polygon.setStyle({ color: "blue", dashArray: null, fillOpacity: 0.4 });
                }

                this._clearShapeEditState(polygon);
                this._setPolygonEditingVisual(polygon, false);
                polygon.closePopup();
                this._showBootstrapToast("saveToast");
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
            const layer = this._resolveLayer(type, id);

            if (!layer) return;

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
                layer._backupLatLngs = this._cloneLatLngs(layer.getLatLngs());
            }

            if (!(layer instanceof L.Marker) && layer.pm) layer.pm.enable();

            if (type === "marker") {
                layer.setIcon(this._getMarkerEditIcon());
                layer.closePopup();
            } else if (type === "srpolygon") {
                this._setPolygonEditingVisual(layer, true);
                layer.closePopup();
            }
        },

        _handleCancel(button) {
            const type = button.dataset.type;
            const id = button.dataset.id;
            const layer = this._resolveLayer(type, id);

            if (!layer) return;

            if (id === "new") {
                this._removeLayerByType(type, id, layer);
                return;
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

            if (type === "srpolygon") this._setPolygonEditingVisual(layer, false);

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
                } else if (type === "srpolygon") {
                    await this.deletePolygon(id);
                    this._removeLayerByType(type, id, layer);
                } else if (type === "pipe") {
                    await this.deletePipa(id);
                    this._removeLayerByType(type, id, layer);
                    this.showToast("Pipa berhasil dihapus", "success");
                } else if (type === "marker") {
                    await this.deleteMarker(id);
                    this._removeLayerByType(type, id, layer);
                    this.showToast("Marker berhasil dihapus", "success");
                }

                if (type === "srpolygon" && id !== "new") {
                    this.showToast("Polygon berhasil dihapus!", "success");
                }

                this._showBootstrapToast("deleteToast");
            } catch (err) {
                console.error(`Delete ${type} error:`, err);
                this._showError(`Gagal menghapus ${type}`, err);
            }
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
        }
    };
})(window);
