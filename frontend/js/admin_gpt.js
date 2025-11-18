/* admin_refactored_medium.js
   Medium automated refactor (utilities extracted + LayerManager added)
   - Behavior of original file preserved
   - Review and request deeper refactors as needed
*/

/* -- extracted: debounce -- */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function initAdminMap() {
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 23,
        maxNativeZoom: 19
    });

    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 23,
        maxNativeZoom: 19,
        noWrap: true
    });

    const googleSat = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 21,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Satellite'
    });

    const googleHybrid = L.tileLayer('http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        maxZoom: 23,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Hybrid'
    });

    map = L.map('map', {
        center: [-6.9383, 109.7178],
        zoom: 13,
        layers: [satelliteLayer],
        maxZoom: 24
    });

    // Add layers
    map.addLayer(editableLayers);
    map.addLayer(markerGroup);
    map.addLayer(markerGroupNew);
    map.addLayer(pipeGroup);
    map.addLayer(pipeGroupNew);
    map.addLayer(polygonGroup);
    map.addLayer(polygonGroupNew); // Tambahkan layer untuk polygon baru  
    map.addLayer(geometryLayer);
    map.addLayer(selectionLayer);

    // Initialize Geoman controls
    map.pm.addControls({
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
        drawMarker: {
            cursorMarker: false
        },
    });

    // === Custom Control: Tombol Select Area ===
    const drawControl = new L.Control.Draw({
        position: 'bottomleft',
        draw: {
            polygon: {
                allowIntersection: false, // opsional: larang polygon self-crossing
                showArea: true,
                shapeOptions: { color: '#3388ff', fillColor: 'orange', fillOpacity: 0.3 }
            },
            // Nonaktifkan tool lain kalau hanya mau polygon
            rectangle: false,
            polyline: false,
            circle: false,
            marker: false,
            circlemarker: false
        },
        edit: {
            featureGroup: selectionLayer,  // 🔹 polygon bisa diedit & dihapus
            remove: true
        }
    });
    // 🔹 Ubah teks tombol sebelum menambahkan ke map
    L.drawLocal.draw.toolbar.buttons.polygon = 'Gambar Area Seleksi';   // ← di sini
    // 🔹 Ganti teks tooltip saat mulai menggambar polygon
    L.drawLocal.draw.handlers.polygon.tooltip.start = 'Klik peta untuk mulai menggambar area';
    L.drawLocal.draw.handlers.polygon.tooltip.cont = 'Klik untuk menambah titik';
    L.drawLocal.draw.handlers.polygon.tooltip.end = 'Klik titik awal untuk menyelesaikan';

    // Ganti teks tooltip mode EDIT
    L.drawLocal.edit.handlers.edit.tooltip.text =
        'Seret titik-titik untuk mengubah bentuk area';
    L.drawLocal.edit.handlers.edit.tooltip.subtext =
        'Klik "Selesai" atau "Batal" untuk membatalkan';

    // Jika ingin mengubah tooltip DELETE
    L.drawLocal.edit.handlers.remove.tooltip.text =
        'Klik pada shape untuk menghapusnya';

    // Ganti teks pada toolbar Edit
    L.drawLocal.edit.toolbar.actions.save.text = 'Selesai';
    L.drawLocal.edit.toolbar.actions.cancel.text = 'Batal';
    L.drawLocal.edit.toolbar.actions.clearAll.text = 'Hapus Semua';

    // Opsional: tooltip/label saat hover tombol edit
    L.drawLocal.edit.toolbar.buttons.edit = 'Ubah Polygon yang Ada';

    L.drawLocal.draw.toolbar.finish.text = 'Selesai';
    L.drawLocal.draw.toolbar.undo.text = 'Undo';
    // L.drawLocal.draw.toolbar.cancel.text = 'Batal';

    map.addControl(drawControl);


    map.on(L.Draw.Event.CREATED, e => {
        // Ada polygon baru → disable interaksi Geoman
        geomanDisabledByDraw = true;

        const layer = e.layer;
        selectionLayer.addLayer(layer);   // Pastikan layer benar-benar masuk ke peta dulu

        // Hitung ulang hasil
        const resultHtml = hitungGeometryDalamArea(layer.toGeoJSON());
        const latlngs = layer.getLatLngs()[0];
        const area = L.GeometryUtil.geodesicArea(latlngs);
        const ha = (area / 10000).toFixed(2);

        // Titik anchor popup (pakai centroid atau vertex pertama)
        const anchor = latlngs[0];  // atau turf.centroid

        // Bind popup awal
        layer.bindPopup(`<b>Luas:</b> ${ha} ha<br>${resultHtml}`).openPopup();

        // 🔹 Delay 0 agar DOM/Layer sudah siap sebelum popup dibuka
        setTimeout(() => {
            layer.openPopup(anchor);
        }, 0);
    });

    // Saat selesai edit
    map.on('draw:edited', e => {
        e.layers.eachLayer(layer => {
            const resultHtml = hitungGeometryDalamArea(layer.toGeoJSON());
            const latlngs = layer.getLatLngs()[0];
            const area = L.GeometryUtil.geodesicArea(latlngs);
            const ha = (area / 10000).toFixed(2);

            // Re-bind dan pakai titik pertama sebagai anchor popup
            const firstLatLng = latlngs[0];
            layer.bindPopup(`<b>Luas:</b> ${ha} ha<br>${resultHtml}`)
                .openPopup(firstLatLng);
        });
    });

    map.on('draw:deleted', () => {
        geomanDisabledByDraw = false;
    });

    // === END Custom Control ===


    //     const drawToolbar = document.querySelector('.leaflet-draw'); // Leaflet.Draw toolbar

    //     if (zoomContainer && pmToolbar) {
    //         zoomContainer.insertAdjacentElement('afterend', pmToolbar);
    //     }

    //     if (pmToolbar && drawToolbar) {
    //         pmToolbar.insertAdjacentElement('afterend', drawToolbar);
    //     }
    // }, 100);

    // Layer Control
    const baseLayers = {
        "OpenStreetMap": osm,
        "Citra Satelit": satelliteLayer,
        "Google Hybrid": googleHybrid,
        "Google Satelit": googleSat
    };

    const overlayLayers = {
        "Tampilkan Marker": markerGroup,
        "Tampilkan Pipa": pipeGroup,
        "Pipa Baru (Belum Disimpan)": pipeGroupNew,
        "Tampilkan Polygon": polygonGroup,
        "Polygon Baru (Belum Disimpan)": polygonGroupNew // Tambahkan opsi untuk polygon baru   
    };

    L.control.layers(baseLayers, overlayLayers, { position: 'topright' }).addTo(map);

    const apiKey = "dc9aa1e045f7427f9da781232e8d0544";

    // Geoapify custom geocoder
    const geoapifyGeocoder = {
        geocode: function (query, cb, context) {
            const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&limit=10&apiKey=${apiKey}`;

            const fetchPromise = fetch(url)
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
                    return results;
                })
                .catch(err => {
                    console.error("Geoapify error:", err);
                    return [];
                });

            if (typeof cb === "function") {
                fetchPromise.then(results => cb.call(context || this, results));
                return;
            }

            return fetchPromise;
        },

        suggest: function (query, cb, context) {
            return this.geocode(query, cb, context);
        }
    };

    // Inisialisasi geocoder control
    const geocoderControl = L.Control.geocoder({
        geocoder: geoapifyGeocoder,
        defaultMarkGeocode: false,
        position: 'topleft',
        placeholder: 'Cari lokasi...',
        errorMessage: 'Lokasi tidak ditemukan',
        showResultIcons: true,
        collapsed: true
    });

    // Handle event markgeocode
    geocoderControl.on('markgeocode', function (e) {
        const center = e.geocode.center;
        const bbox = e.geocode.bbox;

        // Hapus marker lama
        map.eachLayer(layer => {
            if (layer instanceof L.Marker) {
                map.removeLayer(layer);
            }
        });

        // Set view dan tambahkan marker
        if (bbox) {
            map.fitBounds(bbox, { padding: [50, 50] });
        } else {
            map.setView(center, 15);
        }

        L.marker(center)
            .addTo(map)
            .bindPopup(`<b>${e.geocode.name}</b>`)
            .openPopup();
    });

    geocoderControl.addTo(map);

    // Setup Geoman events
    setupGeomanEvents();

    // Buat pane khusus untuk polygon & pipa
    map.createPane('polygonPane');
    map.getPane('polygonPane').style.zIndex = 400;

    map.createPane('pipaPane');
    map.getPane('pipaPane').style.zIndex = 450;

    // Load data dengan debounce
    loadLegend();
    // loadPolygon();
    // loadPipa();
    // loadMarkers();
    // loadAllLayers();

    // 🔹 trigger pertama kali setelah map siap
    map.whenReady(() => {
        loadAllLayers();
    });

    // Gunakan debounce untuk moveend event
    map.on("moveend", debounce(loadAllLayers, 300));
}

// Hitung jumlah geometry di dalam area polygon
function hitungGeometryDalamArea(selectionPolygon) {
    let totalPoint = 0;
    let totalLine = 0;
    let totalPolygon = 0;

    geometryLayer.eachLayer(layer => {
        const feature = layer.toGeoJSON();

        switch (feature.geometry.type) {
            case 'Point':
                if (turf.booleanPointInPolygon(feature, selectionPolygon)) totalPoint++;
                break;
            case 'LineString':
                if (turf.booleanWithin(feature, selectionPolygon) || turf.booleanIntersects(feature, selectionPolygon)) totalLine++;
                break;
            case 'Polygon':
                if (turf.booleanWithin(feature, selectionPolygon)) totalPolygon++;
                break;
        }
    });

    // alert(`Geometry di dalam area:\nPoint: ${totalPoint}\nLine: ${totalLine}\nPolygon: ${totalPolygon}`);

    const resultText = `
        <b>Point:</b> ${totalPoint}<br>
        <b>Line:</b> ${totalLine}<br>
        <b>Polygon:</b> ${totalPolygon}
    `;


    return resultText;
}


// Wrapper untuk load semua layer dengan 1x bbox
// Coba format bbox yang berbeda
async function loadAllLayers() {
    if (!map) return;

    const bounds = map.getBounds();
    // Format 1: minLng,minLat,maxLng,maxLat
    const bbox1 = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth()
    ].join(",");

    // Format 2: minLat,minLng,maxLat,maxLng
    const bbox2 = [
        bounds.getSouth(),
        bounds.getWest(),
        bounds.getNorth(),
        bounds.getEast()
    ].join(",");

    // console.log("🔍 Bbox format 1:", bbox1);
    // console.log("🔍 Bbox format 2:", bbox2);

    // Coba kedua format
    await Promise.all([
        loadPipa(bbox2),
        loadPolygon(bbox2),
        loadMarkers(bbox1)  // markers pakai format 1 dan 2 semua bisa karena backend mendukungnya
    ]);
}

// 🔹 fungsi utama untuk ambil semua layer sekali jalan
// async function loadAllLayers() {
//     if (!map) return;

//     const bounds = map.getBounds();
//     const bbox = [
//         bounds.getWest(),
//         bounds.getSouth(),
//         bounds.getEast(),
//         bounds.getNorth()
//     ].map(coord => coord.toFixed(6)); // biar rapi 6 desimal

//     console.log("📦 BBox:", bbox.join(","));

//     // panggil loader satu-satu dengan bbox yang sama
//     await Promise.all([
//         loadPipa(bbox),
//         loadPolygon(bbox),
//         loadMarkers(bbox)
//     ]);
// }



// 🔹 trigger setiap selesai pan/zoom (pakai debounce biar ga spam)
// map.on("moveend", debounce(loadAllLayers, 400));



function setupGeomanEvents() {
    let markerDrawHandler = null;

    map.on('pm:drawstart', function (e) {
        if (e.layerType === 'Marker') {
            markerDrawHandler = e.handler;
        }
    });

    map.on("pm:create", (e) => {
        // ===== HANDLER UNTUK PIPA BARU =====
        if (e.layer instanceof L.Polyline && !(e.layer instanceof L.Polygon)) {
            const newLine = e.layer;
            newLine._pipeId = "new";
            newLine.setStyle({ color: "red", dashArray: "5,5" });
            pipeGroupNew.addLayer(newLine);

            if (newLine.pm) newLine.pm.disable();

            // Buat dropdown diameter otomatis dari diameterList
            let diameterOptions = diameterList.map(d => `<option value="${d}">${d}</option>`).join("");
            let jenisOptions = jenisList.map(j => `<option value="${j}">${j}</option>`).join("");

            newLine.bindPopup(`
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
        }


        if (!(e.layer instanceof L.Polygon)) return;
        // HANDLER UNTUK POLYGON BARU
        const newPolygon = e.layer;
        newPolygon._polygonId = "new";
        newPolygon.setStyle({ color: "orange", dashArray: "5,5", fillOpacity: 0.3 });
        polygonGroupNew.addLayer(newPolygon)

        if (newPolygon.pm) newPolygon.pm.disable();

        function calculatePolygonArea(latLngs) {
            if (!latLngs || latLngs.length < 3) return 0;
            const R = 6371000;
            let area = 0;
            const points = latLngs.map(p => ({ lat: p.lat * Math.PI / 180, lng: p.lng * Math.PI / 180 }));
            for (let i = 0; i < points.length; i++) {
                const j = (i + 1) % points.length;
                area += points[i].lng * points[j].lat - points[j].lng * points[i].lat;
            }
            return Math.round(Math.abs(area) * R * R / 2);
        }

        const initialArea = calculatePolygonArea(newPolygon.getLatLngs()[0]);

        newPolygon.bindPopup(`
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
    });
    window.batalBuatMarker = function () {
        markerGroup.eachLayer(layer => {
            if (layer instanceof L.Marker && !layer._id) {
                markerGroup.removeLayer(layer);
            }
        });
        map.closePopup();
    };
}

async function loadMarkers(bbox) {
    if (!map) return;

    try {
        // reset dulu supaya tidak numpuk
        geometryLayer.clearLayers();
        markerGroup.clearLayers();

        const res = await fetch(`/api/marker?bbox=${bbox}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        for (const m of data) {
            const { lat, lng } = getLatLng(m);
            if (lat && lng) {
                const markerIcon = L.divIcon({
                    className: "custom-marker",
                    html: `<div style="
                        width:10px;
                        height:10px;
                        border-radius:50%;
                        background:${colorMap[m.tipe] || "gray"};
                        border:1px solid #fff;
                    "></div>`,
                    iconSize: [10, 10],
                });

                const marker = L.marker([lat, lng], { icon: markerIcon })
                    .bindPopup(`
                        <b>${m.tipe?.toUpperCase() || "-"}</b><br>
                        ID: ${m.id || "-"}<br>
                        Elev: ${m.elevation || "-"}
                    `);

                markerGroup.addLayer(marker);
                geometryLayer.addLayer(marker);
            } else {
                console.warn("❌ Marker invalid:", m);
            }
        }

        console.log(`✅ Point loaded: ${data.length}`);
    } catch (err) {
        console.error("⚠️ Gagal load markers:", err);
    }
}

