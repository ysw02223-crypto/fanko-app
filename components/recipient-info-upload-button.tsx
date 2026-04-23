"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  bulkUpsertRecipientInfoAction,
  type RecipientRow,
  type RecipientImportResult,
} from "@/lib/actions/shipping-recipient-import";

function parseSheet(file: File): Promise<{ rows: RecipientRow[]; skipped: number }> {
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

        const rows: RecipientRow[] = [];
        let skipped = 0;

        for (let i = 1; i < raw.length; i++) {
          const r = raw[i];
          const rawOrderNum = String(r[0] ?? "").trim();
          if (!rawOrderNum) {
            skipped++;
            continue;
          }

          const orderNums = rawOrderNum
            .split(/\r?\n/)
            .map((n) => n.trim())
            .filter(Boolean);

          const shared: Omit<RecipientRow, "order_num"> = {
            recipient_name: String(r[2] ?? "").trim() || null,
            recipient_phone: String(r[3] ?? "").trim() || null,
            recipient_email: String(r[4] ?? "").trim() || null,
            zip_code: r[5] != null && r[5] !== "" ? String(r[5]).trim() : null,
            region: String(r[6] ?? "").trim() || null,
            city: String(r[7] ?? "").trim() || null,
            address: String(r[8] ?? "").trim() || null,
            customs_number: String(r[9] ?? "").trim() || null,
          };

          for (const num of orderNums) {
            rows.push({ order_num: num, ...shared });
          }
        }

        resolve({ rows, skipped });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsArrayBuffer(file);
  });
}

type PreviewState = { rows: RecipientRow[]; skipped: number };

export function RecipientInfoUploadButton() {
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
      const parsed = await parseSheet(file);
      if (parsed.rows.length === 0) {
        setParseError("데이터 행이 없습니다. 파일을 확인하세요.");
        return;
      }
      setPreview(parsed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "파싱 오류");
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const result: RecipientImportResult = await bulkUpsertRecipientInfoAction(preview.rows);
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
        onChange={(e) => {
          void handleFile(e);
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
      >
        수취인 정보 업로드
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
            <h2 className="mb-3 text-base font-semibold">
              수취인 정보 확인 ({preview.rows.length}건
              {preview.skipped > 0 ? `, ${preview.skipped}행 스킵` : ""})
            </h2>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-zinc-500">
                    <th className="px-2 py-1 text-left">주문번호</th>
                    <th className="px-2 py-1 text-left">수취인</th>
                    <th className="px-2 py-1 text-left">전화번호</th>
                    <th className="px-2 py-1 text-left">주소</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-2 py-1 font-mono">{r.order_num}</td>
                      <td className="px-2 py-1">{r.recipient_name ?? "—"}</td>
                      <td className="px-2 py-1">{r.recipient_phone ?? "—"}</td>
                      <td className="max-w-[200px] truncate px-2 py-1">
                        {[r.city, r.address].filter(Boolean).join(" ") || "—"}
                      </td>
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
                onClick={() => {
                  void handleConfirm();
                }}
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
