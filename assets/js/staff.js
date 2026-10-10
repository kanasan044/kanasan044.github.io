/* YORIMICHI 先生・運営スタッフ用（Discord ログイン）。
   main.js が、このブラウザでログインしているとき（または Discord ログインから戻ってきたとき）だけ読み込みます。
   役職は Cloudflare の API（settings.staff_api）が名簿で判定します。先生は自分が作った予定だけ追加・変更・削除でき、
   先生・運営スタッフは自分のプロフィール（担当・紹介・写真）を直せます。招待リンクから来た新しい人は、役割を選んで
   プロフィールを送り、管理者の承認を待ちます。 */
(function () {
  "use strict";

  var SESSION_KEY = "yorimichi-session", NONCE_KEY = "yorimichi-login-n";
  var SITE = window.YORIMICHI_SITE;
  if (!SITE) return;
  var API = SITE.staffApi();
  var token = null, me = null, schedule = [];

  // Japanese / Korean pairs for every label (members may read either).
  var L = {
    teacher: ["先生", "선생님"], staff: ["運営スタッフ", "운영 스태프"],
    edit: ["予定を編集", "일정 편집"], logout: ["ログアウト", "로그아웃"], close: ["閉じる", "닫기"],
    panel: ["予定", "일정"], add: ["＋ 予定を追加", "＋ 일정 추가"],
    note: ["日付を押すかテンプレートを選ぶと、すぐ作れます。編集・削除できるのは自分の予定だけです。保存するとすぐ公開されます。", "날짜를 누르거나 템플릿을 고르면 바로 만들 수 있어요. 편집·삭제는 내 일정만 가능합니다. 저장하면 바로 공개됩니다."],
    empty: ["まだありません", "아직 없습니다"], save: ["保存して公開", "저장하고 공개"], del: ["削除", "삭제"],
    confirmDel: ["この予定を削除しますか？", "이 일정을 삭제할까요?"], saving: ["保存しています…", "저장 중…"],
    done: ["公開しました！ 1〜2分でみんなのサイトにも反映されます。", "공개했습니다! 1~2분 후 모든 사람의 사이트에 반영됩니다."],
    failed: ["うまくいきませんでした", "처리하지 못했습니다"],
    welcome: ["ログインしました", "로그인했습니다"],
    notMember: ["この Discord アカウントは、まだ名簿に登録されていません", "이 Discord 계정은 아직 명단에 등록되어 있지 않습니다"],
    notMemberHelp: ["運営（かなさん）から届く「招待リンク」を開いて登録してください。", "운영자(카나상)에게 받은 '초대 링크'를 열어 등록해 주세요."],
    expired: ["ログインの期限が切れました。もう一度ログインしてください。", "로그인이 만료되었습니다. 다시 로그인해 주세요."],
    expiredKeep: ["しばらく使われていなかったので、ログインの期限が切れました。保存していない変更があります。右上の「スタッフログイン」でもう一度ログインしてから保存してください。", "한동안 사용하지 않아 로그인이 만료되었습니다. 저장하지 않은 변경 사항이 있습니다. 오른쪽 위 '스태프 로그인'으로 다시 로그인한 뒤 저장해 주세요."],
    cancelled: ["ログインをやめました", "로그인을 취소했습니다"],
    invite_expired: ["この招待リンクは期限切れか、使えなくなっています。かなさんに新しいリンクをもらってください。", "이 초대 링크는 만료되었거나 사용할 수 없습니다. 운영자(카나상)에게 새 링크를 받아 주세요."],
    invite_used: ["この招待リンクはもう使われています。かなさんに新しいリンクをもらってください。", "이 초대 링크는 이미 사용되었습니다. 운영자(카나상)에게 새 링크를 받아 주세요."],
    joined: ["登録が完了しました。ようこそ！", "등록이 완료되었습니다. 환영합니다!"],
    need_mfa: ["安全のため、Discord の「2段階認証」をオンにしてからログインしてください。（Discord の「ユーザー設定」→「マイアカウント」→「2段階認証を有効にする」）", "보안을 위해 Discord의 '2단계 인증'을 켠 후 로그인해 주세요. (Discord '사용자 설정' → '내 계정' → '2단계 인증 활성화')"],
    inviteTitle: ["YORIMICHI スタッフ登録", "YORIMICHI 스태프 등록"],
    inviteBody: ["Discord でログインして、登録を進めてください（Discord の2段階認証が必要です）。次からはサイトのいちばん下の「スタッフログイン」からログインできます。", "Discord로 로그인해서 등록을 진행해 주세요 (Discord 2단계 인증이 필요합니다). 다음부터는 사이트 맨 아래의 '스태프 로그인'으로 로그인할 수 있습니다."],
    inviteBtn: ["Discord でログインして登録", "Discord로 로그인하여 등록"],
    date: ["日付", "날짜"], start: ["開始", "시작"], end: ["終了", "종료"], type: ["種類", "종류"],
    title_ja: ["タイトル（日本語）", "제목（일본어）"], title_ko: ["タイトル（韓国語）", "제목（한국어）"],
    desc_ja: ["説明（日本語）", "설명（일본어）"], desc_ko: ["説明（韓国語）", "설명（한국어）"],
    host: ["担当", "담당"], place: ["場所", "장소"],
    // new person: choose a role, then a profile
    obWelcome: ["ようこそ YORIMICHI へ！", "YORIMICHI에 오신 것을 환영합니다!"],
    obStep1: ["あなたの役割を選んでください", "당신의 역할을 선택해 주세요"],
    obTeacher: ["先生", "선생님"], obTeacherSub: ["日本語・韓国語の授業をする", "일본어·한국어 수업을 해요"],
    obStaff: ["運営スタッフ", "운영 스태프"], obStaffSub: ["ワールドの運営やイベントを手伝う", "월드 운영과 이벤트를 도와요"],
    next: ["次へ", "다음"], back: ["戻る", "뒤로"], send: ["送信する", "보내기"],
    obStep2: ["プロフィールを登録してください", "프로필을 등록해 주세요"],
    obStep2Sub: ["サイトの「教員・スタッフ紹介」に載ります。", "사이트의 '선생님·스태프 소개'에 실립니다."],
    vrcName: ["VRChat の表示名（1文字も違わないように）", "VRChat 표시 이름（한 글자도 틀리지 않게）"],
    vrcNameHelp: ["ワールドで先生・スタッフとして扱われる名前です。", "월드에서 선생님·스태프로 인식되는 이름입니다."],
    bio: ["自己紹介（日本語・韓国語どちらでもOK）", "자기소개（일본어·한국어 어느 쪽이든 OK）"],
    tags: ["タグ（押すと追加・もう一度押すと外れます）", "태그（누르면 추가, 다시 누르면 해제）"],
    tagsMax: ["タグは6つまでです", "태그는 6개까지입니다"],
    photo: ["写真（なくても大丈夫）", "사진（없어도 괜찮아요）"], pick: ["写真を選ぶ", "사진 선택"], unpick: ["外す", "삭제"], noPhoto: ["写真なし", "사진 없음"],
    obDone: ["送信しました！", "보냈습니다!"],
    obDoneSub: ["かなさんが確認して承認すると、先生・スタッフとして使えるようになります。承認されたら、サイトのいちばん下の「スタッフログイン」からログインしてください。", "운영자(카나상)가 확인하고 승인하면 선생님·스태프로 이용할 수 있습니다. 승인 후 사이트 맨 아래의 '스태프 로그인'으로 로그인해 주세요."],
    pending: ["承認待ち", "승인 대기"], pendingNote: ["申請を受け付けました。かなさんの承認をお待ちください。", "신청이 접수되었습니다. 운영자(카나상)의 승인을 기다려 주세요."],
    // members: their own profile
    profile: ["プロフィール", "프로필"], profileNote: ["自己紹介・タグ・写真を直せます。VRChat の表示名と役割を変えたいときは、かなさんに伝えてください。", "자기소개·태그·사진을 수정할 수 있어요. VRChat 표시 이름과 역할을 바꾸려면 운영자(카나상)에게 알려 주세요."],
    profileSaved: ["プロフィールを保存しました。1〜2分でサイトに反映されます。", "프로필을 저장했습니다. 1~2분 후 사이트에 반영됩니다."]
  };
  var ERR = {
    bad_date: ["日付を入れてください", "날짜를 입력해 주세요"], bad_time: ["時間を入れてください", "시간을 입력해 주세요"],
    no_title: ["タイトルを入れてください（日本語か韓国語のどちらか）", "제목을 입력해 주세요（일본어 또는 한국어）"],
    not_yours: ["ほかの人の予定は変更できません", "다른 사람의 일정은 변경할 수 없습니다"],
    not_found: ["この予定は見つかりませんでした（削除された可能性があります）", "이 일정을 찾을 수 없습니다（삭제되었을 수 있습니다）"],
    teachers_only: ["予定の編集は先生だけができます", "일정 편집은 선생님만 할 수 있습니다"],
    busy: ["混み合っています。もう一度押してください", "혼잡합니다. 다시 눌러 주세요"],
    discord: ["Discord とうまくつながりませんでした。もう一度お試しください", "Discord와 연결하지 못했습니다. 다시 시도해 주세요"],
    no_name: ["VRChat の表示名を入れてください", "VRChat 표시 이름을 입력해 주세요"],
    bad_role: ["役割を選んでください", "역할을 선택해 주세요"],
    bad_picture: ["この写真は使えませんでした。別の写真を選んでください", "이 사진은 사용할 수 없습니다. 다른 사진을 선택해 주세요"],
    not_applicant: ["招待リンクからもう一度ログインしてください", "초대 링크로 다시 로그인해 주세요"]
  };
  function ko() { return SITE.getLang() === "ko"; }
  function t(k) { return L[k][ko() ? 1 : 0]; }
  function errText(e) { var p = ERR[e.message]; return p ? p[ko() ? 1 : 0] : e.message; }

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

  // Each answer brings a renewed login (X-Session): keep it, so 3 hours of not using the site signs you out.
  function keepSession(r) {
    var s = r && r.headers && r.headers.get ? r.headers.get("X-Session") : null;
    if (!s) return;
    token = s; window.YORIMICHI_SESSION = s;
    try { localStorage.setItem(SESSION_KEY, s); } catch (e) { /* private window */ }
  }
  window.YORIMICHI_KEEP_SESSION = keepSession;   // admin.js uses the same
  async function call(method, path, body) {
    var r = await fetch(API + path, {
      method: method, cache: "no-store",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    keepSession(r);
    var j = {}; try { j = await r.json(); } catch (e) { /* no body */ }
    if (!r.ok) { var err = new Error(j.error || ("HTTP " + r.status)); err.status = r.status; err.body = j; throw err; }
    return j;
  }

  function forget() { try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } token = null; }
  // Log out: the staff API stops this login on every device; the profile and role stay as they are.
  async function logout() {
    try { await call("POST", "/logout"); } catch (e) { /* signed out here anyway */ }
    forget(); location.href = location.pathname + location.search;
  }

  // Coming back from Discord: the page address ends with #yo_session=… (or #yo_error=…) and the value this page saved.
  function takeLoginResult() {
    var h = new URLSearchParams(location.hash.slice(1));
    if (!h.has("yo_session") && !h.has("yo_error")) return null;
    history.replaceState(null, "", location.pathname + location.search);
    var expected = null;
    try { expected = sessionStorage.getItem(NONCE_KEY); sessionStorage.removeItem(NONCE_KEY); } catch (e) { /* ignore */ }
    if (h.get("yo_error")) return { error: h.get("yo_error") };
    if (!expected || h.get("n") !== expected) return { error: "expired" };   // a login this page did not start
    try { localStorage.setItem(SESSION_KEY, h.get("yo_session")); } catch (e) { /* private window: works for this page only */ }
    return { session: h.get("yo_session"), joined: h.has("yo_joined") };
  }

  function pair(k) { return L[k][0] + " / " + L[k][1]; }

  // A picture from this device, shrunk to 640px JPEG (profile photos).
  function pickPicture(done) {
    var input = $("input", { type: "file", accept: "image/*" });
    input.addEventListener("change", function () {
      var file = input.files[0]; if (!file) return;
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, 640 / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        done(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = function () { URL.revokeObjectURL(url); toast(errText({ message: "bad_picture" }), false, true); };
      img.src = url;
    });
    input.click();
  }
  // Tags: tap to add, tap again to remove (up to 6). The list and labels come from main.js (SITE.tags).
  function tagPicker(data) {
    if (!Array.isArray(data.tags)) data.tags = [];
    var wrap = $("div", { class: "yo-field" });
    function draw() {
      wrap.innerHTML = "";
      wrap.appendChild($("span", { text: pair("tags") + "（" + data.tags.length + "/6）" }));
      wrap.appendChild($("div", { class: "yo-tags" }, (SITE.tags || []).map(function (tg) {
        var on = data.tags.indexOf(tg[0]) >= 0;
        return $("button", { type: "button", class: "yo-tag" + (on ? " is-on" : ""), text: (on ? "✓ " : "") + tg[ko() ? 2 : 1], on: { click: function () {
          if (on) data.tags = data.tags.filter(function (k) { return k !== tg[0]; });
          else if (data.tags.length >= 6) { toast(t("tagsMax"), false, true); return; }
          else data.tags = data.tags.concat([tg[0]]);
          draw();
        } } });
      })));
    }
    draw();
    return wrap;
  }
  // Profile form shared by the new-person screen and the members' profile panel.
  function profileForm(role, data, withName) {
    var f = function (key, type) {
      var input = type === "textarea" ? $("textarea", { class: "yo-input", rows: "3" }) : $("input", { class: "yo-input", type: "text" });
      input.value = data[key] || "";
      input.addEventListener("input", function () { data[key] = input.value; });
      return $("label", { class: "yo-field" }, [$("span", { text: pair(key) }), input]);
    };
    var thumb = $("div", { class: "yo-thumb" });
    var showThumb = function () { thumb.innerHTML = ""; if (data.image) thumb.appendChild($("img", { src: data.image, alt: "" })); else thumb.textContent = t("noPhoto"); };
    showThumb();
    var kids = [];
    if (withName) kids.push(f("vrcName"), $("p", { class: "yo-muted", text: pair("vrcNameHelp") }));
    if (withName) { kids[0].querySelector("input").value = data.name || ""; kids[0].querySelector("input").addEventListener("input", function (e) { data.name = e.target.value; }); }
    kids.push(f("bio", "textarea"), tagPicker(data));
    kids.push($("div", { class: "yo-field" }, [$("span", { text: pair("photo") }), $("div", { class: "yo-row" }, [thumb,
      $("button", { class: "yo-btn yo-btn--sm", type: "button", text: t("pick"), on: { click: function () { pickPicture(function (d) { data.image = d; showThumb(); }); } } }),
      $("button", { class: "yo-btn yo-btn--sm", type: "button", text: t("unpick"), on: { click: function () { data.image = ""; showThumb(); } } })
    ])]));
    return $("div", { class: "yo-list" }, kids);
  }

  // Registration must be finished: everything behind the dialog can't be clicked, focused or scrolled.
  // (It shows again on every page until it is sent, so opening another page doesn't skip it.)
  function lockPage(box) {
    Array.prototype.forEach.call(document.body.children, function (n) { if (n !== box && !n.classList.contains("yo-toast")) n.setAttribute("inert", ""); });
    document.documentElement.style.overflow = "hidden";
  }
  function unlockPage() {
    Array.prototype.forEach.call(document.querySelectorAll("[inert]"), function (n) { n.removeAttribute("inert"); });
    document.documentElement.style.overflow = "";
  }

  // New person (opened a "new person" invite): 1) choose 先生 / 運営スタッフ, 2) profile, 3) sent → waits for approval.
  // Shown only until the profile is sent (status "draft"); it can't be closed or skipped.
  function showOnboarding() {
    var data = { role: me.applied || "", name: me.name || "", bio: "", tags: [], image: "" };
    var box = $("div", { class: "yo-modal yo-modal--locked yo-ui", role: "dialog", "aria-modal": "true" });
    var card = $("div", { class: "yo-modal__card yo-modal__card--wide" });
    box.appendChild(card);
    function step1() {
      card.innerHTML = "";
      var choice = function (role, title, sub) {
        var b = $("button", { type: "button", class: "yo-choice" + (data.role === role ? " is-on" : ""), on: { click: function () { data.role = role; step1(); } } }, [
          $("strong", { text: pair(title) }), $("span", { text: L[sub][0] }), $("span", { text: L[sub][1] })
        ]);
        return b;
      };
      card.appendChild($("p", { class: "yo-eyebrow", text: "STEP 1 / 2" }));
      card.appendChild($("h2", { text: L.obWelcome[0] }));
      card.appendChild($("p", { class: "yo-muted", text: L.obWelcome[1] }));
      card.appendChild($("p", { text: pair("obStep1") }));
      card.appendChild($("div", { class: "yo-choices" }, [choice("teacher", "obTeacher", "obTeacherSub"), choice("staff", "obStaff", "obStaffSub")]));
      var next = $("button", { class: "yo-btn yo-btn--primary", type: "button", text: pair("next"), on: { click: step2 } });
      if (!data.role) next.disabled = true;
      card.appendChild($("div", { class: "yo-row yo-row--end" }, [next]));
    }
    function step2() {
      card.innerHTML = "";
      card.appendChild($("p", { class: "yo-eyebrow", text: "STEP 2 / 2 ・ " + pair(data.role === "teacher" ? "obTeacher" : "obStaff") }));
      card.appendChild($("h2", { text: pair("obStep2") }));
      card.appendChild($("p", { class: "yo-muted", text: L.obStep2Sub[0] }));
      card.appendChild($("p", { class: "yo-muted", text: L.obStep2Sub[1] }));
      card.appendChild(profileForm(data.role, data, true));
      var sendBtn = $("button", { class: "yo-btn yo-btn--primary", type: "button", text: pair("send") });
      sendBtn.addEventListener("click", async function () {
        if (!String(data.name || "").trim()) { toast(errText({ message: "no_name" }), false, true); return; }
        sendBtn.disabled = true;
        try { await call("POST", "/apply", data); step3(); }
        catch (e) { sendBtn.disabled = false; toast(t("failed") + "：" + errText(e), false, true); }
      });
      card.appendChild($("div", { class: "yo-row yo-row--end" }, [
        $("button", { class: "yo-btn", type: "button", text: pair("back"), on: { click: step1 } }), sendBtn
      ]));
    }
    function step3() {
      card.innerHTML = "";
      card.appendChild($("p", { class: "yo-eyebrow", text: "THANK YOU" }));
      card.appendChild($("h2", { text: pair("obDone") }));
      card.appendChild($("p", { text: L.obDoneSub[0] }));
      card.appendChild($("p", { class: "yo-muted", text: L.obDoneSub[1] }));
      card.appendChild($("button", { class: "yo-btn yo-btn--primary", type: "button", text: "OK", on: { click: function () { box.remove(); unlockPage(); me.status = "pending"; buildBar(); } } }));
    }
    step1();
    document.body.appendChild(box);
    lockPage(box);
  }

  // Members edit their own 担当／役割, introduction and photo (not the VRChat name or the role).
  async function openProfile() {
    if (panel) panel.remove();
    panel = $("aside", { class: "yo-panel yo-ui" }, [
      $("div", { class: "yo-panel__head" }, [
        $("h2", { text: t("profile") }),
        $("button", { class: "yo-btn yo-btn--sm", type: "button", text: t("close"), on: { click: function () { panel.remove(); panel = null; } } })
      ]),
      $("div", { class: "yo-panel__body" })
    ]);
    document.body.appendChild(panel);
    var body = panel.querySelector(".yo-panel__body");
    var data;
    try { data = await call("GET", "/profile"); } catch (e) { toast(t("failed") + "：" + errText(e), false, true); return; }
    var saveBtn = $("button", { class: "yo-btn yo-btn--primary yo-btn--block", type: "button", text: t("save") });
    saveBtn.addEventListener("click", async function () {
      saveBtn.disabled = true;
      try { data = await call("POST", "/profile", data); toast(t("profileSaved")); }
      catch (e) { toast(t("failed") + "：" + errText(e), false, true); }
      saveBtn.disabled = false;
    });
    body.appendChild($("div", { class: "yo-card" }, [
      $("strong", { text: data.name + "（" + t(data.role === "teacher" ? "teacher" : "staff") + "）" }),
      $("p", { class: "yo-muted", text: t("profileNote") }),
      profileForm(data.role, data, false), saveBtn
    ]));
  }

  // A longer message in both languages (e.g. "turn on two-factor authentication").
  function showNotice(pair) {
    var box = $("div", { class: "yo-modal yo-ui", role: "dialog", "aria-modal": "true" }, [
      $("div", { class: "yo-modal__card" }, [
        $("p", { class: "yo-eyebrow", text: "STAFF LOGIN" }),
        $("p", { text: pair[0] }), $("p", { class: "yo-muted", text: pair[1] }),
        $("button", { class: "yo-btn yo-btn--primary", type: "button", text: L.close[0] + " / " + L.close[1], on: { click: function () { box.remove(); } } })
      ])
    ]);
    document.body.appendChild(box);
  }

  // Opened an invite link (…?invite=…): explain, then log in with Discord carrying the invite.
  function showInvite(invite) {
    var both = function (k) { return [$("p", { class: "yo-muted", text: L[k][0] }), $("p", { class: "yo-muted", text: L[k][1] })]; };
    var box = $("div", { class: "yo-modal yo-modal--locked yo-ui", role: "dialog", "aria-modal": "true" }, [
      $("div", { class: "yo-modal__card" }, [
        $("p", { class: "yo-eyebrow", text: "WELCOME" }),
        $("h2", { text: L.inviteTitle[0] + " / " + L.inviteTitle[1] })
      ].concat(both("inviteBody"), [
        $("button", { class: "yo-btn yo-btn--primary", type: "button", text: L.inviteBtn[0] + " / " + L.inviteBtn[1], on: { click: function () { SITE.startLogin(invite); } } })
      ]))
    ]);
    document.body.appendChild(box);
    lockPage(box);
  }

  // Show the latest schedule on the page right away (GitHub Pages needs a minute or two to catch up).
  function apply(list) {
    schedule = list || [];
    var c = window.YORIMICHI_CONTENT || {};
    c.schedule = schedule;
    window.YORIMICHI_CONTENT = c;
    SITE.setContent(c);
  }

  function showNotMember(body) {
    var box = $("div", { class: "yo-modal yo-ui", role: "dialog", "aria-modal": "true" }, [
      $("div", { class: "yo-modal__card" }, [
        $("p", { class: "yo-eyebrow", text: "STAFF LOGIN" }),
        $("h2", { text: t("notMember") }),
        $("p", { class: "yo-muted", text: t("notMemberHelp") }),
        $("p", { class: "yo-code", text: "@" + (body.username || "") }),
        $("p", { class: "yo-muted", text: "Discord ID：" + (body.id || "") }),
        $("button", { class: "yo-btn yo-btn--primary", type: "button", text: t("close"), on: { click: function () { box.remove(); } } })
      ])
    ]);
    document.body.appendChild(box);
  }

  /* ---------- schedule panel (teachers): calendar + templates (schedule-editor.js), saved right away ---------- */
  var panel = null;
  async function send(body) {
    toast(t("saving"), true);
    try { var res = await call("POST", "/schedule", body); apply(res.schedule); }
    catch (e) { var err = new Error(t("failed") + "：" + errText(e)); throw err; }
  }
  function drawPanel() {
    if (!panel) return;
    var body = panel.querySelector(".yo-panel__body");
    body.innerHTML = "";
    if (!window.YorimichiScheduleEditor) { SITE.loadScript("assets/js/schedule-editor.js", drawPanel); return; }
    body.appendChild($("p", { class: "yo-muted", text: t("note") }));
    body.appendChild(window.YorimichiScheduleEditor({
      lang: SITE.getLang,
      items: function () { return schedule; },
      canEdit: function (x) { return x.owner === me.name; },
      templates: function () { return (window.YORIMICHI_CONTENT || {}).schedule_templates || []; },
      host: me.name,
      hosts: function () { return [me.name]; },
      cats: SITE.scheduleCats || [],
      toast: function (msg, bad) { toast(msg, false, bad); },
      notice: t("done").replace(/^[^！!]*[！!]\s*/, ""),
      add: function (items) { return send({ op: "add", items: items }); },
      update: function (id, item) { return send({ op: "update", id: id, item: item }); },
      remove: function (id) { return send({ op: "delete", id: id }); }
    }));
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
    var applicant = me.role === "applicant";
    var label = applicant ? t("pending") : t(me.role === "teacher" ? "teacher" : "staff");
    bar = $("div", { class: "yo-bar yo-ui" }, [
      $("span", { class: "yo-bar__who", title: (me.name || "") + (me.username ? "（@" + me.username + "）" : ""),
        text: "● " + (me.discord || me.name) + "（" + label + "）" }),
      me.role === "teacher" ? b(t("edit"), openPanel, "yo-bar__save") : null,
      me.role === "teacher" || me.role === "staff" ? b(t("profile"), openProfile) : null,
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
    // Registration: under the toast (98) so its messages stay visible; nothing behind can be reached.
    ".yo-modal--locked{z-index:96;background:rgba(12,14,19,.62);overscroll-behavior:contain}",
    ".yo-modal__card{width:min(440px,100%);display:grid;gap:12px;padding:28px;background:#fff;border-radius:24px;box-shadow:var(--shadow-lg)}",
    ".yo-modal__card h2{font-size:20px;margin:0}",
    ".yo-modal__card--wide{width:min(560px,100%);max-height:calc(100vh - 32px);overflow-y:auto}",
    ".yo-choices{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
    "@media (max-width:520px){.yo-choices{grid-template-columns:1fr}}",
    ".yo-choice{display:grid;gap:4px;text-align:left;padding:18px;border:2px solid var(--line);border-radius:16px;background:#fff;font:inherit;color:var(--ink);cursor:pointer}",
    ".yo-choice strong{font-size:17px}.yo-choice span{font-size:12.5px;color:var(--muted)}",
    ".yo-choice:hover{border-color:rgba(49,87,255,.45)}",
    ".yo-choice.is-on{border-color:var(--accent);background:rgba(49,87,255,.06);box-shadow:0 0 0 3px rgba(49,87,255,.12)}",
    ".yo-thumb{width:56px;height:56px;flex:none;display:grid;place-items:center;overflow:hidden;border-radius:50%;background:var(--soft);border:1px solid var(--line);font-size:10.5px;color:var(--muted)}",
    ".yo-thumb img{width:100%;height:100%;object-fit:cover}",
    ".yo-tags{display:flex;flex-wrap:wrap;gap:6px}",
    ".yo-tag{padding:7px 12px;border:1px solid var(--line);border-radius:999px;background:#fff;font:inherit;font-size:13px;font-weight:700;color:var(--ink);cursor:pointer}",
    ".yo-tag:hover{border-color:var(--accent)}.yo-tag.is-on{background:var(--accent);border-color:var(--accent);color:#fff}",
    ".yo-eyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;color:var(--accent);margin:0}",
    ".yo-code{margin:4px 0;padding:14px;border-radius:12px;background:var(--soft);font:700 18px/1.3 ui-monospace,Consolas,monospace;text-align:center;user-select:all}",
    ".yo-toast{position:fixed;left:50%;bottom:84px;transform:translate(-50%,10px);z-index:98;max-width:min(560px,calc(100% - 32px));padding:12px 18px;border-radius:14px;background:#fff;border:1px solid var(--line);box-shadow:var(--shadow);font-size:14px;font-weight:600;opacity:0;pointer-events:none;transition:all .25s}",
    ".yo-toast.is-on{opacity:1;transform:translate(-50%,0)}",
    ".yo-toast.is-bad{border-color:rgba(212,60,100,.4);color:#b02a50}"
  ].join("\n") }));

  /* ---------- start ---------- */
  // Left open without use: when the login's time runs out, sign out here too (keep the page if there are unsaved edits).
  function sessionExp(tok) {
    try { var p = String(tok).split(".")[0].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(decodeURIComponent(escape(atob(p + "===".slice((p.length + 3) % 4))))).exp || 0; }
    catch (e) { return 0; }
  }
  var expiredShown = false;
  function checkExpiry() {
    var cur = window.YORIMICHI_SESSION || token;
    if (!cur || !me || Date.now() < sessionExp(cur)) return;
    forget(); window.YORIMICHI_SESSION = null;
    if (window.YORIMICHI_DIRTY && window.YORIMICHI_DIRTY()) {
      if (!expiredShown) { expiredShown = true; toast(t("expiredKeep"), true, true); }
      return;
    }
    location.href = location.pathname + location.search;
  }
  setInterval(checkExpiry, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) checkExpiry(); });

  // The header button shows who is signed in (tap → log out), or goes back to 「スタッフログイン」.
  function report(signedIn) {
    if (SITE.setLogin) SITE.setLogin(signedIn ? { signedIn: true, label: me.discord || me.name, onLogout: logout } : null);
  }
  (async function () {
    if (!API) return;
    var invite = (location.search.match(/[?&]invite=([^&]+)/) || [])[1];
    if (invite && !/yo_(session|error)=/.test(location.hash)) { report(false); showInvite(decodeURIComponent(invite)); return; }
    var result = takeLoginResult();
    if (result && result.error === "need_mfa") { report(false); showNotice(L.need_mfa); return; }
    if (result && result.error) { report(false); toast(L[result.error] ? t(result.error) : errText({ message: result.error }), false, true); return; }
    try { token = result ? result.session : localStorage.getItem(SESSION_KEY); } catch (e) { token = null; }
    if (!token) { report(false); return; }
    try {
      me = await call("GET", "/me");
      report(true);
      if (me.role === "admin" || me.role === "staff") {
        // 創設者 gets the full editor, 運営スタッフ the same editor limited to site content (admin.js checks the role;
        // the staff API enforces it). Both use the editor's own toolbar; hand over this session.
        window.YORIMICHI_SESSION = token;
        if (me.role === "staff") window.YORIMICHI_OPEN_PROFILE = openProfile;
        SITE.loadScript("assets/js/schedule-editor.js", function () { SITE.loadScript("assets/js/admin.js"); });
        if (result) toast(t("welcome") + "：" + (me.discord || me.name));
        return;
      }
      if (me.role === "applicant") {
        // Not registered yet: only the registration (no toolbar, nothing else) until it is sent.
        if (me.status === "draft") showOnboarding(); else { buildBar(); toast(t("pendingNote")); }
      } else {
        buildBar();
        if (result) toast((result.joined ? t("joined") : t("welcome")) + "：" + (me.discord || me.name));
        if (me.role === "teacher") { SITE.loadScript("assets/js/schedule-editor.js"); apply((await call("GET", "/schedule")).schedule); }
      }
    } catch (e) {
      me = null; report(false);
      if (e.status === 401) { forget(); toast(t("expired"), false, true); }
      else if (e.status === 403 && e.body && e.body.error === "not_member") { forget(); showNotMember(e.body); }
      else toast(t("failed") + "：" + errText(e), false, true);
    }
  })();
})();
