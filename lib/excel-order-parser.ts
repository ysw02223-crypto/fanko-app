import * as XLSX from "xlsx";
import { ORDER_PROGRESS, PHOTO_STATUS, PLATFORMS } from "@/lib/schema";
import type { OrderProgress, PhotoStatus, Platform } from "@/lib/schema";

export type ParsedOrderItem = {
  product_name: string;
  quantity: number;
  price_rub: number;
  prepayment_rub: number;
  extra_payment_rub: number;
  krw: number | null;
  progress: OrderProgress;
  gift: "no" | "ask";
  photo_sent: PhotoStatus;
};

export type ParsedOrder = {
  order_num: string;
  date: string;
  platform: Platform;
  customer_name: string | null;
  items: ParsedOrderItem[];
  warnings: string[];
};

export type ParseResult = {
  orders: ParsedOrder[];
  skippedRows: number;
};

const PREFIX_MAP: Record<string, Platform> = {
  "01": "avito",
  "02": "telegram",
  "03": "vk",
};

function serialToDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

function normalizeProgress(raw: unknown): OrderProgress {
  if (!raw) return "PAY";
  const upper = String(raw).toUpperCase().trim();
  return (ORDER_PROGRESS as readonly string[]).includes(upper)
    ? (upper as OrderProgress)
    : "PAY";
}

function normalizePlatform(raw: unknown, orderNum: string): Platform {
  if (raw) {
    const lower = String(raw).toLowerCase().trim();
    if ((PLATFORMS as readonly string[]).includes(lower)) return lower as Platform;
  }
  return PREFIX_MAP[orderNum.slice(0, 2)] ?? "avito";
}

function normalizePhoto(raw: unknown): PhotoStatus {
  if (raw) {
    const s = String(raw).trim();
    if ((PHOTO_STATUS as readonly string[]).includes(s)) return s as PhotoStatus;
  }
  return "Not sent";
}

export function parseExcelBuffer(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

  const grouped = new Map<string, unknown[][]>();
  let skippedRows = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.every((v) => v == null || v === "")) { skippedRows++; continue; }
    if (!row[3]) { skippedRows++; continue; }
    if (!row[1]) { skippedRows++; continue; }
    const on = String(row[2] ?? "").trim();
    if (!on || on === "00000000") { skippedRows++; continue; }

    if (!grouped.has(on)) grouped.set(on, []);
    grouped.get(on)!.push(row);
  }

  const orders: ParsedOrder[] = [];

  for (const [order_num, orderRows] of grouped) {
    const warnings: string[] = [];

    let date: string | null = null;
    let platformRaw: unknown = null;
    let customer_name: string | null = null;

    for (const r of orderRows) {
      if (!date && r[1]) date = serialToDate(Number(r[1]));
      if (!platformRaw && r[19]) platformRaw = r[19];
      if (!customer_name && r[9]) customer_name = String(r[9]).trim();
    }

    const allDates = [...new Set(orderRows.map((r) => r[1]).filter(Boolean))];
    if (allDates.length > 1) {
      warnings.push(
        `날짜 불일치 (${allDates.map((d) => serialToDate(Number(d))).join(", ")}) → ${date} 사용`,
      );
    }

    const allPlatforms = [...new Set(orderRows.map((r) => r[19]).filter(Boolean))];
    if (allPlatforms.length > 1) {
      warnings.push(
        `플랫폼 불일치 (${allPlatforms.join(", ")}) → ${String(platformRaw)} 사용`,
      );
    }

    const platform = normalizePlatform(platformRaw, order_num);

    const items: ParsedOrderItem[] = orderRows.map((r) => ({
      product_name:      String(r[3] ?? "").trim(),
      quantity:          Math.max(1, Math.floor(Number(r[5]) || 1)),
      price_rub:         Number(r[6]) || 0,
      prepayment_rub:    Number(r[7]) || 0,
      extra_payment_rub: Number(r[8]) || 0,
      krw:               r[15] != null && r[15] !== "" ? Number(r[15]) : null,
      progress:          normalizeProgress(r[4]),
      gift:              String(r[10] ?? "no") === "ask" ? "ask" : "no",
      photo_sent:        normalizePhoto(r[11]),
    }));

    orders.push({
      order_num,
      date: date!,
      platform,
      customer_name: customer_name || null,
      items,
      warnings,
    });
  }

  return { orders, skippedRows };
}
