/**
 * 直売所レジ 同期用スクリプト（Google Apps Script）
 *
 * スプレッドシートの「拡張機能 → Apps Script」に貼り付けて使います。
 * 1. setup を一度実行（シートと合言葉 TOKEN が作られます）
 * 2. 「デプロイ → 新しいデプロイ → ウェブアプリ」
 *    実行ユーザー: 自分 / アクセスできるユーザー: 全員
 * 3. 表示された URL と、ログに出た合言葉をレジアプリの設定画面に入れる
 */

const SHEET_PRODUCTS = '商品マスタ';
const SHEET_SALES = '売上';
const SHEET_ITEMS = '売上明細';
const SHEET_LOCATIONS = '販売場所';

const PRODUCT_HEADERS = ['商品ID', '品名', '区分', '価格', '時価', 'よく使う価格', '表示順', '非表示', 'よく売れる'];
const SALES_HEADERS = ['取引ID', '日時', '端末', '支払方法', '合計', '預かり', 'おつり', '取消', '受信日時', '修正日時', '販売場所'];
const ITEM_HEADERS = ['取引ID', '日時', '端末', '支払方法', '商品ID', '品名', '単価', '数量', '小計', '取消', '販売場所'];
const LOCATION_HEADERS = ['場所名', '非表示'];

