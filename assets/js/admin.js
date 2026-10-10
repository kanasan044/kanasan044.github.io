/* YORIMICHI in-site editor (admins only).
   Loaded by main.js only when this browser has signed in (or the page was opened with ?admin).
   Sign-in = a GitHub fine-grained token for the site repository, kept only in this browser. The token's user must
   be listed in content.editors AND have write access to the repository, so nobody else can edit even if they open
   ?admin. Saving commits data/content.js (and uploaded pictures / CNAME) straight to the repository. */
(function () {
  "use strict";

  var REPO = { owner: "kanasan044", repo: "kanasan044.github.io", branch: "main" };
  var TOKEN_KEY = "yorimichi-gh-token";
  var CONTENT_PATH = "data/content.js";
  var CONTENT_HEAD = "/* サイト内の「編集」から保存されるファイルです。 */\nwindow.YORIMICHI_CONTENT = ";
  var SITE = window.YORIMICHI_SITE;
  if (!SITE) return;

  var token = null, login = "", draft = null, saved = "", editing = false;
  var pending = {};   // settings key -> data URL of a picture chosen but not uploaded yet
  var preview = {};   // uploaded path -> data URL (shown until GitHub Pages has the new file)

  function $(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "on") Object.keys(attrs.on).forEach(function (ev) { n.addEventListener(ev, attrs.on[ev]); });
      else if (k === "class") n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- GitHub ---------- */
  async function api(path, opts) {
    opts = opts || {};
    var r = await fetch("https://api.github.com" + path, {
      method: opts.method || "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store"
    });
    if (r.status === 404 && opts.allow404) return null;
    if (!r.ok) {
      var j = {}; try { j = await r.json(); } catch (e) { /* no body */ }
      var err = new Error(j.message || ("HTTP " + r.status)); err.status = r.status; throw err;
    }
    return r.status === 204 ? null : r.json();
  }
  function contentsUrl(path) { return "/repos/" + REPO.owner + "/" + REPO.repo + "/contents/" + path; }
  function toB64(str) {
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromB64(b64) {
    var bin = atob(String(b64).replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, function (c) { return c.charCodeAt(0); }));
  }
  async function getFile(path) {
    var f = await api(contentsUrl(path) + "?ref=" + REPO.branch, { allow404: true });
    return f ? { sha: f.sha, text: f.content ? fromB64(f.content) : "" } : null;
  }
  async function putFile(path, b64, message, sha) {
    var body = { message: message, content: b64, branch: REPO.branch };
    if (sha) body.sha = sha;
    return api(contentsUrl(path), { method: "PUT", body: body });
  }

  async function verify() {
    var me = await api("/user");
    var editors = ((window.YORIMICHI_CONTENT || {}).editors || ["kanasan044"]).map(function (s) { return String(s).toLowerCase(); });
    if (editors.indexOf(String(me.login).toLowerCase()) < 0) throw new Error("このアカウント（" + me.login + "）には編集の権限がありません");
    var repo = await api("/repos/" + REPO.owner + "/" + REPO.repo);
    if (!repo.permissions || !repo.permissions.push) throw new Error("このトークンではサイトに保存できません（書き込み権限がありません）");
    return me.login;
  }

  /* ---------- sign-in ---------- */
  function showLogin(message) {
    var input = $("input", { type: "password", class: "yo-input", placeholder: "github_pat_…", autocomplete: "off" });
    var err = $("p", { class: "yo-err", text: message || "" });
    var btn = $("button", { class: "yo-btn yo-btn--primary", type: "button", text: "ログイン" });
    var box = $("div", { class: "yo-modal yo-ui", role: "dialog", "aria-modal": "true" }, [
      $("div", { class: "yo-modal__card" }, [
        $("p", { class: "yo-eyebrow", text: "ADMIN" }),
        $("h2", { text: "管理者ログイン" }),
        $("p", { class: "yo-muted", text: "GitHub で作った「鍵（トークン）」を貼り付けてください。このブラウザにだけ保存され、他の人には編集ボタンは表示されません。" }),
        input, err,
        $("div", { class: "yo-row" }, [
          $("button", { class: "yo-btn", type: "button", text: "閉じる", on: { click: function () { box.remove(); } } }),
          btn
        ]),
        $("a", { class: "yo-link", href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener", text: "鍵（トークン）を作る →" })
      ])
    ]);
    btn.addEventListener("click", async function () {
      token = input.value.trim();
      if (!token) return;
      btn.disabled = true; err.textContent = "確認しています…";
      try {
        login = await verify();
        try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* private window: works until closed */ }
        box.remove();
        await ready();
      } catch (e) {
        token = null; btn.disabled = false;
        err.textContent = e.status === 401 ? "鍵が正しくないか、期限が切れています" : e.message;
      }
    });
    document.body.appendChild(box);
    input.focus();
  }

  function logout() {
    if (dirty() && !confirm("保存していない変更があります。ログアウトしますか？")) return;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    location.href = location.pathname;
  }

  /* ---------- content ---------- */
  function dirty() { return draft && (JSON.stringify(draft) !== saved || Object.keys(pending).length > 0); }
  function view() {
    // The page shows the draft; pictures that were just uploaded are shown from memory until Pages publishes them.
    var v = clone(draft);
    Object.keys(v.settings || {}).forEach(function (k) { if (preview[v.settings[k]]) v.settings[k] = preview[v.settings[k]]; });
    return v;
  }
  var renderTimer = 0;
  function changed(now) {
    clearTimeout(renderTimer);
    var go = function () { SITE.setContent(view()); if (editing) decorate(); updateBar(); };
    if (now) go(); else renderTimer = setTimeout(go, 350);
    updateBar();
  }

  async function loadLatest() {
    var f = await getFile(CONTENT_PATH);
    var obj = window.YORIMICHI_CONTENT || {};
    if (f && f.text) obj = JSON.parse(f.text.slice(f.text.indexOf("{"), f.text.lastIndexOf("}") + 1));
    draft = clone(obj);
    ["settings", "texts"].forEach(function (k) { if (!draft[k]) draft[k] = {}; });
    ["schedule", "news", "faq"].forEach(function (k) { if (!draft[k]) draft[k] = []; });
    saved = JSON.stringify(draft);
    SITE.setContent(view());
  }

  async function save() {
    var btn = bar.querySelector("[data-save]");
    btn.disabled = true;
    toast("保存しています…", true);
    try {
      // 1) pictures
      for (var key of Object.keys(pending)) {
        var data = pending[key];
        if (draft.settings[key] !== data) { delete pending[key]; continue; }
        var path = "images/uploads/" + new Date().toISOString().replace(/\D/g, "").slice(0, 14) + "-" + key + ".jpg";
        await putFile(path, data.split(",")[1], "画像を追加（" + key + "）");
        draft.settings[key] = path; preview[path] = data; delete pending[key];
      }
      // 2) tidy lists
      draft.schedule.sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); });
      draft.news.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      // 3) content
      var cur = await getFile(CONTENT_PATH);
      var text = CONTENT_HEAD + JSON.stringify(draft, null, 2) + ";\n";
      await putFile(CONTENT_PATH, toB64(text), "サイトを編集（" + login + "）", cur && cur.sha);
      // 4) custom domain
      var oldDomain = (JSON.parse(saved).settings || {}).domain || "", domain = String(draft.settings.domain || "").trim();
      if (domain !== oldDomain) {
        var cname = await getFile("CNAME");
        if (domain) await putFile("CNAME", toB64(domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "") + "\n"), "独自ドメインを設定", cname && cname.sha);
        else if (cname) await api(contentsUrl("CNAME"), { method: "DELETE", body: { message: "独自ドメインを解除", sha: cname.sha, branch: REPO.branch } });
      }
      saved = JSON.stringify(draft);
      changed(true);
      toast("公開しました！ 1〜2分でみんなのサイトにも反映されます。");
    } catch (e) {
      toast("保存できませんでした：" + e.message, false, true);
    }
    updateBar();
  }

  /* ---------- in-page editing ---------- */
  function editableNodes() {
    return Array.prototype.filter.call(
      document.querySelectorAll("main [data-i18n], main [data-i18n-html], footer [data-i18n='footer.tag']"),
      function (n) { return !n.closest("a, button, .lang, .tabs, nav, .yo-ui, [data-status]"); });
  }
  function onEditKey(e) {
    if (e.key === "Enter" && !e.currentTarget.hasAttribute("data-i18n-html")) { e.preventDefault(); e.currentTarget.blur(); }
  }
  function onEditBlur(e) {
    var n = e.currentTarget, key = n.getAttribute("data-i18n") || n.getAttribute("data-i18n-html"), lang = SITE.getLang();
    var value = n.innerText.replace(/ /g, " ").replace(/\n{2,}/g, "\n").trim();
    var cur = ((draft.texts[key] || {})[lang]) || "";
    if (value === cur) return;
    draft.texts[key] = draft.texts[key] || {};
    draft.texts[key][lang] = value;
    changed(true);
  }
  function decorate() {
    editableNodes().forEach(function (n) {
      if (n.classList.contains("yo-editable")) return;
      n.classList.add("yo-editable");
      try { n.contentEditable = "plaintext-only"; } catch (e) { n.contentEditable = "true"; }
      if (n.contentEditable !== "plaintext-only") n.contentEditable = "true";
      n.spellcheck = false;
      n.addEventListener("keydown", onEditKey);
      n.addEventListener("blur", onEditBlur);
    });
    document.querySelectorAll("img[data-img]").forEach(function (img) {
      var host = img.parentElement;
      if (host.querySelector(":scope > .yo-imgbar")) return;
      var key = img.getAttribute("data-img");
      host.classList.add("yo-imghost");
      host.appendChild($("div", { class: "yo-imgbar yo-ui" }, [
        $("button", { class: "yo-chip", type: "button", text: "写真を変える", on: { click: function () { pickImage(key); } } }),
        $("button", { class: "yo-chip yo-chip--ghost", type: "button", text: "元の写真", on: { click: function () { draft.settings[key] = ""; delete pending[key]; changed(true); } } })
      ]));
    });
  }
  function undecorate() {
    document.querySelectorAll(".yo-editable").forEach(function (n) {
      n.classList.remove("yo-editable"); n.removeAttribute("contenteditable");
      n.removeEventListener("keydown", onEditKey); n.removeEventListener("blur", onEditBlur);
    });
    document.querySelectorAll(".yo-imgbar").forEach(function (n) { n.remove(); });
  }
  function blockLinks(e) {
    if (!editing) return;
    var a = e.target.closest("a");
    if (a && !a.closest(".yo-ui") && !a.closest("nav") && !a.closest(".header")) e.preventDefault();
  }
  document.addEventListener("click", blockLinks, true);

  function pickImage(key) {
    var input = $("input", { type: "file", accept: "image/*" });
    input.addEventListener("change", function () {
      var file = input.files[0]; if (!file) return;
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, 1920 / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        var data = c.toDataURL("image/jpeg", 0.86);
        URL.revokeObjectURL(url);
        pending[key] = data; draft.settings[key] = data;
        changed(true);
        toast("写真を差し替えました。「保存して公開」で公開されます。");
      };
      img.src = url;
    });
    input.click();
  }

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle("yo-editing", on);
    if (on) { decorate(); toast("文章をクリックすると書き換えられます。いま表示している言語（" + (SITE.getLang() === "ko" ? "韓国語" : "日本語") + "）が編集されます。"); }
    else undecorate();
    updateBar();
  }
  document.addEventListener("yorimichi:lang", function () { if (editing) decorate(); });

  /* ---------- side panel ---------- */
  var panel = null;
  function field(label, value, onInput, type, options) {
    var input;
    if (type === "textarea") input = $("textarea", { class: "yo-input", rows: "3" });
    else if (type === "select") { input = $("select", { class: "yo-input" }); options.forEach(function (o) { input.appendChild($("option", { value: o, text: o })); }); }
    else input = $("input", { class: "yo-input", type: type || "text" });
    input.value = value || "";
    input.addEventListener("input", function () { onInput(input.value); changed(); });
    return $("label", { class: "yo-field" }, [$("span", { text: label }), input]);
  }
  function listEditor(title, listKey, blank, fields, note) {
    var body = $("div", { class: "yo-list" });
    function draw() {
      body.innerHTML = "";
      body.appendChild($("button", { class: "yo-btn yo-btn--primary yo-btn--block", type: "button", text: "＋ " + title + "を追加",
        on: { click: function () { draft[listKey].unshift(clone(blank)); changed(true); draw(); } } }));
      if (note) body.appendChild($("p", { class: "yo-muted", text: note }));
      if (!draft[listKey].length) body.appendChild($("p", { class: "yo-empty", text: "まだありません" }));
      draft[listKey].forEach(function (item, i) {
        var card = $("div", { class: "yo-card" });
        fields.forEach(function (f) { card.appendChild(field(f[1], item[f[0]], function (v) { item[f[0]] = v; }, f[2], f[3])); });
        card.appendChild($("div", { class: "yo-row yo-row--end" }, [
          i > 0 ? $("button", { class: "yo-btn yo-btn--sm", type: "button", text: "↑", title: "上へ", on: { click: function () { var a = draft[listKey]; a.splice(i - 1, 0, a.splice(i, 1)[0]); changed(true); draw(); } } }) : null,
          $("button", { class: "yo-btn yo-btn--sm yo-btn--danger", type: "button", text: "削除",
            on: { click: function () { if (confirm("この" + title + "を削除しますか？")) { draft[listKey].splice(i, 1); changed(true); draw(); } } } })
        ]));
        body.appendChild(card);
      });
    }
    draw();
    return body;
  }
  function settingsEditor() {
    var s = draft.settings, box = $("div", { class: "yo-list" });
    var group = function (title, kids) { box.appendChild($("div", { class: "yo-card" }, [$("h3", { text: title })].concat(kids))); };
    var f = function (key, label, type, opts) { return field(label, s[key], function (v) { s[key] = v; }, type, opts); };
    group("リンク", [
      f("world_url", "VRChat ワールドのURL"), f("group_url", "VRChat グループのURL"),
      f("recruit_form_url", "応募フォーム（Google フォーム）のURL"), f("staff_page_url", "スタッフ専用ページのURL"),
      f("discord_url", "Discord のURL（空なら非表示）"), f("x_url", "X のURL（空なら非表示）")
    ]);
    group("トップのお知らせバー", [f("announcement_ja", "日本語（空なら非表示）", "textarea"), f("announcement_ko", "韓国語", "textarea")]);
    group("募集状況（採用情報ページ）", [f("recruit_teacher", "先生", "select", ["募集中", "停止"]), f("recruit_staff", "運営スタッフ", "select", ["募集中", "停止"])]);
    group("独自ドメイン", [f("domain", "例：yorimichi.jp（空なら kanasan044.github.io）"),
      $("p", { class: "yo-muted", text: "ドメイン会社側の設定も必要です。設定するときは Claude に聞いてください。" })]);
    box.appendChild($("p", { class: "yo-muted", text: "写真は「編集する」をオンにして、ページの写真の上のボタンから変えられます。" }));
    return box;
  }
  var TABS = {
    schedule: ["予定", function () {
      return listEditor("予定", "schedule", { date: "", start: "21:00", end: "22:00", type: "授業", title_ja: "", title_ko: "", desc_ja: "", desc_ko: "", host: "", place: "" }, [
        ["date", "日付", "date"], ["start", "開始", "time"], ["end", "終了", "time"], ["type", "種類", "select", ["授業", "イベント"]],
        ["title_ja", "タイトル（日本語）"], ["title_ko", "タイトル（韓国語）"], ["desc_ja", "説明（日本語）", "textarea"], ["desc_ko", "説明（韓国語）", "textarea"],
        ["host", "担当"], ["place", "場所"]], "終わった予定はサイトに自動で表示されなくなります。");
    }],
    news: ["お知らせ", function () {
      return listEditor("お知らせ", "news", { date: new Date().toISOString().slice(0, 10), title_ja: "", title_ko: "", body_ja: "", body_ko: "", link: "" }, [
        ["date", "日付", "date"], ["title_ja", "タイトル（日本語）"], ["title_ko", "タイトル（韓国語）"],
        ["body_ja", "本文（日本語）", "textarea"], ["body_ko", "本文（韓国語）", "textarea"], ["link", "リンク（任意）"]]);
    }],
    faq: ["よくある質問", function () {
      return listEditor("質問", "faq", { q_ja: "", q_ko: "", a_ja: "", a_ko: "" }, [
        ["q_ja", "質問（日本語）"], ["q_ko", "質問（韓国語）"], ["a_ja", "答え（日本語）", "textarea"], ["a_ko", "答え（韓国語）", "textarea"]]);
    }],
    settings: ["リンク・設定", settingsEditor]
  };
  function openPanel(tab) {
    if (panel) panel.remove();
    panel = $("aside", { class: "yo-panel yo-ui" }, [
      $("div", { class: "yo-panel__head" }, [
        $("h2", { text: TABS[tab][0] }),
        $("button", { class: "yo-btn yo-btn--sm", type: "button", text: "閉じる", on: { click: function () { panel.remove(); panel = null; } } })
      ]),
      $("div", { class: "yo-panel__body" }, [TABS[tab][1]()])
    ]);
    document.body.appendChild(panel);
  }

  /* ---------- toolbar ---------- */
  var bar = null;
  function updateBar() {
    if (!bar) return;
    var d = dirty();
    bar.querySelector("[data-save]").disabled = !d;
    bar.querySelector("[data-save]").textContent = d ? "保存して公開" : "保存済み";
    bar.querySelector("[data-edit]").textContent = editing ? "編集を終える" : "✎ 編集する";
    bar.querySelector("[data-edit]").classList.toggle("is-on", editing);
  }
  function buildBar() {
    var b = function (text, fn, attrs) { var a = attrs || {}; a.type = "button"; a.class = "yo-bar__btn " + (a.class || ""); a.text = text; a.on = { click: fn }; return $("button", a); };
    bar = $("div", { class: "yo-bar yo-ui" }, [
      $("span", { class: "yo-bar__who", title: "ログイン中", text: "● " + login }),
      b("✎ 編集する", function () { setEditing(!editing); }, { "data-edit": "1" }),
      b("予定", function () { openPanel("schedule"); }),
      b("お知らせ", function () { openPanel("news"); }),
      b("質問", function () { openPanel("faq"); }),
      b("リンク・設定", function () { openPanel("settings"); }),
      b("保存済み", save, { "data-save": "1", class: "yo-bar__save" }),
      b("ログアウト", logout, { class: "yo-bar__ghost" })
    ]);
    document.body.appendChild(bar);
    updateBar();
  }
  window.addEventListener("beforeunload", function (e) { if (dirty()) { e.preventDefault(); e.returnValue = ""; } });

  var toastTimer = 0;
  function toast(msg, stay, bad) {
    var t = document.querySelector(".yo-toast") || document.body.appendChild($("div", { class: "yo-toast yo-ui", role: "status" }));
    t.textContent = msg; t.classList.toggle("is-bad", !!bad); t.classList.add("is-on");
    clearTimeout(toastTimer);
    if (!stay) toastTimer = setTimeout(function () { t.classList.remove("is-on"); }, bad ? 9000 : 4500);
  }

  async function ready() {
    buildBar();
    try { await loadLatest(); } catch (e) { toast("最新の内容を読み込めませんでした：" + e.message, false, true); draft = clone(window.YORIMICHI_CONTENT || {}); saved = JSON.stringify(draft); }
    updateBar();
  }

  /* ---------- styles (admin UI only) ---------- */
  document.head.appendChild($("style", { text: [
    ".yo-ui{font-family:var(--font-ja);color:var(--ink);line-height:1.5}",
    ".yo-bar{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:90;display:flex;align-items:center;gap:4px;padding:6px;max-width:calc(100% - 24px);overflow-x:auto;background:rgba(12,14,19,.92);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-radius:999px;box-shadow:0 20px 40px -12px rgba(0,0,0,.45);color:#fff}",
    ".yo-bar__who{padding:0 12px 0 10px;font-size:12.5px;font-weight:700;color:#7ee2a8;white-space:nowrap}",
    ".yo-bar__btn{border:0;background:transparent;color:#fff;padding:9px 14px;border-radius:999px;font:inherit;font-size:13.5px;font-weight:600;white-space:nowrap;cursor:pointer}",
    ".yo-bar__btn:hover{background:rgba(255,255,255,.1)}",
    ".yo-bar__btn.is-on{background:#fff;color:var(--ink)}",
    ".yo-bar__save{background:var(--accent)}.yo-bar__save:hover{background:var(--accent-ink)}",
    ".yo-bar__save:disabled{background:rgba(255,255,255,.08);color:rgba(255,255,255,.55);cursor:default}",
    ".yo-bar__ghost{color:rgba(255,255,255,.6)}",
    ".yo-editing .yo-editable{outline:1.5px dashed rgba(49,87,255,.55);outline-offset:4px;border-radius:6px;cursor:text;transition:outline-color .2s,background .2s}",
    ".yo-editing .yo-editable:hover{background:rgba(49,87,255,.05)}",
    ".yo-editing .yo-editable:focus{outline:2px solid var(--accent);background:rgba(49,87,255,.06)}",
    ".yo-editing .tile .yo-editable{outline-color:rgba(255,255,255,.7)}",
    ".yo-editing .reveal{opacity:1;transform:none}",
    ".yo-imghost{position:relative}",
    ".yo-imgbar{position:absolute;top:14px;left:14px;z-index:5;display:flex;gap:6px}",
    ".yo-chip{border:0;padding:8px 14px;border-radius:999px;background:#fff;color:var(--ink);font:inherit;font-size:13px;font-weight:700;box-shadow:0 6px 16px -6px rgba(0,0,0,.4);cursor:pointer}",
    ".yo-chip--ghost{background:rgba(255,255,255,.75)}",
    ".yo-panel{position:fixed;top:0;right:0;bottom:0;z-index:95;width:min(440px,100%);display:flex;flex-direction:column;background:#fff;box-shadow:-20px 0 50px -20px rgba(16,24,40,.35);animation:yoIn .25s ease}",
    "@keyframes yoIn{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}",
    ".yo-panel__head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--line)}",
    ".yo-panel__head h2{font-size:18px;margin:0}",
    ".yo-panel__body{flex:1;overflow-y:auto;padding:16px 20px 120px;background:var(--soft)}",
    ".yo-list{display:grid;gap:12px}",
    ".yo-card{display:grid;gap:10px;padding:16px;background:#fff;border:1px solid var(--line);border-radius:16px}",
    ".yo-card h3{font-size:14px;margin:0 0 2px}",
    ".yo-field{display:grid;gap:4px;font-size:12.5px;font-weight:600;color:var(--muted)}",
    ".yo-input{width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:10px;font:inherit;font-size:14.5px;font-weight:400;color:var(--ink);background:#fff;resize:vertical}",
    ".yo-input:focus{outline:2px solid rgba(49,87,255,.35);border-color:var(--accent)}",
    ".yo-row{display:flex;gap:8px;align-items:center}.yo-row--end{justify-content:flex-end}",
    ".yo-btn{border:1px solid var(--line);background:#fff;color:var(--ink);padding:9px 16px;border-radius:999px;font:inherit;font-size:14px;font-weight:700;cursor:pointer}",
    ".yo-btn:disabled{opacity:.5}",
    ".yo-btn--primary{background:var(--ink);border-color:var(--ink);color:#fff}",
    ".yo-btn--block{width:100%}.yo-btn--sm{padding:6px 12px;font-size:13px}",
    ".yo-btn--danger{color:#d43c64;border-color:rgba(212,60,100,.3)}",
    ".yo-muted{font-size:13px;color:var(--muted);margin:0}",
    ".yo-empty{text-align:center;color:var(--muted);font-size:14px;padding:16px}",
    ".yo-modal{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:16px;background:rgba(12,14,19,.45);backdrop-filter:blur(4px)}",
    ".yo-modal__card{width:min(440px,100%);display:grid;gap:12px;padding:28px;background:#fff;border-radius:24px;box-shadow:var(--shadow-lg)}",
    ".yo-modal__card h2{font-size:22px;margin:0}",
    ".yo-eyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;color:var(--accent);margin:0}",
    ".yo-err{min-height:1.2em;font-size:13px;color:#d43c64;margin:0}",
    ".yo-link{font-size:13px;font-weight:700;color:var(--accent)}",
    ".yo-toast{position:fixed;left:50%;bottom:84px;transform:translate(-50%,10px);z-index:96;max-width:min(560px,calc(100% - 32px));padding:12px 18px;border-radius:14px;background:#fff;border:1px solid var(--line);box-shadow:var(--shadow);font-size:14px;font-weight:600;opacity:0;pointer-events:none;transition:all .25s}",
    ".yo-toast.is-on{opacity:1;transform:translate(-50%,0)}",
    ".yo-toast.is-bad{border-color:rgba(212,60,100,.4);color:#b02a50}"
  ].join("\n") }));

  /* ---------- start ---------- */
  (async function () {
    try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { token = null; }
    if (!token) { showLogin(); return; }
    try { login = await verify(); await ready(); }
    catch (e) {
      try { localStorage.removeItem(TOKEN_KEY); } catch (x) { /* ignore */ }
      token = null;
      if (/[?&]admin\b/.test(location.search)) showLogin(e.status === 401 ? "鍵の期限が切れました。もう一度ログインしてください。" : e.message);
    }
  })();
})();
