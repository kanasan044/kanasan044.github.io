/* YORIMICHI in-site editor (admins only).
   Loaded by main.js only when this browser has signed in (or the page was opened with ?admin).
   Sign-in = a GitHub fine-grained token for the site repository, kept only in this browser. The token's user must
   be listed in content.editors AND have write access to the repository, so nobody else can edit even if they open
   ?admin. Saving commits data/content.js (and uploaded pictures / CNAME) straight to the repository.
   The roster (先生・運営スタッフ) is saved to data/people.js for the site and roster.json for the VRChat world. */
(function () {
  "use strict";

  var REPO = { owner: "kanasan044", repo: "kanasan044.github.io", branch: "main" };
  var TOKEN_KEY = "yorimichi-gh-token";
  var CONTENT_PATH = "data/content.js";
  var CONTENT_HEAD = "/* サイト内の「編集」から保存されるファイルです。 */\nwindow.YORIMICHI_CONTENT = ";
  var PEOPLE_PATH = "data/people.js", ROSTER_PATH = "roster.json";
  var PEOPLE_HEAD = "/* サイト内の「名簿」から保存されるファイルです。 */\nwindow.YORIMICHI_PEOPLE = ";
  var SITE = window.YORIMICHI_SITE;
  if (!SITE) return;

  var token = null, login = "", draft = null, saved = "", editing = false;
  var people = null, peopleSaved = "";   // roster draft (teachers / staff) and its last saved form
  var KEYS_PATH = "data/staff-logins.json";
  var keys = null, keysSaved = "";       // Discord accounts of teachers / staff (SHA-256 only) for the staff API
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
  function peopleDirty() { return people && JSON.stringify(people) !== peopleSaved; }
  function keysDirty() { return keys && JSON.stringify(keys) !== keysSaved; }
  function dirty() { return draft && (JSON.stringify(draft) !== saved || Object.keys(pending).length > 0 || peopleDirty() || keysDirty()); }
  function newId() { return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function view() {
    // The page shows the draft; pictures that were just uploaded are shown from memory until Pages publishes them.
    var v = clone(draft);
    Object.keys(v.settings || {}).forEach(function (k) { if (preview[v.settings[k]]) v.settings[k] = preview[v.settings[k]]; });
    if (people) {
      var p = clone(people);
      ["teachers", "staff"].forEach(function (k) { p[k].forEach(function (x) { if (preview[x.image]) x.image = preview[x.image]; }); });
      window.YORIMICHI_PEOPLE = p;
    }
    return v;
  }
  var renderTimer = 0;
  function changed(now) {
    clearTimeout(renderTimer);
    var go = function () { SITE.setContent(view()); if (editing) decorate(); updateBar(); };
    if (now) go(); else renderTimer = setTimeout(go, 350);
    updateBar();
  }

  function parseJs(text) { return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); }
  async function loadLatest() {
    var f = await getFile(CONTENT_PATH);
    var obj = window.YORIMICHI_CONTENT || {};
    if (f && f.text) obj = parseJs(f.text);
    draft = clone(obj);
    ["settings", "texts"].forEach(function (k) { if (!draft[k]) draft[k] = {}; });
    ["schedule", "news", "faq"].forEach(function (k) { if (!draft[k]) draft[k] = []; });
    // Every event gets an id so teachers' changes can be merged with this draft on save.
    draft.schedule.forEach(function (x) { if (!x.id) { x.id = newId(); freshIds[x.id] = true; } });
    saved = JSON.stringify(draft);
    var kf = await getFile(KEYS_PATH);
    keys = kf && kf.text ? JSON.parse(kf.text) : { accounts: [] };
    if (!keys.accounts) keys.accounts = [];
    keysSaved = JSON.stringify(keys);
    var pf = await getFile(PEOPLE_PATH);
    var po = pf && pf.text ? parseJs(pf.text) : (window.YORIMICHI_PEOPLE || {});
    people = { teachers: po.teachers || [], staff: po.staff || [] };
    peopleSaved = JSON.stringify(people);
    SITE.setContent(view());
  }

  // Teachers may have added / changed / deleted their events (through the schedule API) since this page loaded.
  // Keep their changes unless the same event was also edited here.
  var freshIds = {};   // ids given on load to events that had none yet (not in the repository's copy)
  function mergeSchedule(remote) {
    var base = JSON.parse(saved).schedule || [];
    var byId = function (list) { var m = {}; list.forEach(function (x) { if (x.id) m[x.id] = x; }); return m; };
    var same = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };
    var B = byId(base), R = byId(remote), out = [];
    draft.schedule.forEach(function (x) {
      var b = B[x.id], r = R[x.id];
      if (!b || freshIds[x.id]) out.push(x);          // added here, or not tracked by id yet
      else if (!r) { if (!same(x, b)) out.push(x); }  // deleted by a teacher: keep only if edited here
      else out.push(same(x, b) ? r : x);              // changed by a teacher and not here: take theirs
    });
    remote.forEach(function (r) {                      // added by a teacher
      if (r.id && !B[r.id] && !out.some(function (x) { return x.id === r.id; })) out.push(r);
    });
    out.sort(function (a, b) { return String(a.date + a.start).localeCompare(String(b.date + b.start)); });
    draft.schedule = out;
  }

  function jstStamp() { return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16).replace("T", " "); }
  async function savePeople() {
    // Profile pictures chosen in the roster panel are still data URLs: upload them first.
    for (var k of ["teachers", "staff"]) {
      for (var p of people[k]) {
        p.name = String(p.name || "").trim();
        if (/^data:image\//.test(p.image || "")) {
          var data = p.image, path = "images/uploads/" + new Date().toISOString().replace(/\D/g, "").slice(0, 17) + "-person" + Math.floor(Math.random() * 1e6) + ".jpg";
          await putFile(path, data.split(",")[1], "名簿の写真を追加");
          p.image = path; preview[path] = data;
        }
      }
    }
    var stamp = jstStamp();
    var cur = await getFile(PEOPLE_PATH);
    await putFile(PEOPLE_PATH, toB64(PEOPLE_HEAD + JSON.stringify({ updated: stamp, teachers: people.teachers, staff: people.staff }, null, 2) + ";\n"),
      "名簿を編集（" + login + "）", cur && cur.sha);
    // The world reads this list (names only, including people hidden on the site).
    var names = function (list) { return list.map(function (p) { return p.name; }).filter(function (n, i, a) { return n && a.indexOf(n) === i; }); };
    var roster = await getFile(ROSTER_PATH);
    await putFile(ROSTER_PATH, toB64(JSON.stringify({ updated: stamp, teachers: names(people.teachers), staff: names(people.staff) }, null, 2) + "\n"),
      "ワールドの役職を更新（" + login + "）", roster && roster.sha);
    peopleSaved = JSON.stringify(people);
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
      if (JSON.stringify(draft) !== saved) {
        var cur = await getFile(CONTENT_PATH);
        if (cur && cur.text) mergeSchedule(parseJs(cur.text).schedule || []);
        var text = CONTENT_HEAD + JSON.stringify(draft, null, 2) + ";\n";
        await putFile(CONTENT_PATH, toB64(text), "サイトを編集（" + login + "）", cur && cur.sha);
        freshIds = {};
      }
      // 3b) roster (site + world)
      if (peopleDirty()) await savePeople();
      // 3c) teachers' login codes
      if (keysDirty()) {
        var kf = await getFile(KEYS_PATH);
        await putFile(KEYS_PATH, toB64(JSON.stringify(keys, null, 2) + "\n"), "スタッフログインの Discord を更新", kf && kf.sha);
        keysSaved = JSON.stringify(keys);
      }
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

  function pickPicture(maxSize, done) {
    var input = $("input", { type: "file", accept: "image/*" });
    input.addEventListener("change", function () {
      var file = input.files[0]; if (!file) return;
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        done(c.toDataURL("image/jpeg", 0.86));
        toast("写真を選びました。「保存して公開」で公開されます。");
      };
      img.onerror = function () { URL.revokeObjectURL(url); toast("この写真は読み込めませんでした（JPEG か PNG を選んでください）", false, true); };
      img.src = url;
    });
    input.click();
  }
  function pickImage(key) {
    pickPicture(1920, function (data) { pending[key] = data; draft.settings[key] = data; changed(true); });
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
  // Profile picture: shrunk in the browser, kept as a data URL in the draft and uploaded on save.
  function photoField(label, item, key) {
    var thumb = $("div", { class: "yo-thumb" });
    function show() {
      var src = preview[item[key]] || item[key] || "";
      thumb.innerHTML = "";
      if (src) thumb.appendChild($("img", { src: src, alt: "" })); else thumb.textContent = "写真なし";
    }
    show();
    return $("div", { class: "yo-field" }, [$("span", { text: label }), $("div", { class: "yo-row" }, [thumb,
      $("button", { class: "yo-btn yo-btn--sm", type: "button", text: "写真を選ぶ", on: { click: function () {
        pickPicture(640, function (data) { item[key] = data; show(); changed(true); }); } } }),
      $("button", { class: "yo-btn yo-btn--sm", type: "button", text: "外す", on: { click: function () { item[key] = ""; show(); changed(true); } } })
    ])]);
  }
  function itemField(item, f) {
    if (f[2] === "photo") return photoField(f[1], item, f[0]);
    if (f[2] === "bool") return field(f[1], item[f[0]] === false ? "表示しない" : "表示する", function (v) { item[f[0]] = v === "表示する"; }, "select", ["表示する", "表示しない"]);
    return field(f[1], item[f[0]], function (v) { item[f[0]] = v; }, f[2], f[3]);
  }
  function listEditor(title, listKey, blank, fields, note, extra) {
    var body = $("div", { class: "yo-list" });
    var arr = function () { return typeof listKey === "function" ? listKey() : draft[listKey]; };
    function draw() {
      body.innerHTML = "";
      body.appendChild($("button", { class: "yo-btn yo-btn--primary yo-btn--block", type: "button", text: "＋ " + title + "を追加",
        on: { click: function () { arr().unshift(typeof blank === "function" ? blank() : clone(blank)); changed(true); draw(); } } }));
      if (note) body.appendChild($("p", { class: "yo-muted", text: note }));
      if (!arr().length) body.appendChild($("p", { class: "yo-empty", text: "まだありません" }));
      arr().forEach(function (item, i) {
        var card = $("div", { class: "yo-card" });
        fields.forEach(function (f) { card.appendChild(itemField(item, f)); });
        if (extra) card.appendChild(extra(item));
        card.appendChild($("div", { class: "yo-row yo-row--end" }, [
          i > 0 ? $("button", { class: "yo-btn yo-btn--sm", type: "button", text: "↑", title: "上へ", on: { click: function () { var a = arr(); a.splice(i - 1, 0, a.splice(i, 1)[0]); changed(true); draw(); } } }) : null,
          $("button", { class: "yo-btn yo-btn--sm yo-btn--danger", type: "button", text: "削除",
            on: { click: function () { if (confirm("この" + title + "を削除しますか？")) { arr().splice(i, 1); changed(true); draw(); } } } })
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
    group("スタッフログイン（Discord）", [f("staff_api", "Cloudflare の API の URL（空ならフッターのログインは表示されません）"),
      $("p", { class: "yo-muted", text: "だれがログインできるかは「名簿」の各先生・運営スタッフの Discord 欄で決めます。" })]);
    group("独自ドメイン", [f("domain", "例：yorimichi.jp（空なら kanasan044.github.io）"),
      $("p", { class: "yo-muted", text: "ドメイン会社側の設定も必要です。設定するときは Claude に聞いてください。" })]);
    box.appendChild($("p", { class: "yo-muted", text: "写真は「編集する」をオンにして、ページの写真の上のボタンから変えられます。" }));
    return box;
  }
  var TABS = {
    schedule: ["予定", function () {
      return listEditor("予定", "schedule", function () { return { id: newId(), date: "", start: "21:00", end: "22:00", type: "授業", title_ja: "", title_ko: "", desc_ja: "", desc_ko: "", host: "", place: "" }; }, [
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
    settings: ["リンク・設定", settingsEditor],
    people: ["先生・運営スタッフ名簿", peopleEditor]
  };
  /* Which Discord account each teacher / staff member signs in with. The repository is public, so only a SHA-256
     of the Discord user name (or user ID) is saved, plus a short hint for this screen. */
  async function sha256(s) {
    var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(d)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }
  function discordField(item) {
    var wrap = $("div", { class: "yo-field" });
    function draw() {
      wrap.innerHTML = "";
      var name = String(item.name || "").trim();
      var acc = keys.accounts.filter(function (a) { return a.name === name; })[0];
      wrap.appendChild($("span", { text: "ログインに使う Discord（ユーザー名）" }));
      if (acc) {
        wrap.appendChild($("div", { class: "yo-row" }, [
          $("span", { class: "yo-muted", text: "登録済み：" + acc.hint + "（" + acc.set + "）" }),
          $("button", { class: "yo-btn yo-btn--sm yo-btn--danger", type: "button", text: "外す", on: { click: function () {
            if (!confirm(name + " さんの Discord ログインを外しますか？（保存するとログインできなくなります）")) return;
            keys.accounts = keys.accounts.filter(function (a) { return a !== acc; });
            changed(true); draw();
          } } })
        ]));
        return;
      }
      var input = $("input", { class: "yo-input", type: "text", placeholder: "例：kanasan044（@ は不要）", autocomplete: "off" });
      wrap.appendChild($("div", { class: "yo-row" }, [input,
        $("button", { class: "yo-btn yo-btn--sm yo-nowrap", type: "button", text: "登録", on: { click: async function () {
          var v = input.value.trim().replace(/^@/, "").toLowerCase();
          name = String(item.name || "").trim();   // the name may have been typed after this field was drawn
          if (!name) { toast("先に VRChat の表示名を書いてください", false, true); return; }
          if (!v) return;
          if (!/^\d{15,22}$/.test(v) && !/^[a-z0-9_.]{2,32}$/.test(v)) { toast("Discord のユーザー名は、英小文字・数字・_ と . だけです（表示名ではなくユーザー名を入れてください）", false, true); return; }
          keys.accounts = keys.accounts.filter(function (a) { return a.name !== name; });
          keys.accounts.push({ name: name, h: await sha256("discord:" + v), hint: "@" + v.slice(0, 2) + "…", set: jstStamp().slice(0, 10) });
          changed(true); draw();
        } } })
      ]));
      wrap.appendChild($("span", { class: "yo-muted", text: "Discord の「ユーザー名」（プロフィールの @ の後ろ）です。表示名ではありません。" }));
    }
    draw();
    return wrap;
  }
  function peopleEditor() {
    var box = $("div", { class: "yo-list" });
    var common = [["name", "VRChat の表示名（1文字も違わないように）"]];
    var tail = [["bio_ja", "紹介（日本語）", "textarea"], ["bio_ko", "紹介（韓国語）", "textarea"], ["image", "写真", "photo"], ["show", "サイトに表示", "bool"]];
    var blank = { name: "", bio_ja: "", bio_ko: "", image: "", show: true };
    box.appendChild($("div", { class: "yo-note" }, [
      $("strong", { text: "ここに書いた人が、ワールドで役職を持ちます。" }),
      $("span", { text: "先生：教室の鍵をかけられる／運営スタッフ：鍵のかかった教室にも入れる。保存してから数分でワールドにも反映されます（ワールドにいる人は最大5分ほど）。「サイトに表示しない」にしても役職はそのままです。" })
    ]));
    box.appendChild($("h3", { class: "yo-section", text: "先生" }));
    box.appendChild(listEditor("先生", function () { return people.teachers; }, Object.assign({ lang_ja: "", lang_ko: "" }, blank),
      common.concat([["lang_ja", "担当（日本語）例：日本語の先生"], ["lang_ko", "担当（韓国語）例：일본어 선생님"]], tail), null, discordField));
    box.appendChild($("h3", { class: "yo-section", text: "運営スタッフ" }));
    box.appendChild(listEditor("運営スタッフ", function () { return people.staff; }, Object.assign({ role_ja: "", role_ko: "" }, blank),
      common.concat([["role_ja", "役割（日本語）"], ["role_ko", "役割（韓国語）"]], tail), null, discordField));
    return box;
  }
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
      b("名簿", function () { if (people) openPanel("people"); }),
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
    ".yo-bar{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:97;display:flex;align-items:center;gap:4px;padding:6px;max-width:calc(100% - 24px);overflow-x:auto;background:rgba(12,14,19,.92);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-radius:999px;box-shadow:0 20px 40px -12px rgba(0,0,0,.45);color:#fff}",
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
    ".yo-thumb{width:56px;height:56px;flex:none;display:grid;place-items:center;overflow:hidden;border-radius:50%;background:var(--soft);border:1px solid var(--line);font-size:10.5px;color:var(--muted)}",
    ".yo-thumb img{width:100%;height:100%;object-fit:cover}",
    ".yo-code{margin:4px 0;padding:14px;border-radius:12px;background:var(--soft);font:700 20px/1.3 ui-monospace,Consolas,monospace;letter-spacing:.06em;text-align:center;user-select:all}",
    ".yo-nowrap{white-space:nowrap;flex:none}",
    ".yo-section{font-size:15px;margin:10px 2px 0}",
    ".yo-note{display:grid;gap:4px;padding:14px 16px;border-radius:14px;background:rgba(49,87,255,.07);font-size:13px;color:var(--ink)}",
    ".yo-note span{color:var(--muted)}",
    ".yo-empty{text-align:center;color:var(--muted);font-size:14px;padding:16px}",
    ".yo-modal{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:16px;background:rgba(12,14,19,.45);backdrop-filter:blur(4px)}",
    ".yo-modal__card{width:min(440px,100%);display:grid;gap:12px;padding:28px;background:#fff;border-radius:24px;box-shadow:var(--shadow-lg)}",
    ".yo-modal__card h2{font-size:22px;margin:0}",
    ".yo-eyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;color:var(--accent);margin:0}",
    ".yo-err{min-height:1.2em;font-size:13px;color:#d43c64;margin:0}",
    ".yo-link{font-size:13px;font-weight:700;color:var(--accent)}",
    ".yo-toast{position:fixed;left:50%;bottom:84px;transform:translate(-50%,10px);z-index:98;max-width:min(560px,calc(100% - 32px));padding:12px 18px;border-radius:14px;background:#fff;border:1px solid var(--line);box-shadow:var(--shadow);font-size:14px;font-weight:600;opacity:0;pointer-events:none;transition:all .25s}",
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
