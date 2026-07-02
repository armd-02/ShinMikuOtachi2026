/*	Main Process */
"use strict";

// Global Variable
var Conf = {}; // Config Praams
const LANG = (window.navigator.userLanguage || window.navigator.language || window.navigator.browserLanguage).substr(0, 2) == "ja" ? "ja" : "en";
const glot = new Glottologist();
const modalActs = new Activities();
const osmBasic = new OSMbasic();
const basic = new Basic();
const poiStatusCont = new PoiStatusCont();
const overPassCont = new OverPassControl();
const mapLibre = new Maplibre();
const geoCont = new GeoCont();
const listTable = new ListTable();
const poiCont = new PoiCont();
const gSheet = new GoogleSpreadSheet();
const wikimedia = new WikimediaLib();
var PoiStatusIndex = { VISITED: 0, FAVORITE: 1, MEMO: 2 };
var PoiStatusCsvIndex = { KEY: 0, CATEGORY: 1, NAME: 2, VISITED: 3, FAVORITE: 4, MEMO: 5 };
var PoiStatusCsvIndexOld = { KEY: 0, CATEGORY: 1, NAME: 2, VISITED: 3, MEMO: 4 };

class CMapMaker {

    constructor() {
        this.status = "initialize";         // 状態フラグ / initialize changeMode normal playback
        this.mode = "map";
        this.moveMapBusy = false;
        this.changeKeywordWaitTime;
        this.scrollHints = 0;
        this.favoriteFilter = null;
        this.visitedFilterStatus = null;
        this.openOSMid = null;
    }