/* -- extracted: getLatLng -- */
function getLatLng(m) {
    if (m.coords && m.coords.length === 2) {
        return { lat: parseFloat(m.coords[0]), lng: parseFloat(m.coords[1]) };
    }
    if (m.y && m.x) {
        return { lat: parseFloat(m.y), lng: parseFloat(m.x) };
    }
    return { lat: null, lng: null };
}

// CRUD Pipa
async function loadPipa(bbox) {
    if (!map) return;

    try {
        const res = await fetch(`/api/pipa?bbox=${bbox}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        // geometryLayer.clearLayers();
        pipeGroup.clearLayers();

        data.forEach(pipe => {
            if (!pipe.line || !Array.isArray(pipe.line)) {
                console.warn("❌ Data pipa invalid:", pipe);
                return;
            }

            // Pastikan koordinat dalam format [lat, lng] dan valid
            const validCoords = pipe.line.filter(pt => {
                if (pt.length === 2) {
                    const [a, b] = pt;
                    return (a >= -90 && a <= 90) && (b >= -180 && b <= 180);
                }
                return false;
            });

            if (validCoords.length < 2) {
                console.warn("❌ Koordinat pipa tidak valid:", pipe);
                return;
            }

            const color = diamtrColors[pipe.diameter] || "red";
            const line = L.polyline(validCoords, { color, weight: 3, pane: "pipaPane" })
                .addTo(pipeGroup);

            geometryLayer.addLayer(line);

            // simpan id & warna default
            line._pipeId = pipe.id;
            line._defaultColor = color;
            pipaLayers[pipe.id] = line;

            // Dropdown diameter
            const diameterOptions = diameterList.map(d => {
                const selected = (d === pipe.diameter) ? "selected" : "";
                return `<option value="${d}" ${selected}>DN${d}</option>`;
            }).join("");

            // Dropdown jenis
            const jenisOptions = jenisList.map(j => {
                const selected = (j === pipe.jenis) ? "selected" : "";
                return `<option value="${j}" ${selected}>${j}</option>`;
            }).join("");

            line.bindPopup(`
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
                        <button class="btn btn-sm btn-success flex-fill btn-save" data-type="pipe" data-id="${pipe.id}">💾 Simpan</button>
                        <button class="btn btn-sm btn-primary flex-fill btn-edit" data-type="pipe" data-id="${pipe.id}">✏️ Edit</button>
                        <button class="btn btn-sm btn-secondary flex-fill btn-cancel" data-type="pipe" data-id="${line._pipeId}">❌ Batal</button>
                        <button class="btn btn-sm btn-danger flex-fill btn-hapus" data-type="pipe" data-id="${pipe.id}">🗑️ Hapus</button>
                    </div>
                </div>
            `);
        });

        console.log(`✅ Line loaded: ${data.length}`);
    } catch (err) {
        console.error("⚠️ Gagal load pipa:", err);
    }
}

/* -- extracted: calculatePolygonArea -- */
function calculatePolygonArea(latLngs) {
    if (!latLngs || latLngs.length < 3) return 0;
    const R = 6371000;
    let area = 0;
    const points = latLngs.map(p => ({ lat: p.lat * Math.PI / 180, lng: p.lng * Math.PI / 180 }));
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].lng * points[j].lat - points[j].lng * points[i].lat;
    }
    return Math.round(Math.abs(area) * R * R / 2);
}

async function loadMarkers(bbox) {
    if (!map) return;

    try {
        // reset dulu supaya tidak numpuk
        geometryLayer.clearLayers();
        markerGroup.clearLayers();

        const res = await fetch(`/api/marker?bbox=${bbox}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        for (const m of data) {
            const { lat, lng } = getLatLng(m);
            if (lat && lng) {
                const markerIcon = L.divIcon({
                    className: "custom-marker",
                    html: `<div style="
                        width:10px;
                        height:10px;
                        border-radius:50%;
                        background:${colorMap[m.tipe] || "gray"};
                        border:1px solid #fff;
                    "></div>`,
                    iconSize: [10, 10],
                });

                const marker = L.marker([lat, lng], { icon: markerIcon })
                    .bindPopup(`
                        <b>${m.tipe?.toUpperCase() || "-"}</b><br>
                        ID: ${m.id || "-"}<br>
                        Elev: ${m.elevation || "-"}
                    `);

                markerGroup.addLayer(marker);
                geometryLayer.addLayer(marker);
            } else {
                console.warn("❌ Marker invalid:", m);
            }
        }

        console.log(`✅ Point loaded: ${data.length}`);
    } catch (err) {
        console.error("⚠️ Gagal load markers:", err);
    }
}

/* -- extracted: showToast -- */
function showToast(message, type = 'info', delay = 3000) {
    // Pastikan message adalah string
    if (typeof message !== 'string') {
        if (message && typeof message.message === 'string') {
            message = message.message;
        } else {
            message = String(message);
        }
    }

    const container = document.getElementById('toastContainer');
    if (!container) {
        console.warn('Toast container tidak ditemukan');
        return;
    }

    const toastEl = document.createElement('div');
    toastEl.className = `toast align-items-center text-bg-${type} border-0`;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');

    toastEl.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;

    container.appendChild(toastEl);

    // Cek apakah Bootstrap tersedia
    if (typeof bootstrap === 'undefined' || typeof bootstrap.Toast === 'undefined') {
        // Fallback tanpa Bootstrap
        console.warn('Bootstrap tidak tersedia, menggunakan fallback toast');
        toastEl.classList.add('show');

        // Hapus toast setelah delay
        setTimeout(() => {
            if (toastEl.parentNode) {
                toastEl.remove();
            }
        }, delay);
        return;
    }

    try {
        const bsToast = new bootstrap.Toast(toastEl, {
            delay: delay,
            autohide: true
        });

        bsToast.show();

        // Handle event ketika toast disembunyikan
        toastEl.addEventListener('hidden.bs.toast', () => {
            if (toastEl.parentNode) {
                toastEl.remove();
            }
        });

    } catch (e) {
        console.error('Error inisialisasi toast:', e);

        // Fallback jika terjadi error
        toastEl.classList.add('show');
        setTimeout(() => {
            if (toastEl.parentNode) {
                toastEl.remove();
            }
        }, delay);
    }
}

/* ====== LayerManager (refactored helper) ======
   This object centralizes layer groups used across the app.
   It is safe to use alongside the original code (which uses the same group names).
*/
const LayerManager = {
    markerGroup: L.layerGroup(),
    markerGroupNew: L.layerGroup(),
    pipeGroup: L.layerGroup(),
    pipeGroupNew: L.layerGroup(),
    polygonGroup: L.layerGroup(),
    polygonGroupNew: L.layerGroup(),
    geometryLayer: L.featureGroup(),
    selectionLayer: L.featureGroup(),
    pipaLayers: {},
    addMarker(marker) { this.markerGroup.addLayer(marker); this.geometryLayer.addLayer(marker); },
    addPipe(pipe) { this.pipeGroup.addLayer(pipe); this.geometryLayer.addLayer(pipe); },
    addPolygon(polygon) { this.polygonGroup.addLayer(polygon); this.geometryLayer.addLayer(polygon); },
    findPolygonById(id) {
        return [...this.polygonGroup.getLayers(), ...this.polygonGroupNew.getLayers()].find(l => l._polygonId === id);
    },
    findPipeById(id) {
        return id === 'new'
            ? this.pipeGroupNew.getLayers().find(l => l._pipeId === 'new')
            : this.pipeGroup.getLayers().find(l => l._pipeId == id);
    }
};

/* -- original file body (unchanged, aside from extracted utilities removed above) -- */

let map;
let drawnPolyline = null;
let editableLayers = new L.FeatureGroup();
const markerMap = {};
const markerGroup = L.layerGroup();
// Layer group khusus untuk marker
const markerLayer = L.layerGroup();
const markerGroupNew = L.layerGroup();
let pipaLayers = {};
// Group untuk pipa
const pipeGroup = L.layerGroup();
const pipeGroupNew = L.layerGroup();
// Group untuk polygon yang sudah disimpan
const polygonGroup = L.layerGroup();
// Group untuk polygon baru/belum disimpan
const polygonGroupNew = L.layerGroup();
let snapMarker = null;
let lastSnapPoint = null;
let searchMarker = null;

// LayerGroup untuk menampung semua geometry
const geometryLayer = L.featureGroup();
// 🔹 LayerGroup untuk menampung area seleksi
const selectionLayer = L.featureGroup();


// Cache untuk icons
let cachedIcons = null;
let iconOptionsLoaded = false;

let geomanDisabledByDraw = false;

// Debounce function


// mapping warna per type
const colorMap = {
    acc: "orange",
    reservoir: "blue",
    tank: "green",
    valve: "red"
};
// helper biar rapi


async function savePipa(id, line, payload) {
    const coords = line.getLatLngs().map(p => [p.lat, p.lng]);

    // Pastikan semua kolom payload dikirim (default null kalau tidak ada)
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

    console.log("🔹 [savePipa] Payload dikirim ke backend:", dataToSend);

    try {
        const res = await fetch('/api/pipa/create', {
            method: 'POST', // untuk create lebih rapi POST, bukan PUT
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSend)
        });

        console.log("🔹 [savePipa] Status response:", res.status);

        const data = await res.json();
        console.log("🔹 [savePipa] Response backend:", data);

        if (!res.ok) throw new Error(data.error || "Save pipa gagal");

        // ✅ Notifikasi sukses
        showToast("success", "Pipa berhasil disimpan");

        loadPipa();

        return data;

    } catch (err) {
        console.error("❌ [savePipa] Error:", err);

        // ❌ Notifikasi error
        showToast("error", err.message || "Terjadi kesalahan saat menyimpan pipa");

        throw err;
    }
}

