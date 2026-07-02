"use strict";
// MapLibre Control
class Maplibre {

    constructor() {
        this.map;
        this.minimap;
        this.Control = { "locate": "", "maps": "" };    // MapLibre object
        this.popup = null;
        this.styles = {};
        this.selectStyle;
        this.TriggerRepaint;
    }

    init(Conf) {
        function extractFilenamesFromTag(tag) { // タグからファイル名を返す
            const result = new Set()
            for (const key in tag) {
                const valueMap = tag[key]
                for (const val in valueMap) result.add(valueMap[val])
            }
            return result
        }

        function extractFilenamesFromSubtag(subtag) {
            const result = new Set()
            for (const keyEqVal in subtag) {
                const valueMap = subtag[keyEqVal]
                for (const subkey in valueMap) {
                    const icons = valueMap[subkey]
                    for (const subval in icons) result.add(icons[subval])
                }
            }
            return result
        }

        function waitForMapLoad(map, timeout = 60000) {
            return new Promise((resolve, reject) => {
                if (map && map.isStyleLoaded && map.isStyleLoaded()) return resolve();
                const timer = setTimeout(() => {
                    cleanup();
                    reject(new Error("Map load timeout. Check Tile Name ok?"));
                }, timeout);
                const onStyle = () => { cleanup(); resolve(); };
                const onErr = (e) => { console.warn("Map error during load:", e?.error || e) };
                const cleanup = () => {
                    clearTimeout(timer);
                    map.off("style.load", onStyle);
                    map.off("error", onErr);
                };
                map.once("style.load", onStyle);
                map.on("error", onErr);
            });
        }

        return new Promise((resolve, reject) => {
            console.log("Maplibre: init start.");
            this.selectStyle = Conf.map.tileName;
            Object.keys(Conf.tile).forEach(key => this.styles[key] = Conf.tile[key].style)
            let protocol = new pmtiles.Protocol()
            maplibregl.addProtocol("pmtiles", protocol.tile)
            this.map = new maplibregl.Map({
                container: 'mapid', style: this.styles[this.selectStyle], "maxZoom": Conf.map.maxZoom, "zoom": Conf.map.initZoom,
                antialias: true, hash: true, maxBounds: Conf.map.maxBounds, center: Conf.map.viewCenter,
                pitch: Conf.map.viewPitch, maxPitch: Conf.map.maxPitch, attributionControl: false, localIdeographFontFamily: ['sans-serif']
            });

            this.map.scrollZoom.setWheelZoomRate(1 / 420);
            this.map.scrollZoom.setZoomRate(1 / 420);
            this.TriggerRepaint = this.map.triggerRepaint;
            const fnames1 = new Set([...extractFilenamesFromTag(Conf.marker.tag), ...extractFilenamesFromSubtag(Conf.marker.subtag)]);
            const fnames2 = [...fnames1].map(file => file.replace(/\.svg$/i, ".png"));
            console.log(`Maplibre: new Map(${Conf.map.tileName})`);

            waitForMapLoad(mapLibre.map, 60000).then(async () => {
                setTimeout(() => {
                    mapLibre.map.setSky({ "sky-color": "#5090D0" });
                    mapLibre.map.setSky(Conf.skyStyle);
                }, 1000)
                for (let file of Conf.marker.background) {
                    let image = await this.map.loadImage("./" + Conf.icon.bgPath + "/" + file)
                    this.map.addImage(file, image.data)
                }
                const images = await Promise.all(
                    fnames2.map(async (file) => {
                        const image = await this.map.loadImage("./" + Conf.icon.fgPath + "/" + file);
                        return { file, image: image.data };
                    })
                );
                for (const { file, image } of images) this.map.addImage(file, image);
                console.log("Maplibre: init end.")
                resolve()
            });
        });
    };

    enable(flag) {
        if (flag) {
            this.map.scrollWheelZoom.enable();
            this.map.dragging.enable();
        } else {
            this.map.scrollWheelZoom.disable();
            this.map.dragging.disable();
        }
    };

