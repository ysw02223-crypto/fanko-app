"use client";

import { createClient } from "@/lib/supabase/client";
import {
  ORDER_PROGRESS,
  ORDER_ROUTES,
  PHOTO_STATUS,
  PLATFORMS,
  PRODUCT_CATEGORIES,
  SET_TYPES,
  type OrderItemRow,
  type OrderRow,
  type Platform,
  type PhotoStatus,
} from "@/lib/schema";
import { inputClass, labelClass, selectClass } from "@/lib/form-classes";
import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// ── column widths ──────────────────────────────────────────────────────────────

const COL_W = {
  category: 120,
  option: 200,
  setType: 110,
  qty: 64,
  price: 100,
  prepay: 100,
  extra: 90,
  krw: 100,
  del: 36,
} as const;

function wPx(n: number): React.CSSProperties {
  return { width: n };
}

// ── types ──────────────────────────────────────────────────────────────────────

type LineRow = {
  id: string;
  product_type: string;
  product_name: string;
  product_option: string;
  product_set_type: string;
  quantity: string;
  price_rub: string;
  prepayment_rub: string;
  krw: string;
};

// ── helpers ────────────────────────────────────────────────────────────────────

function emptyLine(): LineRow {
  return {
    id: crypto.randomUUID(),
    product_type: "Cosmetic",
    product_name: "",
    product_option: "",
    product_set_type: "Single",
    quantity: "1",
    price_rub: "",
    prepayment_rub: "0",
    krw: "",
  };
}

