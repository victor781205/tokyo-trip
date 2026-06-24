// 日文發票解析測試腳本
// 模擬真實日本收據的 OCR 文字，測試 parseReceiptText 的辨識率

const pricePatterns = [
  /(.+?)\s*[¥￥]\s*([\d,]+)/,
  /(.+?)\s*([\d,]+)\s*円/,
  /(.+?)\s+([\d,]+)$/,
  /([\d,]+)\s*円\s*(.+)/,
  /[¥￥]\s*([\d,]+)\s*(.+)/,
];

const skipPattern = /^(合計|小計|税|消費税|内税|外税|お預かり|お釣り|おつり|クレジット|現金|カード|レシート|領収書|日付|店名|住所|電話|TEL|残額|残高|預かり|釣り)/;

function parseReceiptText(text) {
  const items = [];
  const lines = text.split("\n").map(line => line.trim()).filter(line => line.length > 0);
  
  for (const line of lines) {
    if (skipPattern.test(line)) continue;
    
    for (const pattern of pricePatterns) {
      const match = line.match(pattern);
      if (match) {
        const name = (match[1] || match[3] || "").trim();
        const amountStr = (match[2] || match[1] || "").replace(/,/g, "");
        const amount = parseInt(amountStr, 10);
        
        if (name && !isNaN(amount) && amount > 0 && amount < 1000000) {
          items.push({ name, amount });
          break;
        }
      }
    }
  }
  
  return items;
}

// 模擬日本真實收據 OCR 文字（各種格式）
const testCases = [
  {
    name: "便利商店收據 (7-11 風格)",
    ocrText: `セブン-イレブン
東京駅前店
2024/09/01 14:30
レジ#03 No.0045

おにぎり 鮭    ¥160
おにぎり 梅    ¥140
サンドイッチ    ¥320
お茶 伊藤園    ¥150
合計            ¥770
お預かり        ¥1,000
お釣り          ¥230`,
    expected: [
      { name: "おにぎり 鮭", amount: 160 },
      { name: "おにぎり 梅", amount: 140 },
      { name: "サンドイッチ", amount: 320 },
      { name: "お茶 伊藤園", amount: 150 },
    ]
  },
  {
    name: "拉麵店收據",
    ocrText: `一蘭拉麵
渋谷店
2024/09/02 19:15

とんこつラーメン  ¥980
替え玉            ¥210
餃子 6個         ¥490
ビール            ¥550
小計              ¥2,230
消費税(10%)       ¥223
合計              ¥2,453`,
    expected: [
      { name: "とんこつラーメン", amount: 980 },
      { name: "替え玉", amount: 210 },
      { name: "餃子 6個", amount: 490 },
      { name: "ビール", amount: 550 },
    ]
  },
  {
    name: "藥妝店收據 (マツモトキヨシ 風格)",
    ocrText: `マツモトキヨシ
新宿東口店

シャンプー  ￥780
コンディショナー  ￥780
化粧水    ￥1,200
日焼け止め  ￥980
マスク 3枚入  ￥398
合計    ￥4,138
クレジットカード  ￥4,138`,
    expected: [
      { name: "シャンプー", amount: 780 },
      { name: "コンディショナー", amount: 780 },
      { name: "化粧水", amount: 1200 },
      { name: "日焼け止め", amount: 980 },
      { name: "マスク 3枚入", amount: 398 },
    ]
  },
  {
    name: "超市收據 (イオン 風格)",
    ocrText: `イオン 東京灣店
2024/09/03 10:45

牛乳 1000ml    238円
食パン 6枚切   158円
卵 10個パック   298円
りんご 3個入   398円
鶏むね肉 300g  358円
豆腐 3個パック  178円
合計            1,628円
現金            2,000円
お釣り          372円`,
    expected: [
      { name: "牛乳 1000ml", amount: 238 },
      { name: "食パン 6枚切", amount: 158 },
      { name: "卵 10個パック", amount: 298 },
      { name: "りんご 3個入", amount: 398 },
      { name: "鶏むね肉 300g", amount: 358 },
      { name: "豆腐 3個パック", amount: 178 },
    ]
  },
  {
    name: "電車 IC 卡加值收據",
    ocrText: `JR東日本
Suica チャージ
東京駅
2024/09/01 08:30

チャージ金額    ￥3,000
残額            ￥5,420
合計            ￥3,000`,
    expected: [
      { name: "チャージ金額", amount: 3000 },
    ]
  },
  {
    name: "伴手禮店收據",
    ocrText: `東京ばな奈
東京駅店

東京ばな奈 8個入  ￥1,080
東京ばな奈 12個入 ￥1,620
合計              ￥2,700
現金              ￥3,000
お釣り            ￥300`,
    expected: [
      { name: "東京ばな奈 8個入", amount: 1080 },
      { name: "東京ばな奈 12個入", amount: 1620 },
    ]
  },
  {
    name: "居酒屋收據",
    ocrText: `鳥貴族
池袋東口店
2024/09/04 21:00

焼き鳥盛り合わせ  ￥580
刺身三種盛り      ￥780
生ビール 中      ￥380
生ビール 中      ￥380
ハイボール        ￥350
ライス           ￥180
小計             ￥2,650
消費税           ￥265
合計             ￥2,915`,
    expected: [
      { name: "焼き鳥盛り合わせ", amount: 580 },
      { name: "刺身三種盛り", amount: 780 },
      { name: "生ビール 中", amount: 380 },
      { name: "生ビール 中", amount: 380 },
      { name: "ハイボール", amount: 350 },
      { name: "ライス", amount: 180 },
    ]
  }
];

