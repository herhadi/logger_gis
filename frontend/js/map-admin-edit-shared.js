(function attachMapAdminEditShared(global) {
    const methods = {
        _renderMarkerPopupContent(d) {
            const tipeOptions = Object.keys(this.state.colorMap).map(t =>
                `<option value="${t}" ${t === d.tipe ? "selected" : ""}>${t.toUpperCase()}</option>`
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
                        <input type="number" class="form-control form-control-sm" name="editElevation" value="${d.elevation || ''}">
                    </div>
                    <div class="mb-2">
                        <label class="form-label small mb-1">Lokasi</label>
                        <input type="text" class="form-control form-control-sm" name="editLokasi" value="${d.lokasi || ''}">
                    </div>
                    <div class="mb-2">
                        <label class="form-label small mb-1">Keterangan</label>
                        <input type="text" class="form-control form-control-sm" name="editKeterangan" value="${d.keterangan || ''}">
                    </div>
                    <div class="d-flex gap-1 mt-3">
                        <button class="btn btn-sm btn-success flex-fill btn-save" data-type="marker" data-id="${d.id}">💾 Simpan</button>
                        <button class="btn btn-sm btn-primary flex-fill btn-edit" data-type="marker" data-id="${d.id}">✏️ Edit</button>
                        <button class="btn btn-sm btn-secondary flex-fill btn-cancel" data-type="marker" data-id="${d.id}">❌ Batal</button>
                        <button class="btn btn-sm btn-danger flex-fill btn-hapus" data-type="marker" data-id="${d.id}">🗑️ Hapus</button>
                    </div>
                </div>`;
        },

        _renderPipaPopupContent(d) {
            const diameterOptions = (this.state.diameterList || []).map(opt => {
                const norm = this._normalizeDiameterValue(opt);
                const selected = this._normalizeDiameterValue(d.diameter) === norm ? "selected" : "";
                return `<option value="${norm}" ${selected}>${norm}</option>`;
            }).join("");

            const jenisOptions = (this.state.jenisList || []).map(opt => {
                const selected = (d.jenis || '') === opt ? "selected" : "";
                return `<option value="${opt}" ${selected}>${opt}</option>`;
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
                        <button class="btn btn-sm btn-success flex-fill btn-save" data-type="pipe" data-id="${d.id}">💾 Simpan</button>
                        <button class="btn btn-sm btn-primary flex-fill btn-edit" data-type="pipe" data-id="${d.id}">✏️ Edit</button>
                        <button class="btn btn-sm btn-secondary flex-fill btn-cancel" data-type="pipe" data-id="${d.id}">❌ Batal</button>
                        <button class="btn btn-sm btn-danger flex-fill btn-hapus" data-type="pipe" data-id="${d.id}">🗑️ Hapus</button>
                    </div>
                </div>`;
        },

        _renderPolygonPopupContent(d) {
            return `
                <div class="p-2" style="min-width:250px">
                    <div class="fw-bold mb-2 text-center">Edit Polygon</div>
                    <div class="mb-2">
                        <label class="form-label small mb-1">No SAMW</label>
                        <input type="text" class="form-control form-control-sm" name="editNosamw" value="${d.nosamw || ''}">
                    </div>
                    <div class="mb-2">
                        <label class="form-label small mb-1">Luas (m²)</label>
                        <input type="text" class="form-control form-control-sm" name="editLuas" value="${d.luas_hitung || 0}" readonly>
                    </div>
                    <div class="d-flex gap-1 mt-3">
                        <button class="btn btn-sm btn-success flex-fill btn-save" data-type="srpolygon" data-id="${d.id}">💾 Simpan</button>
                        <button class="btn btn-sm btn-primary flex-fill btn-edit" data-type="srpolygon" data-id="${d.id}">✏️ Edit</button>
                        <button class="btn btn-sm btn-danger flex-fill btn-hapus" data-type="srpolygon" data-id="${d.id}">🗑️ Hapus</button>
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
                this.showToast(err.message || "Terjadi kesalahan saat menyimpan marker", "danger");
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
                this.showToast("Marker berhasil diperbarui", "success");

                if (options.reload !== false && this.layers.map) {
                    const b = this.layers.map.getBounds();
                    const bbox1 = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(",");
                    this.loadMarkers(bbox1);
                }

                return data;
            } catch (err) {
                this.showToast("Gagal update marker: " + err.message, "danger");
                throw err;
            }
        },

        async deleteMarker(id) {
            if (!confirm("Yakin hapus marker ini?")) return;

            try {
                const marker = this._findMarkerById(id);
                const tipe = (marker?.featureData?.tipe || marker?._originalTipe || '').toString();

                if (!tipe) {
                    throw new Error("Tipe marker tidak ditemukan");
                }

                const res = await fetch(`/api/marker/delete/${encodeURIComponent(tipe)}/${id}`, { method: "DELETE" });
                if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);

                this.layers.markerGroup.eachLayer(layer => {
                    if (layer._markerId == id) this.layers.markerGroup.removeLayer(layer);
                });

                this.state.markerGroupNew.eachLayer(layer => {
                    if (layer._markerId == id) this.state.markerGroupNew.removeLayer(layer);
                });

                this.showToast("Marker berhasil dihapus", "success");
            } catch (err) {
                this.showToast("Gagal menghapus marker: " + err.message, "danger");
            }
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
                this.showToast("Pipa berhasil disimpan", "success");
                if (options.reload !== false) this.loadPipa();
                return data;
            } catch (err) {
                this.showToast(err.message || "Terjadi kesalahan saat menyimpan pipa", "danger");
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
                this.showToast("Pipa berhasil diperbarui", "success");
                if (options.reload !== false) this.loadPipa();
                return data;
            } catch (err) {
                this.showToast("Gagal update pipa: " + err.message, "danger");
                throw err;
            }
        },

        async deletePipa(id) {
            try {
                const res = await fetch(`/api/pipa/delete/${id}`, { method: "DELETE" });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || data.message || `HTTP error! Status: ${res.status}`);

                this.showToast("Pipa berhasil dihapus", "success");
            } catch (err) {
                this.showToast("Gagal menghapus pipa: " + err.message, "danger");
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

        _findMarkerById(id) {
            let found = null;

            this.layers.markerGroup.eachLayer(layer => {
                if (layer instanceof L.Marker && layer._markerId == id) found = layer;
            });

            if (!found) {
                this.state.markerGroupNew.eachLayer(layer => {
                    if (layer instanceof L.Marker && layer._markerId == id) found = layer;
                });
            }

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
                } else {
                    await this.updateMarker(id, marker, payload, { reload: false });
                }

                marker.featureData = { ...marker.featureData, ...payload };

                this._ensureMarkerDragging(marker);
                if (marker.dragging) marker.dragging.disable();
                this._setMarkerEditingVisual(marker, false);
                marker.closePopup();

                let needsPipeReload = false;
                if (marker._linkedPipes && marker._linkedPipes.length) {
                    const uniq = new Map();
                    for (const link of marker._linkedPipes) {
                        if (link?.line?._pipeId) uniq.set(String(link.line._pipeId), link.line);
                    }

                    await Promise.all(Array.from(uniq.values()).map(line =>
                        this.updatePipa(line._pipeId, line, {
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
                        }, { reload: false })
                    ));

                    needsPipeReload = uniq.size > 0;
                }

                if (needsPipeReload) {
                    this.loadPipa();
                }

                if (id && id !== "new" && this.layers.map) {
                    const b = this.layers.map.getBounds();
                    const bbox1 = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(",");
                    this.loadMarkers(bbox1);
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
                    polygon.setStyle({ color: "blue", dashArray: null, fillOpacity: 0.4 });
                } else {
                    await this.updatePolygon(id, polygon, { coords, nosamw, nosambckup: polygon._backup || '', luas });
                    polygon.setStyle({ color: "blue", dashArray: null, fillOpacity: 0.4 });
                }

                polygon.pm.disable();
                this._setPolygonEditingVisual(polygon, false);
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

            if (!id || id === "new") {
                const startLatLng = line.getLatLngs()[0];
                if (!this._hasMarkerAt(startLatLng)) {
                    this.showToast("Pipa harus dimulai dari point (marker)", "danger");
                    return;
                }
            }

            const popupEl = line.getPopup().getElement();
            let diameterInput = popupEl.querySelector('[name="editDiameter"]')?.value ||
                popupEl.querySelector('#newPipeDiameter')?.value || '';
            let jenisInput = popupEl.querySelector('[name="editJenis"]')?.value ||
                popupEl.querySelector('#newPipeJenis')?.value || '';

            const diameterToSave = this._normalizeDiameterValue(diameterInput);

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
                layer = this._findMarkerById(id);
            }

            if (!layer) return;

            if (layer instanceof L.Marker) {
                layer._backupLatLng = layer.getLatLng();
                this._ensureMarkerDragging(layer);
                if (layer.dragging) layer.dragging.enable();
                this._setMarkerEditingVisual(layer, true);

                if (!layer._pipeFollowBound) {
                    layer._pipeFollowBound = true;

                    layer.on('dragstart', () => {
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
                    });

                    layer.on('drag', () => {
                        layer._pendingDragLatLng = layer.getLatLng();
                        if (layer._dragFrameScheduled) return;

                        layer._dragFrameScheduled = true;
                        requestAnimationFrame(() => {
                            layer._dragFrameScheduled = false;

                            const newLatLng = layer._pendingDragLatLng || layer.getLatLng();
                            const moved = layer._linkedPipes || [];
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
                    });
                }
            } else if (typeof layer.getLatLngs === 'function') {
                layer._backupLatLngs = this._cloneLatLngs(layer.getLatLngs());
            }
            if (!(layer instanceof L.Marker) && layer.pm) layer.pm.enable();

            if (type === "marker") {
                const editIcon = L.divIcon({
                    className: "custom-marker-edit",
                    html: `<div style="width:12px;height:12px;border-radius:50%;background:orange;border:2px solid #fff;box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`,
                    iconSize: [12, 12]
                });
                layer.setIcon(editIcon);
                layer.closePopup();
            } else if (type === "srpolygon") {
                this._setPolygonEditingVisual(layer, true);
                layer.closePopup();
            }
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
                layer = this._findMarkerById(id);
            }

            if (!layer) return;

            if (id === "new") {
                if (type === "srpolygon") this.layers.polygonGroupNew.removeLayer(layer);
                else if (type === "pipe") this.layers.pipeGroupNew.removeLayer(layer);
                else if (type === "marker") this.state.markerGroupNew.removeLayer(layer);
            } else {
                if (layer.pm) layer.pm.disable();
                this._ensureMarkerDragging(layer);
                if (layer.dragging) layer.dragging.disable();
                if (type === "marker") this._setMarkerEditingVisual(layer, false);
                layer.closePopup();

                if (type === "marker" && layer._originalTipe) {
                    const normalIcon = L.divIcon({
                        className: "custom-marker",
                        html: `<div style="width:10px;height:10px;border-radius:50%;background:${this.state.colorMap[layer._originalTipe] || "gray"};border:1px solid #fff;"></div>`,
                        iconSize: [10, 10]
                    });
                    layer.setIcon(normalIcon);
                }

                if (layer._backupLatLng) {
                    layer.setLatLng(layer._backupLatLng);
                    delete layer._backupLatLng;
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
                    layer._linkedPipes = [];
                }
                if (layer._backupLatLngs && typeof layer.setLatLngs === 'function') {
                    layer.setLatLngs(layer._backupLatLngs);
                    delete layer._backupLatLngs;
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
                layer = this._findMarkerById(id);
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
        }
    };

    global.MapAdminEditShared = {
        apply(target) {
            Object.assign(target, methods);
            return target;
        }
    };
})(window);
