import e from "electron";
import t from "node:path";
import { fileURLToPath as n } from "node:url";
//#region electron/main.ts
var { app: r, BrowserWindow: i, ipcMain: a, net: o } = e, s = t.dirname(n(import.meta.url));
process.env.APP_ROOT = t.join(s, "..");
var c = process.env.VITE_DEV_SERVER_URL, l = t.join(process.env.APP_ROOT, "dist-electron"), u = t.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = c ? t.join(process.env.APP_ROOT, "public") : u;
var d;
function f() {
	d = new i({
		icon: t.join(process.env.VITE_PUBLIC || "", "electron-vite.svg"),
		webPreferences: { preload: t.join(s, "preload.mjs") }
	}), d.webContents.on("did-finish-load", () => {
		d?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
	}), c ? d.loadURL(c) : d.loadFile(t.join(u, "index.html"));
}
r.on("window-all-closed", () => {
	process.platform !== "darwin" && (r.quit(), d = null);
}), r.on("activate", () => {
	i.getAllWindows().length === 0 && f();
}), r.whenReady().then(() => {
	f(), a.handle("fetch-data", async (e, t) => {
		try {
			let e = await o.fetch(t);
			if (!e.ok) throw Error(`HTTP error! status: ${e.status}`);
			let n = await e.text();
			try {
				return {
					success: !0,
					data: JSON.parse(n)
				};
			} catch {
				let e = n.match(/\{[\s\S]*\}/);
				if (e) return {
					success: !0,
					data: JSON.parse(e[0])
				};
				throw Error("Invalid JSON format");
			}
		} catch (e) {
			return {
				success: !1,
				error: e instanceof Error ? e.message : String(e)
			};
		}
	});
});
//#endregion
export { l as MAIN_DIST, u as RENDERER_DIST, c as VITE_DEV_SERVER_URL };
