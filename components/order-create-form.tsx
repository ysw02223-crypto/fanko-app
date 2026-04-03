"use client";

import { createClient } from "@/lib/supabase/client";
import { ORDER_PROGRESS, ORDER_ROUTES, PRODUCT_CATEGORIES, SET_TYPES } from "@/lib/schema";
import { inputClass, labelClass, selectClass } from "@/lib/form-classes";
import React, { useCallback, useEffect, useMemo, useState, useTransition } from "react";

// ── helpers ────────────────────────────────────────────────────────────────────

function moscowTodayYmd(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function detectPlatform(orderNum: string): string {
  const prefix = orderNum.slice(0, 2);
  if (prefix === "01") return "avito";
  if (prefix === "02") return "telegram";
  if (prefix === "03") return "vk";
  return "avito";
}

function extractOption(productName: string): string | null {
  const match = productName.match(/\(([^)]+)\)(?=[^(]*$)/);
  return match ? match[0] : null;
}

function stripLastParens(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function progressBadgeClass(p: string): string {
  const map: Record<string, string> = {
    PAY: "bg-slate-200 text-slate-900",
    "BUY IN KOREA": "bg-amber-200 text-amber-950",
    "ARRIVE KOR": "bg-orange-200 text-orange-950",
    "IN DELIVERY": "bg-sky-200 text-sky-950",
    "ARRIVE RUS": "bg-cyan-200 text-cyan-950",
    DONE: "bg-emerald-200 text-emerald-950",
  };
  return map[p] ?? "bg-zinc-200 text-zinc-800";
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
};

type RecentOrder = {
  order_num: string;
  date: string | null;
  customer_name: string | null;
  progress: string;
  order_items: Array<{
    product_name: string;
    product_option: string | null;
    price_rub: number;
  }>;
};

// ── line helpers ───────────────────────────────────────────────────────────────

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
    const price_rub = Number(priceRaw);
    if (!Number.isFinite(price_rub)) return `상품 ${i + 1}행: 판매가(₽)를 입력하세요.`;
    const q = Math.floor(Number(L.quantity));
    if (!Number.isFinite(q) || q < 1) return `상품 ${i + 1}행: 수량을 확인하세요.`;
    const prepayment_rub = L.prepayment_rub.trim() === "" ? 0 : Number(L.prepayment_rub);
    if (!Number.isFinite(prepayment_rub) || prepayment_rub < 0)
      return `상품 ${i + 1}행: 선결제(₽)를 확인하세요.`;
  }
  return null;
}

function linesToInsertRows(lines: LineRow[], orderNum: string) {
  return lines.map((L) => {
    const price_rub = Number(L.price_rub);
    const prepayment_rub = L.prepayment_rub.trim() === "" ? 0 : Number(L.prepayment_rub);
    return {
      order_num: orderNum,
      product_type: L.product_type || null,
      product_name: L.product_name.trim(),
      product_option: L.product_option.trim() || null,
      product_set_type: L.product_set_type,
      quantity: Math.floor(Number(L.quantity)),
      price_rub,
      prepayment_rub,
      extra_payment_rub: price_rub - prepayment_rub,
      krw: null,
    };
  });
}

// ── column widths ──────────────────────────────────────────────────────────────

const COL_W = {
  category: 120,
  option: 200,
  setType: 110,
  qty: 64,
  price: 100,
  prepay: 100,
  extra: 90,
  del: 36,
} as const;

function wPx(n: number): React.CSSProperties {
  return { width: n };
}

// ── component ──────────────────────────────────────────────────────────────────

