// loader_module_fast_v2.js
(async () => {
    const manifestUrl = new URL("./manifest.json", import.meta.url);

    // no-cache は毎回 manifest を取りに行くので、通常は避ける。
    // 更新反映を確実にしたい場合は loader_module_fast_v2.js?ver=20260429 のように
    // HTML側でクエリ文字列を付ける方が扱いやすい。
    const res = await fetch(manifestUrl);
    if (!res.ok) throw new Error(`manifest load failed: ${res.status}`);

    const manifest = await res.json();
    const {
        styles = [],
        scripts = [],
        scriptGroups = [],
        gId = "",
        gaCookieDomain = ""
    } = manifest;

    const trimNonEmpty = (items) =>
        (items || []).map(v => String(v).trim()).filter(Boolean);

    function loadStyle(href) {
        return new Promise((resolve, reject) => {
            const url = href.trim();
            if (!url) return resolve();

            // 二重読み込み防止
            if (document.querySelector(`link[rel="stylesheet"][href="${CSS.escape(url)}"]`)) {
                return resolve();
            }

            const l = document.createElement("link");
            l.rel = "stylesheet";
            l.href = url;
            l.crossOrigin = "anonymous";
            l.onload = resolve;
            l.onerror = () => reject(new Error(`Failed to load stylesheet: ${url}`));
            document.head.appendChild(l);
        });
    }

    function loadScript(src, { ordered = false } = {}) {
        return new Promise((resolve, reject) => {
            const url = src.trim();
            if (!url) return resolve();

            // 二重読み込み防止
            if (document.querySelector(`script[src="${CSS.escape(url)}"]`)) {
                return resolve();
            }

            const s = document.createElement("script");
            s.src = url;

            // 動的追加 script は async 扱いになりやすい。
            // 依存順を維持したいものは async=false にしておく。
            s.async = !ordered;
            s.defer = true;

            s.onload = resolve;
            s.onerror = () => reject(new Error(`Failed to load script: ${url}`));
            document.head.appendChild(s);
        });
    }

    // CSSは並列ロード。ただし、CSSの読み込み完了を待つと初期化が安定する。
    await Promise.all(trimNonEmpty(styles).map(loadStyle));

    // 後方互換: scriptGroups が無い場合は従来通り scripts を順番に読む。
    if (scriptGroups.length === 0) {
        for (const src of trimNonEmpty(scripts)) {
            await loadScript(src, { ordered: true });
        }
    } else {
        for (const group of scriptGroups) {
            const groupScripts = trimNonEmpty(group.scripts);
            if (group.parallel) {
                await Promise.all(groupScripts.map(src => loadScript(src, { ordered: false })));
            } else {
                for (const src of groupScripts) {
                    await loadScript(src, { ordered: true });
                }
            }
        }
    }

    // Google Analytics は本体初期化を待たせない。
    // gtag.js の URL は ?id=G-XXXX が正しい。
    if (gId) {
        window.dataLayer = window.dataLayer || [];
        window.gtag = window.gtag || function () {
            window.dataLayer.push(arguments);
        };

        window.gtag("js", new Date());

        const gaConfig = {};
        if (gaCookieDomain) {
            gaConfig.cookie_domain = gaCookieDomain;
        }
        window.gtag("config", gId, gaConfig);

        loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gId)}`, {
            ordered: false
        }).catch(err => {
            console.warn(err);
        });
    }

    cMapMaker.init();
})();
