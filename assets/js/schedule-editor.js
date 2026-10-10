/* YORIMICHI schedule editor: month calendar + templates + one-tap time / length / place + weekly repeat.
   Shared by the admin editor (admin.js, saves with 「保存して公開」) and the teachers' panel (staff.js, saves through the
   staff API right away). Loaded only for signed-in admins / teachers.
   YorimichiScheduleEditor(opts) returns an element. opts:
     lang()            "ja" | "ko" (labels)
     items()           all events (shown on the calendar)
     canEdit(item)     may this event be edited / deleted
     templates()       shared templates (made by the admin)
     saveTemplate(t)   admin: store a shared template (omit for teachers: they keep their own in this browser)
     removeTemplate(i) admin: remove shared template i
     add(items) / update(id, item) / remove(id)   may return promises
     host              default 担当の先生
     hosts()           names offered as buttons for 担当の先生 (e.g. the teachers in the roster)
     cats              [key, 日本語, 한국어, "授業" | "イベント"] — what the event is (title + type come from this)
     notice            text shown after adding (e.g. "「保存して公開」で公開されます")
     toast(msg, bad)   message helper */
(function () {
  "use strict";

  var L = {
    prev: ["前の月", "이전 달"], next: ["次の月", "다음 달"], today: ["今日", "오늘"],
    days: ["日月火水木金土", "일월화수목금토"],
    pickDay: ["カレンダーの日付を押すか、テンプレートを選んでください", "달력의 날짜를 누르거나 템플릿을 선택해 주세요"],
    templates: ["テンプレートから作る", "템플릿으로 만들기"], blank: ["白紙から", "빈 양식"],
    mine: ["自分用", "내 템플릿"], shared: ["共通", "공통"],
    newOn: ["の予定を作る", " 일정 만들기"], editing: ["予定を編集", "일정 편집"],
    date: ["日付", "날짜"], start: ["開始", "시작"], length: ["長さ", "길이"], end: ["終了", "종료"],
    min30: ["30分", "30분"], h1: ["1時間", "1시간"], h15: ["1.5時間", "1.5시간"], h2: ["2時間", "2시간"],
    lesson: ["授業", "수업"], event: ["イベント", "이벤트"],
    place: ["場所", "장소"], placeOther: ["その他の場所", "기타 장소"],
    cat: ["内容", "내용"], host: ["担当の先生", "담당 선생님"], hostOther: ["名前を入力", "이름 입력"],
    desc: ["説明（任意）", "설명（선택）"],
    repeat: ["くり返し", "반복"], once: ["1回だけ", "1회만"], weekly: ["毎週・{n}回", "매주·{n}회"],
    add: ["予定を追加", "일정 추가"], addN: ["{n}件の予定を追加", "일정 {n}개 추가"], saveEdit: ["変更を保存", "변경 저장"], cancel: ["やめる", "취소"],
    asTemplate: ["テンプレートとして保存", "템플릿으로 저장"], templateSaved: ["テンプレートに追加しました", "템플릿에 추가했습니다"],
    removeTemplate: ["このテンプレートを消しますか？", "이 템플릿을 삭제할까요?"],
    needTitle: ["「内容」を選んでください", "'내용'을 선택해 주세요"],
    needDate: ["日付を選んでください", "날짜를 선택해 주세요"],
    clash: ["同じ時間に {place} で「{title}」があります", "같은 시간에 {place}에서 '{title}' 일정이 있습니다"],
    listTitle: ["この月の予定", "이번 달 일정"], none: ["この月の予定はまだありません", "이번 달 일정이 아직 없습니다"],
    copyNext: ["来週にコピー", "다음 주로 복사"], edit: ["編集", "편집"], del: ["削除", "삭제"], others: ["ほかの人の予定", "다른 사람의 일정"],
    confirmDel: ["この予定を削除しますか？", "이 일정을 삭제할까요?"], added: ["追加しました", "추가했습니다"], saved: ["保存しました", "저장했습니다"], deleted: ["削除しました", "삭제했습니다"]
  };
  var BUILTIN = [
    { cat: "ja_study", start: "21:00", dur: 60, place: "1-1" },
    { cat: "ko_study", start: "21:00", dur: 60, place: "1-2" },
    { cat: "exchange", start: "22:00", dur: 60, place: "中央広場" }
  ];
  var PLACES = ["1-1", "1-2", "1-3", "1-4", "1-5", "1-6", "中央広場"];
  var STARTS = ["19:00", "20:00", "20:30", "21:00", "21:30", "22:00"];
  var DURS = [[30, "min30"], [60, "h1"], [90, "h15"], [120, "h2"]];

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
  // Dates are "YYYY-MM-DD" in Japan / Korea time; arithmetic is done in UTC so the viewer's time zone never matters.
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function parseYmd(s) { var p = String(s).split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function todayYmd() { return ymd(new Date(Date.now() + 9 * 3600000)); }
  function addDays(s, n) { var d = parseYmd(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
  function toMin(hm) { var p = String(hm || "0:0").split(":"); return (+p[0]) * 60 + (+p[1] || 0); }
  function fromMin(m) { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
  function durOf(x) { return x.end ? ((toMin(x.end) - toMin(x.start) + 1440) % 1440) || 60 : 60; }

  window.YorimichiScheduleEditor = function (opts) {
    var ko = function () { return opts.lang() === "ko"; };
    var t = function (k, vars) { var s = L[k][ko() ? 1 : 0]; Object.keys(vars || {}).forEach(function (v) { s = s.split("{" + v + "}").join(vars[v]); }); return s; };
    var toast = opts.toast || function () {};
    var root = $("div", { class: "yo-se" });
    var today = todayYmd();
    var month = today.slice(0, 7);      // "YYYY-MM" shown
    var form = null;                     // { mode: "new" | "edit", id, data, weeks }
    var CATS = opts.cats || [];
    var catOf = function (key) { return CATS.filter(function (c) { return c[0] === key; })[0]; };
    // Choosing 内容 fills in both titles and 授業／イベント.
    function setCat(d, key) { var c = catOf(key); if (!c) return; d.cat = key; d.title_ja = c[1]; d.title_ko = c[2]; d.type = c[3]; }
    function titleOf(x) { var c = catOf(x.cat); return c ? c[ko() ? 2 : 1] : (ko() ? x.title_ko || x.title_ja : x.title_ja || x.title_ko) || ""; }

    function myTemplates() {
      if (opts.saveTemplate) return [];
      try { return JSON.parse(localStorage.getItem("yorimichi-templates") || "[]"); } catch (e) { return []; }
    }
    function setMyTemplates(list) { try { localStorage.setItem("yorimichi-templates", JSON.stringify(list)); } catch (e) { /* ignore */ } }
    function blank(date) { return { date: date || "", start: "21:00", end: "22:00", type: "授業", cat: "", title_ja: "", title_ko: "", desc: "", host: opts.host || "", place: "" }; }
    function fromTemplate(tp, date) {
      var d = blank(date);
      ["title_ja", "title_ko", "type", "place", "host", "desc"].forEach(function (k) { if (tp[k]) d[k] = tp[k]; });
      if (!d.desc && (tp.desc_ja || tp.desc_ko)) d.desc = tp.desc_ja || tp.desc_ko;
      if (tp.cat) setCat(d, tp.cat);
      d.start = tp.start || d.start; d.end = fromMin(toMin(d.start) + (tp.dur || 60));
      if (!d.host) d.host = opts.host || "";
      return d;
    }
    function openNew(date, tp) {
      form = { mode: "new", weeks: 1, data: tp ? fromTemplate(tp, date) : blank(date) };
      if (date) month = date.slice(0, 7);
      draw(true);
    }
    function openEdit(item) {
      var d = JSON.parse(JSON.stringify(item));
      if (!d.desc && (d.desc_ja || d.desc_ko)) d.desc = d.desc_ja || d.desc_ko;   // older events had two descriptions
      delete d.desc_ja; delete d.desc_ko;
      form = { mode: "edit", id: item.id, weeks: 1, data: d }; month = String(item.date).slice(0, 7); draw(true);
    }

    /* ---------- calendar ---------- */
    function calendar() {
      var first = parseYmd(month + "-01"), y = first.getUTCFullYear(), m = first.getUTCMonth();
      var startDay = first.getUTCDay(), daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      var byDate = {};
      opts.items().forEach(function (x) { (byDate[x.date] = byDate[x.date] || []).push(x); });
      var grid = $("div", { class: "yo-se__grid" });
      t("days").split("").forEach(function (w, i) { grid.appendChild($("span", { class: "yo-se__dow" + (i === 0 ? " is-sun" : i === 6 ? " is-sat" : ""), text: w })); });
      for (var i = 0; i < startDay; i++) grid.appendChild($("span"));
      for (var d = 1; d <= daysIn; d++) {
        (function (date) {
          var evs = byDate[date] || [];
          var cls = "yo-se__day" + (date === today ? " is-today" : "") + (form && form.data.date === date ? " is-sel" : "") + (date < today ? " is-past" : "");
          var dots = $("span", { class: "yo-se__dots" });
          evs.slice(0, 3).forEach(function (x) { dots.appendChild($("i", { class: x.type === "イベント" ? "is-event" : "" })); });
          grid.appendChild($("button", { type: "button", class: cls, title: evs.map(function (x) { return x.start + " " + titleOf(x); }).join("\n"),
            on: { click: function () { if (form && form.mode === "new") { form.data.date = date; draw(true); } else openNew(date); } } },
            [$("span", { text: String(+date.slice(8)) }), dots]));
        })(month + "-" + String(d).padStart(2, "0"));
      }
      var title = ko() ? y + "년 " + (m + 1) + "월" : y + "年" + (m + 1) + "月";
      var shift = function (n) { var dd = parseYmd(month + "-01"); dd.setUTCMonth(dd.getUTCMonth() + n); month = ymd(dd).slice(0, 7); draw(); };
      return $("div", { class: "yo-se__cal" }, [
        $("div", { class: "yo-se__calhead" }, [
          $("button", { type: "button", class: "yo-se__nav", title: t("prev"), text: "‹", on: { click: function () { shift(-1); } } }),
          $("strong", { text: title }),
          $("button", { type: "button", class: "yo-se__nav", title: t("next"), text: "›", on: { click: function () { shift(1); } } }),
          $("button", { type: "button", class: "yo-se__todaybtn", text: t("today"), on: { click: function () { month = today.slice(0, 7); draw(); } } })
        ]),
        grid
      ]);
    }

    /* ---------- templates ---------- */
    function templateChips() {
      var date = form && form.mode === "new" ? form.data.date : "";
      var chip = function (tp, label, onRemove) {
        var b = $("button", { type: "button", class: "yo-se__tpl", on: { click: function () { openNew(date || nextDateFor(tp), tp); } } }, [
          $("strong", { text: label || titleOf(tp) }),
          tp.start ? $("span", { text: tp.start + "〜" + fromMin(toMin(tp.start) + (tp.dur || 60)) + (tp.place ? " ・ " + tp.place : "") }) : null
        ]);
        if (!onRemove) return b;
        return $("span", { class: "yo-se__tplwrap" }, [b, $("button", { type: "button", class: "yo-se__tplx", title: "×", text: "×", on: { click: function () { if (confirm(t("removeTemplate"))) onRemove(); } } })]);
      };
      var row = $("div", { class: "yo-se__tpls" });
      BUILTIN.forEach(function (tp) { row.appendChild(chip(tp)); });
      (opts.templates() || []).forEach(function (tp, i) { row.appendChild(chip(tp, null, opts.removeTemplate ? function () { opts.removeTemplate(i); draw(); } : null)); });
      myTemplates().forEach(function (tp, i) { row.appendChild(chip(tp, null, function () { var l = myTemplates(); l.splice(i, 1); setMyTemplates(l); draw(); })); });
      row.appendChild(chip({}, t("blank")));
      return $("div", { class: "yo-se__block" }, [$("p", { class: "yo-se__label", text: t("templates") }), row]);
    }
    // No date chosen yet: the next day from today that has no event at the template's time.
    function nextDateFor(tp) {
      var d = today;
      for (var i = 0; i < 60; i++) {
        var clash = opts.items().some(function (x) { return x.date === d && x.start === (tp.start || "21:00") && (!tp.place || x.place === tp.place); });
        if (!clash) return d;
        d = addDays(d, 1);
      }
      return today;
    }

    /* ---------- the form ---------- */
    function chips(values, current, label, onPick) {
      return $("div", { class: "yo-se__chips" }, values.map(function (v) {
        var val = Array.isArray(v) ? v[0] : v, text = Array.isArray(v) ? t(v[1]) : v;
        return $("button", { type: "button", class: "yo-se__chip" + (String(current) === String(val) ? " is-on" : ""), text: text, on: { click: function () { onPick(val); } } });
      }));
    }
    function input(data, key, type) {
      var el = type === "textarea" ? $("textarea", { class: "yo-input", rows: "2" }) : $("input", { class: "yo-input", type: type || "text" });
      el.value = data[key] || "";
      el.addEventListener("input", function () { data[key] = el.value; if (key === "date" || key === "start") refreshClash(); });
      if (key === "date") el.addEventListener("change", function () { if (el.value) { month = el.value.slice(0, 7); draw(true); } });
      return el;
    }
    var clashBox = null;
    function refreshClash() {
      if (!clashBox || !form) return;
      var d = form.data, s = toMin(d.start), e = s + durOf(d);
      var other = opts.items().filter(function (x) {
        if (x.id && x.id === form.id) return false;
        if (x.date !== d.date || (d.place && x.place && x.place !== d.place)) return false;
        var xs = toMin(x.start), xe = xs + durOf(x);
        return xs < e && s < xe;
      })[0];
      clashBox.textContent = other ? "⚠ " + t("clash", { place: other.place || "—", title: titleOf(other) }) : "";
      clashBox.hidden = !other;
    }
    function formBox() {
      var d = form.data, isNew = form.mode === "new";
      var field = function (k, el) { return $("label", { class: "yo-field" }, [$("span", { text: t(k) }), el]); };
      var dur = durOf(d);
      var setStart = function (v) { d.start = v; d.end = fromMin(toMin(v) + dur); draw(true); };
      var setDur = function (m) { d.end = fromMin(toMin(d.start) + m); draw(true); };
      var placeIn = input(d, "place");
      placeIn.placeholder = t("placeOther");
      var hostIn = input(d, "host");
      hostIn.placeholder = t("hostOther");
      var hosts = (opts.hosts ? opts.hosts() : []).filter(Boolean);
      var catChips = $("div", { class: "yo-se__chips" }, CATS.map(function (c) {
        return $("button", { type: "button", class: "yo-se__chip yo-se__chip--cat" + (c[3] === "イベント" ? " is-event" : "") + (d.cat === c[0] ? " is-on" : ""),
          text: c[ko() ? 2 : 1], on: { click: function () { setCat(d, c[0]); draw(true); } } });
      }));
      clashBox = $("p", { class: "yo-se__clash", hidden: "hidden" });
      var weeksSel = $("select", { class: "yo-input" });
      [1, 2, 4, 8, 12].forEach(function (n) { weeksSel.appendChild($("option", { value: String(n), text: n === 1 ? t("once") : t("weekly", { n: n }) })); });
      weeksSel.value = String(form.weeks);
      var mainBtn = $("button", { type: "button", class: "yo-btn yo-btn--primary", text: isNew ? (form.weeks > 1 ? t("addN", { n: form.weeks }) : t("add")) : t("saveEdit") });
      weeksSel.addEventListener("change", function () { form.weeks = +weeksSel.value; mainBtn.textContent = form.weeks > 1 ? t("addN", { n: form.weeks }) : t("add"); });
      mainBtn.addEventListener("click", async function () {
        if (!d.date) { toast(t("needDate"), true); return; }
        if (!d.cat && !String(d.title_ja || "").trim() && !String(d.title_ko || "").trim()) { toast(t("needTitle"), true); return; }
        mainBtn.disabled = true;
        try {
          if (isNew) {
            var list = [];
            for (var i = 0; i < form.weeks; i++) { var c = JSON.parse(JSON.stringify(d)); c.date = addDays(d.date, 7 * i); list.push(c); }
            await opts.add(list);
            toast(t("added") + (opts.notice ? "　" + opts.notice : ""));
          } else {
            await opts.update(form.id, d);
            toast(t("saved") + (opts.notice ? "　" + opts.notice : ""));
          }
          form = null; draw();
        } catch (e) { mainBtn.disabled = false; toast(String(e.message || e), true); }
      });
      var box = $("div", { class: "yo-se__form" }, [
        $("div", { class: "yo-se__formhead" }, [
          $("strong", { text: isNew ? (d.date ? fmtDate(d.date) + t("newOn") : t("add")) : t("editing") }),
          $("button", { type: "button", class: "yo-btn yo-btn--sm", text: t("cancel"), on: { click: function () { form = null; draw(); } } })
        ]),
        field("date", input(d, "date", "date")),
        $("div", { class: "yo-field" }, [$("span", { text: t("cat") + (d.cat || d.title_ja ? "（" + titleOf(d) + " ・ " + t(d.type === "イベント" ? "event" : "lesson") + "）" : "") }), catChips]),
        $("div", { class: "yo-field" }, [$("span", { text: t("start") + "（" + d.start + "）" }), chips(STARTS, d.start, "start", setStart), input(d, "start", "time")]),
        $("div", { class: "yo-field" }, [$("span", { text: t("length") + "（" + t("end") + " " + d.end + "）" }), chips(DURS, dur, "length", setDur)]),
        $("div", { class: "yo-field" }, [$("span", { text: t("place") }), chips(PLACES, d.place, "place", function (v) { d.place = v; draw(true); }), placeIn]),
        $("div", { class: "yo-field" }, [$("span", { text: t("host") }), hosts.length ? chips(hosts, d.host, "host", function (v) { d.host = v; draw(true); }) : null, hostIn]),
        field("desc", input(d, "desc", "textarea")),
        clashBox,
        isNew ? $("label", { class: "yo-field" }, [$("span", { text: t("repeat") }), weeksSel]) : null,
        $("div", { class: "yo-row yo-row--end yo-se__actions" }, [
          $("button", { type: "button", class: "yo-btn yo-btn--sm", text: t("asTemplate"), on: { click: function () {
            var tp = { cat: d.cat, title_ja: d.title_ja, title_ko: d.title_ko, desc: d.desc, type: d.type, start: d.start, dur: durOf(d), place: d.place, host: d.host };
            if (!tp.cat && !tp.title_ja && !tp.title_ko) { toast(t("needTitle"), true); return; }
            if (opts.saveTemplate) opts.saveTemplate(tp); else { var l = myTemplates(); l.push(tp); setMyTemplates(l); }
            toast(t("templateSaved")); draw(true);
          } } }),
          mainBtn
        ])
      ]);
      setTimeout(refreshClash, 0);
      return box;
    }
    function fmtDate(s) {
      var d = parseYmd(s), w = t("days").charAt(d.getUTCDay());
      return ko() ? (d.getUTCMonth() + 1) + "월 " + d.getUTCDate() + "일(" + w + ")" : (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日（" + w + "）";
    }

    /* ---------- this month's events ---------- */
    function monthList() {
      var items = opts.items().filter(function (x) { return String(x.date).slice(0, 7) === month; })
        .sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); });
      var box = $("div", { class: "yo-se__block" }, [$("p", { class: "yo-se__label", text: t("listTitle") })]);
      if (!items.length) { box.appendChild($("p", { class: "yo-empty", text: t("none") })); return box; }
      items.forEach(function (x) {
        var mine = opts.canEdit(x);
        box.appendChild($("div", { class: "yo-se__item" + (x.date < today ? " is-past" : "") + (mine ? "" : " is-other") }, [
          $("div", { class: "yo-se__when" }, [$("strong", { text: fmtDate(x.date) }), $("span", { text: x.start + (x.end ? "〜" + x.end : "") })]),
          $("div", { class: "yo-se__what" }, [
            $("span", { class: "yo-se__type" + (x.type === "イベント" ? " is-event" : ""), text: x.type === "イベント" ? t("event") : t("lesson") }),
            $("strong", { text: titleOf(x) }),
            $("span", { class: "yo-muted", text: [x.place, x.host].filter(Boolean).join(" ・ ") + (mine ? "" : "（" + t("others") + "）") })
          ]),
          $("div", { class: "yo-se__btns" }, [
            $("button", { type: "button", class: "yo-btn yo-btn--sm", text: t("copyNext"), on: { click: function () {
              var c = JSON.parse(JSON.stringify(x)); delete c.id; delete c.owner; c.date = addDays(x.date, 7); if (!mine) c.host = opts.host || "";
              form = { mode: "new", weeks: 1, data: c }; month = c.date.slice(0, 7); draw(true);
            } } }),
            mine ? $("button", { type: "button", class: "yo-btn yo-btn--sm", text: t("edit"), on: { click: function () { openEdit(x); } } }) : null,
            mine ? $("button", { type: "button", class: "yo-btn yo-btn--sm yo-btn--danger", text: t("del"), on: { click: async function (e) {
              if (!confirm(t("confirmDel"))) return;
              e.currentTarget.disabled = true;
              try { await opts.remove(x.id); toast(t("deleted") + (opts.notice ? "　" + opts.notice : "")); if (form && form.id === x.id) form = null; draw(); }
              catch (err) { toast(String(err.message || err), true); draw(); }
            } } }) : null
          ])
        ]));
      });
      return box;
    }

    function draw(focusForm) {
      root.innerHTML = "";
      root.appendChild(calendar());
      if (form) root.appendChild(formBox());
      else root.appendChild($("p", { class: "yo-se__hint", text: t("pickDay") }));
      root.appendChild(templateChips());
      root.appendChild(monthList());
      if (focusForm) { var f = root.querySelector(".yo-se__form"); if (f && f.scrollIntoView) f.scrollIntoView({ block: "nearest" }); }
    }
    draw();
    root.redraw = function () { draw(); };
    return root;
  };

  /* ---------- styles ---------- */
  var css = [
    ".yo-se{display:grid;gap:14px}",
    ".yo-se__cal{background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px}",
    ".yo-se__calhead{display:flex;align-items:center;gap:6px;margin-bottom:8px}.yo-se__calhead strong{flex:1;text-align:center;font-size:15px}",
    ".yo-se__nav{width:32px;height:32px;border:1px solid var(--line);border-radius:10px;background:#fff;font-size:18px;line-height:1;cursor:pointer}",
    ".yo-se__todaybtn{border:1px solid var(--line);border-radius:10px;background:#fff;padding:6px 10px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}",
    ".yo-se__grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}",
    ".yo-se__dow{text-align:center;font-size:11px;font-weight:700;color:var(--muted);padding:2px 0}.yo-se__dow.is-sun{color:#d43c64}.yo-se__dow.is-sat{color:var(--accent)}",
    ".yo-se__day{position:relative;aspect-ratio:1/1;min-height:36px;display:grid;place-items:center;align-content:center;gap:2px;border:0;border-radius:10px;background:var(--soft);font:inherit;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer}",
    ".yo-se__day:hover{background:rgba(49,87,255,.1)}.yo-se__day.is-past{opacity:.45}",
    ".yo-se__day.is-today{box-shadow:inset 0 0 0 2px var(--accent)}",
    ".yo-se__day.is-sel{background:var(--accent);color:#fff;opacity:1}",
    ".yo-se__dots{display:flex;gap:2px;height:5px}.yo-se__dots i{width:5px;height:5px;border-radius:50%;background:var(--accent)}.yo-se__dots i.is-event{background:var(--sakura,#ff6b8b)}",
    ".yo-se__day.is-sel .yo-se__dots i{background:#fff}",
    ".yo-se__hint{margin:0;font-size:13px;color:var(--muted);text-align:center}",
    ".yo-se__block{display:grid;gap:8px}.yo-se__label{margin:0;font-size:13px;font-weight:800;color:var(--ink)}",
    ".yo-se__tpls{display:flex;flex-wrap:wrap;gap:6px}",
    ".yo-se__tpl{display:grid;gap:1px;text-align:left;padding:8px 12px;border:1px solid var(--line);border-radius:12px;background:#fff;font:inherit;cursor:pointer}",
    ".yo-se__tpl strong{font-size:13px}.yo-se__tpl span{font-size:11px;color:var(--muted)}.yo-se__tpl:hover{border-color:var(--accent)}",
    ".yo-se__tplwrap{position:relative;display:inline-flex}.yo-se__tplx{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border:0;border-radius:50%;background:var(--ink);color:#fff;font-size:11px;line-height:18px;cursor:pointer}",
    ".yo-se__form{display:grid;gap:10px;padding:14px;background:#fff;border:2px solid var(--accent);border-radius:16px;box-shadow:0 10px 30px -18px rgba(49,87,255,.6)}",
    ".yo-se__formhead{display:flex;align-items:center;justify-content:space-between;gap:8px}.yo-se__formhead strong{font-size:15px}",
    ".yo-se__chips{display:flex;flex-wrap:wrap;gap:5px}",
    ".yo-se__chip{padding:6px 11px;border:1px solid var(--line);border-radius:999px;background:#fff;font:inherit;font-size:13px;font-weight:700;color:var(--ink);cursor:pointer}",
    ".yo-se__chip:hover{border-color:var(--accent)}.yo-se__chip.is-on{background:var(--accent);border-color:var(--accent);color:#fff}",
    ".yo-se__chip--cat.is-event:not(.is-on){border-color:rgba(255,107,139,.45)}.yo-se__chip--cat.is-event.is-on{background:#e8537a;border-color:#e8537a}",
    ".yo-se__more summary{cursor:pointer;font-size:12.5px;font-weight:700;color:var(--muted);padding:2px 0}.yo-se__more[open]{display:grid;gap:8px}",
    ".yo-se__clash{margin:0;padding:8px 10px;border-radius:10px;background:#fff4e5;color:#9a5b00;font-size:12.5px;font-weight:700}",
    ".yo-se__actions{flex-wrap:wrap}",
    ".yo-se__item{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;padding:10px 12px;background:#fff;border:1px solid var(--line);border-radius:14px}",
    ".yo-se__item.is-past{opacity:.55}.yo-se__item.is-other{background:var(--soft)}",
    ".yo-se__when{display:grid;font-size:12px;color:var(--muted)}.yo-se__when strong{font-size:13px;color:var(--ink)}",
    ".yo-se__what{display:grid;gap:1px;min-width:0}.yo-se__what strong{font-size:14px;overflow-wrap:anywhere}",
    ".yo-se__type{justify-self:start;padding:1px 8px;border-radius:999px;background:rgba(49,87,255,.1);color:var(--accent);font-size:11px;font-weight:800}",
    ".yo-se__type.is-event{background:rgba(255,107,139,.12);color:#d43c64}",
    ".yo-se__btns{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}"
  ].join("\n");
  var style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
})();
