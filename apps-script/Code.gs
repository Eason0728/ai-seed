/**
 * AI 種子計畫｜學習看板 後端
 * 前端：https://eason0728.github.io/ai-seed/
 *
 * 部署：Web App，執行身分＝我，存取＝**任何人（甚至匿名）**
 * ——學員不需要任何帳號，這是整個搬遷的目的。
 *
 * 三張表（第一次跑 setup() 自建）：
 *   學員      一列一人：代號｜姓名｜通行碼｜四堂＋10/07
 *   件        一列一件事：所有欄位攤平，Eason 直接看得懂
 *   交件紀錄  append-only：誰、哪一天、做了什麼 ← 10/07 判準①的憑據
 */

var SS_NAME   = 'AI種子計畫｜學習看板';
var SH_PEOPLE = '學員';
var SH_ITEMS  = '件';
var SH_LOG    = '交件紀錄';
var PROP_SSID = 'AI_SEED_SSID';
var PROP_ADMIN= 'AI_SEED_ADMIN';   // Eason 的審核通行碼

var P_HEAD = ['代號','姓名','通行碼','第01堂','第02堂','第03堂','第04堂','10/07分享'];
var I_HEAD = ['件ID','學員代號','題目',
              '高頻','可標準化','可驗收','風險低',
              '原本分鐘','每週次數','現在分鐘','狀態','最近用',
              '卡點','沒有卡點','缺數字',
              '因為','所以','本週先做','下週看',
              '審核狀態','退回原因','退回次數','更新時間'];
var L_HEAD = ['時間','學員代號','姓名','件ID','動作','摘要'];

/* 10/07 成果分享的報告時段：13:00–14:30，每人 5 分鐘，一格只能一個人。
 * 存在「學員」表的「10/07時段」欄——舊表沒有這一欄，第一次有人選時自動補在最右邊。
 * 過了 SLOT_LOCK_ 學員就不能自己改，只剩 Eason（審核模式）能排。 */
/* 9/29 00:00 起看板鎖定：學員不能再存檔、刪除、送審、撤回（第 04 堂 9/28 23:59 截止，接著就鎖）。
 * Eason 審核模式照常可以改、審。報告時段另外算，選到 SLOT_LOCK_。 */
var EDIT_LOCK_ = new Date('2026-09-29T00:00:00+08:00');
var EDIT_LOCK_MSG = '看板 9/29 起已經鎖定，不能再修改';
function editLocked_() { return Date.now() >= EDIT_LOCK_.getTime(); }

var SLOT_HEAD  = '10/07時段';
var SLOT_LOCK_ = new Date('2026-10-06T23:59:59+08:00');
// 保留格：已經排定的人，不在名冊裡也可以。學員不能選、審核模式也不能把別人排進來——要改只改這裡。
var SLOT_FIXED_ = { '13:00': '郭益誠' };
var SLOTS_ = (function () {
  var a = [];
  for (var m = 13 * 60; m < 14 * 60 + 30; m += 5)
    a.push(('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2));
  return a;
})();

/* ─────────── 設定 ─────────── */

function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_SSID);
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create(SS_NAME);
  props.setProperty(PROP_SSID, ss.getId());
  ensureSheet_(ss, SH_PEOPLE, P_HEAD);
  ensureSheet_(ss, SH_ITEMS,  I_HEAD);
  ensureSheet_(ss, SH_LOG,    L_HEAD);
  if (!props.getProperty(PROP_ADMIN)) props.setProperty(PROP_ADMIN, '83575678');
  Logger.log('試算表：' + ss.getUrl());
  Logger.log('審核通行碼：' + props.getProperty(PROP_ADMIN));
  Logger.log('接著到「部署 → 新增部署作業 → 網頁應用程式」，存取權限選「任何人」，把網址給 Eason。');
  return ss.getUrl();
}

function ensureSheet_(ss, name, head) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  var first = ss.getSheets()[0];
  if (first.getName() === '工作表1' && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);
  return sh;
}

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_SSID);
  if (!id) throw new Error('還沒跑過 setup()');
  return SpreadsheetApp.openById(id);
}
function sheet_(name) { return ss_().getSheetByName(name); }