function lineExtraRub(line: LineRow): string {
  const p = Number(line.price_rub);
  const pre = Number(line.prepayment_rub);
  if (!Number.isFinite(p) || !Number.isFinite(pre)) return "—";
  return (p - pre).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function validateLines(lines: LineRow[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (!L.product_name.trim()) return `상품 ${i + 1}행: 상품명을 입력하세요.`;
    const priceRaw = L.price_rub.trim();
    if (!priceRaw) return `상품 ${i + 1}행: 판매가(₽)를 입력하세요.`;
    if (!Number.isFinite(Number(priceRaw))) return `상품 ${i + 1}행: 판매가(₽)가 올바르지 않습니다.`;
    const q = Math.floor(Number(L.quantity));
    if (!Number.isFinite(q) || q < 1) return `상품 ${i + 1}행: 수량을 확인하세요.`;
    const prep = L.prepayment_rub.trim() === "" ? 0 : Number(L.prepayment_rub);
    if (!Number.isFinite(prep) || prep < 0) return `상품 ${i + 1}행: 선결제(₽)를 확인하세요.`;
  }
  return null;
}

// ── component ──────────────────────────────────────────────────────────────────

export function OrderEditForm({
  order,
  items,
  onSaveSuccess,
}: {
  order: OrderRow;
  items: OrderItemRow[];
  onSaveSuccess?: () => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // ── order fields ─────────────────────────────────────────────────────────────
  const [platform, setPlatform] = useState<Platform>(order.platform);
  const [orderType, setOrderType] = useState<string>(order.order_type);
  const [date, setDate] = useState(order.date.slice(0, 10));
  const [progress, setProgress] = useState<string>(order.progress);
  const [customerName, setCustomerName] = useState(order.customer_name ?? "");
  const [gift, setGift] = useState(order.gift === "ask" ? "ask" : "no");
  const [photoSent, setPhotoSent] = useState<PhotoStatus>(order.photo_sent);
  const [purchaseChannel, setPurchaseChannel] = useState(order.purchase_channel ?? "");

  // ── item lines ───────────────────────────────────────────────────────────────
  const [lines, setLines] = useState<LineRow[]>(() =>
    items.length > 0
      ? items.map((item) => ({
          id: crypto.randomUUID(),
          product_type: item.product_type ?? "Cosmetic",
          product_name: item.product_name,
          product_option: item.product_option ?? "",
          product_set_type: item.product_set_type,
          quantity: String(item.quantity),
          price_rub: String(item.price_rub),
          prepayment_rub: String(item.prepayment_rub),
          krw: item.krw != null ? String(item.krw) : "",
        }))
      : [emptyLine()],
  );

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // ── line helpers ─────────────────────────────────────────────────────────────
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (id: string) =>
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  const updateLine = (id: string, patch: Partial<LineRow>) =>
    setLines((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // ── submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const lineErr = validateLines(lines);
    if (lineErr) {
      setFormError(lineErr);
      return;
    }

    startTransition(async () => {
      // 1. 주문 정보 UPDATE
      const { error: orderErr } = await supabase
        .from("orders")
        .update({
          platform,
          order_type: orderType,
          date,
          progress,
          customer_name: customerName.trim() || null,
          gift: gift === "ask" ? "ask" : "no",
          photo_sent: photoSent,
          purchase_channel: purchaseChannel.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("order_num", order.order_num);

      if (orderErr) {
        setFormError(orderErr.message);
        return;
      }

      // 2. 기존 상품 전체 삭제 후 재삽입
      const { error: delErr } = await supabase
        .from("order_items")
        .delete()
        .eq("order_num", order.order_num);

      if (delErr) {
        setFormError(delErr.message);
        return;
      }

      const rows = lines.map((L) => {
        const price_rub = Number(L.price_rub);
        const prepayment_rub = L.prepayment_rub.trim() === "" ? 0 : Number(L.prepayment_rub);
        const krwRaw = L.krw.trim();
        return {
          order_num: order.order_num,
          product_type: L.product_type || null,
          product_name: L.product_name.trim(),
          product_option: L.product_option.trim() || null,
          product_set_type: L.product_set_type,
          quantity: Math.floor(Number(L.quantity)),
          price_rub,
          prepayment_rub,
          extra_payment_rub: price_rub - prepayment_rub,
          krw: krwRaw === "" ? null : Math.round(Number(krwRaw)),
        };
      });

      const { error: itemsErr } = await supabase.from("order_items").insert(rows);
      if (itemsErr) {
        setFormError(itemsErr.message);
        return;
      }

      setFormSuccess("변경 사항을 저장했습니다.");
      router.refresh();
      onSaveSuccess?.();
    });
  };

  // ── styles (create form과 동일) ───────────────────────────────────────────────
  const th =
    "whitespace-nowrap border-b-2 border-r border-b-gray-300 border-r-gray-200 bg-gray-50 px-2 py-2 text-left text-xs font-semibold text-zinc-600 dark:border-b-zinc-600 dark:border-r-zinc-700 dark:bg-zinc-900 dark:text-zinc-400";
  const thLast =
    "whitespace-nowrap border-b-2 border-b-gray-300 bg-gray-50 px-2 py-2 text-center text-xs font-semibold text-zinc-600 dark:border-b-zinc-600 dark:bg-zinc-900 dark:text-zinc-400";
  const td =
    "border-b border-r border-b-gray-100 border-r-gray-100 px-2 py-1.5 align-middle dark:border-b-zinc-800 dark:border-r-zinc-800";
  const tdLast = "border-b border-b-gray-100 px-2 py-1.5 align-middle text-center dark:border-b-zinc-800";
  const cellInput = `${inputClass} !py-1.5 text-sm`;
  const cellSelect = `${selectClass} !py-1.5 text-sm`;
  const compactInput =
    "w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
  const compactSelect = compactInput;

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* 주문 정보 3열 그리드 */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-3">

        {/* 1행: 주문번호(읽기전용) | 주문일 | 고객명 */}
        <div className="flex flex-col gap-1">
          <span className={labelClass}>주문번호</span>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {order.order_num}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="date" className={labelClass}>주문일 *</label>
          <input
            id="date"
            type="date"
            required
            className={compactInput}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="customer_name" className={labelClass}>고객명</label>
          <input
            id="customer_name"
            className={compactInput}
            autoComplete="off"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </div>

        {/* 2행: 진행상태 | 선물여부 | 주문경로 */}
        <div className="flex flex-col gap-1">
          <label htmlFor="progress" className={labelClass}>진행상태 *</label>
          <select
            id="progress"
            required
            className={compactSelect}
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
          >
            {ORDER_PROGRESS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="gift" className={labelClass}>선물 여부</label>
          <select
            id="gift"
            className={compactSelect}
            value={gift}
            onChange={(e) => setGift(e.target.value)}
          >
            <option value="no">no</option>
            <option value="ask">ask</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="order_type" className={labelClass}>주문 경로 *</label>
          <select
            id="order_type"
            required
            className={compactSelect}
            value={orderType}
            onChange={(e) => setOrderType(e.target.value)}
          >
            {ORDER_ROUTES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* 3행: 플랫폼 | 사진발송 | 거래처 */}
        <div className="flex flex-col gap-1">
          <label htmlFor="platform" className={labelClass}>플랫폼 *</label>
          <select
            id="platform"
            required
            className={compactSelect}
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="photo_sent" className={labelClass}>사진 발송</label>
          <select
            id="photo_sent"
            className={compactSelect}
            value={photoSent}
            onChange={(e) => setPhotoSent(e.target.value as PhotoStatus)}
          >
            {PHOTO_STATUS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="purchase_channel" className={labelClass}>거래처 / 매입처</label>
          <input
            id="purchase_channel"
            className={compactInput}
            value={purchaseChannel}
            onChange={(e) => setPurchaseChannel(e.target.value)}
          />
        </div>
      </div>

      {/* 상품 테이블 */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">상품</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table
            className="min-w-[960px] border-collapse text-left text-sm"
            style={{ width: "100%" }}
          >
            <colgroup>
              <col style={wPx(COL_W.category)} />
              <col />
              <col style={wPx(COL_W.option)} />
              <col style={wPx(COL_W.setType)} />
              <col style={wPx(COL_W.qty)} />
              <col style={wPx(COL_W.price)} />
              <col style={wPx(COL_W.prepay)} />
              <col style={wPx(COL_W.extra)} />
              <col style={wPx(COL_W.krw)} />
              <col style={wPx(COL_W.del)} />
            </colgroup>
            <thead>
              <tr>
                <th className={`${th} min-w-[120px]`}>카테고리</th>
                <th className={`${th} min-w-[160px]`}>상품명 *</th>
                <th className={`${th} min-w-[180px]`}>옵션</th>
                <th className={`${th} min-w-[110px]`}>단품/세트</th>
                <th className={`${th} min-w-[60px] text-center`}>수량</th>
                <th className={`${th} min-w-[100px] text-right`}>판매가₽ *</th>
                <th className={`${th} min-w-[90px] text-right`}>선결제₽</th>
                <th className={`${th} min-w-[80px] text-right`}>잔금₽</th>
                <th className={`${th} min-w-[90px] text-right`}>원화매입₩</th>
                <th className={`${thLast} min-w-[36px]`}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className={td}>
                    <select
                      className={`${cellSelect} w-full text-left`}
                      style={{ paddingLeft: "6px" }}
                      value={line.product_type}
                      onChange={(e) => updateLine(line.id, { product_type: e.target.value })}
                    >
                      <option value="">—</option>
                      {PRODUCT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td className={td}>
                    <input
                      className={`${cellInput} w-full`}
                      value={line.product_name}
                      onChange={(e) => updateLine(line.id, { product_name: e.target.value })}
                      placeholder="필수"
                    />
                  </td>
                  <td className={td}>
                    <input
                      className={`${cellInput} w-full`}
                      value={line.product_option}
                      onChange={(e) => updateLine(line.id, { product_option: e.target.value })}
                    />
                  </td>
                  <td className={td}>
                    <select
                      className={`${cellSelect} w-full text-left`}
                      style={{ paddingLeft: "6px" }}
                      value={line.product_set_type}
                      onChange={(e) => updateLine(line.id, { product_set_type: e.target.value })}
                    >
                      {SET_TYPES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className={td}>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      placeholder="1"
                      className={`${cellInput} w-full text-center tabular-nums`}
                      value={line.quantity}
                      onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                    />
                  </td>
                  <td className={td}>
                    <input
                      type="number"
                      step="0.01"
                      max={9999999}
                      className={`${cellInput} w-full text-right tabular-nums`}
                      value={line.price_rub}
                      onChange={(e) => updateLine(line.id, { price_rub: e.target.value })}
                      placeholder="필수"
                    />
                  </td>
                  <td className={td}>
                    <input
                      type="number"
                      step="0.01"
                      max={9999999}
                      className={`${cellInput} w-full text-right tabular-nums`}
                      value={line.prepayment_rub}
                      onChange={(e) => updateLine(line.id, { prepayment_rub: e.target.value })}
                    />
                  </td>
                  <td className={`${td} text-right tabular-nums text-zinc-700 dark:text-zinc-300`}>
                    {lineExtraRub(line)}
                  </td>
                  <td className={td}>
                    <input
                      type="number"
                      step="1"
                      className={`${cellInput} w-full text-right tabular-nums`}
                      value={line.krw}
                      onChange={(e) => updateLine(line.id, { krw: e.target.value })}
                      placeholder="—"
                    />
                  </td>
                  <td className={tdLast}>
                    <button
                      type="button"
                      disabled={lines.length <= 1}
                      className="rounded-md px-1.5 py-1 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950/40"
                      aria-label="행 삭제"
                      onClick={() => removeLine(line.id)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={addLine}
          className="w-fit rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          + 상품 추가
        </button>
      </div>

      {formError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {formError}
        </p>
      )}
      {formSuccess && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {formSuccess}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        {pending ? "저장 중…" : "변경 저장"}
      </button>
    </form>
  );
}
