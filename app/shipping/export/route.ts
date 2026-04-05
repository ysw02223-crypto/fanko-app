import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getShippingExportRows } from "@/lib/actions/shipping";

const HS_CODE: Record<string, string> = {
  Cosmetic: "3304999000",
  Clothes: "6110301000",
  Toy: "9503003919",
};

export async function GET(req: NextRequest) {
  const rows = await getShippingExportRows();

  // public/ 파일을 HTTP fetch로 읽기 (fs 불필요, Vercel 서버리스에서 안정적)
  const { origin } = new URL(req.url);
  const templateRes = await fetch(`${origin}/shipter-template.xlsx`);
  if (!templateRes.ok) {
    return NextResponse.json({ error: "템플릿 파일을 불러오지 못했습니다." }, { status: 500 });
  }
  const templateBuffer = await templateRes.arrayBuffer();

  const workbook = XLSX.read(new Uint8Array(templateBuffer), { type: "array" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  rows.forEach((r, i) => {
    const rowIdx = i + 1; // row 0 = 헤더, row 1부터 데이터

    const rowData = [
      "RU",                                                        // A  배송국가
      "SHIPTER_EREG1",                                             // B  배송타입
      r.order_num,                                                 // C  주문번호
      "",                                                          // D  운송장번호
      "",                                                          // E  출발국가 택배번호
      "FANKO",                                                     // F  발송인 이름
      "01056959120",                                               // G  발송인 전화번호
      "",                                                          // H  발송인 이메일
      "07764",                                                     // I  발송인 우편번호
      "Korea",                                                     // J  발송인 지역
      "Seoul",                                                     // K  발송인 도시
      "B01ho, Gangseo-gu,f Gangseo-ro 17na-gil",                  // L  발송인 주소
      r.recipient_name ?? "",                                      // M  수취인 이름
      r.recipient_phone ?? "",                                     // N  수취인 전화번호
      r.recipient_email ?? "",                                     // O  수취인 이메일
      r.zip_code ?? "",                                            // P  수취인 우편번호
      r.region ?? "",                                              // Q  수취인 지역
      r.city ?? "",                                                // R  수취인 도시
      r.address ?? "",                                             // S  수취인 주소1
      "",                                                          // T  수취인 주소2
      "",                                                          // U  수출신고신청여부
      "",                                                          // V  수출신고번호
      "",                                                          // W  무게(Kg)
      "",                                                          // X  가로(Cm)
      "",                                                          // Y  세로(Cm)
      "",                                                          // Z  높이(Cm)
      "",                                                          // AA 통관번호종류
      r.customs_number ?? "",                                      // AB 통관번호
      "USD",                                                       // AC 화폐 종류
      "",                                                          // AD 상품코드(SKU)
      r.product_name,                                              // AE 상품명
      r.quantity,                                                  // AF 수량
      r.unit_price_usd ?? "",                                      // AG 단가
      r.brand ?? "",                                               // AH 브랜드명
      "",                                                          // AI 제품 URL
      HS_CODE[r.product_type ?? ""] ?? "",                         // AJ HS CODE
      "",                                                          // AK 사용자 데이터1
      "",                                                          // AL 사용자 데이터2
      "",                                                          // AM 사용자 데이터3
      "",                                                          // AN 사용자 데이터4
    ];

    XLSX.utils.sheet_add_aoa(worksheet, [rowData], { origin: { r: rowIdx, c: 0 } });
  });

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="shipping_${today}.xlsx"`,
    },
  });
}