function rows_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues().map(function (r) {
    var o = {};
    head.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
}

/* ─────────── 入口 ─────────── */

function doGet(e) {
  return respond_(handleGetAll_(null, false));
}

function doPost(e) {
  var payload;
  try { payload = JSON.parse(e && e.postData && e.postData.contents); }
  catch (err) { return respond_({ ok: false, error: '請求格式錯誤' }); }
  if (!payload || typeof payload !== 'object') return respond_({ ok: false, error: '請求格式錯誤' });

  var a = payload.action;

  // 唯讀動作不搶鎖。全部包在鎖裡的話，16 個人同時開頁就會互相排隊——
  // 2026-09-02 實測 getAll 連續呼叫會從 3 秒暴增到 34 秒。
  if (a === 'getAll')    { var v = viewerOf_(payload); return respond_(handleGetAll_(v.code, v.admin)); }
  if (a === 'login')     return respond_(handleLogin_(payload));
  if (a === 'adminAuth') return respond_(handleAdminAuth_(payload));

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return respond_({ ok: false, error: '有人正在存檔，再按一次' }); }
  try {
    if (a === 'saveItem')   return respond_(handleSaveItem_(payload));
    if (a === 'deleteItem') return respond_(handleDeleteItem_(payload));
    if (a === 'changePass') return respond_(handleChangePass_(payload));
    if (a === 'resetPass')  return respond_(handleResetPass_(payload));
    if (a === 'submit')     return respond_(handleSubmit_(payload));
    if (a === 'withdraw')   return respond_(handleWithdraw_(payload));
    if (a === 'review')     return respond_(handleReview_(payload));
    if (a === 'setSess')    return respond_(handleSetSess_(payload));
    if (a === 'undoReject') return respond_(handleUndoReject_(payload));
    if (a === 'log')        return respond_(handleLog_(payload));
    if (a === 'pickSlot')   return respond_(handlePickSlot_(payload));
    return respond_({ ok: false, error: '不支援的操作：' + a });
  } finally { lock.releaseLock(); }
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ─────────── 讀 ─────────── */

var WPM_ = 4.33;

/** 前端 num() 的同款判斷，兩邊要一致 */
function n_(v) { var x = parseFloat(v); return (isFinite(x) && x >= 0) ? x : null; }

/** 別人看得到的那一份——只留看板格子會畫出來的欄位。
 *  卡點、分析四格、退回原因、最近用、四標準、原始分鐘數一律不送出去。 */
function pubItem_(it) {
  var b = n_(it.beforeMin), w = n_(it.perWeek), a = n_(it.afterMin);
  var saved = null;
  if (b !== null && w !== null && a !== null) {
    saved = Math.round(b * w * WPM_) - Math.round(a * w * WPM_);
    if (saved < 0) saved = 0;
  }
  var an = 0, av = it.ana || {};
  ['b', 't', 'w', 'n'].forEach(function (k) { if (String(av[k] || '').trim()) an++; });
  return {
    pub: true, id: it.id, topic: it.topic, status: it.status,
    review: it.review, needData: it.needData, saved: saved, anaN: an
  };
}

/** payload 是誰？回 {code, admin} —— code 為 null 代表沒登入 */
function viewerOf_(payload) {
  if (adminOk_(payload)) return { code: null, admin: true };
  if (payload && payload.code) {
    var a = auth_(payload);
    if (a.ok) return { code: a.person.code, admin: false };
  }
  return { code: null, admin: false };
}

function handleGetAll_(viewerCode, isAdmin) {
  var people = rows_(SH_PEOPLE).filter(function (p) { return String(p['代號']).trim(); });
  var items  = rows_(SH_ITEMS).filter(function (i) { return String(i['件ID']).trim(); });
  var byCode = {};
  people.forEach(function (p) {
    byCode[p['代號']] = {
      id: String(p['代號']),
      name: String(p['姓名'] || ''),
      sess: [tf_(p['第01堂']), tf_(p['第02堂']), tf_(p['第03堂']), tf_(p['第04堂']), tf_(p['10/07分享'])],
      slot: slotStr_(p[SLOT_HEAD]),   // 公開：誰排哪一格，大家都要看得到才不會撞
      items: []
    };
  });
  items.forEach(function (r) {
    var p = byCode[r['學員代號']];
    if (!p) return;
    p.items.push({
      id: String(r['件ID']),
      topic: str_(r['題目']),
      crit: [tf_(r['高頻']), tf_(r['可標準化']), tf_(r['可驗收']), tf_(r['風險低'])],
      beforeMin: str_(r['原本分鐘']), perWeek: str_(r['每週次數']), afterMin: str_(r['現在分鐘']),
      status: Number(r['狀態'] || 0), lastUsed: dstr_(r['最近用']),
      blocker: str_(r['卡點']), noBlocker: tf_(r['沒有卡點']), needData: str_(r['缺數字']),
      ana: { b: str_(r['因為']), t: str_(r['所以']), w: str_(r['本週先做']), n: str_(r['下週看']) },
      review: str_(r['審核狀態']) || 'draft',
      rejectNote: str_(r['退回原因']), rejectCount: Number(r['退回次數'] || 0)
    });
  });
  var list = people.map(function (p) { return byCode[p['代號']]; });
  list.forEach(function (p) { if (!p.items.length) p.items.push(blankItem_(p.id)); });
  if (!isAdmin) {
    list.forEach(function (p) {
      if (p.id === viewerCode) return;              // 自己那一張照原樣
      p.items = p.items.map(pubItem_);
    });
  }
  return { ok: true, people: list,
           slotCfg: { slots: SLOTS_, lock: SLOT_LOCK_.getTime(), fixed: SLOT_FIXED_ },
           editLock: EDIT_LOCK_.getTime() };
}

function blankItem_(code) {
  return { id: code + '-1', topic: '', crit: [false,false,false,false],
           beforeMin: '', perWeek: '', afterMin: '', status: 0, lastUsed: '',
           blocker: '', noBlocker: false, needData: '',
           ana: { b:'', t:'', w:'', n:'' }, review: 'draft', rejectNote: '', rejectCount: 0 };
}

function str_(v)  { return v === null || v === undefined ? '' : String(v).trim(); }
function tf_(v)   { return v === true || String(v).trim() === 'TRUE' || String(v).trim() === '是' || String(v).trim() === '1'; }
function dstr_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]')
    return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd');
  return String(v).trim();
}
/** 時段一律回 "13:05" 這種字串。程式寫進去時是純文字；
 *  但如果有人直接在試算表打 13:05，Google 會把它變成時間值，這裡轉回字串。 */
