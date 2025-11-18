// ✅ Fallback aman: inisialisasi L.Symbol jika plugin belum inject
if (typeof L.Symbol === 'undefined') {
    L.Symbol = {};
}

// Inisialisasi peta dengan maxZoom lebih besar
const map = L.map('map', {
    maxZoom: 24
}).setView([-6.9383, 109.7178], 13);

const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 23,
    maxNativeZoom: 19
}).addTo(map);

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 21,
    maxNativeZoom: 19, // ❗️Batas asli citra satelit
    noWrap: true        // ❗️Mencegah tile looping ke baris selanjutnya
});

const jalanLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    opacity: 0.4,
    attribution: '&copy; OpenStreetMap contributors (Jalan Transparan)',
    maxZoom: 21
});

const googleStreets = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 22,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
});

const googleHybrid = L.tileLayer('http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
    maxZoom: 24,
    maxNativeZoom: 22,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: 'Map data © Google'
});

const googleSat = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
});

const googleTerrain = L.tileLayer('http://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
});

const googleTraffic = L.tileLayer('https://{s}.google.com/vt/lyrs=m@221097413,traffic&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    minZoom: 2,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
});

// Layer hybrid: gabungan satelit dan jalan transparan
const hybridLayer = L.layerGroup([satelliteLayer, jalanLayer]);

const baseMaps = {
    "Peta Biasa": streetLayer,
    "Citra Satelit": satelliteLayer,
    "gHybrid": googleHybrid,
    "gTerrain": googleTerrain,
    "gStreets": googleStreets,
    "gSat": googleSat,
    "gTraffic": googleTraffic,
    "Hybrid (Satelit + Jalan)": hybridLayer
};

const markerGroup = L.layerGroup();
const statusDotGroup = L.layerGroup();
const overlayMaps = {
    "Tampilkan Marker": markerGroup,
    "Status Logger": statusDotGroup
};

L.control.layers(baseMaps, overlayMaps).addTo(map);

// Secara default aktif? Tambahkan ke map di sini (jika perlu)
markerGroup.addTo(map);
statusDotGroup.addTo(map);

const markerMap = {};
const allMarkers = [];

function closeAllPopups() {
    document.querySelectorAll('.leaflet-popup').forEach(p => p.remove());
}

function formatPixelDistance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function isOverlappingMarkers(minDistance = 80) {
    const pixels = allMarkers.map(m => map.latLngToContainerPoint(m.getLatLng()));
    for (let i = 0; i < pixels.length; i++) {
        for (let j = i + 1; j < pixels.length; j++) {
            if (formatPixelDistance(pixels[i], pixels[j]) < minDistance) return true;
        }
    }
    return false;
}