// 執行測試
let totalExpected = 0;
let totalParsed = 0;
let totalCorrect = 0;

console.log("=" .repeat(60));
console.log("日文發票解析辨識率測試");
console.log("=" .repeat(60));

for (const testCase of testCases) {
  const parsed = parseReceiptText(testCase.ocrText);
  totalExpected += testCase.expected.length;
  totalParsed += parsed.length;
  
  let correct = 0;
  for (const expectedItem of testCase.expected) {
    const found = parsed.some(p => p.name === expectedItem.name && p.amount === expectedItem.amount);
    if (found) correct++;
  }
  totalCorrect += correct;
  
  const rate = testCase.expected.length > 0 
    ? ((correct / testCase.expected.length) * 100).toFixed(1)
    : "0.0";
  
  console.log(`\n📋 ${testCase.name}`);
  console.log(`   預期: ${testCase.expected.length} 項 | 解析: ${parsed.length} 項 | 正確: ${correct} 項 | 辨識率: ${rate}%`);
  
  // 顯示詳細比對
  for (const expectedItem of testCase.expected) {
    const found = parsed.some(p => p.name === expectedItem.name && p.amount === expectedItem.amount);
    console.log(`   ${found ? "✅" : "❌"} ${expectedItem.name} - ¥${expectedItem.amount.toLocaleString()}`);
  }
  
  // 顯示多餘的解析項目
  const extraItems = parsed.filter(p => 
    !testCase.expected.some(e => e.name === p.name && e.amount === p.amount)
  );
  if (extraItems.length > 0) {
    console.log(`   ⚠️  多餘項目:`);
    for (const item of extraItems) {
      console.log(`      ${item.name} - ¥${item.amount.toLocaleString()}`);
    }
  }
}

console.log("\n" + "=" .repeat(60));
console.log("📊 總計結果");
console.log("=" .repeat(60));
console.log(`總預期項目: ${totalExpected}`);
console.log(`總解析項目: ${totalParsed}`);
console.log(`正確辨識: ${totalCorrect}`);
console.log(`整體辨識率: ${((totalCorrect / totalExpected) * 100).toFixed(1)}%`);
console.log(`解析精確率: ${totalParsed > 0 ? ((totalCorrect / totalParsed) * 100).toFixed(1) : "0.0"}%`);
console.log("=" .repeat(60));