async function updatePipa(id, layer, formData) {
    try {
        // Ambil koordinat latlng dari layer Leaflet
        const coords = layer.getLatLngs().map(latlng => [latlng.lat, latlng.lng]);

        console.log("🔹 [updatePipa] ID:", id, "Coords:", coords);

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
            method: "PUT", // <-- ubah jadi PUT
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        console.log("🔹 Response updatePipa:", data);

        if (!res.ok) {
            throw new Error(data.error || "Gagal update pipa");
        }

        // ✅ toast sukses
        showToast("Pipa berhasil diperbarui", "success");
        loadPipa();
    } catch (err) {
        console.error("❌ [updatePipa] Error:", err);
        showToast("Gagal update pipa: " + err.message, "danger");
    }
}

async function deletePipa(id) {
    console.log("🔹 [deletePipa] ID:", id);

    try {
        const res = await fetch(`/api/pipa/delete/${id}`, {
            method: "DELETE"
        });

        if (!res.ok) {
            throw new Error(`HTTP error! Status: ${res.status}`);
        }

        const data = await res.json();
        console.log("✅ [deletePipa] Success:", data);

        // Hapus layer pipa dari map kalau perlu
        if (pipaLayers[id]) {
            map.removeLayer(pipaLayers[id]);
            delete pipaLayers[id];
        }

        showToast("Pipa berhasil dihapus", "success");
    } catch (err) {
        console.error("❌ [deletePipa] Error:", err);
        showToast("Gagal menghapus pipa", "danger");
    }
}


