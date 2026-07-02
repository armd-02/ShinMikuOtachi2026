"use strict";
// OverPass Server Control(With easy cache)
class OverPassControl {
    #UseChache = true;

    constructor() {
        this.Cache = { "geojson": [], "targets": [] };   // Cache variable
        this.LLc = {};
        this.CacheZoom = 14;
        this.UseServer = 0;
        this.CacheIdxs = {};		// 連想配列にtargets内のidxを保存
        this.#UseChache = true
    }

    // キャッシュモード設定(キャッシュ無効時は)
    useCache(mode) {
        this.#UseChache = mode == false ? false : true;
        this.Cache = { "geojson": [], "targets": [] };   // Cache variable
        this.LLc = {};
        this.CacheIdxs = {};		// 連想配列にtargets内のidxを保存
        return this.#UseChache;
    }

    // Overpass APIからデータ取得
    // targets: Conf.osm内の目標 / progress: 処理中に呼び出すプログラム
    getGeojson(targets, progress) {
        return new Promise((resolve, reject) => {
            let url = this.#UseChache ? Conf.system.OverPassServer[overPassCont.UseServer] : Conf.system.NoChacheServer;
            var LL = mapLibre.get_LL()
            let CT = geoCont.ll2tile(mapLibre.getCenter(), overPassCont.CacheZoom)
            console.log("overPassCont: Check:" + CT.tileX + "." + CT.tileY)
            if (overPassCont.LLc[CT.tileX + "." + CT.tileY] !== void 0 || Conf.static.use) {
                console.log("overPassCont: Cache Hit.")       // Within Cache range
                resolve(overPassCont.Cache)
            } else {
                let query = "";
                let tileNW = geoCont.ll2tile(LL.NW, overPassCont.CacheZoom)	// 緯度経度→タイル座標(左上、右下)→緯度経度
                let tileSE = geoCont.ll2tile(LL.SE, overPassCont.CacheZoom)
                let NW = geoCont.tile2ll(tileNW, overPassCont.CacheZoom, "NW")
                let SE = geoCont.tile2ll(tileSE, overPassCont.CacheZoom, "SE")
                let maparea = "[bbox:" + SE.lat + ',' + NW.lng + ',' + NW.lat + ',' + SE.lng + "]";
                targets.forEach(key => {
                    if (Conf.osm[key] !== undefined) Conf.osm[key].overpass.forEach(val => query += val + ";")
                })
                query = `[out:json][timeout:30]${maparea};(${query});out body;>;out skel;`
                console.log("overPassCont: POST: " + url + "?data=" + query)
                const data = new URLSearchParams();
                data.set('data', query);
                this.fetchOverpass(data, (loaded) => {
                    if (progress !== undefined) progress(loaded);
                    console.log("Loaded bytes:", loaded);
                }).then(data => {
                    console.log("overPassCont: done.")
                    //geoCont.box_write(NW, SE);		// Cache View
                    for (let y = tileNW.tileY; y <= tileSE.tileY; y++) {
                        for (let x = tileNW.tileX; x <= tileSE.tileX; x++) {
                            overPassCont.LLc[x + "." + y] = true
                        }
                    }
                    if (data.elements.length == 0) { resolve(); return };
                    let osmxml = data;
                    let geojson = osmtogeojson(osmxml, { flatProperties: true });
                    overPassCont.setCache(geojson);
                    console.log("overPassCont: Cache Update");
                    resolve(overPassCont.Cache);
                }).catch(err => {
                    console.log("overPassCont: " + err);
                    overPassCont.UseServer = (overPassCont.UseServer + 1) % Conf.system.OverPassServer.length;
                    reject(err);
                });
            };
        });
    }

