/* YORIMICHI site
   - Shared header / footer for every page (menu + 日本語 / 한국어 switch).
   - Renders data/content.js (edited inside the site by admins) and data/people.js (teachers / staff, from the
     management sheet).
   - The in-site editor (assets/js/admin.js) is only loaded for a signed-in admin.
   Only Japanese and Korean are supported. */
(function () {
  "use strict";

  var D = {};   // content + people, set in start()
  var S = {};   // D.settings
  var PAGE = document.body.getAttribute("data-page") || "home";

  var T = {
    ja: {
      "skip": "本文へ移動", "menu": "メニュー",
      "nav.home": "ホーム", "nav.schedule": "スケジュール", "nav.team": "教員・スタッフ紹介", "nav.recruit": "採用情報", "nav.guide": "はじめての方へ",
      "recruit.title": "採用情報", "recruit.lead": "YORIMICHI を一緒につくる仲間を募集しています。日本と韓国の交流を、あなたの力でもっと楽しく。",
      "recruit.apply": "応募フォームを開く", "recruit.open": "募集中", "recruit.closed": "募集停止中",
      "recruit.want": "こんな方を募集しています",
      "recruit.teacher.title": "先生", "recruit.teacher.body": "Kotoba Campus の教室で、日本語または韓国語の授業をしていただきます。",
      "recruit.teacher.w1": "日本語や韓国語を教えてみたい方", "recruit.teacher.w2": "初心者にもやさしく説明できる方", "recruit.teacher.w3": "自分のペースで授業を続けられる方",
      "recruit.staff.title": "運営スタッフ", "recruit.staff.body": "ワールドの運営、イベントの企画・進行、はじめて来た人の案内などをお願いします。",
      "recruit.staff.w1": "日本と韓国の交流に興味がある方", "recruit.staff.w2": "人と話すのが好きな方", "recruit.staff.w3": "みんなが気持ちよく過ごせるよう、ルールを守って見守れる方",
      "recruit.common": "応募の条件（共通）",
      "recruit.c1": "VRChat のアカウントをお持ちの方", "recruit.c2": "メールで連絡が取れる方", "recruit.c3": "日本語か韓国語のどちらかで会話ができる方",
      "recruit.flow": "応募の流れ",
      "recruit.f1.title": "フォームで応募", "recruit.f1.body": "応募フォームに VRChat の表示名、連絡先、自己PRなどを書いて送信します。",
      "recruit.f2.title": "運営から連絡", "recruit.f2.body": "内容を確認して、運営からメールでご連絡します。",
      "recruit.f3.title": "VRChat で面談", "recruit.f3.body": "ワールドで実際にお会いして、少しお話しします。",
      "recruit.f4.title": "活動スタート", "recruit.f4.body": "先生・運営スタッフとして名簿に登録され、ワールドの役職が使えるようになります。",
      "recruit.ctaTitle": "ご応募、お待ちしています。",
      "recruit.privacy": "いただいた情報は選考と連絡のためだけに使い、外部に公開することはありません。",
      "cta.world": "ワールドに行く", "cta.group": "グループに参加", "cta.guide": "はじめての方へ", "cta.soon": "準備中",
      "hero.eyebrow": "VRChat ワールド · 日本語 × 한국어",
      "hero.title": "寄り道から、<br><span class=\"grad\">はじまる友だち。</span>",
      "hero.lead": "YORIMICHI は、日本と韓国の人がふらっと立ち寄って話せる交流ラウンジです。広場でおしゃべりしたり、静かな個室でくつろいだり、先生と一緒に日本語・韓国語を学ぶこともできます。",
      "hero.tz": "日本と韓国は同じ時間帯です（UTC+9）",
      "hero.next": "次の予定", "hero.none": "予定は準備中です",
      "hero.voice": "部屋の声は外に聞こえません",
      "stats.areas": "エリア", "stats.rooms": "プライベート個室", "stats.classes": "語学教室", "stats.langs": "言語対応（日本語・韓国語）",
      "about.title": "ことばも文化も、気軽に。",
      "about.lead": "うまく話せなくても大丈夫。ワールドの案内はすべて日本語と韓国語で書かれているので、はじめての人でも迷わず楽しめます。",
      "f1.title": "広場でおしゃべり", "f1.body": "吹き抜けの中央広場には、ソファ席やカフェ、イベントステージがあります。初めて会う人とも自然に会話が生まれます。",
      "f2.title": "鍵付きの個室", "f2.body": "旅館風の「灯り宿」には、鍵を掛けられる個室が6部屋。部屋の声は外に漏れないので、落ち着いて話せます。",
      "f3.title": "先生と学べる教室", "f3.body": "Kotoba Campus には本物の学校のような教室が6つ。黒板や動画プレイヤー、空中に書けるペンを使って、先生の授業に参加できます。",
      "areas.title": "ワールドのエリア", "areas.lead": "中央広場から各エリアへワープできます。エリア同士は離れているので、声が混ざりません。",
      "area.plaza.title": "中央広場", "area.plaza.body": "シンボルツリーのある吹き抜けのラウンジ。ソファ席、縁側、カフェ、イベントステージがあります。",
      "area.akari.title": "灯り宿", "area.akari.body": "中庭を望む旅館風の個室エリア。鍵付きの部屋が6つあります。",
      "area.kotoba.body": "窓の外に桜が見える現代の学校。1-1 から 1-6 までの教室が並びます。",
      "area.class.title": "教室", "area.class.body": "30席の教室に、黒板・動画プレイヤー・ペン。授業が始まると先生が鍵を掛けるので、外からは入れなくなります。",
      "home.upcoming": "近日の予定", "home.allSchedule": "スケジュールをすべて見る",
      "news.title": "お知らせ", "news.more": "詳しく見る",
      "schedule.title": "授業・イベント", "schedule.lead": "時間はすべて日本・韓国時間です（両国は同じ時間帯です）。",
      "schedule.empty": "いまは予定がありません。グループのお知らせをチェックしてください。",
      "schedule.howTitle": "授業に参加するには",
      "schedule.how": "開始時間に Kotoba Campus の教室へ来てください。授業が始まると先生が教室に鍵を掛けるので、少し早めの入室がおすすめです。",
      "filter.all": "すべて", "filter.lesson": "授業", "filter.event": "イベント",
      "kind.lesson": "授業", "kind.event": "イベント",
      "team.title": "教員・スタッフ紹介", "team.lead": "YORIMICHI を一緒につくっている先生と運営スタッフです。",
      "team.teachers": "先生", "team.teachersLead": "日本語・韓国語の授業を担当しています。",
      "team.staff": "運営スタッフ", "team.staffLead": "ワールドの運営やイベントの企画をしています。",
      "team.empty": "近日公開",
      "join.title": "今日、ちょっと寄り道しませんか。",
      "join.lead": "VRChat のグループに参加すると、授業やイベントのお知らせが届きます。",
      "guide.title": "はじめての方へ", "guide.lead": "YORIMICHI への行き方と、ワールドの楽しみ方を紹介します。",
      "guide.s1.title": "グループに参加", "guide.s1.body": "VRChat のグループに参加すると、授業やイベントのお知らせを受け取れます。",
      "guide.s2.title": "ワールドへ行く", "guide.s2.body": "ワールドのページからインスタンスを作るか、フレンドのいるインスタンスに参加します。",
      "guide.s3.title": "行きたいエリアへ", "guide.s3.body": "入口の先にある中央広場から、案内板の矢印に沿って進むと各エリアへワープできます。",
      "guide.use.title": "ワールドの使い方",
      "guide.t1.title": "ワープ", "guide.t1.body": "各エリアの入口はゲートになっていて、くぐるとワープします。広場へ戻るときも同じです。",
      "guide.t2.title": "個室の鍵", "guide.t2.body": "灯り宿の個室は、中のスイッチで鍵を掛けられます。全員が部屋を出ると自動で鍵が開きます。",
      "guide.t3.title": "教室と授業", "guide.t3.body": "教室の戸をクリックすると出入りできます。授業中は先生が鍵を掛けるので、外からは入れません。",
      "guide.t4.title": "声のエリア", "guide.t4.body": "個室や教室の中の声は外に聞こえず、外の声も中には届きません。",
      "faq.title": "よくある質問",
      "footer.tag": "日本と韓国が出会う、VRChat の交流ラウンジ。", "footer.pages": "ページ", "footer.links": "リンク", "footer.staff": "スタッフ専用", "footer.login": "スタッフログイン",
      "updated": "最終更新",
      "dow": ["日", "月", "火", "水", "木", "金", "土"]
    },
    ko: {
      "skip": "본문으로 건너뛰기", "menu": "메뉴",
      "nav.home": "홈", "nav.schedule": "일정", "nav.team": "선생님·스태프 소개", "nav.recruit": "채용 안내", "nav.guide": "이용 안내",
      "recruit.title": "채용 안내", "recruit.lead": "YORIMICHI를 함께 만들어 갈 동료를 모집합니다. 일본과 한국의 교류를 당신의 힘으로 더 즐겁게 만들어 주세요.",
      "recruit.apply": "지원서 작성하기", "recruit.open": "모집 중", "recruit.closed": "모집 마감",
      "recruit.want": "이런 분을 찾고 있어요",
      "recruit.teacher.title": "선생님", "recruit.teacher.body": "Kotoba Campus 교실에서 일본어 또는 한국어 수업을 진행해 주세요.",
      "recruit.teacher.w1": "일본어나 한국어를 가르쳐 보고 싶은 분", "recruit.teacher.w2": "초보자에게도 친절하게 설명할 수 있는 분", "recruit.teacher.w3": "자신의 페이스에 맞춰 꾸준히 수업할 수 있는 분",
      "recruit.staff.title": "운영 스태프", "recruit.staff.body": "월드 운영, 이벤트 기획·진행, 처음 오신 분 안내 등을 맡아 주세요.",
      "recruit.staff.w1": "일본과 한국의 교류에 관심이 있는 분", "recruit.staff.w2": "사람들과 이야기하는 걸 좋아하는 분", "recruit.staff.w3": "모두가 편하게 지낼 수 있도록 규칙을 지키며 살펴 줄 수 있는 분",
      "recruit.common": "지원 조건 (공통)",
      "recruit.c1": "VRChat 계정이 있는 분", "recruit.c2": "이메일로 연락이 가능한 분", "recruit.c3": "일본어나 한국어 중 하나로 대화할 수 있는 분",
      "recruit.flow": "지원 절차",
      "recruit.f1.title": "지원서 작성", "recruit.f1.body": "지원서에 VRChat 표시 이름, 연락처, 자기소개 등을 적어서 보내 주세요.",
      "recruit.f2.title": "운영진 연락", "recruit.f2.body": "내용을 확인한 뒤 운영진이 이메일로 연락드려요.",
      "recruit.f3.title": "VRChat 면담", "recruit.f3.body": "월드에서 직접 만나 잠깐 이야기를 나눠요.",
      "recruit.f4.title": "활동 시작", "recruit.f4.body": "선생님·운영 스태프 명단에 등록되고, 월드에서 해당 권한을 사용할 수 있게 돼요.",
      "recruit.ctaTitle": "여러분의 지원을 기다리고 있어요.",
      "recruit.privacy": "보내 주신 정보는 선발과 연락에만 사용하며, 외부에 공개하지 않아요.",
      "cta.world": "월드 바로가기", "cta.group": "그룹 가입하기", "cta.guide": "이용 안내 보기", "cta.soon": "준비 중",
      "hero.eyebrow": "VRChat 월드 · 日本語 × 한국어",
      "hero.title": "잠깐 들렀다가,<br><span class=\"grad\">친구가 되는 곳.</span>",
      "hero.lead": "YORIMICHI는 일본과 한국 사람들이 가볍게 들러 이야기를 나눌 수 있는 교류 라운지예요. 광장에서 수다를 떨거나 조용한 개인실에서 쉬고, 선생님과 함께 일본어·한국어를 배울 수도 있어요.",
      "hero.tz": "일본과 한국은 시간대가 같아요 (UTC+9)",
      "hero.next": "다음 일정", "hero.none": "일정을 준비하고 있어요",
      "hero.voice": "방 안의 목소리는 밖에서 들리지 않아요",
      "stats.areas": "구역", "stats.rooms": "프라이빗 개인실", "stats.classes": "어학 교실", "stats.langs": "언어 지원 (일본어·한국어)",
      "about.title": "언어도 문화도, 부담 없이.",
      "about.lead": "말이 서툴러도 괜찮아요. 월드 안내는 모두 일본어와 한국어로 되어 있어서 처음 오신 분도 헤매지 않고 즐길 수 있어요.",
      "f1.title": "광장에서 수다 떨기", "f1.body": "탁 트인 중앙 광장에는 소파석과 카페, 이벤트 스테이지가 있어요. 처음 만난 사람과도 자연스럽게 이야기가 시작돼요.",
      "f2.title": "잠글 수 있는 개인실", "f2.body": "료칸 분위기의 '아카리야도'에는 문을 잠글 수 있는 개인실이 6개 있어요. 방 밖으로 목소리가 새어 나가지 않아 편하게 이야기할 수 있어요.",
      "f3.title": "선생님과 함께하는 교실", "f3.body": "Kotoba Campus에는 실제 학교 같은 교실이 6개 있어요. 칠판과 동영상 플레이어, 허공에 글씨를 쓸 수 있는 펜으로 선생님의 수업에 참여해 보세요.",
      "areas.title": "월드 구역 소개", "areas.lead": "중앙 광장에서 각 구역으로 워프할 수 있어요. 구역끼리 멀리 떨어져 있어서 목소리가 섞이지 않아요.",
      "area.plaza.title": "중앙 광장", "area.plaza.body": "상징 나무가 있는 탁 트인 라운지. 소파석, 툇마루, 카페, 이벤트 스테이지가 있어요.",
      "area.akari.title": "아카리야도", "area.akari.body": "안뜰이 보이는 료칸 스타일의 개인실 구역. 잠글 수 있는 방이 6개 있어요.",
      "area.kotoba.body": "창밖으로 벚꽃이 보이는 현대식 학교. 1-1부터 1-6까지 교실이 있어요.",
      "area.class.title": "교실", "area.class.body": "30석 교실에 칠판, 동영상 플레이어, 펜까지. 수업이 시작되면 선생님이 교실을 잠가서 밖에서는 들어올 수 없어요.",
      "home.upcoming": "다가오는 일정", "home.allSchedule": "전체 일정 보기",
      "news.title": "공지사항", "news.more": "자세히 보기",
      "schedule.title": "수업·이벤트 일정", "schedule.lead": "모든 시간은 한국·일본 시간 기준이에요 (두 나라는 시간대가 같아요).",
      "schedule.empty": "지금은 예정된 일정이 없어요. 그룹 공지를 확인해 주세요.",
      "schedule.howTitle": "수업에 참여하려면",
      "schedule.how": "시작 시간에 맞춰 Kotoba Campus 교실로 와 주세요. 수업이 시작되면 선생님이 교실을 잠그기 때문에 조금 일찍 들어오시는 걸 추천해요.",
      "filter.all": "전체", "filter.lesson": "수업", "filter.event": "이벤트",
      "kind.lesson": "수업", "kind.event": "이벤트",
      "team.title": "선생님·스태프 소개", "team.lead": "YORIMICHI를 함께 만들어 가는 선생님과 운영 스태프를 소개합니다.",
      "team.teachers": "선생님", "team.teachersLead": "일본어·한국어 수업을 맡고 있어요.",
      "team.staff": "운영 스태프", "team.staffLead": "월드 운영과 이벤트 기획을 맡고 있어요.",
      "team.empty": "곧 공개될 예정이에요",
      "join.title": "오늘, 잠깐 들렀다 가실래요?",
      "join.lead": "VRChat 그룹에 가입하면 수업과 이벤트 소식을 받아 볼 수 있어요.",
      "guide.title": "처음 오신 분께", "guide.lead": "YORIMICHI에 오는 방법과 월드를 즐기는 방법을 알려 드릴게요.",
      "guide.s1.title": "그룹 가입하기", "guide.s1.body": "VRChat 그룹에 가입하면 수업과 이벤트 소식을 받을 수 있어요.",
      "guide.s2.title": "월드 방문하기", "guide.s2.body": "월드 페이지에서 인스턴스를 만들거나, 친구가 있는 인스턴스에 참여하세요.",
      "guide.s3.title": "원하는 구역으로", "guide.s3.body": "입구를 지나 중앙 광장에서 안내판의 화살표를 따라가면 각 구역으로 워프할 수 있어요.",
      "guide.use.title": "월드 이용 방법",
      "guide.t1.title": "워프", "guide.t1.body": "각 구역의 입구는 게이트로 되어 있어서 지나가기만 하면 워프돼요. 광장으로 돌아올 때도 마찬가지예요.",
      "guide.t2.title": "개인실 잠금", "guide.t2.body": "아카리야도 개인실은 안쪽 스위치로 잠글 수 있어요. 모두 방을 나가면 자동으로 잠금이 풀려요.",
      "guide.t3.title": "교실과 수업", "guide.t3.body": "교실 문을 클릭하면 드나들 수 있어요. 수업 중에는 선생님이 문을 잠그기 때문에 밖에서는 들어갈 수 없어요.",
      "guide.t4.title": "목소리 구역", "guide.t4.body": "개인실과 교실 안의 목소리는 밖으로 들리지 않고, 밖의 소리도 안으로 들어오지 않아요.",
      "faq.title": "자주 묻는 질문",
      "footer.tag": "일본과 한국이 만나는 VRChat 교류 라운지.", "footer.pages": "페이지", "footer.links": "링크", "footer.staff": "스태프 전용", "footer.login": "스태프 로그인",
      "updated": "최종 업데이트",
      "dow": ["일", "월", "화", "수", "목", "금", "토"]
    }
  };

  // Texts edited in the site replace the defaults above. The big title is written on two lines; the second
  // line gets the colour gradient.
  var HTML_KEYS = { "hero.title": true };
  var DEFAULT_T = JSON.parse(JSON.stringify(T));
  function applyTexts(texts) {
    T = JSON.parse(JSON.stringify(DEFAULT_T));
    Object.keys(texts || {}).forEach(function (key) {
      var v = texts[key] || {};
      ["ja", "ko"].forEach(function (l) {
        var s = String(v[l] || "").trim();
        if (!s) return;
        if (HTML_KEYS[key]) {
          var lines = s.split(/\r?\n/).map(function (x) { return esc(x.trim()); }).filter(Boolean);
          s = lines.length > 1 ? lines[0] + '<br><span class="grad">' + lines.slice(1).join("<br>") + "</span>" : lines[0];
        }
        T[l][key] = s;
      });
    });
  }

  var lang = "ja";
  try {
    var saved = localStorage.getItem("yorimichi-lang");
    if (saved === "ja" || saved === "ko") lang = saved;
    else if ((navigator.language || "").toLowerCase().indexOf("ko") === 0) lang = "ko";
  } catch (e) { /* storage blocked: keep default */ }
  // ?lang=ko / ?lang=ja in the address picks the language (e.g. a link shared with Korean visitors).
  var qm = location.search.match(/[?&]lang=(ja|ko)\b/);
  if (qm) lang = qm[1];
  var filter = "all";

  function t(key) { return (T[lang] && T[lang][key]) || T.ja[key] || ""; }
  // ja / ko variant of a sheet field ("title" -> title_ja / title_ko), falling back to the other language.
  function pick(o, base) {
    if (!o) return "";
    var a = o[base + "_" + lang], b = o[base + "_" + (lang === "ja" ? "ko" : "ja")];
    return (a && String(a).trim()) || (b && String(b).trim()) || (o[base] ? String(o[base]) : "");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function safeUrl(u) {
    u = String(u || "").trim();
    return /^https?:\/\//i.test(u) || /^[\w\-./]+\.(jpe?g|png|webp|gif|avif|svg)$/i.test(u) || /^data:image\/(jpeg|png|webp|gif);base64,/i.test(u) ? u : "";
  }
  var ARROW = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var MARK = '<svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="12" cy="16" r="9" fill="var(--sakura)" opacity=".9"/><circle cx="20" cy="16" r="9" fill="var(--accent)" opacity=".85" style="mix-blend-mode:multiply"/></svg>';
  var PAGES = [["home", "index.html"], ["schedule", "schedule.html"], ["team", "team.html"], ["recruit", "recruit.html"], ["guide", "guide.html"]];

  /* ---------- shared header / footer ---------- */
  function buildChrome() {
    var nav = PAGES.map(function (p) {
      return '<a href="' + p[1] + '" data-i18n="nav.' + p[0] + '"' + (p[0] === PAGE ? ' aria-current="page"' : "") + "></a>";
    }).join("");
    el("site-header").outerHTML =
      '<a class="skip" href="#main" data-i18n="skip"></a>' +
      '<header class="header"><div class="container header__inner">' +
      '<a class="brand" href="index.html" aria-label="YORIMICHI">' + MARK + '<span class="brand__name">YORIMICHI</span></a>' +
      '<nav class="nav" id="nav">' + nav + "</nav>" +
      '<div class="header__actions">' +
      '<div class="lang" role="group" aria-label="Language / 언어">' +
      '<svg class="lang__icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>' +
      '<button type="button" data-lang="ja" lang="ja">日本語</button><button type="button" data-lang="ko" lang="ko">한국어</button></div>' +
      '<a class="btn btn--dark btn--sm hide-md" data-link="group_url" href="#" data-i18n="cta.group"></a>' +
      '<button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav"><span></span><span></span></button>' +
      "</div></div></header>";

    var pages = PAGES.map(function (p) { return '<a href="' + p[1] + '" data-i18n="nav.' + p[0] + '"></a>'; }).join("");
    el("site-footer").outerHTML =
      '<footer class="footer"><div class="container footer__inner">' +
      '<div class="footer__brand"><a class="brand" href="index.html">' + MARK + '<span class="brand__name">YORIMICHI</span></a><p data-i18n="footer.tag"></p></div>' +
      '<div class="footer__cols">' +
      '<div><p class="footer__title" data-i18n="footer.pages"></p>' + pages + "</div>" +
      '<div id="footer-links"><p class="footer__title" data-i18n="footer.links"></p>' +
      '<a data-link="world_url" href="#">VRChat World</a><a data-link="group_url" href="#">VRChat Group</a>' +
      '<a data-link="discord_url" href="#">Discord</a><a data-link="x_url" href="#">X</a></div>' +
      "</div></div>" +
      '<div class="container footer__bottom"><small>© <span id="year">2026</span> YORIMICHI</small>' +
      '<a class="footer__staff" data-link="staff_page_url" href="#"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span data-i18n="footer.staff"></span></a>' +
      '<button type="button" class="footer__login" id="staff-login" data-i18n="footer.login" hidden></button>' +
      '<small class="muted" id="updated"></small></div></footer>';
  }

  /* ---------- staff login (Discord, through the staff API) ---------- */
  var SESSION_KEY = "yorimichi-session";
  function staffApi() { return String(S.staff_api || "").trim().replace(/\/+$/, ""); }
  function hasSession() { try { return !!localStorage.getItem(SESSION_KEY); } catch (e) { return false; } }
  function startStaffLogin() {
    var api = staffApi(); if (!api) return;
    var n = Array.from(crypto.getRandomValues(new Uint8Array(12)), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    try { sessionStorage.setItem("yorimichi-login-n", n); } catch (e) { /* ignore */ }
    location.href = api + "/login?n=" + n + "&r=" + encodeURIComponent(location.origin + location.pathname + location.search);
  }

  /* ---------- text, links, images ---------- */
  function applyText() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (n) { var v = t(n.getAttribute("data-i18n")); if (v) n.textContent = v; });
    document.querySelectorAll("[data-i18n-html]").forEach(function (n) { var v = t(n.getAttribute("data-i18n-html")); if (v) n.innerHTML = v; });
    document.querySelectorAll(".lang button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === lang)); });
    var mb = document.querySelector(".menu-btn"); if (mb) mb.setAttribute("aria-label", t("menu"));
    var nav = el("nav"); if (nav) nav.setAttribute("aria-label", t("menu"));
    if (PAGE !== "home") document.title = t("nav." + PAGE) + " | YORIMICHI";
    else document.title = "YORIMICHI | " + (lang === "ko" ? "한일 교류 라운지" : "日韓交流ラウンジ");
  }

  function applySettings() {
    // Links left empty in the sheet: buttons show "準備中 / 준비 중", plain links are hidden.
    document.querySelectorAll("[data-link]").forEach(function (a) {
      var url = safeUrl(S[a.getAttribute("data-link")]);
      var isBtn = a.classList.contains("btn") || a.classList.contains("link-more");
      a.classList.toggle("is-soon", !url && isBtn);
      a.setAttribute("data-soon", t("cta.soon"));
      if (url) { a.href = url; a.target = "_blank"; a.rel = "noopener"; a.hidden = false; }
      else { a.removeAttribute("target"); a.hidden = !isBtn; }
    });
    var login = el("staff-login");
    if (login) login.hidden = !staffApi() || hasSession() || !/^https?:$/.test(location.protocol);
    var linkCol = el("footer-links");
    if (linkCol) linkCol.hidden = !linkCol.querySelector("a:not([hidden])");
    document.querySelectorAll("[data-img]").forEach(function (img) {
      if (!img.hasAttribute("data-src0")) img.setAttribute("data-src0", img.getAttribute("src"));
      img.src = safeUrl(S[img.getAttribute("data-img")]) || img.getAttribute("data-src0");
    });
    var note = el("notice");
    if (note) { var txt = pick(S, "announcement"); note.hidden = !txt; el("notice-text").textContent = txt; }
  }

  /* ---------- schedule ---------- */
  function parseDate(d, time) {
    var m = String(d || "").match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (!m) return null;
    var tm = String(time || "").match(/(\d{1,2}):(\d{2})/);
    // Times are Japan / Korea time (UTC+9); without a time, the event counts until 23:59 that day.
    var ts = Date.UTC(+m[1], +m[2] - 1, +m[3], (tm ? +tm[1] : 23) - 9, tm ? +tm[2] : 59);
    return { y: +m[1], mo: +m[2], d: +m[3], ts: ts, dow: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() };
  }
  function upcoming() {
    var now = Date.now();
    return (D.schedule || []).map(function (e) {
      var s = parseDate(e.date, e.start), end = parseDate(e.date, e.end || e.start);
      return s ? { e: e, start: s, end: end } : null;
    }).filter(function (x) { return x && x.end.ts + 30 * 60000 > now; })
      .sort(function (a, b) { return a.start.ts - b.start.ts; });
  }
  function kindOf(e) { return /授業|수업|lesson|class/i.test(String(e.type || "")) ? "lesson" : "event"; }
  function timeRange(e) { return e.start ? e.start + (e.end ? " – " + e.end : "") : ""; }

  function renderSchedule() {
    var list = upcoming(), dow = t("dow");
    var box = el("schedule-list");
    if (box) {
      var limit = +box.getAttribute("data-limit") || 0;
      var shown = list.filter(function (x) { return filter === "all" || kindOf(x.e) === filter; });
      if (limit) shown = shown.slice(0, limit);
      box.innerHTML = shown.map(function (x) {
        var e = x.e, k = kindOf(e), desc = pick(e, "desc");
        return '<li class="event event--' + k + '">' +
          '<div class="event__date"><div><div class="event__month">' + x.start.y + "." + String(x.start.mo).padStart(2, "0") + "</div>" +
          '<div class="event__day">' + x.start.d + '</div><div class="event__dow">' + dow[x.start.dow] + "</div></div></div>" +
          '<div><span class="event__kind">' + esc(t("kind." + k)) + (e.place ? " · " + esc(e.place) : "") + "</span>" +
          "<h3>" + esc(pick(e, "title")) + "</h3>" + (desc ? "<p>" + esc(desc) + "</p>" : "") + "</div>" +
          '<div class="event__side"><div class="event__time">' + esc(timeRange(e)) + "</div>" +
          (e.host ? '<div class="event__host">' + esc(e.host) + "</div>" : "") + "</div></li>";
      }).join("");
      el("schedule-empty").hidden = shown.length > 0;
    }
    if (el("next-title")) {
      var next = list[0];
      el("next-title").textContent = next ? pick(next.e, "title") : t("hero.none");
      el("next-meta").textContent = next ? next.start.mo + "/" + next.start.d + " (" + dow[next.start.dow] + ") " + timeRange(next.e) : "";
    }
  }

  function renderNews() {
    if (!el("news")) return;
    var items = (D.news || []).filter(function (n) { return pick(n, "title"); }).slice(0, 5);
    el("news").hidden = items.length === 0;
    el("news-list").innerHTML = items.map(function (n) {
      var body = pick(n, "body"), link = safeUrl(n.link);
      return "<li><time>" + esc(n.date || "") + "</time><div><h3>" + esc(pick(n, "title")) + "</h3>" +
        (body ? "<p>" + esc(body) + "</p>" : "") +
        (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(t("news.more")) + " →</a>" : "") + "</div></li>";
    }).join("");
  }

  function person(p, role) {
    var img = safeUrl(p.image), name = String(p.name || "").trim(), bio = pick(p, "bio");
    var initial = name ? Array.from(name)[0] : "?";
    return '<article class="person"><div class="avatar">' +
      (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : esc(initial)) + "</div><div>" +
      '<div class="person__name">' + esc(name) + "</div>" + (role ? '<div class="person__role">' + esc(role) + "</div>" : "") +
      (bio ? '<p class="person__bio">' + esc(bio) + "</p>" : "") + "</div></article>";
  }
  function renderTeam() {
    if (!el("staff-list")) return;
    var empty = '<p class="empty">' + esc(t("team.empty")) + "</p>";
    var staff = (D.staff || []).filter(function (p) { return p.name && p.show !== false; });
    var teachers = (D.teachers || []).filter(function (p) { return p.name && p.show !== false; });
    el("staff-list").innerHTML = staff.length ? staff.map(function (p) { return person(p, pick(p, "role")); }).join("") : empty;
    el("teacher-list").innerHTML = teachers.length ? teachers.map(function (p) { return person(p, pick(p, "lang")); }).join("") : empty;
  }

  function renderFaq() {
    if (!el("faq-list")) return;
    var items = (D.faq || []).filter(function (f) { return pick(f, "q"); });
    el("faq").hidden = items.length === 0;
    el("faq-list").innerHTML = items.map(function (f) {
      return "<details><summary>" + esc(pick(f, "q")) + '</summary><p class="faq__a">' + esc(pick(f, "a")) + "</p></details>";
    }).join("");
  }

  // Recruit page: each position shows 募集中 / 募集停止中 from the sheet (open unless set to 停止 / 締切 / ×).
  function renderRecruit() {
    document.querySelectorAll("[data-recruit]").forEach(function (card) {
      var v = String(S[card.getAttribute("data-recruit")] || "").trim();
      var open = !/停止|締切|終了|마감|×|✕|closed|no|false/i.test(v);
      card.classList.toggle("is-closed", !open);
      var st = card.querySelector("[data-status]");
      st.textContent = t(open ? "recruit.open" : "recruit.closed");
      st.classList.toggle("status--open", open);
    });
  }

  function renderAll() {
    applyText(); applySettings(); renderRecruit();
    renderNews(); renderSchedule(); renderTeam(); renderFaq();
    if (D.updated && el("updated")) el("updated").textContent = t("updated") + " " + D.updated;
    if (el("year")) el("year").textContent = String(new Date().getFullYear());
  }

  function setContent(content) {
    D = {};
    Object.keys(content || {}).forEach(function (k) { D[k] = content[k]; });
    var P = window.YORIMICHI_PEOPLE || {};
    D.teachers = P.teachers || []; D.staff = P.staff || []; D.updated = P.updated || "";
    S = D.settings || {};
    applyTexts(D.texts);
    renderAll();
  }

  /* ---------- start ---------- */
  function start() {
  buildChrome();
  setContent(window.YORIMICHI_CONTENT || {});

  // Hook for the in-site editor.
  window.YORIMICHI_SITE = {
    page: PAGE,
    getLang: function () { return lang; },
    setContent: setContent,
    defaults: function () { return DEFAULT_T; },
    rerender: renderAll
  };

  document.querySelectorAll(".lang button").forEach(function (b) {
    b.addEventListener("click", function () {
      lang = b.getAttribute("data-lang");
      try { localStorage.setItem("yorimichi-lang", lang); } catch (e) { /* ignore */ }
      renderAll();
      document.dispatchEvent(new CustomEvent("yorimichi:lang"));
    });
  });
  document.querySelectorAll(".tabs button").forEach(function (b) {
    b.addEventListener("click", function () {
      filter = b.getAttribute("data-filter");
      document.querySelectorAll(".tabs button").forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
      renderSchedule();
    });
  });
  var menuBtn = document.querySelector(".menu-btn"), nav = el("nav");
  menuBtn.addEventListener("click", function () {
    var open = menuBtn.getAttribute("aria-expanded") !== "true";
    menuBtn.setAttribute("aria-expanded", String(open)); nav.classList.toggle("is-open", open);
  });
  var header = document.querySelector(".header");
  function onScroll() { header.classList.toggle("is-scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    document.querySelectorAll(".reveal").forEach(function (n) { io.observe(n); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (n) { n.classList.add("is-in"); });
  }

  // The editor is only downloaded for someone who has signed in on this browser (or opens the page with ?admin).
  var signedIn = false;
  try { signedIn = !!localStorage.getItem("yorimichi-gh-token"); } catch (e) { /* ignore */ }
  if (signedIn || /[?&]admin\b/.test(location.search)) loadScript("assets/js/admin.js?v=" + BUST);
  else if (hasSession() || /[#&]yo_(session|error)=/.test(location.hash)) {
    // Teachers / staff signed in with Discord (or just coming back from the Discord login).
    loadScript("assets/js/staff.js?v=" + BUST);
  }
  el("staff-login").addEventListener("click", startStaffLogin);
  }

  /* ---------- load data, then start ---------- */
  // A new cache key every minute, so changes saved in the editor show up quickly for everyone.
  var BUST = Math.floor(Date.now() / 60000);
  function loadScript(src, done) {
    var s = document.createElement("script");
    s.src = src; s.onload = s.onerror = function () { if (done) done(); };
    document.head.appendChild(s);
  }
  loadScript("data/content.js?v=" + BUST, function () {
    loadScript("data/people.js?v=" + BUST, start);
  });
})();
