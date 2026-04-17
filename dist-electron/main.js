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
	f();
	let e = (e) => {
		let t = (e || "").trim();
		if (!t) return "";
		if (!/^https?:\/\//i.test(t)) return t;
		try {
			return new URL(t).toString();
		} catch {
			return t;
		}
	}, t = (e) => {
		let t = new TextDecoder("utf-8").decode(e), n = 0, r = 0;
		for (let e = 0; e < t.length; e++) {
			let i = t.charCodeAt(e);
			i === 65533 && (n += 1), i >= 57344 && i <= 63743 && (r += 1);
		}
		if (n < 10 && r < 10) return t;
		try {
			return new TextDecoder("gb18030").decode(e);
		} catch {
			return t;
		}
	}, n = (e) => {
		let t = (e || "").trimStart();
		return /^<!doctype\s+html/i.test(t) || /^<html/i.test(t);
	}, r = (e) => {
		let t = (e || "").trimStart();
		if (!t || n(t)) throw Error("Invalid JSON format");
		try {
			return JSON.parse(t);
		} catch {
			let t = e.indexOf("{"), n = e.indexOf("["), r = [t, n].filter((e) => e >= 0);
			if (!r.length) throw Error("Invalid JSON format");
			let i = Math.min(...r), a = i === t && (n === -1 || t < n) ? e.lastIndexOf("}") : e.lastIndexOf("]");
			if (a <= i) throw Error("Invalid JSON format");
			let o = e.slice(i, a + 1);
			return JSON.parse(o);
		}
	}, i = (e) => {
		if (!e) return [];
		let t = [], n = /* @__PURE__ */ new Set(), r = (e, r) => {
			let i = (e || "").trim(), a = (r || "").trim();
			if (!i || !a || !/^https?:\/\//i.test(a)) return;
			let o = `${i}::${a}`;
			n.has(o) || (n.add(o), t.push({
				name: i,
				url: a
			}));
		};
		{
			let t = /copyLinkToClipboard\('([^']+)'\)[\s\S]*?>\s*([^<]+?)\s*<\/a>/g;
			for (;;) {
				let n = t.exec(e);
				if (!n) break;
				r(n[2], n[1]);
			}
		}
		{
			let t = /data-clipboard-text\s*=\s*["']([^"']+)["'][\s\S]*?>\s*([^<]+?)\s*<\/a>/g;
			for (;;) {
				let n = t.exec(e);
				if (!n) break;
				r(n[2], n[1]);
			}
		}
		return t;
	}, s = (e, t) => {
		let n = 0, r = t.name.replace(/\s+/g, ""), i = "", a = "";
		try {
			let t = new URL(e);
			a = t.host;
			let n = t.pathname.split("/").filter(Boolean), r = n.length ? n[n.length - 1] : "";
			i = r ? decodeURIComponent(r).replace(/\s+/g, "") : "";
		} catch {
			i = "", a = "";
		}
		i && (r === i || r.includes(i)) && (n += 200);
		try {
			a && new URL(t.url).host === a && (n += 50);
		} catch {}
		let o = t.url.toLowerCase();
		return o.endsWith(".json") && (n += 30), o.includes("tvbox") && (n += 20), o.includes("box") && (n += 10), n;
	}, c = async (n) => {
		let r = e(n), i = await o.fetch(r, {
			redirect: "follow",
			headers: {
				"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
				accept: "text/html,application/json;q=0.9,*/*;q=0.8",
				"accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
			}
		}), a = t(await i.arrayBuffer());
		return {
			ok: i.ok,
			status: i.status,
			text: a
		};
	}, l = async (t, a = 0, o) => {
		let u = e(t);
		if (!u) throw Error("Empty URL");
		let d = o || /* @__PURE__ */ new Set();
		if (d.has(u)) throw Error("Circular reference");
		d.add(u);
		let f = await c(u);
		if (!f.ok) throw Error(`HTTP error! status: ${f.status}`);
		let p = f.text || "";
		if (n(p)) {
			if (a >= 2) throw Error("Invalid JSON format");
			let e = i(p).sort((e, t) => s(u, t) - s(u, e)).map((e) => e.url);
			for (let t of e.slice(0, 12)) try {
				return await l(t, a + 1, d);
			} catch {}
			throw Error("Invalid JSON format");
		}
		return r(p);
	};
	a.handle("fetch-data", async (e, t) => {
		try {
			return {
				success: !0,
				data: await l(t)
			};
		} catch (e) {
			return {
				success: !1,
				error: e instanceof Error ? e.message : String(e)
			};
		}
	}), a.handle("fetch-text", async (e, t) => {
		try {
			let e = await c(t);
			if (!e.ok) throw Error(`HTTP error! status: ${e.status}`);
			return {
				success: !0,
				data: e.text
			};
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