    getOsmIds(osmids) {
        osmids = [...new Set(osmids)];
        return new Promise((resolve, reject) => {
            let params = "(", pois = { node: "", way: "", relation: "" };
            osmids.forEach(id => {
                let query = id.split("/");
                pois[query[0]] += query[1] + ",";
            });
            Object.keys(pois).forEach(category => {
                if (pois[category] !== "") params += `${category}(id:${pois[category].slice(0, -1)});`;
            });
            const query = `[out:json][timeout:30];${params});out body;>;out skel;`;
            const url = Conf.system.OverPassServer[overPassCont.UseServer]; // ベースURLのみ

            console.log("overPassCont: POST to: " + url);
            console.log("overPassCont: query: " + query);

            const data = new URLSearchParams();
            data.set("data", query);
            fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: data })
                .then(response => {
                    if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
                    return response.json();
                })
                .then(osmxml => {
                    console.log("overPassCont: getOsmIds: done.");
                    if (!osmxml.elements || osmxml.elements.length === 0) { resolve(); return; }
                    const geojson = osmtogeojson(osmxml, { flatProperties: true });
                    overPassCont.setCache(geojson);
                    console.log("overPassCont: Cache Update");
                    resolve(overPassCont.Cache);
                })
                .catch(error => {
                    console.error("overPassCont: fetch error:", error);
                    overPassCont.UseServer = (overPassCont.UseServer + 1) % Conf.system.OverPassServer.length;
                    reject(error);
                });
        });
    }

    fetchOverpass(data, progress) {
        const url = Conf.system.OverPassServer[overPassCont.UseServer]; // ベースURLのみ
        return fetch(url, {
            method: 'POST', body: data, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }).then(response => {
            const reader = response.body.getReader();
            let receivedLength = 0;
            const chunks = [];
            const decoder = new TextDecoder("utf-8");
            return new Promise((resolve, reject) => {
                function read() {
                    reader.read().then(({ done, value }) => {
                        if (done) {
                            const full = decoder.decode(new Uint8Array(chunks.flat()));
                            try {
                                const json = JSON.parse(full);
                                resolve(json);
                            } catch (err) {
                                reject(err);
                            }
                            return;
                        }
                        receivedLength += value.length;
                        if (progress !== undefined) progress(receivedLength);
                        chunks.push(Array.from(value));
                        read();
                    }).catch(reject);
                }
                read();
            })
        })
    }

    // 指定したpropertiesがtagsに含まれるか判定
    isTagsInclude(properties, tags) {
        for (let key in properties) {
            const tagWithEqual = `${key}=${properties[key]}`	// `key=value`の形式をチェック
            const tagWithNoEqual = `${key}!=${properties[key]}`	// `key!=value`の形式をチェック
            if (tags.includes(tagWithEqual)) return true
            if (tags.includes(tagWithNoEqual)) return false
            if (tags.includes(key)) return true					// `key`のみの形式をチェック
        }
        return false;
    }

    // 指定したidがpoiCont.adataに含まれるか判定
    isIdInclude(adata, osmid) {
        if (!adata || !osmid) return false;
        if (Array.isArray(adata)) return adata.some(obj => obj.osmid === osmid);  // 配列の場合
        if (typeof adata === "object" && adata.osmid) return adata.osmid === osmid;  // 単一オブジェクトの場合
        return false;
    }

    // tagsを元にキャッシュセット
    setCache(geojson) {
        if (!Array.isArray(geojson.features) || geojson.features.length === 0) return;
        const features = geojson.features;		// アイコン重なり回避のオフセット追加なし
        const osmkeys = Object.keys(Conf.osm).filter(k => Conf.osm[k].file == undefined);

        // id 正規化（feature.id / properties.id を必ず揃える）
        for (const f of features) {
            if (!f || !f.properties) continue;
            const id = f.properties.id ?? f.id;
            if (id != null) {
                f.properties.id = f.properties.id ?? id;
                f.id = f.id ?? id;
            }
        }

        // 既存キャッシュ index を整合
        this.#rebuildCacheIndex();
        for (const f of features) {
            if (!f || !f.properties) continue;
            const id = f.properties.id;
            if (id == null) continue;
            const key = String(id);
            const hitTargets = [];            // 対象 target 抽出
            for (const t of osmkeys) {
                if (this.isTagsInclude(f.properties, Conf.osm[t].tags)) hitTargets.push(t);
            }
            if (hitTargets.length === 0) continue;

            const isActive = this.isIdInclude(poiCont.adata, id);
            let idx = this.CacheIdxs[key];

            if (idx == null) {
                // 新規
                const targets = isActive ? [...hitTargets, "activity"] : [...hitTargets];
                this.Cache.geojson.push(f);
                this.Cache.targets.push([...new Set(targets)]);
                this.CacheIdxs[key] = this.Cache.geojson.length - 1;
            } else {
                // 既存
                const merged = new Set(this.Cache.targets[idx] ?? []);
                hitTargets.forEach(t => merged.add(t));
                if (isActive) merged.add("activity");
                this.Cache.targets[idx] = Array.from(merged);
            }
        }
        this.#compactCache();        // 穴あき除去 + CacheIdxs 再構築
    }

    // 穴あき除去・targets未定義除去・CacheIdxs再構築
    #compactCache() {
        const newGeo = [];
        const newTgt = [];
        const newIdx = {};

        for (let i = 0; i < this.Cache.geojson.length; i++) {
            const f = this.Cache.geojson[i];
            const t = this.Cache.targets[i];

            if (!f || !f.properties) continue;
            if (!Array.isArray(t) || t.length === 0) continue;

            const id = f.properties.id ?? f.id;
            if (id == null) continue;

            f.properties.id = f.properties.id ?? id;
            f.id = f.id ?? id;

            const idx = newGeo.length;
            newGeo.push(f);
            newTgt.push([...new Set(t)]);
            newIdx[String(id)] = idx;
        }
        this.Cache.geojson = newGeo;
        this.Cache.targets = newTgt;
        this.CacheIdxs = newIdx;
    }

    // CacheIdxs だけを既存キャッシュから再構築
    #rebuildCacheIndex() {
        const idx = {};
        for (let i = 0; i < this.Cache.geojson.length; i++) {
            const f = this.Cache.geojson[i];
            if (!f || !f.properties) continue;
            const id = f.properties.id ?? f.id;
            if (id == null) continue;
            f.properties.id = f.properties.id ?? id;
            f.id = f.id ?? id;
            idx[String(id)] = i;
        }
        this.CacheIdxs = idx;
    }

    getTarget(ovanswer, target) {
        let geojson = ovanswer.geojson.filter(function (val, gidx) {
            let found = false
            for (let tidx in ovanswer.targets[gidx]) {
                if (ovanswer.targets[gidx][tidx] == target) { found = true; break }
            };
            return found
        });
        return geojson
    }

    setOsmJson(osmjson) {		// set Static osmjson
        let geojson = osmtogeojson(osmjson, { flatProperties: true });
        overPassCont.setCache(geojson);
        return overPassCont.Cache;
    }

}