    init() {        // initialize
        console.log("Welcome to Community Map Maker.");
        console.log("initialize: Start.");
        const FILES = [
            "./baselist.html", "./data/config-user.jsonc", "./data/config-system.jsonc",
            "./data/config-activities.jsonc", `./data/marker.jsonc`,
            `./data/category-${LANG}.jsonc`, `./data/listtable.jsonc`,
            "./data/overpass-system.jsonc", `./data/overpass-custom.jsonc`,
            `./data/glot-custom.jsonc`, `./data/glot-system.jsonc`,
        ];
        const fetchUrls = FILES.map((url) => fetch(url).then((res) => res.text()));
        const setUrlParams = function () {  // URLから引数を取得して返す関数
            let keyValue = {};
            let search = location.search.replace(/[?&]fbclid.*/, "").replace(/%2F/g, "/").slice(1); // facebook対策
            search = search.slice(-1) == "/" ? search.slice(0, -1) : search; // facebook対策(/が挿入される)
            let params = search.split("&"); // -= -> / and split param
            history.replaceState("", "", location.pathname + "?" + search + location.hash); // fixURL
            for (const param of params) {
                let delimiter = param.includes("=") ? "=" : "/";
                let keyv = param.split(delimiter);
                keyValue[keyv[0]] = keyv[1];
            }
            return keyValue;
        }
        const loadStatic = function () {
            return new Promise((resolve, reject) => {
                if (!Conf.static.use) {
                    resolve();
                } else {
                    console.log("cMapMaker: Static mode");
                    const fetchUrls = Conf.static.osmjsons.map((url) => fetch(url).then((res) => res.text()));
                    Promise.all(fetchUrls).then((datas) => {
                        datas.forEach(data => {
                            let json = JSON5.parse(data)
                            let ovanswer = overPassCont.setOsmJson(json);
                            poiCont.addGeojson(ovanswer);
                        })
                        poiCont.setActlnglat();
                        console.log("cMapMaker: Static load done.");
                        resolve();
                    })
                }
            })
        }
        const setBGImage = function (imgUrl) {  // basemenuの背景画像設定
            const test = new Image();
            test.onload = () => document.body.style.setProperty("--bg-url", `url(${imgUrl})`);
            test.onerror = () => document.body.style.setProperty("--bg-url", "none");
            test.src = imgUrl;
        }

        Promise.all(fetchUrls)
            .then((texts) => {
                let basehtml = texts[0]; // Get Menu HTML
                for (let i = 1; i <= 7; i++) {
                    Conf = Object.assign(Conf, JSON5.parse(texts[i]));
                }
                Conf.osm = Object.assign(Conf.osm, JSON5.parse(texts[8]).osm);
                Conf.category_keys = Object.keys(Conf.category); // Make Conf.category_keys
                Conf.category_subkeys = Object.keys(Conf.category_sub); // Make Conf.category_subkeys
                glot.data = Object.assign(glot.data, JSON5.parse(texts[9])); // import glot data
                glot.data = Object.assign(glot.data, JSON5.parse(texts[10])); // import glot data
                let UrlParams = setUrlParams();
                if (UrlParams.edit) Conf.etc["editMode"] = true;
                if (UrlParams.static) Conf.static["mode"] = basic.parseBoolean(UrlParams.static);

                winCont.viewSplash(true);
                listTable.init();
                poiCont.init(Conf.minimap.use);

                Promise.all([
                    gSheet.get(Conf.google.AppScript),
                    mapLibre.init(Conf), // get_zoomなどMapLibreの情報が必要なためMapLibre.init後に実行
                ]).then((results) => {
                    // MapLibre add control
                    console.log("initialize: gSheet, static, MapLibre OK.");
                    mapLibre.addControl("top-left", "baselist", basehtml, "mapLibre-control m-0 p-0"); // Make: base list
                    setBGImage(Conf.listTable.backgroundImage)
                    if (Conf.etc.localSave !== "") filter_menu.classList.remove('d-none')
                    mapLibre.addNavigation("bottom-right");
                    if (Conf.map.changeMap) mapLibre.addControl("bottom-right", "maplist", "<button onclick='cMapMaker.changeMap()'><i class='fas fa-layer-group fa-lg'></i></button>", "maplibregl-ctrl-group");
                    mapLibre.addControl("bottom-left", "images", "", "showcase"); // add images
                    mapLibre.addControl("bottom-left", "globalStatus", "", "vw-100 d-flex align-items-center justify-content-center gap-2");
                    globalStatus.innerHTML = '<div id="globalSpinner" class="spinner-border text-primary d-none"></div><span id="globalMessage" class="globalMessage"></span>';
                    winCont.playback(Conf.listTable.playback.view); // playback control view:true/false
                    winCont.download(Conf.listTable.download); // download view:true/false
                    cMapMaker.changeMode("list");
                    winCont.showMessage(Conf.tile[mapLibre.selectStyle].name);
                    const mergedMenu = [...Conf.menu.main, ...Conf.menu.mainSystem];
                    winCont.menu_make(mergedMenu, "main_menu");
                    winCont.mouseDragScroll(images, cMapMaker.eventViewThumb); // set Drag Scroll on images
                    glot.render()
                    list_keyword.setAttribute("placeholder", glot.get("searchKeyword"));
                    listTitle.innerHTML = glot.get("listTitle");
                    window.onresize = winCont.resizeWindow; // 画面サイズに合わせたコンテンツ表示切り替え
                    // document.title = glot.get("site_title"); // Google検索のインデックス反映が読めないので一旦なし
                    winCont.setSidebar(Conf.sideBar.initView) // サイドバーの初期表示設定
                    cMapMaker.clearDatail() // 詳細モーダルの内容をクリア
                    this.changeMode("map");
                    
                    const init_close = function () {
                        let cat = (UrlParams.category !== "" && UrlParams.category !== undefined) ? UrlParams.category : Conf.selectItem.default;
                        cat = decodeURI(cat);
                        cMapMaker.updateView(cat).then(() => {     // 初期データロード
                            mapLibre.addCountryFlagsImage(poiCont.getAllOSMCountryCode())
                            cMapMaker.addEvents()
                            winCont.viewSplash(false)
                            winCont.resizeWindow()
                            article.classList.remove("d-none")
                            setTimeout(() => { cMapMaker.eventMoveMap() }, 300) // 本来なら不要だがfirefoxだとタイミングの関係で必要
                            if (UrlParams.node || UrlParams.way || UrlParams.relation) {
                                let keyv = Object.entries(UrlParams).find(([key, value]) => value !== undefined)
                                let param = keyv[0] + "/" + keyv[1]
                                let subparam = param.split(".") // split child elements(.)
                                let osmdata = poiCont.get_osmid(subparam[0])
                                let geojson = osmdata !== undefined ? osmdata.geojson : undefined
                                if (osmdata !== undefined) {
                                    cMapMaker.viewDetail(subparam[0], subparam[1])
                                        .then(() => {
                                            geoCont.flashPolygon(geojson)
                                            geoCont.writePoiCircle(geojson)
                                        })
                                        .catch((e) => {
                                            console.warn("cMapMaker.init: viewDetail failed", e);
                                        });
                                } else {
                                    console.warn("cMapMaker.init: No OSM data found for ID:", subparam[0]);
                                }
                            }
                        })
                    }

                    poiCont.setActdata(results[0]); // gSheetをPoiContにセット(座標は無いのでOSM読み込み時にマッチング)
                    if (Conf.poiView.poiActLoad) {
                        let osmids = poiCont.pois().acts.map((act) => { return act.osmid; });
                        osmids = osmids.filter(Boolean);
                        if (osmids.length > 0 && !Conf.static.use) {   // osmidsがある&非static時
                            basic.retry(() => overPassCont.getOsmIds(osmids), 5).then((geojson) => {
                                poiCont.addGeojson(geojson)
                                poiCont.setActlnglat()
                                init_close();
                            });
                        } else {    // static時
                            loadStatic().then(() => {
                                poiCont.setActlnglat()
                                init_close()
                            })
                        }
                    } else if (Conf.static.use) {       // actLoadしない&Static時
                        loadStatic().then(() => init_close())
                    } else {
                        init_close()
                    }
                }).catch((e) => {
                    console.error("cMapMaker.init: gSheet or MapLibre init failed", e);
                    winCont?.viewSplash?.(false);
                });
            }).catch((e) => {
                console.error("cMapMaker.init: initial file load failed", e);
                winCont?.viewSplash?.(false);
            });
    }

