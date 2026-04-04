import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getShippingExportRows } from "@/lib/actions/shipping";

// 40컬럼 헤더 정의
// 데이터 컬럼: 실제 DB값, 고정값: 항상 동일한 값, 빈칸: 수동 입력용
const HEADERS = [
  "주문번호",         // 1  order_num
  "주문일자",         // 2  date
  "구매자명",         // 3  customer_name
  "브랜드",           // 4  brand
  "상품명",           // 5  product_name
  "옵션",             // 6  product_option
  "수량",             // 7  quantity
  "판매가(₽)",        // 8  price_rub
  "원화매입(₩)",      // 9  krw
  "단가USD",          // 10 unit_price_usd
  "총금액USD",        // 11 계산값: unit_price_usd * quantity
  "수취인명",         // 12 recipient_name
  "수취인 연락처",    // 13 recipient_phone
  "수취인 이메일",    // 14 recipient_email
  "우편번호",         // 15 zip_code
  "지역(Oblast)",     // 16 region
  "도시",             // 17 city
  "상세주소",         // 18 address
  "개인통관고유번호", // 19 customs_number
  "발송국가",         // 20 고정: Korea
  "수취국가",         // 21 고정: Russia
  "배송방법",         // 22 빈칸
  "운송장번호",       // 23 빈칸
  "박스번호",         // 24 빈칸
  "무게(kg)",         // 25 빈칸
  "가로(cm)",         // 26 빈칸
  "세로(cm)",         // 27 빈칸
  "높이(cm)",         // 28 빈칸
  "HS코드",           // 29 빈칸
  "상품분류",         // 30 빈칸
  "원산지",           // 31 고정: Korea
  "통화",             // 32 고정: USD
  "관세율(%)",        // 33 빈칸
  "보험여부",         // 34 빈칸
  "보험금액",         // 35 빈칸
  "비고1",            // 36 빈칸
  "비고2",            // 37 빈칸
  "비고3",            // 38 빈칸
  "비고4",            // 39 빈칸
  "비고5",            // 40 빈칸
];

export async function GET() {
  const rows = await getShippingExportRows();

  const data: (string | number | null)[][] = rows.map((r) => [
    r.order_num,
    r.date,
    r.customer_name ?? "",
    r.brand ?? "",
    r.product_name,
    r.product_option ?? "",
    r.quantity,
    r.price_rub,
    r.krw ?? "",
    r.unit_price_usd ?? "",
    r.unit_price_usd != null ? r.unit_price_usd * r.quantity : "",
    r.recipient_name ?? "",
    r.recipient_phone ?? "",
    r.recipient_email ?? "",
    r.zip_code ?? "",
    r.region ?? "",
    r.city ?? "",
    r.address ?? "",
    r.customs_number ?? "",
    "Korea",   // 20 고정
    "Russia",  // 21 고정
    "",        // 22 배송방법
    "",        // 23 운송장번호
    "",        // 24 박스번호
    "",        // 25 무게
    "",        // 26 가로
    "",        // 27 세로
    "",        // 28 높이
    "",        // 29 HS코드
    "",        // 30 상품분류
    "Korea",   // 31 원산지 고정
    "USD",     // 32 통화 고정
    "",        // 33 관세율
    "",        // 34 보험여부
    "",        // 35 보험금액
    "",        // 36 비고1
    "",        // 37 비고2
    "",        // 38 비고3
    "",        // 39 비고4
    "",        // 40 비고5
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([HEADERS, ...data]);

  // 헤더 행 스타일 (배경색 설정은 xlsx pro 버전에서만 가능, 여기선 컬럼 너비만 조정)
  worksheet["!cols"] = HEADERS.map(() => ({ wch: 18 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "배송정보");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="shipping_${today}.xlsx"`,
    },
  });
}