function updateSensorData(autoPopup = false) {
    if (autoPopup) closeAllPopups();

    return fetch('/api/data-terbaru')
        .then(res => res.json())
        .then(data => {
            const now = new Date();
            const idmetWithData = new Set(data.map(d => d.idmet));

            Object.entries(markerMap).forEach(([idmet, entry]) => {
                let content = '';
                let statusDot = '';

                if (entry.status == 0) {
                    statusDot = `<span class="status-dot gray-dot"></span>`;
                    content = `
                        ${statusDot}<b>${entry.nama}</b><br>ID: ${idmet}
                        <br><span class="badge bg-secondary">Logger belum terpasang</span>
                    `;
                } else if (idmetWithData.has(idmet)) {
                    const sensor = data.find(d => d.idmet === idmet);
                    const waktu = new Date(sensor.jam);
                    const selisihJam = (now - waktu) / (1000 * 60 * 60);

                    let warnaClass = selisihJam <= 1 ? 'green-dot' : 'red-dot';
                    statusDot = `<span class="status-dot ${warnaClass} blinking"></span>`;

                    // Foto logger langsung dari entry.foto_logger, tidak lewat api/foto-logger/:idmet
                    const fotoLogger = entry.foto_logger
                        ? `/foto_logger/${encodeURIComponent(entry.foto_logger)}`
                        : `/foto_logger/default.png`;

                    const { lat, lng } = entry.marker.getLatLng();

                    content = `
                        <img src="${fotoLogger}" 
                            alt="Foto Logger" 
                            style="width:100%; max-height:150px; object-fit:cover; border-radius:8px; margin-bottom:5px;"
                            onerror="this.onerror=null; this.src='/foto_logger/default.png';"><br>
                        ${statusDot}<b>${entry.nama}</b><br>ID: ${idmet}
                        <br><b>Waktu:</b> ${formatWaktu(sensor.jam)}
                        <br><b>Stand:</b> ${sensor.stand}
                        <br><b>Debit:</b> ${parseFloat(sensor.debit).toFixed(2)} L/s
                        <br><b>Tekanan:</b> ${parseFloat(sensor.pressure).toFixed(2)} Bar
                        <br><div style="text-align:center; margin-top:8px;">
                                <button id="lokasiBtn-${idmet}" onclick="bukaRute(${lat}, ${lng}, '${idmet}')" 
                                    style="width:100%; background:#2196F3; color:#fff; border:none; padding:8px; border-radius:5px; cursor:pointer; font-size:14px;"">
                                    📍 Lokasi
                                </button>
                            </div>
                    `;
                } else {
                    statusDot = `<span class="status-dot yellow-dot blinking"></span>`;
                    content = `
                        ${statusDot}<b>${entry.nama}</b><br>ID: ${idmet}
                        <br><i>Data belum tersedia</i>
                    `;
                }

                entry.marker.bindPopup(content, {
                    offset: L.point(0, -35)
                });

                const dotIcon = L.divIcon({
                    className: '',
                    html: statusDot,
                    iconSize: [14, 14],
                    iconAnchor: [7, 7]
                });

                if (entry.statusDot) {
                    entry.statusDot.setLatLng(entry.marker.getLatLng());
                    entry.statusDot.setIcon(dotIcon);
                } else {
                    entry.statusDot = L.marker(entry.marker.getLatLng(), {
                        icon: dotIcon,
                        interactive: false
                    }).addTo(statusDotGroup);
                }

                if (autoPopup && map.getZoom() >= 17 && !isOverlappingMarkers() && !entry.popupShown) {
                    const popup = L.popup({
                        autoClose: false,
                        closeOnClick: false,
                        closeButton: false,
                        autoPan: false,
                        offset: L.point(0, -35)
                    })
                        .setLatLng(entry.marker.getLatLng())
                        .setContent(content)
                        .addTo(map);

                    if (entry.statusDot && entry.statusDot.getElement()) {
                        entry.statusDot.getElement().style.display = 'none';
                    }

                    entry.currentPopup = popup;
                    entry.popupShown = true;

                    console.log("Opening popup [zoom≥17] for:", idmet);
                }
            });
        })
        .catch(err => console.error("Gagal fetch data sensor:", err));
}