export function OrderCreateForm() {
  const today = useMemo(() => moscowTodayYmd(), []);
  const supabase = useMemo(() => createClient(), []);

  // form fields (all controlled)
  const [orderNum, setOrderNum] = useState("");
  const [platform, setPlatform] = useState("avito");
  const [orderType, setOrderType] = useState("KOREA");
  const [customerName, setCustomerName] = useState("");
  const [gift, setGift] = useState("no");
  const [date, setDate] = useState(today);
  const [progress, setProgress] = useState("PAY");
  const [lines, setLines] = useState<LineRow[]>(() => [emptyLine()]);

  // UI state
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // edit mode
  const [editMode, setEditMode] = useState(false);
  const [editOrderNum, setEditOrderNum] = useState("");

  // recent orders panel
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const fetchRecentOrders = useCallback(async () => {
    setRecentLoading(true);
    try {
      const { data } = await supabase
        .from("orders")
        .select("order_num, date, customer_name, progress, order_items(product_name, product_option, price_rub)")
        .order("created_at", { ascending: false })
        .limit(20);
      setRecentOrders((data as RecentOrder[]) ?? []);
    } finally {
      setRecentLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void fetchRecentOrders();
  }, [fetchRecentOrders]);

  // ── form helpers ─────────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setOrderNum("");
    setPlatform("avito");
    setOrderType("KOREA");
    setCustomerName("");
    setGift("no");
    setDate(moscowTodayYmd());
    setProgress("PAY");
    setLines([emptyLine()]);
    setFormError(null);
    setFormSuccess(null);
    setEditMode(false);
    setEditOrderNum("");
  }, []);

  const handleOrderNumChange = (v: string) => {
    setOrderNum(v);
    setPlatform(detectPlatform(v));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (id: string) =>
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  const updateLine = (id: string, patch: Partial<LineRow>) =>
    setLines((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const handleProductNameChange = (id: string, value: string) => {
    setLines((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const extracted = extractOption(value);
        const option = extracted !== null ? extracted : "";
        return { ...r, product_name: value, product_option: option };
      }),
    );
  };

  // ── load existing order into form ────────────────────────────────────────────

  const loadOrder = useCallback(
    async (on: string) => {
      const { data: order, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("order_num", on)
        .single();

      if (error || !order) return;

      setOrderNum(order.order_num);
      setPlatform(order.platform ?? "avito");
      setOrderType(order.order_type ?? "KOREA");
      setCustomerName(order.customer_name ?? "");
      setGift(order.gift ?? "no");
      setDate(order.date ?? moscowTodayYmd());
      setProgress(order.progress ?? "PAY");
      setLines(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((order.order_items ?? []) as any[]).map((item) => ({
          id: crypto.randomUUID(),
          product_type: item.product_type ?? "Cosmetic",
          product_name: item.product_name ?? "",
          product_option: item.product_option ?? "",
          product_set_type: item.product_set_type ?? "Single",
          quantity: String(item.quantity ?? 1),
          price_rub: String(item.price_rub ?? ""),
          prepayment_rub: String(item.prepayment_rub ?? 0),
        })),
      );
      setEditMode(true);
      setEditOrderNum(on);
      setFormError(null);
      setFormSuccess(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [supabase],
  );

  // ── submit: INSERT new order ─────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!orderNum.trim()) {
      setFormError("주문번호를 입력하세요.");
      return;
    }
    if (lines.length < 1) {
      setFormError("상품을 최소 1개 이상 추가하세요.");
      return;
    }
    const lineErr = validateLines(lines);
    if (lineErr) {
      setFormError(lineErr);
      return;
    }

    startTransition(async () => {
      const { error: orderErr } = await supabase.from("orders").insert({
        order_num: orderNum.trim(),
        platform,
        order_type: orderType,
        date,
        progress,
        customer_name: customerName.trim() || null,
        gift: gift === "ask" ? "ask" : "no",
        photo_sent: "Not sent",
        purchase_channel: null,
      });
      if (orderErr) {
        setFormError(orderErr.message);
        return;
      }

      const rows = linesToInsertRows(lines, orderNum.trim());
      const { error: itemsErr } = await supabase.from("order_items").insert(rows);
      if (itemsErr) {
        await supabase.from("orders").delete().eq("order_num", orderNum.trim());
        setFormError(itemsErr.message);
        return;
      }

      setFormSuccess(`주문 ${orderNum.trim()} 저장 완료!`);
      resetForm();
      void fetchRecentOrders();
    });
  };

  // ── submit: UPDATE existing order ────────────────────────────────────────────

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const lineErr = validateLines(lines);
    if (lineErr) {
      setFormError(lineErr);
      return;
    }

    startTransition(async () => {
      const { error: orderErr } = await supabase
        .from("orders")
        .update({
          order_type: orderType,
          date,
          customer_name: customerName.trim() || null,
          gift: gift === "ask" ? "ask" : "no",
          progress,
          platform: detectPlatform(editOrderNum),
        })
        .eq("order_num", editOrderNum);
      if (orderErr) {
        setFormError(orderErr.message);
        return;
      }

      const { error: delErr } = await supabase
        .from("order_items")
        .delete()
        .eq("order_num", editOrderNum);
      if (delErr) {
        setFormError(delErr.message);
        return;
      }

      const rows = linesToInsertRows(lines, editOrderNum);
      const { error: itemsErr } = await supabase.from("order_items").insert(rows);
      if (itemsErr) {
        setFormError(itemsErr.message);
        return;
      }

      setFormSuccess(`주문 ${editOrderNum} 수정 완료!`);
      resetForm();
      void fetchRecentOrders();
    });
  };

  // ── styles ───────────────────────────────────────────────────────────────────

  const th =
    "whitespace-nowrap border-b-2 border-r border-b-gray-300 border-r-gray-200 bg-gray-50 px-2 py-2 text-left text-xs font-semibold text-zinc-600 dark:border-b-zinc-600 dark:border-r-zinc-700 dark:bg-zinc-900 dark:text-zinc-400";
  const thLast =
    "whitespace-nowrap border-b-2 border-b-gray-300 bg-gray-50 px-2 py-2 text-center text-xs font-semibold text-zinc-600 dark:border-b-zinc-600 dark:bg-zinc-900 dark:text-zinc-400";
  const td = "border-b border-r border-b-gray-100 border-r-gray-100 px-2 py-1.5 align-middle dark:border-b-zinc-800 dark:border-r-zinc-800";
  const tdLast = "border-b border-b-gray-100 px-2 py-1.5 align-middle text-center dark:border-b-zinc-800";
  const cellInput = `${inputClass} !py-1.5 text-sm`;
  const cellSelect = `${selectClass} !py-1.5 text-sm`;
  const compactInput =
    "w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm outline-none ring-emerald-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
  const compactSelect = compactInput;

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── 추가 이력 슬라이드 패널 ── */}
      {historyOpen && (
        <div className="fixed inset-0 z-[105] flex justify-end bg-black/30" role="presentation">
          <button
            type="button"
            className="h-full flex-1 cursor-default"
            aria-label="닫기"
            onClick={() => setHistoryOpen(false)}
          />
          <div className="flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">추가 이력</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void fetchRecentOrders()}
                  disabled={recentLoading}
                  className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                >
                  {recentLoading ? "로딩…" : "새로고침"}
                </button>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => setHistoryOpen(false)}
                >
                  닫기
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {recentLoading && recentOrders.length === 0 ? (
                <p className="p-6 text-center text-sm text-zinc-400">불러오는 중…</p>
              ) : recentOrders.length === 0 ? (
                <p className="p-6 text-center text-sm text-zinc-400">최근 주문이 없습니다.</p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {recentOrders.map((order) => {
                    const products = order.order_items
                      .map((it) => (it.product_option ? stripLastParens(it.product_name) : it.product_name))
                      .join(", ");
                    const totalRub = order.order_items.reduce((acc, it) => acc + (it.price_rub ?? 0), 0);
                    const isEditing = editMode && editOrderNum === order.order_num;

                    return (
                      <li
                        key={order.order_num}
                        className={`flex flex-col gap-1 px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${isEditing ? "bg-sky-50 dark:bg-sky-950/30" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void loadOrder(order.order_num);
                              setHistoryOpen(false);
                            }}
                            className="font-mono text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                          >
                            {order.order_num}
                          </button>
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${progressBadgeClass(order.progress)}`}
                            >
                              {order.progress}
                            </span>
                            <span className="text-xs text-zinc-400">불러오기 →</span>
                          </div>
                        </div>
                        <div className="flex items-baseline gap-2 text-xs text-zinc-500">
                          <span>{order.date?.slice(0, 10) ?? "—"}</span>
                          {order.customer_name && (
                            <>
                              <span>·</span>
                              <span className="font-medium text-zinc-700 dark:text-zinc-300">{order.customer_name}</span>
                            </>
                          )}
                          <span>·</span>
                          <span className="tabular-nums text-zinc-600 dark:text-zinc-300">
                            {totalRub > 0 ? `${totalRub.toLocaleString("ko-KR")} ₽` : "—"}
                          </span>
                        </div>
                        {products && (
                          <p className="truncate text-xs text-zinc-400 dark:text-zinc-500" title={products}>
                            {products}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 추가 이력 고정 버튼 ── */}
      <button
        type="button"
        className="fixed bottom-6 right-6 z-50 rounded-full bg-gray-800 px-4 py-2 text-xs font-semibold text-white shadow-lg hover:bg-gray-700 dark:bg-zinc-700 dark:hover:bg-zinc-600"
        onClick={() => setHistoryOpen(true)}
      >
        추가 이력 {recentOrders.length > 0 ? `(${recentOrders.length})` : ""}
      </button>

      {/* ── 주문 입력 폼 ── */}
      <form
        onSubmit={editMode ? handleUpdate : handleSubmit}
        className="flex flex-col gap-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        {/* 제목 */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
            {editMode ? `주문 수정 · ${editOrderNum}` : "새 주문"}
          </h2>
          {editMode && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              ✕ 취소
            </button>
          )}
        </div>

        {/* ── 상단 주문 정보 3열 그리드 ── */}
        <div className="grid grid-cols-3 gap-x-4 gap-y-3">
          {/* 1행: 주문번호 | 주문일 | 고객명 */}

          {/* 주문번호 */}
          <div className="flex flex-col gap-1">
            <label htmlFor="order_num" className={labelClass}>
              주문번호 *
            </label>
            <input
              id="order_num"
              name="order_num"
              required={!editMode}
              disabled={editMode}
              className={`${compactInput} ${editMode ? "opacity-60" : ""}`}
              placeholder="예: 0212345"
              autoComplete="off"
              value={orderNum}
              onChange={(e) => handleOrderNumChange(e.target.value)}
            />
            <span className="text-xs text-gray-400">
              {platform}{"  "}(01=avito · 02=telegram · 03=vk)
            </span>
          </div>

          {/* 주문일 */}
          <div className="flex flex-col gap-1">
            <label htmlFor="date" className={labelClass}>
              주문일 *
            </label>
            <input
              id="date"
              name="date"
              type="date"
              required
              className={compactInput}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* 고객명 */}
          <div className="flex flex-col gap-1">
            <label htmlFor="customer_name" className={labelClass}>고객명</label>
            <input
              id="customer_name"
              name="customer_name"
              className={compactInput}
              autoComplete="off"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>

          {/* 2행: 진행상태 | 선물여부 | 주문경로 */}

          {/* 진행상태 */}
          <div className="flex flex-col gap-1">
            <label htmlFor="progress" className={labelClass}>진행상태 *</label>
            <select
              id="progress"
              name="progress"
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

          {/* 선물 여부 */}
          <div className="flex flex-col gap-1">
            <label htmlFor="gift" className={labelClass}>선물 여부</label>
            <select
              id="gift"
              name="gift"
              className={compactSelect}
              value={gift}
              onChange={(e) => setGift(e.target.value)}
            >
              <option value="no">no</option>
              <option value="ask">ask</option>
            </select>
          </div>

          {/* 주문 경로 */}
          <div className="flex flex-col gap-1">
            <label htmlFor="order_type" className={labelClass}>주문 경로 *</label>
            <select
              id="order_type"
              name="order_type"
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
        </div>

        {/* ── 상품 테이블 ── */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">상품</h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table
              className="min-w-[820px] border-collapse text-left text-sm"
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
                        onChange={(e) => handleProductNameChange(line.id, e.target.value)}
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
          {pending ? "저장 중…" : editMode ? "수정 저장" : "주문 저장"}
        </button>
      </form>
    </>
  );
}
