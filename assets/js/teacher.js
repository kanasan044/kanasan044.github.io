/* YORIMICHI 先生用の予定エディタ。
   main.js が、このブラウザで先生がログインしているとき（または ?teacher を付けて開いたとき）だけ読み込みます。
   ログインは、かなさんが名簿で発行した「ログインコード」。保存は Cloudflare の API（settings.teacher_api）経由で、
   自分が作った予定しか追加・変更・削除できません。 */
(function () {
  "use strict";

  var CODE_KEY = "yorimichi-teacher-code";
  var SITE = window.YORIMICHI_SITE;
  if (!SITE) return;
  var API = String(((window.YORIMICHI_CONTENT || {}).settings || {}).teacher_api || "").trim().replace(/\/+$/, "");
  var code = null, name = "", schedule = [];

  // Japanese / Korean pairs for every label (teachers may read either).
  var L = {
    title: ["先生ログイン", "선생님 로그인"],
    intro: ["かなさんから受け取ったログインコードを入力してください。このブラウザにだけ保存されます。", "운영자에게 받은 로그인 코드를 입력해 주세요. 이 브라우저에만 저장됩니다."],
    login: ["ログイン", "로그인"], close: ["閉じる", "닫기"], checking: ["確認しています…", "확인 중…"],
    bad: ["コードが正しくないか、使えなくなっています", "코드가 올바르지 않거나 사용할 수 없습니다"],
    notReady: ["先生用の編集はまだ準備中です", "선생님용 편집은 아직 준비 중입니다"],
    edit: ["予定を編集", "일정 편집"], logout: ["ログアウト", "로그아웃"], teacher: ["先生", "선생님"],
    panel: ["自分の予定", "내 일정"], add: ["＋ 予定を追加", "＋ 일정 추가"],
    note: ["自分で作った予定だけ表示・編集できます。終わった予定はサイトに表示されなくなります。", "직접 만든 일정만 보이고 편집할 수 있습니다. 지난 일정은 사이트에 표시되지 않습니다."],
    empty: ["まだありません", "아직 없습니다"], save: ["保存して公開", "저장하고 공개"], del: ["削除", "삭제"],
    confirmDel: ["この予定を削除しますか？", "이 일정을 삭제할까요?"], saving: ["保存しています…", "저장 중…"],
    done: ["公開しました！ 1〜2分でみんなのサイトにも反映されます。", "공개했습니다! 1~2분 후 모든 사람의 사이트에 반영됩니다."],
    failed: ["保存できませんでした", "저장하지 못했습니다"],
    date: ["日付", "날짜"], start: ["開始", "시작"], end: ["終了", "종료"], type: ["種類", "종류"],
    title_ja: ["タイトル（日本語）", "제목（일본어）"], title_ko: ["タイトル（韓国語）", "제목（한국어）"],
    desc_ja: ["説明（日本語）", "설명（일본어）"], desc_ko: ["説明（韓国語）", "설명（한국어）"],
    host: ["担当", "담당"], place: ["場所", "장소"]
  };
  var ERR = {
    bad_date: ["日付を入れてください", "날짜를 입력해 주세요"], bad_time: ["時間を入れてください", "시간을 입력해 주세요"],
    no_title: ["タイトルを入れてください（日本語か韓国語のどちらか）", "제목을 입력해 주세요（일본어 또는 한국어）"],
    not_yours: ["ほかの人の予定は変更できません", "다른 사람의 일정은 변경할 수 없습니다"],
    not_found: ["この予定は見つかりませんでした（削除された可能性があります）", "이 일정을 찾을 수 없습니다（삭제되었을 수 있습니다）"],
    busy: ["混み合っています。もう一度押してください", "혼잡합니다. 다시 눌러 주세요"]
  };
  function t(k) { var p = L[k]; return SITE.getLang() === "ko" ? p[1] : p[0]; }
  function both(k) { return L[k][0] + " / " + L[k][1]; }
  function errText(e) { var p = ERR[e.message]; return p ? (SITE.getLang() === "ko" ? p[1] : p[0]) : e.message; }

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

  async function call(method, path, body) {
    var r = await fetch(API + path, {
      method: method, cache: "no-store",
      headers: { Authorization: "Bearer " + code, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    var j = {}; try { j = await r.json(); } catch (e) { /* no body */ }
    if (!r.ok) { var err = new Error(j.error || ("HTTP " + r.status)); err.status = r.status; throw err; }
    return j;
  }

  // Show the latest schedule on the page right away (GitHub Pages needs a minute or two to catch up).
  function apply(list) {
    schedule = list || [];
    var c = window.YORIMICHI_CONTENT || {};
    c.schedule = schedule;
    window.YORIMICHI_CONTENT = c;
    SITE.setContent(c);
  }

  /* ---------- sign-in ---------- */
  function showLogin(message) {
    var input = $("input", { type: "password", class: "yo-input", placeholder: "XXXX-XXXX-XXXX-XXXX", autocomplete: "off" });
    var err = $("p", { class: "yo-err", text: message || "" });
    var btn = $("button", { class: "yo-btn yo-btn--primary", type: "button", text: both("login") });
    var box = $("div", { class: "yo-modal yo-ui", role: "dialog", "aria-modal": "true" }, [
      $("div", { class: "yo-modal__card" }, [
        $("p", { class: "yo-eyebrow", text: "TEACHER" }),
        $("h2", { text: both("title") }),
        $("p", { class: "yo-muted", text: L.intro[0] }), $("p", { class: "yo-muted", text: L.intro[1] }),
        input, err,
        $("div", { class: "yo-row" }, [$("button", { class: "yo-btn", type: "button", text: both("close"), on: { click: function () { box.remove(); } } }), btn])
      ])
    ]);
    btn.addEventListener("click", async function () {
      code = input.value.trim();
      if (!code) return;
      btn.disabled = true; err.textContent = both("checking");
      try {
        name = (await call("GET", "/me")).name;
        try { localStorage.setItem(CODE_KEY, code); } catch (e) { /* private window */ }
        box.remove();
        await ready();
      } catch (e) {
        code = null; btn.disabled = false;
        err.textContent = e.status === 401 ? both("bad") : e.message;
      }
    });
    document.body.appendChild(box);
    input.focus();
  }
  function logout() {
    try { localStorage.removeItem(CODE_KEY); } catch (e) { /* ignore */ }
    location.href = location.pathname;
  }

  /* ---------- panel ---------- */
  var panel = null;
  function field(item, key, type, options) {
    var input;
    if (type === "textarea") input = $("textarea", { class: "yo-input", rows: "3" });
    else if (type === "select") { input = $("select", { class: "yo-input" }); options.forEach(function (o) { input.appendChild($("option", { value: o[0], text: SITE.getLang() === "ko" ? o[1] : o[0] })); }); }
    else input = $("input", { class: "yo-input", type: type || "text" });
    input.value = item[key] || "";
    input.addEventListener("input", function () { item[key] = input.value; });
    return $("label", { class: "yo-field" }, [$("span", { text: t(key) }), input]);
  }
  function card(item, isNew) {
    var draft = JSON.parse(JSON.stringify(item));
    var saveBtn = $("button", { class: "yo-btn yo-btn--sm yo-btn--primary", type: "button", text: t("save") });
    var el = $("div", { class: "yo-card" }, [
      field(draft, "date", "date"), field(draft, "start", "time"), field(draft, "end", "time"),
      field(draft, "type", "select", [["授業", "수업"], ["イベント", "이벤트"]]),
      field(draft, "title_ja"), field(draft, "title_ko"), field(draft, "desc_ja", "textarea"), field(draft, "desc_ko", "textarea"),
      field(draft, "host"), field(draft, "place"),
      $("div", { class: "yo-row yo-row--end" }, [
        $("button", { class: "yo-btn yo-btn--sm yo-btn--danger", type: "button", text: t("del"), on: { click: async function () {
          if (isNew) { el.remove(); return; }
          if (!confirm(t("confirmDel"))) return;
          await send({ op: "delete", id: item.id });
        } } }),
        saveBtn
      ])
    ]);
    saveBtn.addEventListener("click", async function () {
      saveBtn.disabled = true;
      await send(isNew ? { op: "add", item: draft } : { op: "update", id: item.id, item: draft });
      saveBtn.disabled = false;
    });
    return el;
  }
  async function send(body) {
    toast(t("saving"), true);
    try {
      var res = await call("POST", "/schedule", body);
      apply(res.schedule);
      drawPanel();
      toast(t("done"));
    } catch (e) {
      toast(t("failed") + "：" + errText(e), false, true);
    }
  }
  function drawPanel() {
    if (!panel) return;
    var body = panel.querySelector(".yo-panel__body");
    body.innerHTML = "";
    var list = $("div", { class: "yo-list" });
    list.appendChild($("button", { class: "yo-btn yo-btn--primary yo-btn--block", type: "button", text: t("add"), on: { click: function () {
      var blank = { date: new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10), start: "21:00", end: "22:00", type: "授業", host: name };
      list.insertBefore(card(blank, true), list.children[2] || null);
    } } }));
    list.appendChild($("p", { class: "yo-muted", text: t("note") }));
    var mine = schedule.filter(function (x) { return x.owner === name; });
    if (!mine.length) list.appendChild($("p", { class: "yo-empty", text: t("empty") }));
    mine.forEach(function (x) { list.appendChild(card(x, false)); });
    body.appendChild(list);
  }
  function openPanel() {
    if (panel) panel.remove();
    panel = $("aside", { class: "yo-panel yo-ui" }, [
      $("div", { class: "yo-panel__head" }, [
        $("h2", { text: t("panel") }),
        $("button", { class: "yo-btn yo-btn--sm", type: "button", text: t("close"), on: { click: function () { panel.remove(); panel = null; } } })
      ]),
      $("div", { class: "yo-panel__body" })
    ]);
    document.body.appendChild(panel);
    drawPanel();
  }

  /* ---------- toolbar ---------- */
  var bar = null;
  function buildBar() {
    if (bar) bar.remove();
    var b = function (text, fn, cls) { return $("button", { type: "button", class: "yo-bar__btn " + (cls || ""), text: text, on: { click: fn } }); };
    bar = $("div", { class: "yo-bar yo-ui" }, [
      $("span", { class: "yo-bar__who", text: "● " + name + "（" + t("teacher") + "）" }),
      b(t("edit"), openPanel, "yo-bar__save"),
      b(t("logout"), logout, "yo-bar__ghost")
    ]);
    document.body.appendChild(bar);
  }
  document.addEventListener("yorimichi:lang", function () { if (bar) buildBar(); if (panel) openPanel(); });

  var toastTimer = 0;
  function toast(msg, stay, bad) {
    var el = document.querySelector(".yo-toast") || document.body.appendChild($("div", { class: "yo-toast yo-ui", role: "status" }));
    el.textContent = msg; el.classList.toggle("is-bad", !!bad); el.classList.add("is-on");
    clearTimeout(toastTimer);
    if (!stay) toastTimer = setTimeout(function () { el.classList.remove("is-on"); }, bad ? 9000 : 4500);
  }

  async function ready() {
    buildBar();
    try { apply((await call("GET", "/schedule")).schedule); } catch (e) { toast(t("failed") + "：" + errText(e), false, true); }
  }

  /* ---------- styles (same look as the admin editor) ---------- */
  document.head.appendChild($("style", { text: [
    ".yo-ui{font-family:var(--font-ja);color:var(--ink);line-height:1.5}",
    ".yo-bar{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:97;display:flex;align-items:center;gap:4px;padding:6px;max-width:calc(100% - 24px);overflow-x:auto;background:rgba(12,14,19,.92);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-radius:999px;box-shadow:0 20px 40px -12px rgba(0,0,0,.45);color:#fff}",
    ".yo-bar__who{padding:0 12px 0 10px;font-size:12.5px;font-weight:700;color:#7ee2a8;white-space:nowrap}",
    ".yo-bar__btn{border:0;background:transparent;color:#fff;padding:9px 14px;border-radius:999px;font:inherit;font-size:13.5px;font-weight:600;white-space:nowrap;cursor:pointer}",
    ".yo-bar__btn:hover{background:rgba(255,255,255,.1)}",
    ".yo-bar__save{background:var(--accent)}.yo-bar__save:hover{background:var(--accent-ink)}",
    ".yo-bar__ghost{color:rgba(255,255,255,.6)}",
    ".yo-panel{position:fixed;top:0;right:0;bottom:0;z-index:95;width:min(440px,100%);display:flex;flex-direction:column;background:#fff;box-shadow:-20px 0 50px -20px rgba(16,24,40,.35)}",
    ".yo-panel__head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--line)}",
    ".yo-panel__head h2{font-size:18px;margin:0}",
    ".yo-panel__body{flex:1;overflow-y:auto;padding:16px 20px 120px;background:var(--soft)}",
    ".yo-list{display:grid;gap:12px}",
    ".yo-card{display:grid;gap:10px;padding:16px;background:#fff;border:1px solid var(--line);border-radius:16px}",
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
    ".yo-toast{position:fixed;left:50%;bottom:84px;transform:translate(-50%,10px);z-index:98;max-width:min(560px,calc(100% - 32px));padding:12px 18px;border-radius:14px;background:#fff;border:1px solid var(--line);box-shadow:var(--shadow);font-size:14px;font-weight:600;opacity:0;pointer-events:none;transition:all .25s}",
    ".yo-toast.is-on{opacity:1;transform:translate(-50%,0)}",
    ".yo-toast.is-bad{border-color:rgba(212,60,100,.4);color:#b02a50}"
  ].join("\n") }));

  /* ---------- start ---------- */
  (async function () {
    var asked = /[?&]teacher\b/.test(location.search);
    try { code = localStorage.getItem(CODE_KEY); } catch (e) { code = null; }
    if (!API) { if (asked) toast(both("notReady"), false, true); return; }
    if (!code) { if (asked) showLogin(); return; }
    try { name = (await call("GET", "/me")).name; await ready(); }
    catch (e) {
      if (e.status === 401) { try { localStorage.removeItem(CODE_KEY); } catch (x) { /* ignore */ } code = null; if (asked) showLogin(both("bad")); }
      else toast(both("failed") + "：" + e.message, false, true);
    }
  })();
})();
