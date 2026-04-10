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

        async updateMarker(id, marker, payload) {
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

                this.showToast("Marker berhasil diperbarui", "success");
                if (this.layers.map) {
                    const b = this.layers.map.getBounds();
                    const bbox1 = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(",");
                    this.loadMarkers(bbox1);
                }
            } catch (err) {
                this.showToast("Gagal update marker: " + err.message, "danger");
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

                this.showToast("Pipa berhasil diperbarui", "success");
                layer.featureData = { ...(layer.featureData || {}), ...payload };
                this.loadPipa();
            } catch (err) {
                this.showToast("Gagal update pipa: " + err.message, "danger");
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
        }
    };

    global.MapAdminEditShared = {
        apply(target) {
            Object.assign(target, methods);
            return target;
        }
    };
})(window);