    addEvents() {
        mapLibre.on('moveend', this.eventMoveMap.bind(cMapMaker))   		// マップ移動時の処理
        mapLibre.on('zoomend', this.eventZoomMap.bind(cMapMaker))			// ズーム終了時に表示更新
        list_category.addEventListener('change', this.eventChangeCategory.bind(cMapMaker))	// category change
    }

    // about Map
    about() {
        let msg = glot.get("about_message");
        msg = msg.replace(/\n/g, "<br>")  // 改行コードを<br>に変換
        msg = "<span class=`fs-5`>" + msg + "</span>"
        mapLibre.viewMiniMap(false)
        winCont.makeDetail({ "title": glot.get("about"), "message": msg, "mode": "close", "menu": false })
        cMapMaker.changeMode("map")
        winCont.setSidebar("view")
    }

    // About license
    licence() {
        let msg = glot.get("licence_message") + glot.get("more_message");
        msg = msg.replace(/\n/g, "<br>")  // 改行コードを<br>に変換
        msg = "<span class=`fs-5`>" + msg + "</span>"
        mapLibre.viewMiniMap(false)
        winCont.makeDetail({ "title": glot.get("licence_title"), "message": msg, "mode": "close", "menu": false });
        cMapMaker.changeMode("map")
        winCont.setSidebar("view")
    }

    changeMode(newmode) {	// mode change(list or map or edit)
        this.mode = newmode ? newmode : (this.mode == "map" ? "list" : "map");
        basic.openAccordion(!["map", "edit"].includes(this.mode) ? "listAccordion" : "detailArea")	// アコーディオン切り替え
        basic.closeAccordion(["map", "edit"].includes(this.mode) ? "listAccordion" : "detailArea")	// アコーディオン切り替え
        if (this.mode == "list") {
            geoCont.writePoiCircle()
            cMapMaker.clearDatail()
        }
        closeDetail.classList.toggle("d-none", this.mode == "list") // 詳細モーダルの閉じるボタンを非表示
    }

    changeMap() {	// Change Map Style(rotation)
        let styleName = mapLibre.changeMap()
        winCont.showMessage(Conf.tile[styleName].name);
        setTimeout(() => {
            this.eventMoveMap()
            let snow = styleName.indexOf("SNOW") > -1;      // SNOWの文字列があれば雪を降らす
            winCont.fallsSnow(snow)
        }, 1000)
    }