function slotStr_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]')
    return Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), 'HH:mm');
  return String(v).trim();
}

/* ─────────── 寫 ─────────── */

function person_(code) {
  var sh = sheet_(SH_PEOPLE), last = sh.getLastRow();
  if (last < 2) return null;
  var vals = sh.getRange(2, 1, last - 1, P_HEAD.length).getValues();
  for (var i = 0; i < vals.length; i++)
    if (String(vals[i][0]).trim() === String(code).trim())
      return { row: i + 2, code: String(vals[i][0]).trim(), name: String(vals[i][1] || ''),
               pass: String(vals[i][2] || '').trim() };
  return null;
}

var DEFAULT_PASS = '0000';

/** 學員身分：代號 ＋ 四位數密碼。表格留空一律當作預設 0000。 */
function auth_(payload) {
  var p = person_(payload.code);
  if (!p) return { ok: false, error: '找不到這個代號' };
  var want = p.pass || DEFAULT_PASS;
  if (want !== String(payload.pass || '').trim())
    return { ok: false, error: '密碼不對' };
  p.isDefault = (want === DEFAULT_PASS);
  return { ok: true, person: p };
}

/** 學員改自己的密碼：四位數字 */
function handleChangePass_(payload) {
  var a = auth_(payload); if (!a.ok) return a;
  var np = String(payload.newPass || '').trim();
  if (!/^[0-9]{4}$/.test(np)) return { ok: false, error: '密碼要剛好四位數字' };
  if (np === DEFAULT_PASS) return { ok: false, error: '不能設成預設的 0000，換一組' };
  sheet_(SH_PEOPLE).getRange(a.person.row, 3).setValue(np);
  log_(a.person.code, a.person.name, '', '改密碼', '');
  var r = handleGetAll_(a.person.code, false); r.newPass = np; return r;
}

