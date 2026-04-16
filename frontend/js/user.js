// Read-only map for user view (markers/pipes/polygons).
// Keeps the same rendering strategy as admin.js, without edit/create controls.

const UserMap = {
    config: {
        mapCenter: [-6.9383, 109.7178],
        defaultZoom: 13,
        maxZoom: 24,
        debounceDelay: 300,
        svgInteractiveZoom: 18,
        apiKey: "dc9aa1e045f7427f9da781232e8d0544"
    },

    layers: {
        map: null,
        markerGroup: null,
        pipeGroup: L.layerGroup(),
        polygonGroup: L.layerGroup(),
        pipeGeometry: null,
        polyGeometry: null,
        polyCanvasRenderer: null,
        polySvgRenderer: null,
        pipaCanvasRenderer: null,
        pipaSvgRenderer: null
    },

    state: {
        layerVisibility: {
            markers: true,
            pipes: true,
            polygons: false
        },
        diamtrColors: {},
        diameterList: [],
        jenisList: []
    },

    init() {
        this._geoCache = new Map();

        this._setupBaseLayers();
        this._setupMap();
        this._setupLayerControl();
        this._setupEventHandlers();
        this._setupGeocoder();
        this.loadLegend();

        this.layers.map.whenReady(() => {
            this.loadAllLayers();
        });
    },

    _setupBaseLayers() {
        this.baseLayers = window.MapCoreShared.createBaseLayers();
        delete this.baseLayers["Google Satelit"];
    },

    _setupMap() {
        window.MapCoreShared.setupMap(this, {
            svgRendererKey: 'polySvgRenderer'
        });
    },

    _setupLayerControl() {
        window.MapCoreShared.setupBasicLayerControl(this);
    },

    _setupEventHandlers() {
        window.MapCoreShared.setupReadOnlyMapEvents(this);
    },

    _formatLegendLabel(dia) {
        return `DN${dia}`;
    }
};

window.MapReadShared?.apply(UserMap);

window.addEventListener('DOMContentLoaded', () => {
    UserMap.init();
});

// Open external maps app (Google Maps in a new tab).
window.bukaRute = function bukaRute(lat, lng, id) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        alert("Koordinat tujuan tidak ditemukan.");
        return;
    }

    const btn = document.getElementById(`lokasiBtn-${id}`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Membuka...";
    }

    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');

    if (btn) {
        setTimeout(() => {
            btn.disabled = false;
            btn.textContent = "Lokasi";
        }, 1000);
    }
};