    // OverPassキャッシュモード設定
    setCacheMode(mode) {
        let UseCache = overPassCont.useCache(mode)
        globalMessage.innerHTML = glot.get(UseCache ? "UseOVCacheYes" : "UseOVCacheNo");
        setTimeout(() => { globalMessage.innerHTML = "" }, 4000)
    }

    setVisitedFilter(visitedFilterStatus) {
        console.log(`cMapMaker: setVisitedFilter: ${visitedFilterStatus}`);
        this.visitedFilterStatus = visitedFilterStatus;
        this.updateView();
    }

    toggleFavoriteFilter(checked) {
        console.log(`cMapMaker: toggleFavoriteFilter: ${checked}`);
        this.favoriteFilter = checked;
        this.updateView();
    }

    viewArea() {			// Area(敷地など)を表示させる refタグがあれば()表記
        let targets = poiCont.getTargets()  //
        console.log("viewArea: " + targets.join())
        targets.forEach((target) => {
            let osmConf = Conf.osm[target] == undefined ? { expression: { viewArea: true } } : Conf.osm[target]
            if (osmConf.expression.viewArea) {   // viewArea: trueが対象
                let pois = poiCont.getPois(target, false)
                let titleTag = "";
                if (!osmConf.expression.poiView) {  // poiViewがfalseの時(true時はpoiView側で表示するため)
                    titleTag = ["format", ["case", ["all", ["has", "ref"], ["!=", ["get", "ref"], ""]],
                        ["case", ["has", "local_ref"],
                            ["concat", "(", ["get", "ref"], "/", ["get", "local_ref"], ") ", ["coalesce", ["get", "name"], ""]],
                            ["concat", "(", ["get", "ref"], ") ", ["coalesce", ["get", "name"], ""]]
                        ], ["coalesce", ["get", "name"], ""]
                    ], {}];
                }
                mapLibre.addPolygon({ "type": "FeatureCollection", "features": pois.geojson }, target, titleTag)
            }
        })
    }

    viewPoi(targets) {		// Poiを表示させる
        let nowselect = listTable.getSelCategory()          // tags,key=valueの複数値
        nowselect = nowselect[0] == "" ? "-" : nowselect[nowselect.length - 1]
        //console.log(`viewPoi: Start(now select ${nowselect}).`)
        targets = targets[0] == "-" || targets[0] == "" ? poiCont.getTargets() : targets;		// '-' or ''はすべて表示
        targets = targets.filter(target => {                                                    // poiView=trueのみ返す
            return Conf.osm[target] !== undefined ? Conf.osm[target].expression.poiView : false;
        })
        targets = Object.keys(Conf.poiView.poiZoom).indexOf("activity") > -1 ? targets.concat("activity") : targets;
        targets = Conf.etc.editMode ? targets.concat(Object.keys(Conf.poiView.editZoom)) : targets	// 編集時はeditZoom追加
        targets = [...new Set(targets)];    // 重複削除
        //poiCont.setPoi(listTable.getFilterList(), false)

        let subcategory = poiCont.getTargets().indexOf(nowselect) > -1 || nowselect == "-" ? false : true;	// サブカテゴリ選択時はtrue
        if (subcategory) {	// targets 内に選択肢が含まれていない場合（サブカテゴリ選択時）
            poiCont.setPoi(listTable.getFilterList(), false)
        } else {			// targets 内に選択肢が含まれている場合
            let nowzoom = mapLibre.getZoom(false)
            //targets = targets.filter(target => target !== "activity");  // activiyがあれば削除 // 2025/08/20 一旦false
            targets = targets.filter(s => s !== "");
            if (nowselect = "-") {
                poiCont.setPoi(listTable.getFilterList(), false) //nowselect == Conf.google.targetName) // 2025/08/20 一旦false
            } else {
                for (let target of targets) {
                    console.log("viewPoi: " + target)
                    let poiView = Conf.google.targetName == target ? true : Conf.osm[target].expression.poiView	// activity以外はexp.poiViewを利用
                    let flag = nowzoom >= Conf.poiView.poiZoom[target] || (Conf.etc.editMode && nowzoom >= Conf.poiView.editZoom[target])
                    if ((target == nowselect) && flag && poiView) {	// 選択している種別の場合
                        poiCont.setPoi(listTable.getFilterList(), false) // target == Conf.google.targetName) // 2025/08/20 一旦false
                        break
                    }
                }
            }
        }
    }