// bikin global map diameter -> warna
let diamtrColors = {};   // mapping diameter -> warna
let diameterList = [];   // simpan semua diameter (supaya bisa dipakai dropdown)
let jenisList = [];      // simpan semua jenis (supaya bisa dipakai dropdown)

async function loadLegend() {
    try {
        const res = await fetch('/api/pipa/option');
        const data = await res.json();
        // console.log("✅ Data dari API /api/pipa/diameter:", diamtr, "Tipe:", typeof diamtr);
        // console.log("Array.isArray(diamtr)?", Array.isArray(diamtr));
        const diamtr = data.diameter;  // array diameter
        diameterList = diamtr;          // simpan untuk dropdown


        // warna bisa disesuaikan atau dibuat skema otomatis
        const colorPalette = [
            '#0077ff', '#28a745', '#dc3545', '#ffc107',
            '#6c757d', '#ff6600', '#00ccffff', '#8e44ad',
            '#00ff00ff', '#fd7e14', '#e83e8c'
        ];

        const legendDiv = document.getElementById('legend');
        legendDiv.innerHTML = '<h4>Diameter Pipa</h4>';



        diamtr.forEach((dia, i) => {
            let color;

            if (i < colorPalette.length) {
                // pakai warna dari palette
                color = colorPalette[i];
            } else {
                // generate warna otomatis dengan HSL
                color = `hsl(${(i * 40) % 360}, 70%, 50%)`;
            }

            diamtrColors[dia] = color;
            // console.log("   Simpan mapping:", dia, "=>", color);

            const item = document.createElement('div');
            item.innerHTML = `
                <span class="legend-line" style="background:${color}; height:6px;"></span> DN${dia}
            `;
            legendDiv.appendChild(item);

            // Simpan juga list jenis
            jenisList = data.jenis; // buat nanti dropdown jenis
        });
        // console.log("📌 Mapping diamtrColors:", diamtrColors);
    } catch (err) {
        console.error("Gagal load legend:", err);
    }

}