    start() {
        if (this.map !== undefined) {
            this.map.getCanvas().style.pointerEvents = "";
            this.map.triggerRepaint = this.TriggerRepaint;
            //this.map.triggerRepaint(); // 即時再描画
        }
        if (this.minimap !== undefined) {
            this.minimap.resize()
            this.minimap.getCanvas().style.pointerEvents = "";
            this.minimap.triggerRepaint = this.TriggerRepaint;
            this.minimap.triggerRepaint(); // 即時再描画
        }
    };

    stop() {
        if (this.map !== undefined) {
            this.map.getCanvas().style.pointerEvents = "none";
            this.map.triggerRepaint = () => { };
        }
        if (this.minimap !== undefined) {
            this.minimap.getCanvas().style.pointerEvents = "none";
            this.minimap.triggerRepaint = () => { };
        }
    };

    // Change Map Style / tilename:タイル名。空欄の時は設定された次のスタイル
    changeMap(tilename) {
        let styles = Object.keys(this.styles);
        let nextSt = (styles.indexOf(this.selectStyle) + 1) % styles.length;
        while (Conf.tile[styles[nextSt]].skip == true) {
            nextSt = (nextSt + 1) % styles.length;
        }
        this.selectStyle = !tilename ? styles[nextSt] : tilename;
        mapLibre.map.setStyle(this.styles[this.selectStyle]);
        setTimeout(() => {
            mapLibre.map.setSky({ "sky-color": "#5090D0" });
            mapLibre.map.setSky(Conf.skyStyle);
        }, 1000)
        return this.selectStyle;
    };

    on(event, callback) { this.map.on(event, callback); };

    openPopup(marker, params) {
        if (this.popup !== null) this.popup.close();
        setTimeout((() => { this.popup = L.popup(marker.getLngLat(), params).openOn(this.map); }).bind(this), 100);
    };

    flyTo(ll, zoomlv) { this.map.flyTo({ center: ll, zoom: zoomlv, speed: 2, essential: true }); };

    // return Zoom Level / round: Math.Round(true or false)
    getZoom(round) { return round ? Math.round(this.map.getZoom() * 10) / 10 : this.map.getZoom(); };

    setZoom(zoomlv) { this.map.flyTo({ center: this.map.getCenter(), zoom: zoomlv, speed: 0.5 }); };

    getCenter() { return this.map.getBounds().getCenter(); };

    get_LL(lll) {			// LngLatエリアの設定 [経度lng,緯度lat] lll:少し大きめにする
        let ll = { "NW": this.map.getBounds().getNorthWest(), "SE": this.map.getBounds().getSouthEast() };
        if (lll) {
            ll.NW.lng = ll.NW.lng * 0.999998;
            ll.SE.lng = ll.SE.lng * 1.000002;
            ll.SE.lat = ll.SE.lat * 0.999998;
            ll.NW.lat = ll.NW.lat * 1.000002;
        }
        return ll;
    };

    getMiniLL(lll) {
        if (this.minimap == undefined) return undefined
        let ll = { "NW": this.minimap.getBounds().getNorthWest(), "SE": this.minimap.getBounds().getSouthEast() };
        if (lll) {
            ll.NW.lng = ll.NW.lng * 0.999997;
            ll.SE.lng = ll.SE.lng * 1.000003;
            ll.SE.lat = ll.SE.lat * 0.999997;
            ll.NW.lat = ll.NW.lat * 1.000003;
        }
        return ll;
    }

    addControl(position, domid, html, cname) {     // add MapLibre control
        class HTMLControl {
            onAdd(map) {
                this._map = map;
                this._container = document.createElement('div');
                this._container.id = domid;
                this._container.className = 'maplibregl-ctrl ' + cname;
                this._container.innerHTML = html;
                this._container.style = "transform: initial;";
                return this._container;
            }
            onRemove() {
                this._container.parentNode.removeChild(this._container);
                this._map = undefined;
            }
        }
        this.map.addControl(new HTMLControl(), position);
    };