    // 画面内のActivity画像を表示させる(view: true=表示)
    makeImages(view) {
        if (view) {
            let acts = []
            let rows = listTable.getFilterList()
            rows.forEach(row => {
                let act = poiCont.get_actid(row[0])
                if (act !== undefined) {
                    let urls = []
                    let actname = act.id.split("/")[0]
                    if (Conf.activities[actname] !== undefined) {
                        let forms = Conf.activities[actname].form
                        for (const key of Object.keys(forms)) { // 複数あっても一つだけとする
                            if (forms[key].type === "image_url") { urls.push(act[key]); break }
                        }
                    } else {
                        console.warn("cMapmaker.makeImage: No Activity Name");
                    }
                    acts.push({ "src": urls, "osmid": act.osmid, "title": act.title })
                }
            })
            if (acts.length > 0) {
                images.classList.remove("d-none");
                winCont.setImages(images, acts, Conf.etc.loadingUrl, Conf.thumbnail.limits)
                if (this.scrollHints == 0) winCont.scrollHint(); this.scrollHints++;
            } else {
                images.classList.add("d-none");
            }
        } else {
            images.classList.add("d-none");
        }
    }

    // OSMとGoogle SpreadSheetからPoiを取得してリスト化
    updateOsmPoi(targets) {
        return new Promise((resolve) => {
            console.log("cMapMaker: updateOsmPoi: Start");
            winCont.spinner(true);
            var keys = (targets !== undefined && targets !== "") ? targets : poiCont.getTargets();
            let PoiLoadZoom = 99;
            for (let [key, value] of Object.entries(Conf.poiView.poiZoom)) {
                if (key !== Conf.google.targetName) PoiLoadZoom = value < PoiLoadZoom ? value : PoiLoadZoom;
            };
            if (Conf.etc.editMode) {
                for (let [key, value] of Object.entries(Conf.poiView.editZoom)) {
                    if (key !== Conf.google.targetName) PoiLoadZoom = value < PoiLoadZoom ? value : PoiLoadZoom;
                }
            }
            if ((mapLibre.getZoom(true) < PoiLoadZoom)) {
                winCont.spinner(false);
                console.log("[success]cMapMaker: updateOsmPoi End(more zoom).");
                resolve({ "update": true });
            } else {
                overPassCont.getGeojson(keys, status_write).then(ovanswer => {
                    winCont.spinner(false);
                    if (ovanswer) {
                        poiCont.addGeojson(ovanswer)
                        poiCont.setActlnglat()
                    };
                    console.log("[success]cMapMaker: updateOsmPoi End.");
                    globalMessage.innerHTML = "";
                    resolve({ "update": true });
                }).catch(() => {
                    winCont.spinner(false);
                    console.log("[error]cMapMaker: updateOsmPoi end.");
                    globalMessage.innerHTML = "";
                    resolve({ "update": false });
                });
            }
        })

        function status_write(progress) {
            const message = document.createElement("div");
            message.innerHTML = "Loading... " + parseInt(progress / 1024) + "KByte";
            globalMessage.appendChild(message);
            while (globalMessage.children.length > 5) {
                globalMessage.removeChild(globalMessage.firstChild);
            }
        }
    }