function initMap() {
    markerGroup.clearLayers();
    statusDotGroup.clearLayers();

    const clusterGroup = L.markerClusterGroup({
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        maxClusterRadius: 40
    }); // Tambahkan cluster

    fetch('/api/lokasi')
        .then(res => res.json())
        .then(data => {
            data.forEach(loc => {
                const { latitude, longitude, nama, idmet, ikon, status, foto_logger } = loc;

                const icon = L.icon({
                    iconUrl: `/icons/${ikon || 'default.png'}`,
                    iconSize: [25, 41],
                    iconAnchor: [12, 41]
                });

                const marker = L.marker([latitude, longitude], { icon, riseOnHover: true, autoPan: true });
                clusterGroup.addLayer(marker);

                marker.bindPopup(`<b>${nama}</b><br>ID: ${idmet}<br><i>Memuat data...</i>`);

                markerMap[idmet] = {
                    marker,
                    nama,
                    foto_logger: foto_logger || null,
                    status
                };

                marker.on('popupopen', () => {
                    const entry = markerMap[idmet];
                    if (entry.currentPopup) {
                        entry.currentPopup.remove();
                        entry.currentPopup = null;
                    }
                    if (entry.statusDot) {
                        map.removeLayer(entry.statusDot);
                    }
                });

                marker.on('popupclose', () => {
                    if (markerMap[idmet].statusDot) {
                        map.addLayer(markerMap[idmet].statusDot);
                    }
                });

                allMarkers.push(marker);
            });

            map.addLayer(clusterGroup); // Masukkan cluster ke map


            if (allMarkers.length > 0) {
                map.fitBounds(L.featureGroup(allMarkers).getBounds().pad(0.2));
            }

            setTimeout(() => updateSensorData(false), 500);
        })
        .then(() => fetch('/api/pipa'))
        .then(res => res.json())
        .then(pipaData => {
            pipaData.forEach(p => {
                const jalur = p.arah === 'reverse'
                    ? [...p.jalur].reverse().map(([lng, lat]) => [lat, lng])
                    : p.jalur.map(([lng, lat]) => [lat, lng]);

                const line = L.polyline(jalur, {
                    color: p.warna || 'blue',
                    weight: 3,
                    className: 'jalur-pipa',
                    dashArray: '3 5'
                }).addTo(map);

                let offset = 0;
                setInterval(() => {
                    offset = (offset + 1) % 7;
                    line.setStyle({ dashOffset: `${offset}` });
                }, 150);

                // Ambil panjang dari kolom p.panjang
                const panjang = Number(p.panjang);
                const panjangText = panjang >= 1000
                    ? (panjang / 1000).toFixed(2) + ' km'
                    : panjang.toFixed(0) + ' m';

                // Bind popup dengan nama dan panjang pipa
                const popupContent = `
                    <div style="font-size: 16px; line-height: 1.4; max-width: 300px;">
                        <strong>${p.nama}</strong><br>
                        Panjang: ${panjangText}
                    </div>
                `;

                line.bindPopup(popupContent, {
                    maxWidth: 320,
                    minWidth: 220,
                    autoPanPadding: [20, 20]
                });
            });
        })
        .catch(err => console.error("Inisialisasi gagal:", err));
}

initMap();

map.on('zoomstart', closeAllPopups);
map.on('zoomend', () => {
    const zoom = map.getZoom();
    console.log("zoomend triggered, zoom =", zoom);

    if (zoom < 17) {
        Object.values(markerMap).forEach(entry => {
            if (entry.statusDot && entry.statusDot.getElement()) {
                entry.statusDot.getElement().style.display = '';
            }
            if (entry.currentPopup) {
                entry.currentPopup.remove();
                entry.currentPopup = null;
            }
            entry.popupShown = false;
        });
    } else {
        // Reset agar popup bisa muncul ulang di zoom > 17
        Object.values(markerMap).forEach(entry => {
            entry.popupShown = false;
        });
        if (!isOverlappingMarkers()) {
            updateSensorData(true);
        }
    }
});


map.on('popupclose', function (e) {
    Object.values(markerMap).forEach(entry => {
        if (entry.currentPopup === e.popup) {
            if (entry.statusDot && entry.statusDot.getElement()) {
                entry.statusDot.getElement().style.display = '';
            }
            entry.currentPopup = null;
            entry.popupShown = false;
        }
    });
});

// Tampilkan info user login
fetch('/api/session')
    .then(res => {
        if (!res.ok) throw new Error('Belum login');
        return res.json();
    })
    .then(data => {
        const userEl = document.getElementById('user-info');
        userEl.textContent = `Login sebagai: 👤 ${data.user.username}`;
    })
    .catch(() => {
        alert("Anda belum login. Akan dialihkan...");
        window.location.href = "/login.html";
    });

// Fungsi logout
function logout() {
    fetch('/api/logout', { method: 'POST' })
        .then(() => {
            alert("Berhasil logout.");
            window.location.href = "/login.html";
        })
        .catch(() => alert("Gagal logout."));
}

function bukaRute(lat, lng, idmet) {
    if (!lat || !lng) {
        alert("Koordinat tujuan tidak ditemukan.");
        return;
    }

    // Ganti warna tombol + teks sementara
    const btn = document.getElementById(`lokasiBtn-${idmet}`);
    if (btn) {
        btn.style.background = "#4CAF50";
        btn.textContent = "Membuka...";
    }

    // Buka Google Maps
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
}

setInterval(() => {
    console.log("Auto-refresh data sensor");
    updateSensorData();
}, 300000); // satuan dalam milidetik (5 menit)