    addNavigation(position) {                               // add location
        this.map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '' }));
        this.map.addControl(new maplibregl.NavigationControl(), position);
        this.map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), position);
    };

    addScale(position) { this.map.addControl(new maplibregl.ScaleControl(), position); };

    //
    updateVisitedCountry() {
        let visitedcountory = poiCont.getPolygonVisitedCountory()
        let viss = this.minimap.getSource("viss");
        if (viss !== undefined) viss.setData({ type: 'FeatureCollection', features: visitedcountory })
    }

    // ミニマップ表示(初期設定)
    addMiniMap() {
        return new Promise((resolve) => {
            console.log("addMiniMap: Start")
            const mmap = document.getElementById("mini-map")
            if (this.minimap === null || this.minimap === undefined) {  // 初回設定
                let planet = Conf.tile.miniMap.style
                this.minimap = new maplibregl.Map({ container: 'mini-map', style: planet, interactive: true, attributionControl: false, localIdeographFontFamily: ['sans-serif'] })
                this.minimap.on('style.load', () => {
                    let allcountry = []
                    let visitedcountory = poiCont.getPolygonVisitedCountory()
                    let countries = poiCont.getAllOSMCountryCode()      // 国コードがある施設一覧
                    if (countries.length > 0) {
                        countries.forEach((CCode) => {
                            let CPoly = poiCont.getPolygonByCountryCode(CCode)
                            if (CPoly !== undefined) allcountry.push(CPoly[0])
                        })
                    }
                    this.minimap.addSource("alls", { type: 'geojson', data: { type: 'FeatureCollection', features: allcountry } })
                    this.minimap.addSource("viss", { type: 'geojson', data: { type: 'FeatureCollection', features: visitedcountory } })
                    this.minimap.addSource("sels", { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
                    this.minimap.addLayer({ id: 'alls-fill', type: 'fill', source: 'alls', paint: { 'fill-color': '#002200', 'fill-opacity': 0.2 } })
                    this.minimap.addLayer({ id: 'viss-fill', type: 'fill', source: 'viss', paint: { 'fill-color': '#88FF88', 'fill-opacity': 0.3 } })
                    this.minimap.addLayer({ id: 'sels-fill', type: 'fill', source: 'sels', paint: { 'fill-color': '#FF8844', 'fill-opacity': 0.6 } })
                    this.minimap.setProjection({ "type": "globe" }) // globe表示には fog が必要
                    mapLibre.addMiniMapControl("top-left", "flags", "");
                    mmap.classList.remove("d-none")
                    this.minimap.setCenter(Conf.map.viewCenter)
                    this.minimap.setZoom(Conf.minimap.initZoom)
                    this.minimap.on('click', this.#miniMapClick)
                    console.log("addMiniMap: End")
                    resolve(true)
                })
            } else {
                resolve(true)
            }
        })
    }

    addMiniMapControl(position, domid, html, cname) {     // add MapLibre control for MiniMap
        class HTMLControl {
            onAdd(map) {
                this._map = map;
                this._container = document.createElement('div');
                this._container.id = domid;
                this._container.className = 'maplibregl-ctrl ' + cname;
                this._container.innerHTML = html;
                this._container.style = "transform: initial;";
                return this._container;
            }
            onRemove() {
                this._container.parentNode.removeChild(this._container);
                this._map = undefined;
            }
        }
        this.minimap.addControl(new HTMLControl(), position);
    }

    viewMiniMap(view) {
        const method = view ? "remove" : "add"
        document.getElementById("mini-map").classList[method]("d-none")
    }

    #miniMapClick(e) {
        console.log("#miniMapClick: Start")
        const pt = turf.point([e.lngLat.lng, e.lngLat.lat])
        const matches = poiCont.getPolygonByPoint(pt)  // 国判定
        if (matches.length > 0) {               // 地図移動（miniMapとmapの両方）
            let CCode = matches[0].properties["ISO3166-1-Alpha-2"];
            let OSMID = poiCont.getOsmidByCountryCode(CCode);
            if (OSMID !== "") {
                poiCont.select(OSMID, !cMapMaker.minimap, cMapMaker.minimap ? -1 : 0);
                mapLibre.#highlightCountry(matches)
                let geojson = poiCont.get_osmid(OSMID).geojson
                geoCont.writePoiCircle(geojson)
                geoCont.flashPolygon(geojson)
                console.log("#miniMapClick: End")
            }
        }
    }

    // ISO-3166 Alpha-2に基づいてminimapを移動してハイライト化
    showCountryByCode(CCode) {
        let matches = []
        console.log("showCountryByCode");
        let countries = CCode.split(";")
        this.addMiniMap().then(() => {
            this.updateVisitedCountry()
            for (let cno = 0; cno < countries.length; cno++) {
                const match = poiCont.getPolygonByCountryCode(countries[cno]);
                if (match.length == 0) { console.warn("showCountryByCode: Not found: ", countries[cno]); continue }
                matches.push(match[0])
            }
            this.#highlightCountry(matches)
        })
    }

    // 指定したGeoJsonから一番大きいポリゴンを返す
    #getLargestPolygonFromMultiPolygon(feature) {
        if (feature.geometry.type !== "MultiPolygon") return feature;
        const polygons = feature.geometry.coordinates.map(coords => turf.polygon(coords, feature.properties));
        let largest = polygons[0];
        let maxArea = turf.area(largest);
        for (let i = 1; i < polygons.length; i++) {
            const area = turf.area(polygons[i]);
            if (area > maxArea) { largest = polygons[i]; maxArea = area; }
        }
        return largest;
    }

    // 指定したgeoJsonをハイライト
    #highlightCountry(feature) {
        const highlight = function () {
            console.log("geoLib: #highlightCountry: " + feature[0].properties["ISO3166-1-Alpha-2"])
            this.minimap.getSource("sels").setData({ type: 'FeatureCollection', features: feature })
            let largestFeature = this.#getLargestPolygonFromMultiPolygon(feature[0])
            let maxArea = turf.area(largestFeature)
            for (let i = 1; i < feature.length; i++) {
                const candidate = this.#getLargestPolygonFromMultiPolygon(feature[i])
                const area = turf.area(candidate)
                if (area > maxArea) largestFeature = candidate; maxArea = area
            }
            const bbox = turf.bbox(largestFeature)
            const bboxCenter = function (bbox) {
                const [minX, minY, maxX, maxY] = bbox
                return [(minX + maxX) / 2, (minY + maxY) / 2]
            }
            const area = turf.area(largestFeature)
            const center = bboxCenter(bbox)
            const zoom = area < 5e9 ? 4.5 : area < 1e11 ? 3.5 : area < 1e12 ? 3 : 2
            this.minimap.flyTo({ center, zoom: zoom, duration: 1000, essential: true })
        }.bind(this)
        if (feature.length > 0) highlight()
    }

    // 指定した国コードリストの画像を読み込む
    async addCountryFlagsImage(countries) {
        async function loadFlagIcons() {
            const images = await Promise.all(
                countries.map(async (CCode) => {
                    let image;
                    const code = CCode.toLowerCase();
                    const urls = [
                        `https://flagcdn.com/w40/${code}.png`, // 第1候補（CDN）
                        `./flags/w40/${code}.png`              // 第2候補（ローカル）
                    ];
                    for (const url of urls) {
                        try {
                            image = await mapLibre.map.loadImage(url);
                            return { status: true, file: `flag-${CCode}`, image: image.data };
                        } catch (err) {
                            console.warn("addCountryFlagsImage: failed", url);
                        }
                    }
                    // すべて失敗した場合
                    return { status: false, file: `flag-${CCode}`, image: null };
                    /*
                    let image;
                    const url = `https://flagcdn.com/w40/${CCode.toLowerCase()}.png`;
                    try {
                        image = await mapLibre.map.loadImage(url)
                        return { status: true, file: `flag-${CCode}`, image: image.data };
                    } catch (err) {
                        console.log("addCountryFlagsImage: Error. " + CCode);
                        const nurl = `./flags/w40/${CCode.toLowerCase()}.png`;
                        image = await mapLibre.map.loadImage(nurl)
                        return { status: true, file: `flag-${CCode}`, image: image.data };
                    }
                        */
                })
            );
            for (const { file, image } of images) mapLibre.map.addImage(file, image);
        }
        await loadFlagIcons();
    }

    addPolygon(data, target, titleTag) {
        //console.log("geolib: addPolygon: " + target)
        let source = this.map.getSource(target)
        if (source !== undefined) {
            source.setData(data);       // 2回目以降の呼び出しはデータ設定のみ
        } else if (Conf.osm[target] !== undefined) {
            let exp = Conf.osm[target].expression;
            let zoom = Conf.poiView.poiZoom[target]
            this.map.addSource(target, { "type": "geojson", "data": data });
            this.map.addLayer({
                'id': target + "-lines", 'type': 'line', 'source': target,
                'layout': { 'line-cap': 'round', 'line-join': 'round' },
                'paint': { 'line-color': exp.stroke, 'line-width': exp["stroke-width"], 'line-opacity': exp["fill-opacity"] }
            });
            if (zoom !== undefined) this.map.setLayerZoomRange(target + '-lines', zoom, 23);

            if (Conf.map.textSize > 0) {        // fontsizeが0より上の場合
                mapLibre.map.addLayer({
                    id: target + "-text", type: 'symbol', source: target,
                    layout: {
                        "text-field": titleTag,             // 指定されたルールに沿う
                        "text-font": Conf.map.textFont,     // 使用可能なフォント（spriteに依存）
                        "text-size": Conf.map.textSize,
                        "text-anchor": "center",            // テキストの位置（上、中央、下など）
                        'symbol-placement': 'point', 'symbol-sort-key': 1,
                        'text-allow-overlap': true, 'text-ignore-placement': true,
                        'text-offset': [0, 1]
                    },
                    paint: { "text-color": "#000000", "text-halo-color": "#ffffff", "text-halo-width": 2 }
                })
                if (zoom !== undefined) this.map.setLayerZoomRange(target + '-text', zoom, 23)
            }

            let icon = Conf.osm[target].expression.imageIcon
            let size = Conf.osm[target].expression.imageSize
            if (icon !== undefined) {
                mapLibre.map.addLayer({
                    id: target + "-icon", type: 'symbol', source: target, minzoom: 12,
                    layout: {
                        'icon-anchor': 'top-left',
                        'symbol-placement': 'point', 'symbol-sort-key': 0, "icon-offset": [-80, -50],
                        'icon-allow-overlap': true, 'icon-ignore-placement': true,
                        'icon-image': icon, 'icon-size': size == undefined ? 1 : size,
                    }
                })
            }

            this.map.addLayer({
                'id': target + "-fills", 'type': 'fill', 'source': target, 'filter': ['==', '$type', 'Polygon'],
                'paint': { 'fill-color': exp.stroke, 'fill-opacity': exp["fill-opacity"] }
            });
            if (zoom !== undefined) this.map.setLayerZoomRange(target + '-fills', zoom, 23)
            if (!exp.poiView) {         // アイコン非表示のポイントはCircle表示
                this.map.addLayer({
                    id: target + '-points', type: 'circle', source: target,
                    filter: ['==', '$type', 'Point'], // ★ポイントだけ抽出
                    minzoom: 12,
                    paint: {
                        'circle-radius': [
                            'interpolate', ['linear'], ['zoom'],
                            12, exp["stroke-width"] / 2,
                            16, exp["stroke-width"],
                            20, exp["stroke-width"] * 2
                        ],
                        'circle-color': exp.stroke,
                        'circle-opacity': exp["fill-opacity"]
                    }
                });
                if (zoom !== undefined) this.map.setLayerZoomRange(target + '-points', zoom, 23);
            }
        }
    }
}