function itemRow_(itemId) {
  var sh = sheet_(SH_ITEMS), last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++)
    if (String(vals[i][0]).trim() === String(itemId).trim()) return i + 2;
  return 0;
}

function writeItem_(code, it) {
  var sh = sheet_(SH_ITEMS);
  var row = itemRow_(it.id);
  var a = it.ana || {};
  var c = it.crit || [];
  var vals = [it.id, code, str_(it.topic),
    !!c[0], !!c[1], !!c[2], !!c[3],
    str_(it.beforeMin), str_(it.perWeek), str_(it.afterMin),
    Number(it.status || 0), str_(it.lastUsed),
    str_(it.blocker), !!it.noBlocker, str_(it.needData),
    str_(a.b), str_(a.t), str_(a.w), str_(a.n),
    str_(it.review) || 'draft', str_(it.rejectNote), Number(it.rejectCount || 0),
    new Date()];
  if (!row) { sh.appendRow(vals); row = sh.getLastRow(); }
  else sh.getRange(row, 1, 1, I_HEAD.length).setValues([vals]);
  return row;
}

function log_(code, name, itemId, action, note) {
  sheet_(SH_LOG).appendRow([new Date(), code, name, itemId || '', action, note || '']);
}

/** 只驗身分，不動資料——點卡片時用 */
function handleLogin_(payload) {
  var a = auth_(payload); if (!a.ok) return a;
  var r = handleGetAll_(a.person.code, false);
  r.isDefault = !!a.person.isDefault;
  return r;
}

/** 學員存自己那一件（不改審核狀態） */
function handleSaveItem_(payload) {
  var it = payload.item; if (!it || !it.id) return { ok: false, error: '缺少件資料' };
  var isAdmin = adminOk_(payload);
  var code, name, viewer;
  if (isAdmin) {
    // Eason 在審核模式代填——從件ID前綴找出這件是誰的
    var mm = String(it.id).match(/^([A-Za-z]+\d+)-/);
    var owner = mm ? person_(mm[1]) : null;
    if (!owner) return { ok: false, error: '看不出這件是誰的（件ID要以學員代號開頭）' };
    code = owner.code; name = owner.name; viewer = null;
  } else {
    var a = auth_(payload); if (!a.ok) return a;
    if (String(it.id).indexOf(a.person.code) !== 0) return { ok: false, error: '不能改別人的資料' };
    if (editLocked_()) return fail_(a.person.code, false, EDIT_LOCK_MSG);
    code = a.person.code; name = a.person.name; viewer = code;
  }
  var row = itemRow_(it.id);
  if (row) {
    var cur = rows_(SH_ITEMS).filter(function (r) { return String(r['件ID']) === String(it.id); })[0];
    if (!isAdmin && cur && (cur['審核狀態'] === 'pending' || cur['審核狀態'] === 'approved'))
      return { ok: false, error: '這件已送出或已通過，要先按「我要修改」' };
    it.review = cur ? (str_(cur['審核狀態']) || 'draft') : 'draft';
    it.rejectNote = cur ? str_(cur['退回原因']) : '';
    it.rejectCount = cur ? Number(cur['退回次數'] || 0) : 0;
  } else { it.review = 'draft'; it.rejectNote = ''; it.rejectCount = 0; }
  writeItem_(code, it);
  log_(code, name, it.id, isAdmin ? '存檔（Eason代填）' : '存檔', str_(it.topic));
  return handleGetAll_(viewer, isAdmin);
}

