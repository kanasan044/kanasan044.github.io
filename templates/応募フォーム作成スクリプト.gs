/**
 * YORIMICHI 先生・運営スタッフ 応募フォームを自動で作るスクリプト
 *
 * 使い方（1回だけ）:
 *   1. https://script.google.com を開き「新しいプロジェクト」
 *   2. 最初から入っている文字を全部消して、このファイルの中身を全部貼り付ける
 *   3. 上の「保存」→ 関数が「createRecruitForm」になっていることを確認して「実行」
 *   4. 「権限を確認」→ 自分のアカウントを選ぶ →「詳細」→「（安全ではないページ）に移動」→「許可」
 *      ※ 自分で作ったスクリプトなので問題ありません
 *   5. 数十秒で完成。フォームのリンクがメールで届きます（下の「実行ログ」にも表示されます）
 *
 * できるもの:
 *   - 日本語・韓国語の応募フォーム（Google フォーム）
 *   - 回答が入る表「YORIMICHI 応募者一覧（非公開）」… かなさんだけが見られます
 *   - 応募が届くたびに、かなさんにお知らせメールが届く設定
 *
 * 注意: 2回実行するとフォームが2つできます。やり直したいときは、できたフォームを削除してから実行してください。
 */

function createRecruitForm() {
  var form = FormApp.create('YORIMICHI 先生・運営スタッフ応募フォーム · 선생님·운영 스태프 지원서');
  form.setDescription(
    'YORIMICHI（日韓交流 VRChat ワールド）の先生・運営スタッフに応募するフォームです。\n' +
    'いただいた情報は選考と連絡のためだけに使い、外部に公開しません。\n\n' +
    'YORIMICHI(한일 교류 VRChat 월드)의 선생님·운영 스태프 지원서입니다.\n' +
    '보내 주신 정보는 선발과 연락에만 사용하며, 외부에 공개하지 않아요.');
  form.setConfirmationMessage(
    'ご応募ありがとうございます！内容を確認して、運営からメールでご連絡します。\n' +
    '지원해 주셔서 감사합니다! 내용을 확인한 뒤 운영진이 이메일로 연락드릴게요.');
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setLimitOneResponsePerUser(false);  // Google アカウントにログインしなくても応募できるように
  form.setShowLinkToRespondAgain(false);

  form.addCheckboxItem()
    .setTitle('応募する役職 · 지원 직무')
    .setHelpText('両方選んでも大丈夫です · 둘 다 선택해도 괜찮아요')
    .setChoiceValues(['先生 · 선생님', '運営スタッフ · 운영 스태프'])
    .setRequired(true);

  form.addTextItem()
    .setTitle('VRChat の表示名 · VRChat 표시 이름')
    .setHelpText('ワールドで頭の上に表示される名前を、1文字も違わないように書いてください · 월드에서 머리 위에 보이는 이름을 정확하게 적어 주세요')
    .setRequired(true);

  form.addTextItem()
    .setTitle('VRChat のプロフィールURL（任意）· VRChat 프로필 URL (선택)')
    .setHelpText('例 · 예: https://vrchat.com/home/user/usr_xxxxxxxx');

  var email = form.addTextItem()
    .setTitle('連絡用メールアドレス · 연락용 이메일 주소')
    .setHelpText('選考の連絡に使います · 선발 관련 연락에 사용해요')
    .setRequired(true);
  email.setValidation(FormApp.createTextValidation()
    .requireTextIsEmail()
    .setHelpText('メールアドレスの形で入力してください · 이메일 주소 형식으로 입력해 주세요')
    .build());

  form.addTextItem()
    .setTitle('Discord のユーザー名（任意）· 디스코드 사용자명 (선택)');

  form.addMultipleChoiceItem()
    .setTitle('年齢 · 연령')
    .setChoiceValues(['18歳以上 · 만 18세 이상', '13〜17歳 · 만 13~17세'])
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('話せる言語 · 사용 가능한 언어')
    .setChoiceValues([
      '日本語（母語）· 일본어 (모국어)',
      '日本語（勉強中）· 일본어 (공부 중)',
      '韓国語（母語）· 한국어 (모국어)',
      '韓国語（勉強中）· 한국어 (공부 중)'])
    .showOtherOption(true)
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('主に使う環境 · 주로 사용하는 환경')
    .setChoiceValues(['PC（VR）', 'PC（デスクトップ · 데스크톱）', 'Quest', 'Android · 스마트폰'])
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('活動できる曜日 · 활동 가능한 요일')
    .setChoiceValues(['月 · 월', '火 · 화', '水 · 수', '木 · 목', '金 · 금', '土 · 토', '日 · 일']);

  form.addTextItem()
    .setTitle('活動できる時間帯（任意）· 활동 가능한 시간대 (선택)')
    .setHelpText('例：21時〜23時（日本・韓国時間）· 예: 21시~23시 (한국·일본 시간)');

  form.addParagraphTextItem()
    .setTitle('自己PR · 자기소개')
    .setHelpText('どんな人か、なぜ応募したか、得意なことなど自由に · 어떤 사람인지, 지원 동기, 잘하는 것 등을 자유롭게 적어 주세요')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('【先生に応募する方】教えたい内容や経験（任意）· 【선생님 지원자】 가르치고 싶은 내용이나 경험 (선택)');

  form.addParagraphTextItem()
    .setTitle('【運営スタッフに応募する方】やってみたいこと（任意）· 【운영 스태프 지원자】 해 보고 싶은 일 (선택)');

  form.addParagraphTextItem()
    .setTitle('その他・質問（任意）· 기타·질문 (선택)');

  form.addCheckboxItem()
    .setTitle('同意 · 동의')
    .setChoiceValues(['応募内容が YORIMICHI 運営に共有されることに同意します · 지원 내용이 YORIMICHI 운영진에게 공유되는 것에 동의합니다'])
    .setRequired(true);

  // Responses go to a separate, private spreadsheet (never into the public management sheet).
  var sheet = SpreadsheetApp.create('YORIMICHI 応募者一覧（非公開）');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  // E-mail the owner whenever someone applies.
  ScriptApp.newTrigger('notifyNewApplication').forForm(form).onFormSubmit().create();

  var me = Session.getEffectiveUser().getEmail();
  var msg =
    '応募フォームができました。\n\n' +
    '■ 応募フォーム（サイトに貼るリンク）\n' + form.getPublishedUrl() + '\n\n' +
    '■ フォームの編集画面\n' + form.getEditUrl() + '\n\n' +
    '■ 応募者一覧（非公開・かなさんだけ）\n' + sheet.getUrl() + '\n\n' +
    '次にやること：管理シートの「設定」→「応募フォームURL」に、いちばん上のリンクを貼ってください。';
  MailApp.sendEmail(me, '【YORIMICHI】応募フォームができました', msg);
  Logger.log(msg);
}

/** Runs automatically when an application arrives: e-mails the owner a summary. */
function notifyNewApplication(e) {
  var lines = e.response.getItemResponses().map(function (r) {
    var a = r.getResponse();
    return '■ ' + r.getItem().getTitle() + '\n' + (Array.isArray(a) ? a.join(', ') : a);
  });
  var name = '';
  e.response.getItemResponses().forEach(function (r) {
    if (r.getItem().getTitle().indexOf('VRChat の表示名') === 0) name = r.getResponse();
  });
  MailApp.sendEmail(
    Session.getEffectiveUser().getEmail(),
    '【YORIMICHI】新しい応募が届きました：' + name,
    lines.join('\n\n') + '\n\n応募者一覧は Google ドライブの「YORIMICHI 応募者一覧（非公開）」で確認できます。');
}