    // OSMデータを取得して画面表示
    updateView(cat) {
        console.log("updateView Start.")
        return new Promise((resolve) => {
            this.updateOsmPoi().then((status) => {
                switch (status.update) {
                    case true:
                        let targets = listTable.getSelCategory();
                        targets = (targets[0] == '' && cat !== undefined) ? [cat] : targets;
                        listTable.makeSelectList(Conf.listTable.category)
                        listTable.makeList()
                        listTable.selectCategory(targets)
                        listTable.filterByPoiStatus(this.visitedFilterStatus, this.favoriteFilter);
                        if (window.getSelection) window.getSelection().removeAllRanges()
                        this.makeImages(Conf.thumbnail.use)
                        this.viewArea()	        // 入手したgeoJsonを追加
                        this.viewPoi(targets)	// in targets
                        resolve({ "update": true })
                        break
                    default:
                        console.log("updateView Error.")
                        resolve({ "update": false })
                        break
                }
            })
        })
    }

    // キーワード検索
    searchKeyword(keyword) {
        if (keyword !== null) {
            const div = document.createElement("div");             // サニタイズ処理
            div.appendChild(document.createTextNode(keyword));
            this.changeMode('list')
            setTimeout(() => { listTable.filterKeyword(div.innerHTML) }, 300)
        }
    }

    // 詳細モーダル表示
    viewDetail(osmid, openid) {	// PopUpを表示(marker,openid=actlst.id)]
        console.log("viewDatail: Start");

        return new Promise((resolve, reject) => {
            const makeFlag = (country) => {     // 旗アイコンを追加
                if (country == undefined) return ""
                let title = "", countries = country.split(";")
                countries.forEach(CCode => { title += `<img src="https://flagcdn.com/h20/${CCode.toLowerCase()}.png" class="ms-1 me-1" height="16" alt="${CCode} Flag">` })
                return title
            }

            const makeDatail = (osmid, openid) => {
                if (osmid == "" || osmid == undefined) {    // OSMIDが空の時はクリアして終了
                    cMapMaker.clearDatail()
                    geoCont.writePoiCircle()
                    resolve()
                    return
                }

                winCont.setSidebar("view").then(() => {
                    console.log("viewDatail: Get OSM Data.");
                    let osmobj = poiCont.get_osmid(osmid);
                    if (osmobj == undefined) { console.log("Error: No osmobj / ID: " + osmid); reject(); return }	// Error

                    let tags = osmobj.geojson.properties;
                    let target = osmobj.targets[0];
                    tags["*"] = "*";
                    target = target == undefined ? "*" : target;			// targetが取得出来ない実在POI対応
                    let category = poiCont.getCatnames(tags);
                    let flagsHTML = makeFlag(tags.country);
                    if (flagsHTML !== "") { // 国旗がある場合はminiMapを設定してHTML追加
                        mapLibre.addMiniMap()
                            .then(() => {
                                flags.innerHTML = flagsHTML;
                                mapLibre.showCountryByCode(tags.country);
                            })
                            .catch((e) => {
                                console.warn("cMapMaker.viewDetail: addMiniMap failed", e);
                            });
                    }

                    let title = `<img src="./${Conf.icon.fgPath}/${poiCont.getIcon(tags)}" class="ms-1 me-1" height="28">`
                    let message = "";
                    let name = poiCont.getOSMname(tags, glot.lang);
                    name = name == "" ? poiCont.getCatnames(tags)[0] : name;   // 名前がある場合は「: 名前」とする
                    title += name;

                    if (title == "") title = category[0] + category[1] !== "" ? "(" + category[1] + ")" : "";   // サブカテゴリ時は追加
                    if (title == "") title = glot.get("undefined");
                    winCont.menu_make(Conf.menu.modal, "btnMenu");
                    winCont.setProgress(0);

                    console.log("viewDatail: Make OSM Basic Info.");
                    message += osmBasic.make(tags);		// append OSM Tags(仮…テイクアウトなど判別した上で最終的には分ける)
                    if (tags.wikipedia !== undefined) {
                        message += wikimedia.makeWikipediaOverView(tags.wikipedia)
                    }

                    // append activity
                    let catname = listTable.getSelCategory() !== "-" ? `&category=${listTable.getSelCategory()}` : "";
                    let actlists = poiCont.getActlistByOsmid(osmid);
                    history.replaceState('', '', location.pathname + "?" + osmid + (!openid ? "" : "." + openid) + catname + location.hash);
                    if (actlists.length > 0) {	// アクティビティ有り
                        message += modalActs.make(actlists);
                        winCont.makeDetail({ "title": title, "message": message, "append": Conf.menu.activities, "menu": true, "openid": openid });
                    } else {					// アクティビティ無し
                        winCont.makeDetail({ "title": title, "message": message, "append": Conf.menu.activities, "menu": true, "openid": openid });
                    }
                    mapLibre.viewMiniMap(tags.country)
                    cMapMaker.changeMode("map")
                    this.detail = true
                    this.openOSMid = osmid
                    resolve()
                })
            }

            if (this.mode == "edit") {    // 編集モード時は閉じるか確認する
                winCont.confirm({
                    title: glot.get("confirmCloseTitle"),
                    message: glot.get("confirmCloseDetail"),
                    callback: (answer) => {
                        if (answer) {
                            cMapMaker.clearDatail()
                            makeDatail(osmid, openid)
                        } else {
                            console.log("viewDatail: Cancel.");
                            reject()
                        }
                    }
                });
            } else {
                makeDatail(osmid, openid)
            }
        })
    }