// ── ② 真的從試算表刪掉一件（原本「移除這件」只改畫面，重新整理就回來） ──
function handleDeleteItem_(payload) {
  var id = String(payload.itemId || '');
  var isAdmin = adminOk_(payload);
  var code, name;
  if (isAdmin) {
    var mm = id.match(/^([A-Za-z]+\d+)-/);
    var owner = mm ? person_(mm[1]) : null;
    if (!owner) return { ok: false, error: '看不出這件是誰的' };
    code = owner.code; name = owner.name;
  } else {
    var a = auth_(payload); if (!a.ok) return a;
    if (id.indexOf(a.person.code) !== 0) return { ok: false, error: '不能刪別人的資料' };
    if (editLocked_()) return fail_(a.person.code, false, EDIT_LOCK_MSG);
    code = a.person.code; name = a.person.name;
  }
  var row = itemRow_(id);
  if (!row) return { ok: false, error: '找不到這一件' };
  var cur = rows_(SH_ITEMS).filter(function (r) { return String(r['件ID']) === id; })[0];
  if (!isAdmin && cur && (cur['審核狀態'] === 'pending' || cur['審核狀態'] === 'approved'))
    return { ok: false, error: '這件已送出或已通過，不能直接移除——先按「我要修改」撤回' };
  sheet_(SH_ITEMS).deleteRow(row);
  log_(code, name, id, '移除', cur ? str_(cur['題目']) : '');
  return handleGetAll_(isAdmin ? null : code, isAdmin);
}

/** 學員送出審核——這一筆進交件紀錄，就是 10/07 判準①的憑據 */
// Eason 專用：把某個人的密碼清空，等於還原成預設的 0000
function handleResetPass_(payload) {
  if (!adminOk_(payload)) return { ok: false, error: '通行碼不對' };
  var t = person_(payload.target);
  if (!t) return { ok: false, error: '找不到這個代號' };
  sheet_(SH_PEOPLE).getRange(t.row, 3).setValue('');
  log_(t.code, t.name, '', '重設密碼', 'Eason 重設為 0000');
  return handleGetAll_(null, true);
}

function handleSubmit_(payload) {
  var a = auth_(payload); if (!a.ok) return a;
  if (editLocked_()) return fail_(a.person.code, false, EDIT_LOCK_MSG);
  var row = itemRow_(payload.itemId);
  if (!row) return { ok: false, error: '找不到這一件' };
  if (String(payload.itemId).indexOf(a.person.code) !== 0) return { ok: false, error: '不能改別人的資料' };
  var sh = sheet_(SH_ITEMS);
  var topic = str_(sh.getRange(row, 3).getValue());
  if (!topic) return { ok: false, error: '先填「題目」再送審' };
  sh.getRange(row, 20).setValue('pending');   // 審核狀態
  sh.getRange(row, 21).setValue('');          // 退回原因
  sh.getRange(row, 23).setValue(new Date());
  log_(a.person.code, a.person.name, payload.itemId, '送出審核', topic);
  return handleGetAll_(a.person.code, false);
}

function handleWithdraw_(payload) {
  var a = auth_(payload); if (!a.ok) return a;
  if (editLocked_()) return fail_(a.person.code, false, EDIT_LOCK_MSG);
  var row = itemRow_(payload.itemId);
  if (!row) return { ok: false, error: '找不到這一件' };
  if (String(payload.itemId).indexOf(a.person.code) !== 0) return { ok: false, error: '不能改別人的資料' };
  sheet_(SH_ITEMS).getRange(row, 20).setValue('draft');
  sheet_(SH_ITEMS).getRange(row, 23).setValue(new Date());
  log_(a.person.code, a.person.name, payload.itemId, '撤回修改', '');
  return handleGetAll_(a.person.code, false);
}

/* ─────────── Eason 的審核 ─────────── */

function adminOk_(payload) {
  var want = PropertiesService.getScriptProperties().getProperty(PROP_ADMIN);
  return want && String(payload.admin || '').trim() === String(want).trim();
}

function handleAdminAuth_(payload) {
  if (!adminOk_(payload)) return { ok: false, error: '通行碼不對' };
  // 直接把完整資料一起回去。只回 { ok:true } 的話，前端會沿用進審核模式之前
  // 抓到的「路人版」（沒有卡點／分析／四標準／原始分鐘數），審核時什麼都看不到。
  return handleGetAll_(null, true);
}