/** 最初に一度だけ実行する */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let products = ss.getSheetByName(SHEET_PRODUCTS);
  if (!products) {
    products = ss.insertSheet(SHEET_PRODUCTS);
    products.getRange(1, 1, 1, PRODUCT_HEADERS.length).setValues([PRODUCT_HEADERS]).setFontWeight('bold');
    const sample = [
      ['', '卵 10個', '卵', 400, false, '', 1, false, true],
      ['', '卵 6個', '卵', 250, false, '', 2, false, true],
      ['', 'トマト', '野菜', 200, false, '', 3, false, true],
      ['', 'きゅうり', '野菜', 150, false, '', 4, false, true],
      ['', '大根', '野菜', '', true, '150,200,250,300', 5, false, true],
      ['', '白菜', '野菜', '', true, '200,300,400', 6, false, false],
      ['', 'いちごジャム', '加工品', 600, false, '', 7, false, false],
    ];
    products.getRange(2, 1, sample.length, sample[0].length).setValues(sample);
    products.setFrozenRows(1);
  }
  // 入力ミスを防ぐための入力規則（500行分）
  const rows = 500;
  products.getRange(2, 5, rows, 1).insertCheckboxes();
  products.getRange(2, 8, rows, 1).insertCheckboxes();
  products.getRange(2, 9, rows, 1).insertCheckboxes();
  products.getRange(2, 4, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false)
      .setHelpText('価格は0以上の数字で入力してください（時価の商品は空欄でOK）').build());
  products.getRange(2, 3, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['野菜', '卵', '果物', '加工品', 'その他'], true)
      .setAllowInvalid(true).build());

  [[SHEET_SALES, SALES_HEADERS], [SHEET_ITEMS, ITEM_HEADERS], [SHEET_LOCATIONS, LOCATION_HEADERS]].forEach(([name, headers]) => {
    if (!ss.getSheetByName(name)) {
      const sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN')) {
    props.setProperty('TOKEN', Utilities.getUuid().slice(0, 8));
  }
  Logger.log('合言葉 (TOKEN): ' + props.getProperty('TOKEN'));
}

/** ブラウザで URL を開いたときの動作確認用 */
function doGet() {
  return json({ ok: true, message: '直売所レジの同期先です。アプリの設定画面にこのURLを入れてください。' });
}

/** レジアプリからの同期リクエスト：売上を受け取り、商品マスタを返す */
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'データの形式が正しくありません' });
  }
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || body.token !== token) {
    return json({ ok: false, error: '合言葉が違います。設定画面を確認してください' });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return json({ ok: false, error: '混み合っています。少し待ってからもう一度同期してください' });
  }
  try {
    prepareSheets();
    // 履歴・集計の「全端末の売上を取得」：期間内の全端末の取引を返す
    if (body.action === 'listSales') {
      return json({ ok: true, applied: true, sales: listSales(new Date(body.start), new Date(body.end)) });
    }
    // アプリの「商品の管理」画面からの保存
    if (body.action === 'saveProducts') {
      saveProducts(Array.isArray(body.upserts) ? body.upserts : [], Array.isArray(body.deletes) ? body.deletes : []);
      return json({ ok: true, applied: true, products: readProducts() });
    }
    const savedIds = saveSales(Array.isArray(body.sales) ? body.sales : []);
    const result = { ok: true, savedIds: savedIds, products: readProducts(), locations: readLocations() };
    // 同期のついでに、指定された期間の全端末の取引も返す（履歴・集計で他の端末の売上を見るため）
    if (body.pull && body.pull.start && body.pull.end) {
      result.pulled = { start: body.pull.start, end: body.pull.end, sales: listSales(new Date(body.pull.start), new Date(body.pull.end)) };
    }
    return json(result);
  } catch (err) {
    return json({ ok: false, error: 'スプレッドシートの処理でエラーが出ました: ' + err.message });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 売上を書き込む。
 * 同じ取引IDがすでにあれば、その行を最新の内容で上書きし、売上明細も入れ替える（二重登録しない）。
 * 修正・取消のどちらも「上書き」で反映される。
 */
function saveSales(sales) {
  if (sales.length === 0) return [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName(SHEET_SALES);
  const itemSheet = ss.getSheetByName(SHEET_ITEMS);

  const salesLast = salesSheet.getLastRow();
  const existing = {};
  if (salesLast > 1) {
    salesSheet.getRange(2, 1, salesLast - 1, 1).getValues().forEach((r, i) => {
      existing[String(r[0])] = i + 2;
    });
  }

  const now = new Date();
  const newSales = [];
  const newItems = [];
  const replacedIds = {};
  const savedIds = [];
  const usedLocations = {};

  sales.forEach((s) => {
    if (!s || !s.id) return;
    const method = s.method === 'paypay' ? 'PayPay' : '現金';
    const at = new Date(s.createdAt);
    const edited = s.editedAt ? new Date(s.editedAt) : '';
    const location = String(s.location || '').trim();
    if (location) usedLocations[location] = true;
    const row = [s.id, at, s.device || '', method, s.total, s.received, s.change, !!s.voided, now, edited, location];
    if (existing[s.id] > 0) {
      salesSheet.getRange(existing[s.id], 1, 1, SALES_HEADERS.length).setValues([row]);
      replacedIds[s.id] = true;
    } else if (existing[s.id] === -1) {
      // 同じ同期の中に同じ取引が2回入っていた場合は後のものだけ使う
      for (let i = newSales.length - 1; i >= 0; i--) if (newSales[i][0] === s.id) newSales.splice(i, 1);
      for (let i = newItems.length - 1; i >= 0; i--) if (newItems[i][0] === s.id) newItems.splice(i, 1);
      newSales.push(row);
    } else {
      newSales.push(row);
      existing[s.id] = -1;
    }
    (s.items || []).forEach((it) => {
      newItems.push([s.id, at, s.device || '', method, it.productId || '', it.name, it.unitPrice, it.qty, it.subtotal, !!s.voided, location]);
    });
    savedIds.push(s.id);
  });

  // 上書きした取引の古い明細行を消す（下から消すと行番号がずれない）
  if (Object.keys(replacedIds).length && itemSheet.getLastRow() > 1) {
    const ids = itemSheet.getRange(2, 1, itemSheet.getLastRow() - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (replacedIds[String(ids[i][0])]) itemSheet.deleteRow(i + 2);
    }
  }
  if (newSales.length) {
    salesSheet.getRange(salesSheet.getLastRow() + 1, 1, newSales.length, SALES_HEADERS.length).setValues(newSales);
  }
  if (newItems.length) {
    itemSheet.getRange(itemSheet.getLastRow() + 1, 1, newItems.length, ITEM_HEADERS.length).setValues(newItems);
  }
  addLocations(Object.keys(usedLocations));
  return savedIds;
}

/**
 * アプリから送られた商品を商品マスタに書き込む。
 * 商品IDが一致する行だけを書き換えるので、スプレッドシートで直接編集した他の行はそのまま残る。
 */
function saveProducts(upserts, deletes) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PRODUCTS);
  const last = sheet.getLastRow();
  const rowOf = {};
  if (last > 1) {
    sheet.getRange(2, 1, last - 1, 1).getValues().forEach((r, i) => {
      const id = String(r[0]).trim();
      if (id) rowOf[id] = i + 2;
    });
  }

  const appends = [];
  upserts.forEach((p) => {
    const name = String(p.name || '').trim();
    const price = Number(p.price || 0);
    if (!name || !isFinite(price) || price < 0) throw new Error('品名か価格が正しくない商品があります');
    const id = String(p.id || '').trim() || 'P' + Utilities.getUuid().slice(0, 8);
    const presets = (Array.isArray(p.presets) ? p.presets : []).map(Number).filter((n) => n > 0);
    const row = [
      id,
      name,
      String(p.category || '').trim() || 'その他',
      p.variable && !price ? '' : Math.round(price),
      !!p.variable,
      presets.join(','),
      Number(p.order) || 0,
      p.visible === false,
      !!p.popular,
    ];
    if (rowOf[id]) sheet.getRange(rowOf[id], 1, 1, row.length).setValues([row]);
    else appends.push(row);
  });
  if (appends.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, appends.length, PRODUCT_HEADERS.length).setValues(appends);
  }

  // 削除は下の行から（行番号がずれないように）
  deletes
    .map((id) => rowOf[String(id)])
    .filter((r) => r)
    .sort((a, b) => b - a)
    .forEach((r) => sheet.deleteRow(r));
}

