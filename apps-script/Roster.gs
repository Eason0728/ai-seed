/**
 * 名冊維護——只有 Eason 在編輯器裡跑，前端碰不到。
 * 用法：把 ROSTER 改成 16 個人，跑 importRoster()。
 * 通行碼留空＝第一次填的人自己設；要指定就直接寫在這裡。
 */
var ROSTER = [
  // ['代號', '姓名', '通行碼'],
  ['s01', '呂家豪', ''],
  ['s02', '沈俊賢', ''],
  ['s03', '陳建樺', ''],
  ['s04', '洪嘉琪', ''],
  ['s05', '蔡昕恩', ''],
  ['s06', '謝政倫', ''],
  ['s07', '林渝倩', ''],
  ['s08', '葉傑和', ''],
  ['s09', '林尚諭', ''],
  ['s10', '林依華', ''],
  ['s11', '朱明哲', ''],
  ['s12', '宋惠鈴', ''],
  ['s13', '陳寶吉', ''],
  ['s14', '張淳',   ''],
  ['s15', '吳佳宜', ''],
  ['s16', '李蔓晴', '']
];

function importRoster() {
  var sh = sheet_(SH_PEOPLE);
  var existing = {};
  rows_(SH_PEOPLE).forEach(function (r, i) { existing[String(r['代號']).trim()] = i + 2; });
  var added = 0, kept = 0;
  ROSTER.forEach(function (r) {
    var code = String(r[0]).trim();
    if (existing[code]) { kept++; return; }          // 已存在就不覆蓋，避免洗掉進度
    sh.appendRow([code, r[1], r[2] || '', false, false, false, false, false]);
    added++;
  });
  Logger.log('新增 ' + added + ' 人，保留既有 ' + kept + ' 人');
  return { added: added, kept: kept };
}

/** 幫全部還沒有通行碼的人各發一組四位數（印在 Logger，你自己私訊給他們） */
function issuePasscodes() {
  var sh = sheet_(SH_PEOPLE);
  var last = sh.getLastRow();
  if (last < 2) return '名冊是空的，先跑 importRoster()';
  var out = [];
  for (var row = 2; row <= last; row++) {
    var code = String(sh.getRange(row, 1).getValue()).trim();
    var name = String(sh.getRange(row, 2).getValue());
    var pass = String(sh.getRange(row, 3).getValue()).trim();
    if (!code) continue;
    if (!pass) {
      pass = String(Math.floor(1000 + Math.random() * 9000));
      sh.getRange(row, 3).setValue(pass);
    }
    out.push(code + '　' + name + '　' + pass);
  }
  Logger.log('代號　姓名　通行碼\n' + out.join('\n'));
  return out.join('\n');
}