// ====== Helper ======
function findPolygonById(id) {
    // Cari di kedua group: polygonGroup (sudah disimpan) dan polygonGroupNew (belum disimpan)
    let found = null;

    polygonGroup.eachLayer((layer) => {
        if (layer instanceof L.Polygon && layer._polygonId == id) {
            found = layer;
        }
    });

    if (!found) {
        polygonGroupNew.eachLayer((layer) => {
            if (layer instanceof L.Polygon && layer._polygonId == id) {
                found = layer;
            }
        });
    }

    return found;
}

// ====== Fungsi Utama ======
async function loadPolygon(bbox) {
    if (!map) return;

    try {
        polygonGroup.clearLayers();

        const response = await fetch(`/api/polygon?bbox=${bbox}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        // =========== POLYGON LAMA ===========
        for (const poly of data) {
            if (!poly.polygon || !Array.isArray(poly.polygon)) {
                console.warn("❌ Data polygon invalid:", poly);
                continue;
            }

            // Validasi koordinat polygon
            const validCoords = poly.polygon.filter(pt => {
                if (pt.length === 2) {
                    const [a, b] = pt;
                    return (a >= -90 && a <= 90) && (b >= -180 && b <= 180);
                }
                return false;
            });

            if (validCoords.length < 3) {
                console.warn("❌ Koordinat polygon tidak valid:", poly);
                continue;
            }

            const polygon = L.polygon(validCoords, {
                color: 'blue',
                weight: 1,
                fillOpacity: 0.4,
                pane: 'polygonPane'
            }).addTo(polygonGroup);

            geometryLayer.addLayer(polygon);

            polygon._polygonId = poly.id;
            polygon._defaultColor = 'blue'; // simpan warna awal

            polygon.bindPopup(`
                <div class="p-2" style="min-width:250px">
                    <div class="fw-bold mb-2 text-center">Edit Polygon</div>

                    <div class="mb-2">
                        <label class="form-label small mb-1">No SAMW</label>
                        <input type="text" class="form-control form-control-sm" name="editNosamw" value="${poly.nosamw || ''}">
                    </div>

                    <div class="mb-2">
                        <label class="form-label small mb-1">Luas (m²)</label>
                        <input type="text" class="form-control form-control-sm" name="editLuas" value="${poly.lsval || 0}" readonly>
                    </div>

                    <div class="mb-2">
                        <label class="form-label small mb-1">Backup</label>
                        <input type="text" class="form-control form-control-sm" name="editBackup" value="${poly.nosambckup || ''}">
                    </div>

                    <div class="d-flex gap-1 mt-3">
                        <button class="btn btn-sm btn-success flex-fill btn-save" data-type="srpolygon" data-id="${poly.id}">💾 Simpan</button>
                        <button class="btn btn-sm btn-primary flex-fill btn-edit" data-type="srpolygon" data-id="${poly.id}">✏️ Edit</button>
                        <button class="btn btn-sm btn-secondary flex-fill btn-cancel" data-type="srpolygon" data-id="${poly.id}">❌ Batal</button>
                        <button class="btn btn-sm btn-danger flex-fill btn-hapus" data-type="srpolygon" data-id="${poly.id}">🗑️ Hapus</button>
                    </div>
                </div>
            `, {
                autoPan: false
            });
        }

        console.log(`✅ Polygon loaded: ${data.length}`);

    } catch (err) {
        console.error('Gagal load polygon:', err);
    }
}

// Simpan polygon baru
async function savePolygon(id, polygon, payload, nosamwNew) {
    try {
        const res = await fetch('/api/polygon/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal menyimpan polygon!");

        // Simpan info nosamw dan ID di layer
        polygon._polygonId = data.ogr_fid;
        polygon._nosamw = nosamwNew;
        polygon.lsval = payload.luas;

        showToast("Polygon berhasil disimpan!", "success");
        return data;

    } catch (err) {
        console.error("Save error:", err);
        showToast(err.message || "Gagal menyimpan polygon!", "danger");
        throw err;
    }
}

// Hapus polygon
async function deletePolygon(id) {
    if (!confirm("Yakin hapus polygon ini?")) return;

    try {
        const res = await fetch(`/api/polygon/delete/${id}`, { method: 'DELETE' });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Gagal hapus polygon!");

        console.log("Delete success:", data);

        // Hapus polygon dari map
        polygonGroup.eachLayer(layer => {
            if (layer._polygonId == id) {
                polygonGroup.removeLayer(layer);
            }
        });

        showToast("Polygon berhasil dihapus!", "success");
    } catch (err) {
        console.error("Delete error:", err);

        // PERBAIKAN: Gunakan err.message bukan err langsung
        showToast(err.message || "Gagal hapus polygon!", "danger");
    }
}

// Update polygon
async function updatePolygon(id, polygon, payload) {
    try {
        const res = await fetch('/api/polygon/update/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showToast("Polygon berhasil diperbarui!", "success");
        return data;
    } catch (err) {
        showToast("Gagal memperbarui polygon!", "danger");
        throw err;
    }
}


// ====== Event Delegation Global ======
document.addEventListener("click", async e => {
    const saveBtn = e.target.closest(".btn-save");
    const editBtn = e.target.closest(".btn-edit");
    const cancelBtn = e.target.closest(".btn-cancel");
    const deleteBtn = e.target.closest(".btn-hapus");

    // ==================== SAVE ====================
    if (saveBtn) {
        const type = saveBtn.dataset.type;

        if (type === "srpolygon") {
            const id = saveBtn.dataset.id;
            const polygon = findPolygonById(id);
            if (!polygon) return;

            const popupEl = polygon.getPopup().getElement();
            const nosamw = popupEl.querySelector('[name="editNosamw"], #newPolygonNosamw')?.value.trim();
            const luas = parseInt(popupEl.querySelector('[name="editLuas"], #newPolygonLuas')?.value) || 0;
            const coords = polygon.getLatLngs()[0].map(p => [p.lat, p.lng]);

            try {
                if (!id || id === "new") {
                    const savedPolygon = await savePolygon(id, polygon, { coords, nosamw, nosambckup: nosamw, luas });
                    polygon._polygonId = savedPolygon.ogr_fid;
                    polygonGroupNew.removeLayer(polygon);
                    polygonGroup.addLayer(polygon);
                    polygon.setStyle({ color: "blue", dashArray: null, fillOpacity: 0.4 });
                } else {
                    await updatePolygon(id, polygon, { coords, nosamw, nosambckup: polygon._backup || '', luas });
                    polygon.setStyle({ color: "blue", dashArray: null, fillOpacity: 0.4 });
                }

                polygon.pm.disable();
                polygon.closePopup();
                const saveToastEl = document.getElementById("saveToast");
                if (saveToastEl) new bootstrap.Toast(saveToastEl, { delay: 3000 }).show();
            } catch (err) {
                console.error("Save SRPolygon error:", err);
            }
        }

        else if (type === "pipe") {
            const id = saveBtn.dataset.id;
            let line;

            // --- Cari layer berdasarkan id ---
            if (!id || id === "new") {
                // Cari pipa baru
                line = pipeGroupNew.getLayers().find(l => l._pipeId === "new");
            } else {
                // Cari pipa existing
                line = pipeGroup.getLayers().find(l => l._pipeId == id);
            }
            if (!line) return;

            const popupEl = line.getPopup().getElement();

            // --- Ambil input diameter & jenis ---
            let diameterInput =
                popupEl.querySelector('[name="editDiameter"]')?.value || // kalau existing
                popupEl.querySelector('#newPipeDiameter')?.value || '';   // kalau new

            let jenisInput =
                popupEl.querySelector('[name="editJenis"]')?.value || // kalau existing
                popupEl.querySelector('#newPipeJenis')?.value || '';  // kalau new

            console.log("🔹 Raw diameter input:", diameterInput);
            console.log("🔹 Raw jenis input:", jenisInput);

            // --- Format diameter ---
            let diameterToSave = diameterInput ? diameterInput.trim() + ' mm' : '';
            console.log("🔹 Diameter yang dikirim ke backend:", diameterToSave);

            try {
                if (!id || id === "new") {
                    // Simpan pipa baru
                    const res = await savePipa(id, line, { diameter: diameterToSave, jenis: jenisInput });
                    console.log("🔹 Response savePipa:", res);

                    // Pindahkan dari groupNew ke group utama
                    pipeGroupNew.removeLayer(line);
                    pipeGroup.addLayer(line);
                } else {
                    // Update pipa existing
                    const res = await updatePipa(id, line, { diameter: diameterToSave, jenis: jenisInput });
                    console.log("🔹 Response updatePipa:", res);
                }

                // Tutup popup
                line.closePopup();

                // Matikan edit mode kalau ada
                if (line.pm && line.pm.enabled()) {
                    line.pm.disable();
                }

                // --- Atur style pipa ---
                line.setStyle({
                    color: diamtrColors[diameterToSave] || line.options.color || "blue",
                    dashArray: null
                });

                // Tampilkan notifikasi
                const saveToastEl = document.getElementById("saveToast");
                if (saveToastEl) new bootstrap.Toast(saveToastEl, { delay: 3000 }).show();

            } catch (err) {
                console.error("Save/update pipe error:", err);
            }
        }

    }

    // ==================== EDIT ====================
    if (editBtn) {
        const type = editBtn.dataset.type;
        let layer;

        if (type === "srpolygon") {
            const id = editBtn.dataset.id;
            layer = findPolygonById(id);
            if (!layer) return;

            // Simpan backup koordinat sebelum edit
            layer._backupLatLngs = JSON.parse(JSON.stringify(layer.getLatLngs()));

            layer.pm.enable({ allowSelfIntersection: false });
            layer.setStyle({ color: "orange", dashArray: "5,5", fillOpacity: 0.3 });
            layer.closePopup();
        }
        else if (type === "pipe") {
            const id = editBtn.dataset.id;
            layer = id === "new"
                ? pipeGroupNew.getLayers().find(l => l._pipeId === "new")
                : pipeGroup.getLayers().find(l => l._pipeId == id);
            if (!layer) return;

            layer._backupLatLngs = JSON.parse(JSON.stringify(layer.getLatLngs()));
            layer.pm.enable();
            layer.setStyle({ color: "orange", dashArray: "5,5" });
            layer.closePopup();
        }
    }

    // ==================== CANCEL ====================
    if (cancelBtn) {
        const type = cancelBtn.dataset.type;
        const id = cancelBtn.dataset.id;
        let layer;

        if (type === "srpolygon") {
            layer = findPolygonById(id);
            if (!layer) return;

            if (id === "new") {
                polygonGroupNew.removeLayer(layer);
            } else {
                if (layer.pm) layer.pm.disable();
                layer.closePopup();

                // kembalikan style
                layer.setStyle({
                    color: layer._defaultColor || '#3388ff',
                    dashArray: null,
                    fillOpacity: 0.4
                });

                // kembalikan koordinat asli
                if (layer._backupLatLngs) {
                    layer.setLatLngs(layer._backupLatLngs);
                    delete layer._backupLatLngs;
                }
            }
        }
        else if (type === "pipe") {
            layer = id === "new"
                ? pipeGroupNew.getLayers().find(l => l._pipeId === "new")
                : pipeGroup.getLayers().find(l => l._pipeId == id);
            if (!layer) return;

            if (id === "new") {
                pipeGroupNew.removeLayer(layer);
            } else {
                if (layer.pm) layer.pm.disable();
                layer.closePopup();

                layer.setStyle({
                    color: layer._defaultColor || (diamtrColors[layer.options.diameter] || 'red'),
                    dashArray: null
                });

                // kembalikan koordinat asli
                if (layer._backupLatLngs) {
                    layer.setLatLngs(layer._backupLatLngs);
                    delete layer._backupLatLngs;
                }
            }
        }
    }


    // ==================== DELETE ====================
    if (deleteBtn) {
        const type = deleteBtn.dataset.type;
        const id = deleteBtn.dataset.id;
        let layer;

        if (type === "srpolygon") {
            layer = findPolygonById(id);
            if (!layer) return;

            if (confirm("Apakah Anda yakin ingin menghapus polygon ini?")) {
                try {
                    await deletePolygon(id);
                    if (id === "new") polygonGroupNew.removeLayer(layer);
                    else map.removeLayer(layer);
                    const deleteToastEl = document.getElementById("deleteToast");
                    if (deleteToastEl) new bootstrap.Toast(deleteToastEl, { delay: 3000 }).show();
                } catch (err) {
                    console.error("Delete SRPolygon error:", err);
                }
            } else layer.closePopup();
        } else if (type === "pipe") {
            layer = id === "new"
                ? pipeGroupNew.getLayers().find(l => l._pipeId === "new")
                : pipeGroup.getLayers().find(l => l._pipeId == id);
            if (!layer) return;

            if (confirm(`Apakah Anda yakin ingin menghapus pipa ${id === "new" ? "baru" : id}?`)) {
                if (id === "new") {
                    pipeGroupNew.removeLayer(layer);
                } else {
                    await deletePipa(id);
                    pipeGroup.removeLayer(layer);
                }
                const deleteToastEl = document.getElementById("deleteToast");
                if (deleteToastEl) new bootstrap.Toast(deleteToastEl, { delay: 3000 }).show();
            } else layer.closePopup();
        }
    }
});

// Inisialisasi
initAdminMap();

// Tampilkan info user login
fetch('/api/session')
    .then(res => {
        if (!res.ok) throw new Error('Belum login');
        return res.json();
    })
    .then(data => {
        const userEl = document.getElementById('user-info');
        userEl.textContent = `Login sebagai:👤 ${data.user.username} | Last login: ${formatWaktu(data.user.last_login) || '-'}`;
    })
    .catch(() => {
        alert("Anda belum login. Akan dialihkan...");
        window.location.href = "/login.html";
    });

// Fungsi logout
async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        alert("Berhasil logout.");
        window.location.href = "/login.html";
    } catch {
        alert("Gagal logout.");
    }
}

// ======= Helper Toast =======

// Cleanup function
function cleanupMap() {
    map.off('pm:drawstart');
    map.off('pm:create');
    map.off('moveend');
    map.off('click');

    map.removeLayer(markerGroup);
    map.removeLayer(polygonGroup);
    map.removeLayer(editableLayers);

    markerMap = {};
    drawnPolyline = null;
    snapMarker = null;
}

window.addEventListener('beforeunload', cleanupMap);