/**
 * 前の版のスプレッドシートにも新しい列・シートを足す（setup をやり直さなくてよいように）。
 * 見出し行を毎回書き直すだけなので、データには触れない。
 */
function prepareSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheetByName(SHEET_SALES).getRange(1, 1, 1, SALES_HEADERS.length).setValues([SALES_HEADERS]);
  ss.getSheetByName(SHEET_ITEMS).getRange(1, 1, 1, ITEM_HEADERS.length).setValues([ITEM_HEADERS]);
  if (!ss.getSheetByName(SHEET_LOCATIONS)) {
    const sh = ss.insertSheet(SHEET_LOCATIONS);
    sh.getRange(1, 1, 1, LOCATION_HEADERS.length).setValues([LOCATION_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

/** 販売場所の一覧（「非表示」にチェックがないもの、シートの並び順） */
function readLocations() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LOCATIONS);
  if (sh.getLastRow() < 2) return [];
  return sh
    .getRange(2, 1, sh.getLastRow() - 1, 2)
    .getValues()
    .filter((r) => String(r[0]).trim() && r[1] !== true)
    .map((r) => String(r[0]).trim());
}

/** アプリで新しく使われた場所を「販売場所」シートに追加する（すでにあるものは追加しない） */
function addLocations(names) {
  if (!names.length) return;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LOCATIONS);
  const known = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach((r) => (known[String(r[0]).trim()] = true));
  }
  const rows = names.filter((n) => !known[n]).map((n) => [n, false]);
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 2).setValues(rows);
}

/** 期間内の全端末の取引を、明細つきで返す（取消・修正済みのものも含む） */
function listSales(start, end) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const from = start.getTime();
  const to = end.getTime();
  const inRange = (d) => d instanceof Date && d.getTime() >= from && d.getTime() < to;
  const salesSheet = ss.getSheetByName(SHEET_SALES);
  const itemSheet = ss.getSheetByName(SHEET_ITEMS);

  const list = [];
  const byId = {};
  if (salesSheet.getLastRow() > 1) {
    salesSheet.getRange(2, 1, salesSheet.getLastRow() - 1, SALES_HEADERS.length).getValues().forEach((r) => {
      if (!inRange(r[1])) return;
      const sale = {
        id: String(r[0]),
        createdAt: r[1].toISOString(),
        device: String(r[2] || ''),
        method: r[3] === 'PayPay' ? 'paypay' : 'cash',
        total: Number(r[4]) || 0,
        received: Number(r[5]) || 0,
        change: Number(r[6]) || 0,
        voided: r[7] === true,
        editedAt: r[9] instanceof Date ? r[9].toISOString() : undefined,
        location: String(r[10] || ''),
        items: [],
      };
      byId[sale.id] = sale;
      list.push(sale);
    });
  }
  if (list.length && itemSheet.getLastRow() > 1) {
    itemSheet.getRange(2, 1, itemSheet.getLastRow() - 1, 9).getValues().forEach((r) => {
      const sale = byId[String(r[0])];
      if (!sale) return;
      sale.items.push({
        productId: r[4] ? String(r[4]) : null,
        name: String(r[5]),
        unitPrice: Number(r[6]) || 0,
        qty: Number(r[7]) || 0,
        subtotal: Number(r[8]) || 0,
      });
    });
  }
  return list;
}

/** 商品マスタを読み込む。商品IDが空の行には自動でIDを振る */
function readProducts() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PRODUCTS);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const values = sheet.getRange(2, 1, last - 1, PRODUCT_HEADERS.length).getValues();
  const result = [];
  let idChanged = false;

  values.forEach((r, i) => {
    const name = String(r[1]).trim();
    if (!name) return;
    if (!String(r[0]).trim()) {
      r[0] = 'P' + Utilities.getUuid().slice(0, 8);
      idChanged = true;
    }
    const presets = String(r[5])
      .split(/[,、，\s]+/)
      .map(Number)
      .filter((n) => n > 0);
    result.push({
      id: String(r[0]).trim(),
      name: name,
      category: String(r[2]).trim() || 'その他',
      price: Number(r[3]) || 0,
      variable: r[4] === true,
      presets: presets,
      order: Number(r[6]) || i + 1,
      // 「非表示」にチェックがある商品はレジに出さない（新しい行は空欄＝表示）
      visible: r[7] !== true,
      popular: r[8] === true,
    });
  });

  if (idChanged) {
    sheet.getRange(2, 1, values.length, 1).setValues(values.map((r) => [r[0]]));
  }
  return result;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
