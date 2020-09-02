// ==UserScript==
// @name         Elimination filter
// @namespace    site.elim2019
// @version      0.0.1
// @updateURL    https://raw.githubusercontent.com/TotallyNot/elim2020/master/elim2020.user.js
// @description  Filter the elimination team lists using user defined conditions.
// @author       Pyrit[2111649]
// @match        https://www.torn.com/*
// @match        https://elim2019.site/index*
// @match        http://localhost:8080/index*
// @grant        GM.xmlHttpRequest
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.info
// @connect      elim2019.site
// @connect      localhost
// @run-at       document-end
// ==/UserScript==

// {{{ convenience functions

// GM.setValue("state", "{}");

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

function reducer(update) {
    state = { ...state, ...update };
    console.debug(state, update);
    listeners.forEach((listener) => listener.handler(state));
}

function shallowCompare(newObj, prevObj) {
    if (Object.keys(newObj).count !== Object.keys(prevObj).count) return false;

    if (Object.keys(newObj).length === 0) return true;

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

class memoListener {
    constructor(propKeys, body) {
        this.propKeys = propKeys;
        this.body = body;
    }

    handler(state) {
        const props = pick(state, this.propKeys);

        if (this.prevProps && shallowCompare(props, this.prevProps)) return;

        this.prevProps = props;
        this.body(props);
    }
}

// hydrate state...
GM.getValue("state").then((value) => {
    const state = value ? JSON.parse(value) : {};
    state.hydrated = true;
    reducer(state);
});

const storageListener = new memoListener(["token", "toggled"], (props) =>
    GM.setValue("state", JSON.stringify(props))
);
listeners.push(storageListener);

// }}}

// {{{ website

if (
    location.hostname === "elim2019.site" ||
    location.hostname === "localhost"
) {
    const dataIn = document.querySelector("#userscript-out");
    const observer = new MutationObserver(() => {
        const token = JSON.parse(dataIn.innerText);
        if (token !== "") reducer({ token });
    });
    observer.observe(dataIn, {
        subtree: true,
        childList: true,
        characterData: true,
    });

    const tokenListener = new memoListener(
        ["hydrated", "token", "valid"],
        ({ hydrated, token, valid }) => {
            if (!hydrated || valid === undefined) return;

            const dataOut = document.querySelector("#userscript-in");

            dataOut.innerText = JSON.stringify({
                version: GM.info.script.version,
                linked: token && valid,
            });
        }
    );

    listeners.push(tokenListener);
}

// }}}

// {{{ Torn

if (location.hostname === "www.torn.com") {
    const styles = document.createElement("style");
    styles.innerHTML = `
#elim-mount-point {
    display: flex;
    padding-left: 20px;
}
.elim-container {
    border: 1px solid #808080;
    border-radius: 5px;
    background-color: #404040;
    padding: 8px 15px 8px 15px;
    color: white;
    display: flex;
    flex-direction: row;
    align-items: center;
    font-size: 15px;
    margin-bottom: 15px;
    flex: 1;
}
.elim-status {
    flex-grow: 1;
}
.elim-status a {
    color: #00bcd4;
}
.elim-status a:hover {
    color: #078191;
}
.elim-label {
    display: flex;
    align-items: center;
}
#elim-toggle {
    margin-left: 5px;
}
.elim-success {
    color: rgb(183, 223, 185);
}
.elim-warning {
    color: rgb(255, 213, 153);
}
.elim-error {
    color: rgb(244, 67, 54);
}
.elim-button {
    padding: 0 7px 0 7px;
    border: solid 1px rgb(128, 128, 128);
    border-radius: 2px;
    color: #fff;
    margin-left: 15px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
}
.elim-button:hover {
    color: rgb(7, 129, 145);
    border-color: rgb(7, 129, 145);
}
.elim-button > svg {
    line-height: 1;
}
.elim-button > span {
    font-size: 15px;
    margin: 2px 0 3px 7px;
}
    `;

    document.querySelector("head").appendChild(styles);

    const infoWidget = new memoListener(
        ["token", "toggled", "valid", "filters"],
        ({ token, toggled, valid, filters }) => {
            let mountPoint = document.querySelector("#elim-mount-point");
            if (mountPoint === null) {
                mountPoint = document.createElement("div");
                mountPoint.id = "elim-mount-point";

                const sidebar = document.querySelector("#sidebarroot");
                sidebar.insertAdjacentElement("afterend", mountPoint);
            }

            let content = undefined;
            if (!token) {
                content = `<span class="elim-error">Please link the script to your account by visiting the settings.</span>`;
            } else if (valid === undefined) {
                content = "";
            } else if (!valid) {
                content = `<span class="elim-error">Your token expired. Please visit the settings to refresh it.</span>`;
            } else if (!filters) {
                content = `<span class="elim-warning">You haven't selected any filters.</span>`;
            } else if (toggled) {
                content = `<span class="elim-success">ACTIVE</span>`;
            } else {
                content = `<span class="elim-warning">PAUSED</span>`;
            }

            mountPoint.innerHTML = `
<div class="elim-container">
    <p class="elim-status">Elimination Filter: ${content}</p>
    ${
        valid && filters
            ? `<label class="elim-label" for="elim-toggle">
        Toggle: <input id="elim-toggle" type="checkbox"${
            toggled ? " checked" : ""
        }>
    </label>`
            : ""
    }
    <a href="https://elim2019.site/index" target="_blank" class="elim-button">
        <svg style="width:15px;height:15px" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" />
        </svg>
        <span>Settings</span>
    </a>
</div>`;

            if (valid && filters)
                mountPoint.querySelector("#elim-toggle").onchange = () =>
                    reducer({ toggled: !toggled });
        }
    );
    listeners.push(infoWidget);
}

// }}}

// {{{ common

const tokenListener = new memoListener(
    ["token"],
    ({ token }) =>
        token &&
        gmFetch("http://localhost:8080/api/elimination/status", {
            headers: {
                authorization: `Bearer ${state.token}`,
            },
        })
            .then((response) => {
                if (response.ok) {
                    return response.json().then(reducer);
                } else {
                    return response
                        .json()
                        .then((json) => reducer({ error: json.reason }));
                }
            })
            .catch(() => reducer({ error: "unknown error" }))
);
listeners.push(tokenListener);

// }}}

// vim: fdm=marker
