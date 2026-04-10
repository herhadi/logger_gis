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
        if (includeNewMarkerLayer && ctx.state.markerGroupNew) ctx.layers.map.addLayer(ctx.state.markerGroupNew);
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

    global.MapCoreShared = {
        createBaseLayers,
        setupMap,
        setupBasicLayerControl,
        setupReadOnlyMapEvents
    };
})(window);
