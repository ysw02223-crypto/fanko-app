"use client";

import { createOrderWithItemsAction, type NewOrderLinePayload } from "@/lib/actions/orders";
import { ORDER_ROUTES, PRODUCT_CATEGORIES, SET_TYPES } from "@/lib/schema";
import { inputClass, labelClass, selectClass } from "@/lib/form-classes";
import { useMemo, useState, useTransition, type FormEvent } from "react";

function moscowTodayYmd(): string {
  const moscowDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  const yyyy = moscowDate.getFullYear();
  const mm = String(moscowDate.getMonth() + 1).padStart(2, "0");
  const dd = String(moscowDate.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function detectPlatform(orderNum: string): string {
  const prefix = orderNum.slice(0, 2);
  if (prefix === "01") return "avito";
  if (prefix === "02") return "telegram";
  if (prefix === "03") return "vk";
  return "avito";
}

type LineRow = {
  id: string;
  product_type: string;
  product_name: string;
  product_option: string;
  product_set_type: string;
  quantity: string;
  price_rub: string;
  prepayment_rub: string;
};

function emptyLine(): LineRow {
  return {
    id: crypto.randomUUID(),
    product_type: "",
    product_name: "",
    product_option: "",
    product_set_type: "Single",
    quantity: "1",
    price_rub: "",
    prepayment_rub: "0",
  };
}

function lineExtraRub(line: LineRow): string {
  const p = Number(line.price_rub);
  const pre = Number(line.prepayment_rub);
  if (!Number.isFinite(p) || !Number.isFinite(pre)) return "—";
  return (p - pre).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

// 컬럼 너비 (px)
const COL_W = {
  category: 110,
  name: 280,
  option: 120,
  setType: 90,
  qty: 55,
  price: 110,
  prepay: 110,
  extra: 110,
  del: 40,
} as const;

function wPx(n: number) {
  return { width: n, minWidth: n, maxWidth: n } as React.CSSProperties;
}

export function OrderCreateForm() {
  const today = useMemo(() => moscowTodayYmd(), []);
  const [orderNum, setOrderNum] = useState("");
  const [platform, setPlatform] = useState("avito");
  const [lines, setLines] = useState<LineRow[]>(() => [emptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleOrderNumChange = (v: string) => {
    setOrderNum(v);
    setPlatform(detectPlatform(v));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (id: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  };
  const updateLine = (id: string, patch: Partial<LineRow>) => {
    setLines((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const order_num = String(fd.get("order_num") ?? "").trim();
    const order_type = String(fd.get("order_type") ?? "");
    const date = String(fd.get("date") ?? "").trim();
    const customer_name = String(fd.get("customer_name") ?? "").trim();
    const gift = String(fd.get("gift") ?? "no");

    if (!order_num) {
      setFormError("주문번호를 입력하세요.");
      return;
    }

    const payloadLines: NewOrderLinePayload[] = [];

    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (!L.product_name.trim()) {
        setFormError(`상품 ${i + 1}행: 상품명을 입력하세요.`);
        return;
      }
      const priceRaw = L.price_rub.trim();
      if (!priceRaw) {
        setFormError(`상품 ${i + 1}행: 판매가(₽)를 입력하세요.`);
        return;
      }
      const price_rub = Number(priceRaw);
      if (!Number.isFinite(price_rub)) {
        setFormError(`상품 ${i + 1}행: 판매가(₽)를 입력하세요.`);
        return;
      }
      const q = Math.floor(Number(L.quantity));
      if (!Number.isFinite(q) || q < 1) {
        setFormError(`상품 ${i + 1}행: 수량을 확인하세요.`);
        return;
      }
      const prepRaw = L.prepayment_rub.trim();
      const prepayment_rub = prepRaw === "" ? 0 : Number(prepRaw);
      if (!Number.isFinite(prepayment_rub) || prepayment_rub < 0) {
        setFormError(`상품 ${i + 1}행: 선결제(₽)를 확인하세요.`);
        return;
      }

      payloadLines.push({
        product_type: L.product_type,
        product_name: L.product_name.trim(),
        product_option: L.product_option,
        product_set_type: L.product_set_type,
        quantity: q,
        price_rub,
        prepayment_rub,
      });
    }

    if (payloadLines.length < 1) {
      setFormError("상품을 최소 1개 이상 추가하세요.");
      return;
    }

    startTransition(async () => {
      const res = await createOrderWithItemsAction({
        order_num,
        platform,
        order_type,
        date,
        customer_name,
        gift,
        lines: payloadLines,
      });
      if (res?.error) setFormError(res.error);
    });
  };

  const th =
    "whitespace-nowrap border-b border-zinc-200 bg-zinc-50 px-2 py-2 text-left text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400";
  const td = "border-b border-zinc-200/80 px-2 py-1.5 align-middle dark:border-zinc-700/80";
  const cellInput = `${inputClass} !py-1.5 text-sm`;
  const cellSelect = `${selectClass} !py-1.5 text-sm`;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <input type="hidden" name="progress" value="PAY" />
      <input type="hidden" name="platform" value={platform} />

      {/* ── 상단 주문 정보 2열 그리드 ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* 주문번호 */}
        <div className="flex flex-col gap-1">
          <label htmlFor="order_num" className={labelClass}>
            주문번호 *
          </label>
          <input
            id="order_num"
            name="order_num"
            required
            className={inputClass}
            placeholder="예: 0212345"
            autoComplete="off"
            value={orderNum}
            onChange={(e) => handleOrderNumChange(e.target.value)}
          />
          <span className="text-xs text-zinc-500">
            플랫폼: <span className="font-medium text-zinc-700 dark:text-zinc-300">{platform}</span>
            {"  "}(01=avito · 02=telegram · 03=vk)
          </span>
        </div>

        {/* 주문 경로 */}
        <label className="flex flex-col gap-1">
          <span className={labelClass}>주문 경로 *</span>
          <select name="order_type" required className={selectClass} defaultValue="KOREA">
            {ORDER_ROUTES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        {/* 고객명 */}
        <label className="flex flex-col gap-1">
          <span className={labelClass}>고객명</span>
          <input name="customer_name" className={inputClass} autoComplete="off" />
        </label>

        {/* 선물 여부 */}
        <label className="flex flex-col gap-1">
          <span className={labelClass}>선물 여부</span>
          <select name="gift" className={selectClass} defaultValue="no">
            <option value="no">no</option>
            <option value="ask">ask</option>
          </select>
        </label>

        {/* 주문일 — 전체 너비 */}
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="date" className={labelClass}>
            주문일 *
          </label>
          <input id="date" name="date" type="date" required className={inputClass} defaultValue={today} />
          <span className="text-xs text-zinc-500">기본값: 모스크바 기준 오늘 날짜 (필요 시 변경 가능)</span>
        </div>
      </div>

      {/* ── 상품 테이블 ── */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">상품</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="border-collapse text-left text-sm" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={wPx(COL_W.category)} />
              <col style={wPx(COL_W.name)} />
              <col style={wPx(COL_W.option)} />
              <col style={wPx(COL_W.setType)} />
              <col style={wPx(COL_W.qty)} />
              <col style={wPx(COL_W.price)} />
              <col style={wPx(COL_W.prepay)} />
              <col style={wPx(COL_W.extra)} />
              <col style={wPx(COL_W.del)} />
            </colgroup>
            <thead>
              <tr>
                <th className={th} style={wPx(COL_W.category)}>카테고리</th>
                <th className={th} style={wPx(COL_W.name)}>상품명 *</th>
                <th className={th} style={wPx(COL_W.option)}>옵션</th>
                <th className={th} style={wPx(COL_W.setType)}>단품/세트</th>
                <th className={`${th} text-right`} style={wPx(COL_W.qty)}>수량</th>
                <th className={`${th} text-right`} style={wPx(COL_W.price)}>판매가₽ *</th>
                <th className={`${th} text-right`} style={wPx(COL_W.prepay)}>선결제₽</th>
                <th className={`${th} text-right`} style={wPx(COL_W.extra)}>잔금₽</th>
                <th className={`${th} text-center`} style={wPx(COL_W.del)}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className={td} style={wPx(COL_W.category)}>
                    <select
                      className={`${cellSelect} w-full`}
                      value={line.product_type}
                      onChange={(e) => updateLine(line.id, { product_type: e.target.value })}
                    >
                      <option value="">—</option>
                      {PRODUCT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={td} style={wPx(COL_W.name)}>
                    <input
                      className={`${cellInput} w-full`}
                      value={line.product_name}
                      onChange={(e) => updateLine(line.id, { product_name: e.target.value })}
                      placeholder="필수"
                    />
                  </td>
                  <td className={td} style={wPx(COL_W.option)}>
                    <input
                      className={`${cellInput} w-full`}
                      value={line.product_option}
                      onChange={(e) => updateLine(line.id, { product_option: e.target.value })}
                    />
                  </td>
                  <td className={td} style={wPx(COL_W.setType)}>
                    <select
                      className={`${cellSelect} w-full`}
                      value={line.product_set_type}
                      onChange={(e) => updateLine(line.id, { product_set_type: e.target.value })}
                    >
                      {SET_TYPES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={td} style={wPx(COL_W.qty)}>
                    <input
                      type="number"
                      min={1}
                      max={9}
                      maxLength={1}
                      className={`${cellInput} w-full text-right tabular-nums`}
                      value={line.quantity}
                      onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                    />
                  </td>
                  <td className={td} style={wPx(COL_W.price)}>
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
                  <td className={td} style={wPx(COL_W.prepay)}>
                    <input
                      type="number"
                      step="0.01"
                      max={9999999}
                      className={`${cellInput} w-full text-right tabular-nums`}
                      value={line.prepayment_rub}
                      onChange={(e) => updateLine(line.id, { prepayment_rub: e.target.value })}
                    />
                  </td>
                  <td
                    className={`${td} text-right tabular-nums text-zinc-700 dark:text-zinc-300`}
                    style={wPx(COL_W.extra)}
                  >
                    {lineExtraRub(line)}
                  </td>
                  <td className={`${td} text-center`} style={wPx(COL_W.del)}>
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

      {formError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        {pending ? "저장 중…" : "주문 저장"}
      </button>
    </form>
  );
}
