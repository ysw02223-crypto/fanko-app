"use client";

import { useRef, useState, useTransition } from "react";
import { parseExcelBuffer, type ParsedOrder } from "@/lib/excel-order-parser";
import { bulkImportOrdersAction, type BulkImportResult } from "@/lib/actions/orders";

type PreviewState = {
  orders: ParsedOrder[];
  skippedRows: number;
};

export function ExcelBulkUploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buffer = ev.target?.result as ArrayBuffer;
      const parsed = parseExcelBuffer(buffer);
      setPreview(parsed);
      setResult(null);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  function handleConfirm() {
    if (!preview) return;
    startTransition(async () => {
      const res = await bulkImportOrdersAction(preview.orders);
      setResult(res);
      setPreview(null);
    });
  }

  const allWarnings = preview?.orders.flatMap((o) =>
    o.warnings.map((w) => `${o.order_num}: ${w}`),
  ) ?? [];

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      >
        엑셀 업로드
      </button>

      {/* 프리뷰 모달 */}
      {preview && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              업로드 미리보기
            </h2>

            <div className="mb-4 space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-2.5 dark:bg-emerald-950/30">
                <span className="text-emerald-700 dark:text-emerald-300">등록 가능</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  {preview.orders.length}개 주문
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-2.5 dark:bg-zinc-800">
                <span className="text-zinc-500 dark:text-zinc-400">자동 스킵 (빈 행·누락)</span>
                <span className="font-semibold text-zinc-500 dark:text-zinc-400">
                  {preview.skippedRows}행
                </span>
              </div>
            </div>

            {allWarnings.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="mb-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  ⚠ 데이터 불일치 감지 — 첫 번째 값으로 등록됩니다
                </p>
                <ul className="space-y-0.5">
                  {allWarnings.map((w, i) => (
                    <li key={i} className="text-xs text-amber-600 dark:text-amber-400">
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mb-5 text-xs text-zinc-400 dark:text-zinc-500">
              * DB에 이미 존재하는 주문번호는 저장 시 자동으로 스킵됩니다.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="flex-1 rounded-lg border border-zinc-200 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending || preview.orders.length === 0}
                className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {isPending ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 완료 결과 모달 */}
      {result && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              업로드 완료
            </h2>
            <div className="space-y-2 text-sm">
              <p className="text-emerald-600 dark:text-emerald-400">
                ✓ {result.inserted}개 주문 등록 완료
              </p>
              {result.skipped.length > 0 && (
                <p className="text-zinc-500 dark:text-zinc-400">
                  ⊘ 이미 존재하여 스킵: {result.skipped.length}건
                </p>
              )}
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
                  <p className="mb-1 text-xs font-semibold text-red-600 dark:text-red-400">
                    오류 발생 ({result.errors.length}건)
                  </p>
                  <ul className="space-y-0.5">
                    {result.errors.map((e, i) => (
                      <li key={i} className="text-xs text-red-500 dark:text-red-400">
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="mt-4 w-full rounded-lg bg-zinc-100 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