function handleReview_(payload) {
  if (!adminOk_(payload)) return { ok: false, error: '通行碼不對' };
  var row = itemRow_(payload.itemId);
  if (!row) return { ok: false, error: '找不到這一件' };
  var sh = sheet_(SH_ITEMS);
  var code = str_(sh.getRange(row, 2).getValue());
  var p = person_(code);
  if (payload.verdict === 'approve') {
    sh.getRange(row, 20).setValue('approved');
    sh.getRange(row, 21).setValue('');
    log_(code, p ? p.name : '', payload.itemId, '通過', '');
  } else if (payload.verdict === 'reject') {
    var why = str_(payload.note);
    if (!why) return { ok: false, error: '要寫原因，不然學員不知道要改什麼' };
    sh.getRange(row, 20).setValue('rejected');
    sh.getRange(row, 21).setValue(why);
    sh.getRange(row, 22).setValue(Number(sh.getRange(row, 22).getValue() || 0) + 1);
    log_(code, p ? p.name : '', payload.itemId, '退回', why);
  } else if (payload.verdict === 'unapprove') {
    sh.getRange(row, 20).setValue('draft');
    log_(code, p ? p.name : '', payload.itemId, '收回通過', '');
  } else return { ok: false, error: '不支援的判定' };
  sh.getRange(row, 23).setValue(new Date());
  return handleGetAll_(null, true);
}

// Eason 誤按駁回時的還原：把件退回到送審中，並把那一筆「退回」從交件紀錄拿掉
function handleUndoReject_(payload) {
  if (!adminOk_(payload)) return { ok: false, error: '通行碼不對' };
  var id = String(payload.itemId || '');
  var row = itemRow_(id);
  if (!row) return { ok: false, error: '找不到這一件' };
  var sh = sheet_(SH_ITEMS);
  var back = str_(payload.to) || 'pending';   // 預設還原成「等審核」
  if (['draft', 'pending', 'approved'].indexOf(back) < 0) return { ok: false, error: '不支援的狀態' };
  sh.getRange(row, 20).setValue(back);
  sh.getRange(row, 21).setValue('');                                   // 清掉退回原因
  var c = Number(sh.getRange(row, 22).getValue() || 0);
  sh.getRange(row, 22).setValue(c > 0 ? c - 1 : 0);                    // 退回次數 -1
  sh.getRange(row, 23).setValue(new Date());
  // 從交件紀錄刪掉這件最近一筆「退回」（由後往前找，只刪一筆）
  var lg = sheet_(SH_LOG), last = lg.getLastRow(), removed = 0;
  if (last >= 2) {
    var vals = lg.getRange(2, 1, last - 1, L_HEAD.length).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][3]).trim() === id && String(vals[i][4]).trim() === '退回') {
        lg.deleteRow(i + 2); removed = 1; break;
      }
    }
  }
  var r = handleGetAll_(null, true);
  r.removedLog = removed;
  return r;
}

// 讀某一件的交件紀錄（Eason 專用，用來查發生過什麼）
function handleLog_(payload) {
  if (!adminOk_(payload)) return { ok: false, error: '通行碼不對' };
  var id = String(payload.itemId || '').trim();
  var lg = sheet_(SH_LOG), last = lg.getLastRow(), out = [];
  if (last >= 2) {
    var vals = lg.getRange(2, 1, last - 1, L_HEAD.length).getValues();
    vals.forEach(function (v, i) {
      if (!id || String(v[3]).trim() === id || String(v[1]).trim() === id) {
        out.push({ row: i + 2, time: dstr_(v[0]) + ' ' + (Object.prototype.toString.call(v[0]) === '[object Date]'
          ? Utilities.formatDate(v[0], 'Asia/Taipei', 'HH:mm:ss') : ''),
          code: str_(v[1]), name: str_(v[2]), itemId: str_(v[3]), action: str_(v[4]), note: str_(v[5]) });
      }
    });
  }
  return { ok: true, log: out };
}