    clearDatail() {
        const visited = document.getElementById("visited")
        const favorite = document.getElementById("favorite")
        const memo = document.getElementById("visited-memo")
        const mmap = document.getElementById("mini-map")
        const menu = document.getElementById("btnMenu")
        const detailMenu = document.getElementById("detailMenu")
        if (Conf.etc.localSave !== "" && visited !== null) {    // 訪問機能が有効＆訪問済みチェックの場合
            poiStatusCont.setValueByOSMID(visited.name, visited.checked, favorite.checked, memo.value)
            cMapMaker.eventMoveMap()                            // アイコン表示を更新
        }
        mmap.classList.add("d-none")
        detailMenu.classList.add("d-none")

        const catname = listTable.getSelCategory() !== "-" ? `?category=${listTable.getSelCategory()}` : ""
        history.replaceState('', '', location.pathname + catname + location.hash)
        this.openOSMid = null
        this.detail = false
        btmWindow_title.innerHTML = ""
        btmWindow_message.innerHTML = ""
        return winCont.setSidebar()
    }

    shareURL(actid) {	// URL共有機能
        actid = actid == undefined ? "" : "." + actid;
        let url = location.origin + location.pathname + location.search + actid + location.hash;
        navigator.clipboard.writeText(url);
    }

    playback() {		// 指定したリストを連続再生()
        const view_control = (list, idx) => {
            if (list.length >= (idx + 1)) {
                listTable.select(list[idx][0]);
                poiCont.select(list[idx][0], false);
                if (this.status == "playback") {
                    setTimeout(view_control, speed_calc(), list, idx + 1);
                };
            } else {
                listTable.disabled(false);
                listTable.heightSet(listTable.height + "px");	// mode end
                this.status = "normal";							// mode stop
                icon_change("play");
            }
        }
        const icon_change = (mode) => { list_playback.className = 'fas fa-' + mode };
        const speed_calc = () => { return ((parseInt(list_speed.value) / 100) * Conf.listTable.playback.timer) + 100 };
        if (this.status !== "playback") {
            listTable.disabled(true);
            listTable.heightSet(listTable.height / 4 + "px");
            mapLibre.setZoom(Conf.listTable.playback.zoomLevel);
            this.changeMode("list");
            this.status = "playback";
            icon_change("stop");
            setTimeout(view_control, speed_calc(), listTable.getFilterList(), 0);
        } else {
            listTable.disabled(false);
            listTable.heightSet(listTable.height + "px");		// mode end
            this.status = "normal";								// mode stop
            icon_change("play");
        }
    }

    download() {
        const linkid = "temp_download";

        const originalLists = listTable.getFilterList();

        if (originalLists.length == 0) {
            globalMessage.innerHTML = glot.get("noDataDownload");
            setTimeout(() => { globalMessage.innerHTML = ""; }, 4000);
        } else {
            // 元データを壊さないように、行ごとコピーする
            const lists = originalLists.map((list) => [...list]);

            for (let list of lists) { list.push(...poiCont.getLnglatbyId(list[0])); }

            // ヘッダーもコピーして追加
            lists.unshift([...Conf.listTable.csvColumn]);
            const csv = basic.makeArray2CSV(lists);
            const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
            const blob = new Blob([bom, csv], { type: "text/csv" });
            const link = document.getElementById(linkid) ? document.getElementById(linkid) : document.createElement("a");
            link.id = linkid;
            link.href = URL.createObjectURL(blob);
            link.download = "my_data.csv";
            link.dataset.downloadurl = ["text/plain", link.download, link.href].join(":");
            document.body.appendChild(link);
            link.click();
            URL.revokeObjectURL(link.href);
        }
        return;
    }

