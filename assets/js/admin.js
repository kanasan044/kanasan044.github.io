/* YORIMICHI in-site editor (admins only).
   Loaded by staff.js only after the staff API says the Discord account signed in on this browser is an admin
   (ADMIN_DISCORD_IDS on Cloudflare). Saving goes through the staff API, which commits only the allowed files:
   data/content.js, uploaded pictures and CNAME, plus the roster (data/people.js for the site, roster.json for the
   VRChat world) and data/staff-logins.json (who may sign in). */
(function () {
  "use strict";

  var SESSION_KEY = "yorimichi-session";
  var CONTENT_PATH = "data/content.js";
  var CONTENT_HEAD = "/* サイト内の「編集」から保存されるファイルです。 */\nwindow.YORIMICHI_CONTENT = ";
  var PEOPLE_PATH = "data/people.js", ROSTER_PATH = "roster.json";
  var PEOPLE_HEAD = "/* サイト内の「名簿」から保存されるファイルです。 */\nwindow.YORIMICHI_PEOPLE = ";
  var SITE = window.YORIMICHI_SITE;
  if (!SITE) return;
  var API = SITE.staffApi();

  var who = "", whoUser = "";
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
  // Moves the older base_ja / base_ko pair into the single field `base` (both joined with sep when they differ).
  function oneField(o, base, sep) {
    var ja = String(o[base + "_ja"] || "").trim(), ko = String(o[base + "_ko"] || "").trim();
    if (!String(o[base] || "").trim() && (ja || ko)) o[base] = ja && ko && ja !== ko ? ja + sep + ko : ja || ko;
    delete o[base + "_ja"]; delete o[base + "_ko"];
  }

  /* ---------- staff API (saves to GitHub for us) ---------- */
  var ERRORS = { github_409: "ほかの画面で同時に保存されました。もう一度「保存して公開」を押してください",
    not_signed_in: "ログインの期限が切れました。もう一度ログインしてください", admins_only: "このアカウントには編集の権限がありません",
    founders_only: "この変更は創設者（かなさん）だけができます", owner_only: "「創設者」に関わる変更は、かなさんだけができます" };
  async function api(path, opts) {
    opts = opts || {};
    if (window.YORIMICHI_SESSION) token = window.YORIMICHI_SESSION;   // renewed by staff.js / by the last answer
    var r = await fetch(API + path, {
      method: opts.method || "GET",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store"
    });
    // Keep the renewed login (3 hours of not using the site signs you out).
    if (window.YORIMICHI_KEEP_SESSION) window.YORIMICHI_KEEP_SESSION(r);
    else { var s = r.headers && r.headers.get ? r.headers.get("X-Session") : null; if (s) { token = s; try { localStorage.setItem(SESSION_KEY, s); } catch (e) { /* ignore */ } } }
    if (window.YORIMICHI_SESSION) token = window.YORIMICHI_SESSION;
    var j = {}; try { j = await r.json(); } catch (e) { /* no body */ }
    if (!r.ok) { var err = new Error(ERRORS[j.error] || j.error || ("HTTP " + r.status)); err.status = r.status; throw err; }
    return j;
  }
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
    var f = await api("/admin/file?path=" + encodeURIComponent(path));
    return f && !f.missing ? { sha: f.sha, text: f.content ? fromB64(f.content) : "" } : null;
  }
  async function putFile(path, b64, message, sha) {
    return api("/admin/file", { method: "PUT", body: { path: path, content: b64, message: message, sha: sha || undefined } });
  }
  async function deleteFile(path, message, sha) {
    return api("/admin/file", { method: "DELETE", body: { path: path, message: message, sha: sha } });
  }

  // 創設者 ("admin") gets everything; 運営スタッフ ("staff") gets the site content only — no 名簿 / 役職 / 招待 / リンク /
  // ドメイン / 全員ログアウト (the staff API refuses those for staff too).
  var ROLE = "admin";
  var OWNER = false;   // the owner (かなさん): the only one who may give / take 創設者
  function founder() { return ROLE === "admin"; }
  async function verify() {
    var me = await api("/me");
    if (me.role !== "admin" && me.role !== "staff") { var err = new Error(ERRORS.admins_only); err.status = 403; throw err; }
    ROLE = me.role; OWNER = !!me.owner;
    who = me.discord || ""; whoUser = me.username || "";   // the Discord account actually signed in, for the toolbar
    return me.name;
  }

  async function logout() {
    if (dirty() && !confirm("保存していない変更があります。ログアウトしますか？")) return;
    // Also tell the staff API, so this login stops working everywhere (not only in this browser).
    try { await api("/logout", { method: "POST", body: {} }); } catch (e) { /* signed out here anyway */ }
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    location.href = location.pathname;
  }

  /* ---------- content ---------- */
  function peopleDirty() { return people && JSON.stringify(people) !== peopleSaved; }
  function keysDirty() { return keys && JSON.stringify(keys) !== keysSaved; }
  function dirty() { return draft && (JSON.stringify(draft) !== saved || Object.keys(pending).length > 0 || peopleDirty() || keysDirty()); }
  window.YORIMICHI_DIRTY = function () { return !!dirty(); };   // staff.js: don't reload over unsaved edits when the login runs out
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
    // お知らせ・質問・お知らせバー used to have Japanese and Korean boxes: join them into the single box (both texts
    // kept). Counted as already saved, so the joined version goes up with the next 「保存して公開」.
    draft.news.forEach(function (n) { oneField(n, "title", " / "); oneField(n, "body", "\n"); });
    draft.faq.forEach(function (f) { oneField(f, "q", " / "); oneField(f, "a", "\n"); });
    oneField(draft.settings, "announcement", " / ");
    saved = JSON.stringify(draft);
    if (founder()) await loadPeople();
    SITE.setContent(view());
  }
  // The roster and who may sign in, fresh from the repository (also after approving someone).
  async function loadPeople() {
    var kf = await getFile(KEYS_PATH);
    keys = kf && kf.text ? JSON.parse(kf.text) : { accounts: [] };
    if (!keys.accounts) keys.accounts = [];
    keysSaved = JSON.stringify(keys);
    var pf = await getFile(PEOPLE_PATH);
    var po = pf && pf.text ? parseJs(pf.text) : (window.YORIMICHI_PEOPLE || {});
    people = { teachers: po.teachers || [], staff: po.staff || [] };
    // Older entries have a two-language introduction (bio_ja / bio_ko): start the single 自己紹介 from it.
    // (The old fields are kept in the file; the site shows 自己紹介 first.)
    people.teachers.concat(people.staff).forEach(function (p) { if (!p.bio && (p.bio_ja || p.bio_ko)) p.bio = p.bio_ja || p.bio_ko; });
    peopleSaved = JSON.stringify(people);
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

  // Three-way merge of a roster list by name: base = as loaded, mine = this page, remote = latest in the repository.
  // An entry changed here wins; otherwise the latest version is kept. Additions on either side are kept; deletions here apply.
  function mergeByName(base, mine, remote) {
    var find = function (list, n) { return list.filter(function (x) { return x.name === n; })[0]; };
    var same = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };
    var out = mine.map(function (m) {
      var b = find(base, m.name), r = find(remote, m.name);
      return b && r && same(m, b) ? r : m;
    });
    remote.forEach(function (r) { if (!find(base, r.name) && !find(out, r.name)) out.push(r); });
    return out;
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
    // Approvals and members' own profile edits may have changed the list since this page loaded: keep them.
    if (cur && cur.text) {
      var remote = parseJs(cur.text), base = JSON.parse(peopleSaved);
      people.teachers = mergeByName(base.teachers || [], people.teachers, remote.teachers || []);
      people.staff = mergeByName(base.staff || [], people.staff, remote.staff || []);
    }
    await putFile(PEOPLE_PATH, toB64(PEOPLE_HEAD + JSON.stringify({ updated: stamp, teachers: people.teachers, staff: people.staff }, null, 2) + ";\n"),
      "名簿を編集（" + login + "）", cur && cur.sha);
    // The world reads this list (names only, including people hidden on the site).
    var names = function (list) { return list.map(function (p) { return p.name; }).filter(function (n, i, a) { return n && a.indexOf(n) === i; }); };
    var roster = await getFile(ROSTER_PATH);
    // founders are also in staff (the world treats them as staff); the staff API gives them full rights.
    var founders = people.staff.filter(function (p) { return p.rank === "founder"; });
    await putFile(ROSTER_PATH, toB64(JSON.stringify({ updated: stamp, teachers: names(people.teachers), staff: names(people.staff), founders: names(founders) }, null, 2) + "\n"),
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
      // 3c) who may sign in (Discord accounts of teachers / staff)
      if (keysDirty()) {
        // People may have registered through invite links meanwhile: apply only what was removed here to the latest list.
        var kf = await getFile(KEYS_PATH);
        var latest = kf && kf.text ? (JSON.parse(kf.text).accounts || []) : [];
        var same = function (a, b) { return a.name === b.name && a.h === b.h; };
        var removed = JSON.parse(keysSaved).accounts.filter(function (a) { return !keys.accounts.some(function (b) { return same(a, b); }); });
        keys.accounts = latest.filter(function (a) { return !removed.some(function (b) { return same(a, b); }); });
        var latestData = kf && kf.text ? JSON.parse(kf.text) : {};
        if ((latestData.epoch || 0) > (keys.epoch || 0)) keys.epoch = latestData.epoch;
        if (latestData.outs) keys.outs = latestData.outs; else delete keys.outs;   // logouts are written by the staff API only
        await putFile(KEYS_PATH, toB64(JSON.stringify(keys, null, 2) + "\n"), "スタッフログインの Discord を更新", kf && kf.sha);
        keysSaved = JSON.stringify(keys);
      }
      // 4) custom domain
      var oldDomain = (JSON.parse(saved).settings || {}).domain || "", domain = String(draft.settings.domain || "").trim();
      if (domain !== oldDomain) {
        var cname = await getFile("CNAME");
        if (domain) await putFile("CNAME", toB64(domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "") + "\n"), "独自ドメインを設定", cname && cname.sha);
        else if (cname) await deleteFile("CNAME", "独自ドメインを解除", cname.sha);
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
  function tagName(key) { var tg = (SITE.tags || []).filter(function (x) { return x[0] === key; })[0]; return tg ? tg[1] : key; }
  // Tags: tap to add / remove (up to 6), same list as the members' own profile.
  function tagsField(label, item, key) {
    var wrap = $("div", { class: "yo-field" });
    function draw() {
      var cur = Array.isArray(item[key]) ? item[key] : [];
      wrap.innerHTML = "";
      wrap.appendChild($("span", { text: label + "（" + cur.length + "/6）" }));
      wrap.appendChild($("div", { class: "yo-tags" }, (SITE.tags || []).map(function (tg) {
        var on = cur.indexOf(tg[0]) >= 0;
        return $("button", { type: "button", class: "yo-tag" + (on ? " is-on" : ""), text: (on ? "✓ " : "") + tg[1], on: { click: function () {
          if (on) item[key] = cur.filter(function (k) { return k !== tg[0]; });
          else if (cur.length >= 6) { toast("タグは6つまでです", false, true); return; }
          else item[key] = cur.concat([tg[0]]);
          changed(); draw();
        } } });
      })));
    }
    draw();
    return wrap;
  }
  function itemField(item, f) {
    if (f[2] === "role") return roleField(f[1], item);
    if (f[2] === "tags") return tagsField(f[1], item, f[0]);
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
        fields.forEach(function (f) { var el = itemField(item, f); if (el) card.appendChild(el); });
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
    // 運営スタッフ see only the announcement bar and the recruiting status; the rest is for the founder.
    if (founder()) group("リンク", [
      f("world_url", "VRChat ワールドのURL"), f("group_url", "VRChat グループのURL"),
      f("recruit_form_url", "応募フォーム（Google フォーム）のURL"), f("staff_page_url", "スタッフ専用ページのURL"),
      f("discord_url", "Discord のURL（空なら非表示）"), f("x_url", "X のURL（空なら非表示）")
    ]);
    group("トップのお知らせバー", [f("announcement", "お知らせ（空なら非表示・日本語と韓国語の両方のページに同じ文が出ます）", "textarea")]);
    group("募集状況（採用情報ページ）", [f("recruit_teacher", "先生", "select", ["募集中", "停止"]), f("recruit_staff", "運営スタッフ", "select", ["募集中", "停止"])]);
    if (!founder()) {
      box.appendChild($("p", { class: "yo-muted", text: "リンク・名簿・役職などの設定は、創設者（かなさん）だけが変えられます。" }));
      return box;
    }
    group("スタッフログイン（Discord）", [
      $("p", { class: "yo-muted", text: "だれがログインできるかは「名簿」の招待リンクで決めます。スマホをなくしたときなどは、下のボタンで全員をログアウトさせられます（かなさんも、もう一度ログインが必要になります）。" }),
      $("button", { class: "yo-btn yo-btn--danger", type: "button", text: "すべての端末からログアウト", on: { click: async function () {
        if (!confirm("先生・運営スタッフ・かなさん自身も含めて、全員をログアウトさせますか？\n（ほかの変更もいっしょに保存されます）")) return;
        keys.epoch = Date.now();
        await save();
        if (!dirty()) {
          try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
          alert("全員をログアウトしました。続けて編集するときは、右上の「スタッフログイン」からもう一度ログインしてください。");
          location.href = location.pathname;
        }
      } } }),
      f("staff_api", "（上級者向け）Cloudflare の API の URL。空なら最初からのアドレスを使います")]);
    group("独自ドメイン", [f("domain", "例：yorimichi.jp（空なら kanasan044.github.io）"),
      $("p", { class: "yo-muted", text: "ドメイン会社側の設定も必要です。設定するときは Claude に聞いてください。" })]);
    box.appendChild($("p", { class: "yo-muted", text: "写真は「編集する」をオンにして、ページの写真の上のボタンから変えられます。" }));
    return box;
  }
  var TABS = {
    schedule: ["予定", function () {
      // Calendar + templates (schedule-editor.js). Changes go into the draft and are published with 「保存して公開」.
      // Templates saved here are shared with the teachers (content.schedule_templates).
      if (!window.YorimichiScheduleEditor) return $("p", { class: "yo-muted", text: "読み込み中です。もう一度「予定」を押してください。" });
      var find = function (id) { return draft.schedule.filter(function (x) { return x.id === id; })[0]; };
      return window.YorimichiScheduleEditor({
        lang: function () { return "ja"; },
        items: function () { return draft.schedule; },
        canEdit: function () { return true; },
        templates: function () { return draft.schedule_templates || []; },
        saveTemplate: function (tp) { draft.schedule_templates = (draft.schedule_templates || []).concat([tp]); changed(true); },
        removeTemplate: function (i) { draft.schedule_templates.splice(i, 1); changed(true); },
        host: "",
        hosts: function () { return ((people || window.YORIMICHI_PEOPLE || {}).teachers || []).map(function (p) { return p.name; }); },
        cats: SITE.scheduleCats || [],
        notice: "「保存して公開」で公開されます。",
        toast: function (msg, bad) { toast(msg, false, bad); },
        add: function (items) { items.forEach(function (x) { x.id = newId(); draft.schedule.push(x); }); changed(true); },
        // Replace the event's fields (keeps id / owner), so old desc_ja / desc_ko don't hide the new single 説明.
        update: function (id, item) {
          var x = find(id); if (!x) return;
          Object.keys(x).forEach(function (k) { if (k !== "id" && k !== "owner") delete x[k]; });
          Object.keys(item).forEach(function (k) { if (k !== "id" && k !== "owner") x[k] = item[k]; });
          changed(true);
        },
        remove: function (id) { draft.schedule = draft.schedule.filter(function (x) { return x.id !== id; }); changed(true); }
      });
    }],
    news: ["お知らせ", function () {
      return listEditor("お知らせ", "news", { date: new Date().toISOString().slice(0, 10), title: "", body: "", link: "" }, [
        ["date", "日付", "date"], ["title", "タイトル"], ["body", "本文", "textarea"], ["link", "リンク（任意）"]],
        "日本語と韓国語のページに同じ文が出ます。両方の言語で書くときは、同じ欄に続けて書いてください。");
    }],
    faq: ["よくある質問", function () {
      return listEditor("質問", "faq", { q: "", a: "" }, [["q", "質問"], ["a", "答え", "textarea"]],
        "日本語と韓国語のページに同じ文が出ます。両方の言語で書くときは、同じ欄に続けて書いてください。");
    }],
    settings: ["リンク・設定", settingsEditor],
    people: ["先生・運営スタッフ名簿", peopleEditor]
  };
  /* Which Discord account each teacher / staff member signs in with. The person registers by opening an invite link
     (made by the staff API) and logging in with Discord; only a SHA-256 of their Discord ID is saved. */
  function showInviteLink(name, link) {
    var msg = "YORIMICHI のスタッフ登録リンクです（48時間有効・1回だけ使えます）\nYORIMICHI 스태프 등록 링크입니다 (48시간 유효, 1회만 사용 가능)\n" + link;
    var box = $("div", { class: "yo-modal yo-ui", role: "dialog", "aria-modal": "true" }, [
      $("div", { class: "yo-modal__card" }, [
        $("p", { class: "yo-eyebrow", text: "INVITE" }),
        $("h2", { text: name ? name + " さんの招待リンク" : "新しい人の招待リンク" }),
        $("textarea", { class: "yo-input", rows: "5", readonly: "readonly" }),
        $("p", { class: "yo-muted", text: name
          ? "この文をコピーして、本人にだけ Discord の個別メッセージで送ってください。本人がリンクを開いて「Discord でログインして登録」を押すと、登録が終わります。"
          : "この文をコピーして、本人にだけ Discord の個別メッセージで送ってください。本人が役割（先生／運営スタッフ）とプロフィールを送ると、ここの「承認待ち」に出ます。" }),
        $("div", { class: "yo-row" }, [
          $("button", { class: "yo-btn", type: "button", text: "コピー", on: { click: function (e) {
            var btn = e.currentTarget;
            navigator.clipboard.writeText(msg).then(function () { btn.textContent = "コピーしました"; }, function () { btn.textContent = "手でコピーしてください"; });
          } } }),
          $("button", { class: "yo-btn yo-btn--primary", type: "button", text: "閉じる", on: { click: function () { box.remove(); } } })
        ])
      ])
    ]);
    box.querySelector("textarea").value = msg;
    document.body.appendChild(box);
  }
  function discordField(item) {
    var wrap = $("div", { class: "yo-field" });
    function draw() {
      wrap.innerHTML = "";
      var name = String(item.name || "").trim();
      var acc = keys.accounts.filter(function (a) { return a.name === name; })[0];
      wrap.appendChild($("span", { text: "サイトへのログイン（Discord）" }));
      wrap.appendChild($("div", { class: "yo-row" }, [
        $("span", { class: "yo-muted", text: acc ? "登録済み：" + acc.hint + "（" + acc.set + "）" : "未登録" }),
        $("button", { class: "yo-btn yo-btn--sm yo-nowrap", type: "button", text: acc ? "招待リンクを作り直す" : "招待リンクをコピー", on: { click: async function (e) {
          var btn = e.currentTarget;
          name = String(item.name || "").trim();   // the name may have been typed after this field was drawn
          if (!name) { toast("先に VRChat の表示名を書いてください", false, true); return; }
          if (peopleDirty()) { toast("先に「保存して公開」を押してから、招待リンクを作ってください", false, true); return; }
          if (name === login && !confirm("ここは「" + name + "」（かなさん自身）の欄です。かなさんは名簿に登録しなくても管理者としてログインできます。\n\nほかの人を招待するときは、その人の名前で新しい欄を作ってから、その欄の招待リンクを使ってください。\n\nそれでもこの欄の招待リンクを作りますか？")) return;
          btn.disabled = true;
          try {
            var res = await api("/admin/invite", { method: "POST", body: { name: name } });
            showInviteLink(name, location.origin + "/?invite=" + encodeURIComponent(res.token));
          } catch (err) {
            toast(err.message === "save_first" ? "先に「保存して公開」を押してから、招待リンクを作ってください" : "招待リンクを作れませんでした：" + err.message, false, true);
          }
          btn.disabled = false;
        } } }),
        acc ? $("button", { class: "yo-btn yo-btn--sm yo-btn--danger yo-nowrap", type: "button", text: "外す", on: { click: function () {
          if (!confirm(name + " さんの Discord ログインを外しますか？（保存するとログインできなくなります）")) return;
          keys.accounts = keys.accounts.filter(function (a) { return a !== acc; });
          changed(true); draw();
        } } }) : null
      ]));
    }
    draw();
    return wrap;
  }
  /* Applications sent through "new person" invite links. Approving adds the person to the roster (site + world) and
     links their Discord; the staff API does the writing, then the roster is reloaded here. */
  function applicationsBox() {
    var wrap = $("div", { class: "yo-list" });
    var row = function (label, value) { return value ? $("p", { class: "yo-muted", text: label + "：" + value }) : null; };
    async function draw() {
      wrap.innerHTML = "";
      var res;
      try { res = await api("/admin/applications"); } catch (e) { return; }
      if (!res.apps.length && !res.drafts) return;
      wrap.appendChild($("h3", { class: "yo-section", text: "承認待ち（" + res.apps.length + "）" }));
      if (res.drafts) wrap.appendChild($("p", { class: "yo-muted", text: "ほかに " + res.drafts + " 人が入力中です。" }));
      res.apps.forEach(function (a) {
        var p = a.profile || {}, isT = a.role === "teacher";
        var decide = async function (decision, btn) {
          if (decision === "approve" && (peopleDirty() || keysDirty())) { toast("先に「保存して公開」を押してから承認してください", false, true); return; }
          if (decision !== "approve" && !confirm(a.name + " さんの申請を見送りますか？（申請の内容は消えます）")) return;
          btn.disabled = true;
          try {
            await api("/admin/applications", { method: "POST", body: { id: a.id, decision: decision } });
            if (decision === "approve") { await loadPeople(); changed(true); toast(a.name + " さんを" + (isT ? "先生" : "運営スタッフ") + "として承認しました。1〜2分でサイトとワールドに反映されます。"); openPanel("people"); }
            else { toast("見送りました"); draw(); }
          } catch (e) {
            btn.disabled = false;
            toast(e.message === "name_taken" ? "同じ VRChat 名の人がもう名簿にいます。名簿を確認してください" : "できませんでした：" + e.message, false, true);
          }
        };
        var thumb = $("div", { class: "yo-thumb" });
        if (a.image) thumb.appendChild($("img", { src: a.image, alt: "" })); else thumb.textContent = "写真なし";
        wrap.appendChild($("div", { class: "yo-card yo-card--app" }, [
          $("div", { class: "yo-row" }, [thumb, $("div", {}, [
            $("strong", { text: a.name }),
            $("p", { class: "yo-muted", text: (isT ? "先生" : "運営スタッフ") + " を希望 ・ Discord：" + (a.dn || "") + "（@" + (a.username || "") + "）" })
          ])]),
          row("タグ", (p.tags || []).map(tagName).join("　")),
          row("自己紹介", p.bio),
          $("div", { class: "yo-row yo-row--end" }, [
            $("button", { class: "yo-btn yo-btn--sm yo-btn--danger", type: "button", text: "見送り", on: { click: function (e) { decide("decline", e.currentTarget); } } }),
            $("button", { class: "yo-btn yo-btn--sm yo-btn--primary", type: "button", text: "承認", on: { click: function (e) { decide("approve", e.currentTarget); } } })
          ])
        ]));
      });
    }
    draw();
    return wrap;
  }
  function peopleEditor() {
    var box = $("div", { class: "yo-list" });
    // The role (創設者 / 運営スタッフ / 先生) is chosen with buttons, like Discord roles; only founders see this screen.
    var fields = [["name", "VRChat の表示名（1文字も違わないように）"], ["role", "役職", "role"], ["bio", "自己紹介", "textarea"], ["tags", "タグ", "tags"],
      ["image", "写真", "photo"], ["show", "サイトに表示", "bool"]];
    var blank = { name: "", bio: "", tags: [], image: "", show: true };
    box.appendChild($("div", { class: "yo-note" }, [
      $("strong", { text: "ここに書いた人が、サイトとワールドで役職を持ちます。役職はボタンで変えられます。" }),
      $("span", { text: "創設者：すべて（名簿・役職・招待・リンクなど）／運営スタッフ：予定・お知らせ・質問・サイトの文章と写真（役職や名簿は変えられません）／先生：自分の予定とプロフィール。" }),
      $("span", { text: "ワールドでは、先生は教室の鍵をかけられ、運営スタッフ・創設者は鍵のかかった教室にも入れます。保存してから数分で反映されます（ワールドにいる人は最大5分ほど）。「サイトに表示しない」にしても役職はそのままです。" }),
      $("span", { text: "新しい人を迎えるには：「新しい人を招待」→ リンクを本人に Discord で送る → 本人が役割とプロフィールを送る →「承認待ち」で「承認」。" })
    ]));
    box.appendChild($("button", { class: "yo-btn yo-btn--primary yo-btn--block", type: "button", text: "＋ 新しい人を招待（招待リンクを作る）", on: { click: async function (e) {
      var btn = e.currentTarget; btn.disabled = true;
      try { var res = await api("/admin/invite", { method: "POST", body: {} }); showInviteLink("", location.origin + "/?invite=" + encodeURIComponent(res.token)); }
      catch (err) { toast("招待リンクを作れませんでした：" + err.message, false, true); }
      btn.disabled = false;
    } } }));
    box.appendChild(applicationsBox());
    box.appendChild($("h3", { class: "yo-section", text: "創設者・運営スタッフ" }));
    box.appendChild(listEditor("運営スタッフ", function () { return people.staff; }, blank, fields, null, discordField));
    box.appendChild($("h3", { class: "yo-section", text: "先生" }));
    box.appendChild(listEditor("先生", function () { return people.teachers; }, blank, fields, null, discordField));
    return box;
  }
  function roleOf(item) { return people.teachers.indexOf(item) >= 0 ? "teacher" : item.rank === "founder" ? "founder" : "staff"; }
  // Role buttons: moving someone between the lists changes what they can do on the site and in the world.
  function roleField(label, item) {
    var cur = roleOf(item);
    // Only the owner (かなさん) may give or take 創設者 — also checked by the staff API.
    var locked = function (role) { return !OWNER && (role === "founder" || cur === "founder"); };
    var pick = function (role) {
      if (role === cur) return;
      if (locked(role)) { toast("「創設者」の付け外しは、かなさんだけができます", false, true); return; }
      var name = String(item.name || "").trim() || "この人";
      if (role === "founder" && !confirm(name + " さんを「創設者」にしますか？\n創設者は、名簿・役職・招待・リンクなど、すべてを変えられるようになります。")) return;
      if (cur === "founder" && name === login && !confirm("自分の「創設者」を外しますか？（Discord アプリの持ち主のかなさんは、外しても管理者のままです）")) return;
      people.teachers = people.teachers.filter(function (x) { return x !== item; });
      people.staff = people.staff.filter(function (x) { return x !== item; });
      if (role === "teacher") { delete item.rank; people.teachers.push(item); }
      else { if (role === "founder") item.rank = "founder"; else delete item.rank; people.staff.push(item); }
      changed(true); openPanel("people");
    };
    var opts = [["founder", "創設者"], ["staff", "運営スタッフ"], ["teacher", "先生"]];
    return $("div", { class: "yo-field" }, [$("span", { text: label }), $("div", { class: "yo-tags" }, opts.map(function (o) {
      var attrs = { type: "button", class: "yo-tag yo-role yo-role--" + o[0] + (cur === o[0] ? " is-on" : ""), text: (cur === o[0] ? "✓ " : "") + o[1],
        on: { click: function () { pick(o[0]); } } };
      if (cur !== o[0] && locked(o[0])) { attrs.disabled = "disabled"; attrs.title = "「創設者」の付け外しは、かなさんだけができます"; }
      return $("button", attrs);
    })), !OWNER && cur === "founder" ? $("span", { class: "yo-muted", text: "創設者の役職は、かなさんだけが変えられます。" }) : null]);
  }
  function openPanel(tab) {
    if (panel) panel.remove();
    panel = $("aside", { class: "yo-panel yo-ui" }, [
      $("div", { class: "yo-panel__head" }, [
        $("h2", { text: tab === "settings" && !founder() ? "設定" : TABS[tab][0] }),
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
      $("span", { class: "yo-bar__who", title: (founder() ? "創設者" : "運営スタッフ") + "としてログイン中" + (whoUser ? "（@" + whoUser + "）" : ""),
        text: "● " + (who || login) + "（" + (founder() ? "創設者" : "運営") + "）" }),
      b("✎ 編集する", function () { setEditing(!editing); }, { "data-edit": "1" }),
      b("予定", function () { openPanel("schedule"); }),
      b("お知らせ", function () { openPanel("news"); }),
      b("質問", function () { openPanel("faq"); }),
      // 運営スタッフ edit their own profile (staff.js), not the roster.
      !founder() && window.YORIMICHI_OPEN_PROFILE ? b("プロフィール", function () { window.YORIMICHI_OPEN_PROFILE(); }) : null,
      !founder() ? null : b("名簿", async function () {
        if (!people) return;
        // Pick up registrations, approvals and members' own profile edits made since this page was opened.
        if (!keysDirty() && !peopleDirty()) {
          try { await loadPeople(); changed(true); } catch (e) { /* show what we have */ }
        }
        openPanel("people");
      }),
      b(founder() ? "リンク・設定" : "設定", function () { openPanel("settings"); }),
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
    ".yo-tags{display:flex;flex-wrap:wrap;gap:6px}",
    ".yo-tag{padding:6px 11px;border:1px solid var(--line);border-radius:999px;background:#fff;font:inherit;font-size:12.5px;font-weight:700;color:var(--ink);cursor:pointer}",
    ".yo-tag:hover{border-color:var(--accent)}.yo-tag.is-on{background:var(--accent);border-color:var(--accent);color:#fff}",
    ".yo-role{font-size:13.5px;padding:8px 14px}.yo-role:disabled{opacity:.4;cursor:not-allowed}",
    ".yo-role--founder.is-on{background:linear-gradient(90deg,#ff6b8b,#3157ff);border-color:transparent}",
    ".yo-role--teacher.is-on{background:#1f9d57;border-color:#1f9d57}",
    ".yo-card--app{border-color:rgba(49,87,255,.35);box-shadow:0 0 0 3px rgba(49,87,255,.06)}",
    ".yo-card--app p{white-space:pre-wrap}",
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
    // staff.js hands over the Discord session it just checked (also kept in localStorage for the next visit).
    token = window.YORIMICHI_SESSION || null;
    if (!token) { try { token = localStorage.getItem(SESSION_KEY); } catch (e) { token = null; } }
    if (!token || !API) return;
    try { login = await verify(); await ready(); }
    catch (e) {
      // Sign out only when the login really expired; a network hiccup must not sign you out.
      if (e.status === 401) { try { localStorage.removeItem(SESSION_KEY); } catch (x) { /* ignore */ } }
      toast("編集の準備ができませんでした：" + e.message, false, true);
    }
  })();
})();