function handleSetSess_(payload) {
  if (!adminOk_(payload)) return { ok: false, error: '通行碼不對' };
  var p = person_(payload.code);
  if (!p) return { ok: false, error: '找不到這個代號' };
  var k = Number(payload.index);
  if (!(k >= 0 && k <= 4)) return { ok: false, error: '堂次超出範圍' };
  var col = 4 + k;   // 第01堂 在第 4 欄
  var sh = sheet_(SH_PEOPLE);
  var now = !!sh.getRange(p.row, col).getValue();
  sh.getRange(p.row, col).setValue(!now);
  log_(p.code, p.name, '', '勾進度', P_HEAD[col - 1] + (now ? ' 取消' : ' 打勾'));
  return handleGetAll_(null, true);
}

/* ─────────── 10/07 報告時段 ─────────── */

/** 「10/07時段」在第幾欄；舊表沒有就補在最右邊，整欄設成純文字（不然 13:05 會被轉成時間值） */
function slotCol_() {
  var sh = sheet_(SH_PEOPLE);
  var lastC = Math.max(sh.getLastColumn(), 1);
  var head = sh.getRange(1, 1, 1, lastC).getValues()[0];
  for (var i = 0; i < head.length; i++) if (String(head[i]).trim() === SLOT_HEAD) return i + 1;
  var col = lastC + 1;
  if (col > sh.getMaxColumns()) sh.insertColumnAfter(lastC);
  sh.getRange(1, col).setValue(SLOT_HEAD).setFontWeight('bold');
  sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  return col;
}

/** 選／換／取消時段。slot 空字串＝取消。
 *  學員：帶自己的 code＋pass，只能排自己，10/06 23:59 之後鎖住。
 *  Eason：帶 admin＋target，隨時可以排任何人，也可以把人移出某一格。
 *  失敗時一樣回最新的 people——前端拿來重畫，才看得到那一格是被誰先選走的。 */
function handlePickSlot_(payload) {
  var isAdmin = adminOk_(payload), p;
  if (isAdmin) {
    p = person_(payload.target);
    if (!p) return { ok: false, error: '找不到這個代號' };
  } else {
    var a = auth_(payload); if (!a.ok) return a;
    p = a.person;
    if (Date.now() > SLOT_LOCK_.getTime())
      return fail_(p.code, false, '時段 10/06 晚上 12 點已經鎖定，不能再改');
  }
  var slot = str_(payload.slot);
  if (slot && SLOTS_.indexOf(slot) < 0) return fail_(p.code, isAdmin, '沒有這個時段');
  if (slot && SLOT_FIXED_[slot]) return fail_(p.code, isAdmin, slot + ' 已經排定給' + SLOT_FIXED_[slot] + '，換一格');

  var sh = sheet_(SH_PEOPLE), col = slotCol_(), last = sh.getLastRow();
  if (last < 2) return { ok: false, error: '名冊是空的' };
  var codes = sh.getRange(2, 1, last - 1, 1).getValues();
  var vals  = sh.getRange(2, col, last - 1, 1).getValues();
  var prev = '';
  for (var i = 0; i < codes.length; i++) {
    var c = str_(codes[i][0]), v = slotStr_(vals[i][0]);
    if (c === p.code) { prev = v; continue; }
    if (slot && v === slot) {
      var r = fail_(p.code, isAdmin, slot + ' 剛剛被別人選走了，換一格');
      r.taken = true; return r;
    }
  }
  // 不寫交件紀錄——那張表只放送審相關的事（2026-09-18 Eason 拍板），時段只記最後選了哪一格
  if (prev !== slot) sh.getRange(p.row, col).setNumberFormat('@').setValue(slot);
  var out = handleGetAll_(isAdmin ? null : p.code, isAdmin);
  if (!isAdmin) out.isDefault = !!p.isDefault;
  return out;
}

function fail_(code, isAdmin, msg) {
  var r = handleGetAll_(isAdmin ? null : code, isAdmin);
  r.ok = false; r.error = msg; return r;
}