    // EVENT: イメージを選択した時のイベント処理
    eventViewThumb(imgdom) {
        console.log("eventViewThumb: Start.");

        const osmid = imgdom.getAttribute("osmid");
        const poi = poiCont.get_osmid(osmid);
        const zoomlv = Math.max(mapLibre.getZoom(true), Conf.map.detailZoom);

        if (zoomlv === undefined) console.log("No " + Conf.map.detailZoom);
        if (poi === undefined) return;

        cMapMaker.viewDetail(osmid).then(() => {
            if (poi.geojson !== undefined) geoCont.flashPolygon(poi.geojson);
            mapLibre.flyTo(poi.lnglat, zoomlv);
            console.log("eventViewThumb: View OK.");
        }).catch((e) => {
            console.warn("cMapMaker.eventViewThumb: failed", e);
        })
    }

    // EVENT: map moveend発生時のイベント
    eventMoveMap() {
        if (cMapMaker.moveMapBusy || cMapMaker.status !== "normal") return;
        //console.log("eventMoveMap: Start. ");
        cMapMaker.moveMapBusy = true;

        const zoom = mapLibre.getZoom(false);
        const zoomLevels = Object.values(Conf.poiView.poiZoom);
        if (Conf.etc.editMode) zoomLevels.push(...Object.values(Conf.poiView.editZoom))
        const poizoom = zoomLevels.some(level => zoom >= level);

        if (!poizoom) {
            console.log("eventMoveMap: Cancel(Busy or MoreZoom).");
            this.makeImages(false);                             // イメージリストを非表示
            cMapMaker.moveMapBusy = false
            return;
        }
        //cMapMaker.updateView().then(() => cMapMaker.moveMapBusy = false)
        cMapMaker.updateView()
            .catch((e) => {
                console.warn("cMapMaker.eventMoveMap: updateView failed", e);
            })
            .finally(() => {
                cMapMaker.moveMapBusy = false;
            });
    }

    // EVENT: カテゴリ変更時のイベント
    eventChangeCategory() {
        let catname, selcategory = listTable.getSelCategory()
        console.log("eventChange: " + selcategory)
        switch (Conf.selectItem.action) {
            case "ChangeMap":                               // 背景地図切り替え
                mapLibre.changeMap(list_category.value)
                break;
            case "ChangePoi":
                cMapMaker.updateView()
                break;
        }
        catname = selcategory !== "-" ? `?category=${selcategory}` : ""
        history.replaceState('', '', location.pathname + catname + location.hash)
        cMapMaker.clearDatail().then(() => {
            geoCont.writePoiCircle()
            mapLibre.map.redraw()
        })

    }

    // EVENT: View Zoom Level & Status Comment
    eventZoomMap() {
        let morezoom = 0;
        for (let [key, value] of Object.entries(Conf.poiView.poiZoom)) {
            morezoom = value >= morezoom ? value : morezoom
        }
        if (Conf.etc.editMode) {
            for (let [key, value] of Object.entries(Conf.poiView.editZoom)) {
                morezoom = value >= morezoom ? value : morezoom
            }
        }
        let poizoom = mapLibre.getZoom(true) >= morezoom ? false : true
        let message = `${glot.get("zoomlevel")}${mapLibre.getZoom(true)} `
        if (poizoom) {
            message += `(${glot.get("morezoom")})`
            cMapMaker.changeMode("list")    // ズームレベルがpoi表示の閾値以下の時はリストを開く
            cMapMaker.clearDatail()         // 詳細画面を閉じる
        }
        globalMessage.innerHTML = message
    }
}
const cMapMaker = new CMapMaker();
