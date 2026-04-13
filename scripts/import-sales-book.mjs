// ─── 실행: node scripts/import-sales-book.mjs ───────────────────────────────
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// .env.local에서 환경변수 로드
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // RLS 우회

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ .env.local에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── 변환 유틸 ────────────────────────────────────────────────────────────────

/** Excel serial → "YYYY-MM-DD" */
function serialToISO(serial) {
  const date = XLSX.SSF.parse_date_code(serial);
  if (!date) return null;
  return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
}

/** "2,400.00 ₽" → 2400 */
function parseRub(val) {
  if (!val) return 0;
  const n = parseFloat(String(val).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

/** Customer 문자열에서 platform 추론 */
function inferPlatform(customer) {
  const c = String(customer).toLowerCase();
  if (c.includes("авито") || c.includes("avito")) return "avito";
  if (c.includes(" vk") || c.startsWith("vk")) return "vk";
  return "telegram";
}

/** Progress 정규화: "Wait Customer" → "WAIT CUSTOMER" */
const VALID_PROGRESS = [
  "PAY", "BUY IN KOREA", "ARRIVE KOR", "IN DELIVERY",
  "ARRIVE RUS", "RU DELIVERY", "DONE", "WAIT CUSTOMER", "PROBLEM", "CANCEL",
];
function normalizeProgress(val) {
  const up = String(val).toUpperCase().trim();
  return VALID_PROGRESS.includes(up) ? up : "PAY";
}

/** product_option: attr1 + attr2 결합 */
function combineOption(attr1, attr2) {
  const a = String(attr1 ?? "").trim();
  const b = String(attr2 ?? "").trim();
  if (a === "#VALUE!") return b || null;
  if (!a && !b) return null;
  if (!b || a === b) return a || null;
  return `${a} ${b}`.trim();
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

const wb = XLSX.readFile("_SALES BOOK FANKO 데이터베이스 제작용 (2).xlsx");
const ws = wb.Sheets["Special orders"];
const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
const dataRows = rawRows.slice(1).filter((r) => String(r[2]).trim() !== "");

console.log(`📂 데이터 행: ${dataRows.length}개`);

// order_num 기준으로 그룹화
const orderMap = new Map();
for (const row of dataRows) {
  const orderNum = String(row[2]).trim();
  if (!orderMap.has(orderNum)) {
    orderMap.set(orderNum, {
      order_num: orderNum,
      order_type: String(row[0]).trim() || "RUSSIA",
      date: serialToISO(row[1]),
      progress: normalizeProgress(row[7]),
      customer_name: String(row[12]).trim() || null,
      platform: inferPlatform(row[12]),
      gift: row[13] === "ask" ? "ask" : "no",
      photo_sent: ["Not sent", "Sent 1", "Sent 2"].includes(row[14]) ? row[14] : "Not sent",
      purchase_channel: String(row[16]).trim() || null,
      items: [],
    });
  }
  orderMap.get(orderNum).items.push({
    order_num: orderNum,
    product_type: String(row[3]).trim() || null,
    product_name: String(row[4]).trim(),
    product_option: combineOption(row[5], row[6]),
    product_set_type: "Single",
    quantity: Math.max(1, Number(row[8]) || 1),
    price_rub: parseRub(row[9]),
    prepayment_rub: parseRub(row[10]),
    extra_payment_rub: parseRub(row[11]),
    krw: Number(row[15]) || null,
  });
}

console.log(`🗂️  고유 주문 수: ${orderMap.size}개`);

// 이미 존재하는 주문번호 조회 (중복 방지)
const allNums = [...orderMap.keys()];
const { data: existing } = await supabase
  .from("orders")
  .select("order_num")
  .in("order_num", allNums);
const existingSet = new Set((existing ?? []).map((r) => r.order_num));
console.log(`⚠️  이미 존재하는 주문: ${existingSet.size}개 (스킵)`);

// 삽입
let insertedOrders = 0;
let insertedItems = 0;
const errors = [];

for (const [orderNum, order] of orderMap) {
  if (existingSet.has(orderNum)) continue;
  if (!order.date) {
    errors.push(`${orderNum}: 날짜 변환 실패`);
    continue;
  }

  const { items, ...orderData } = order;

  const { error: oErr } = await supabase.from("orders").insert(orderData);
  if (oErr) {
    errors.push(`${orderNum}: ${oErr.message}`);
    continue;
  }
  insertedOrders++;

  const { error: iErr } = await supabase.from("order_items").insert(items);
  if (iErr) {
    errors.push(`${orderNum} 품목: ${iErr.message}`);
    await supabase.from("orders").delete().eq("order_num", orderNum);
    insertedOrders--;
  } else {
    insertedItems += items.length;
  }
}

console.log(`\n✅ 완료`);
console.log(`   주문 삽입: ${insertedOrders}개`);
console.log(`   품목 삽입: ${insertedItems}개`);
if (errors.length > 0) {
  console.log(`\n❌ 오류 (${errors.length}개):`);
  errors.forEach((e) => console.log("  -", e));
}
