"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  importDeliveryDataAction,
  type DeliveryImportRow,
} from "@/lib/actions/delivery-import";

// 엑셀 헤더 이름 → 내부 필드 매핑 (대소문자 무시, 공백 무시)
const HEADER_MAP: Record<string, keyof DeliveryImportRow> = {
  "주문번호": "order_num",
  "order_num": "order_num",
  "order num": "order_num",
  "주문 번호": "order_num",
  "주문번호1": "order_num",
  "배송비": "shipping_fee",
  "shipping_fee": "shipping_fee",
  "배송 비용": "shipping_fee",
  "적용무게": "applied_weight",
  "applied_weight": "applied_weight",
  "무게": "applied_weight",
  "무게(kg)": "applied_weight",
  "적용무게(kg)": "applied_weight",
  "배송번호": "tracking_number",
  "tracking_number": "tracking_number",
  "운송장번호": "tracking_number",
  "송장번호": "tracking_number",
  "shipter 배송 번호": "tracking_number",
  "delivery": "tracking_number",
};

function parseSheet(file: File): Promise<DeliveryImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Array<string | number>>(ws, {
          header: 1,
          defval: "",
        }) as Array<Array<string | number>>;

        if (raw.length < 2) { resolve([]); return; }

        const headerRow = raw[0].map((h) => String(h).trim().replace(/\s+/g, " "));
        const colIdx: Partial<Record<keyof DeliveryImportRow, number>> = {};
        headerRow.forEach((h, i) => {
          const key = HEADER_MAP[h] ?? HEADER_MAP[h.toLowerCase()];
          if (key !== undefined) colIdx[key] = i;
        });

        if (colIdx.order_num === undefined) {
          reject(new Error("주문번호 컬럼을 찾을 수 없습니다. 헤더명을 확인하세요."));
          return;
        }

        const result: DeliveryImportRow[] = [];
        for (let i = 1; i < raw.length; i++) {
          const row = raw[i];
          const orderNum = String(row[colIdx.order_num] ?? "").trim();
          if (!orderNum) continue;

          const toNum = (idx: number | undefined): number | null => {
            if (idx === undefined) return null;
            const v = Number(row[idx]);
            return Number.isFinite(v) && v !== 0 ? v : null;
          };

          result.push({
            order_num: orderNum,
            shipping_fee: toNum(colIdx.shipping_fee),
            applied_weight: toNum(colIdx.applied_weight),
            tracking_number:
              colIdx.tracking_number !== undefined
                ? String(row[colIdx.tracking_number] ?? "").trim() || null
                : null,
          });
        }
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsArrayBuffer(file);
  });
}

type PreviewState = {
  rows: DeliveryImportRow[];
};

export function DeliveryImportButton({
  onImportDone,
}: {
  onImportDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setParseError(null);
    setResultMsg(null);
    try {
      const rows = await parseSheet(file);
      if (rows.length === 0) {
        setParseError("데이터 행이 없습니다. 파일을 확인하세요.");
        return;
      }
      setPreview({ rows });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "파싱 오류");
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const result = await importDeliveryDataAction(preview.rows);
      if (result.error) {
        setParseError(result.error);
        return;
      }
      const notFoundMsg =
        result.notFound.length > 0
          ? ` (미매칭 ${result.notFound.length}건: ${result.notFound.slice(0, 3).join(", ")}${result.notFound.length > 3 ? " …" : ""})`
          : "";
      setResultMsg(`${result.updated}건 업데이트됨${notFoundMsg}`);
      setPreview(null);
      onImportDone();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => { void handleFile(e); }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
      >
        배송 엑셀 업로드
      </button>

      {parseError && (
        <span className="text-xs text-red-600 dark:text-red-400">{parseError}</span>
      )}
      {resultMsg && (
        <span className="text-xs text-emerald-600 dark:text-emerald-400">{resultMsg}</span>
      )}

      {preview && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="mb-3 text-base font-semibold">배송 데이터 확인 ({preview.rows.length}건)</h2>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-zinc-500">
                    <th className="px-2 py-1 text-left">주문번호</th>
                    <th className="px-2 py-1 text-right">배송비</th>
                    <th className="px-2 py-1 text-right">적용무게</th>
                    <th className="px-2 py-1 text-left">배송번호</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.order_num} className="border-b last:border-0">
                      <td className="px-2 py-1">{r.order_num}</td>
                      <td className="px-2 py-1 text-right">{r.shipping_fee ?? "—"}</td>
                      <td className="px-2 py-1 text-right">{r.applied_weight ?? "—"}</td>
                      <td className="px-2 py-1">{r.tracking_number ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => { void handleConfirm(); }}
                disabled={loading}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {loading ? "업로드 중…" : "확인 · 업로드"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
