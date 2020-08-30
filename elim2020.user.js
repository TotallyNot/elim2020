// ==UserScript==
// @name         Elimination filter
// @namespace    site.elim2019
// @version      0.0.0
// @updateURL    https://raw.githubusercontent.com/TotallyNot/elim2020/master/elim2020.user.js
// @description  Filter the elimination team lists using user defined conditions.
// @author       Pyrit[2111649]
// @match        https://www.torn.com/competition.php*
// @match        https://elim2019.site/index*
// @match        http://localhost:8080/index*
// @grant        GM.xmlHttpRequest
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.info
// @connect      elim2019.site
// @run-at       document-end
// ==/UserScript==

// {{{ convenience functions

function gmFetch(url, config) {
    return new Promise((resolve) => {
        GM.xmlHttpRequest({
            url,
            method: config?.method,
            headers: config?.headers,
            body: config?.data,
            onload: (response) =>
                resolve(
                    new Response(response.response, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: Object.fromEntries(
                            response.responseHeaders
                                .split("\n")
                                .filter((header) => header !== "")
                                .map((header) =>
                                    header.split(/: (.+)/).slice(0, 2)
                                )
                        ),
                    })
                ),
        });
    });
}

// }}}

// {{{ state management

let state = {
    hydrated: false,
};
const listeners = [];

function reducer(action) {
    state = { ...state, ...action };
    console.debug(state, action);
    listeners.forEach((listener) => listener(state));
}

function shallowCompare(newObj, prevObj) {
    for (const key in newObj) {
        if (newObj[key] !== prevObj[key]) return false;
    }
    return true;
}

function pick(object, keys) {
    return Object.fromEntries(
        Object.entries(object).filter(([key]) => keys.includes(key))
    );
}

function memoListener(propKeys, body) {
    return function (state) {
        const props = pick(state, propKeys);

        if (this.prevProps && shallowCompare(props, this.prevProps)) return;

        this.prevProps = props;
        body(props);
    };
}

// hydrate state...
GM.getValue("state").then((value) => {
    const state = value ? JSON.parse(value) : {};
    state.hydrated = true;
    reducer(state);
});

const storageListener = memoListener(["token"], (props) =>
    GM.setValue("state", JSON.stringify(props))
);

//}}}

// {{{ website

if (
    location.hostname === "elim2019.site" ||
    location.hostname === "localhost"
) {
    const tokenListener = memoListener(["hydrated"], ({ hydrated }) => {
        if (!hydrated) return;

        const dataIn = document.querySelector("#userscript-out");
        const dataOut = document.querySelector("#userscript-in");

        const observer = new MutationObserver(() => {
            const token = JSON.parse(dataIn.innerText);
            if (token !== "") reducer({ token });
        });
        observer.observe(dataIn, {
            subtree: true,
            childList: true,
            characterData: true,
        });

        dataOut.innerText = JSON.stringify({
            version: GM.info.script.version,
            linked: state.token !== undefined,
        });
    });

    listeners.push(tokenListener);
}

// }}}

// {{{ DOM interaction

// }}}

// vim: fdm=marker
