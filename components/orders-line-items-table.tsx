"use client";

import { createClient } from "@/lib/supabase/client";
import {
  flattenOrders,
  replaceOrderSegment,
  type FlatOrderItemRow,
  type OrderWithNestedItems,
} from "@/lib/orders-line-items-flatten";
import {
  ORDER_PROGRESS,
  PHOTO_STATUS,
  PRODUCT_CATEGORIES,
  SET_TYPES,
  type OrderItemRow,
} from "@/lib/schema";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const ORDER_SELECT = `
  *,
  order_items (
    id,
    product_type,
    product_name,
    product_option,
    product_set_type,
    quantity,
    price_rub,
    prepayment_rub,
    extra_payment_rub,
    krw
  )
`;

type OrderEditableField = "progress" | "customer_name" | "gift" | "photo_sent" | "purchase_channel";
type ItemEditableField =
  | "product_type"
  | "product_name"
  | "product_option"
  | "product_set_type"
  | "quantity"
  | "price_rub"
  | "prepayment_rub"
  | "krw";

type EditTarget =
  | { kind: "order"; orderNum: string; field: OrderEditableField }
  | { kind: "item"; itemId: string; orderNum: string; field: ItemEditableField };

function progressBadgeClass(p: string) {
  const map: Record<string, string> = {
    PAY: "bg-slate-200 text-slate-900 dark:bg-slate-600 dark:text-slate-50",
    "BUY IN KOREA": "bg-amber-200 text-amber-950 dark:bg-amber-900/60 dark:text-amber-50",
    "ARRIVE KOR": "bg-orange-200 text-orange-950 dark:bg-orange-900/50 dark:text-orange-50",
    "IN DELIVERY": "bg-sky-200 text-sky-950 dark:bg-sky-900/50 dark:text-sky-50",
    "ARRIVE RUS": "bg-cyan-200 text-cyan-950 dark:bg-cyan-900/50 dark:text-cyan-50",
    "RU DELIVERY": "bg-blue-200 text-blue-950 dark:bg-blue-900/50 dark:text-blue-50",
    DONE: "bg-emerald-200 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-50",
    "WAIT CUSTOMER": "bg-violet-200 text-violet-950 dark:bg-violet-900/50 dark:text-violet-50",
    PROBLEM: "bg-red-200 text-red-950 dark:bg-red-900/50 dark:text-red-50",
    CANCEL: "bg-zinc-300 text-zinc-800 dark:bg-zinc-600 dark:text-zinc-100",
  };
  return map[p] ?? "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200";
}

function fmtRub(n: string | number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function fmtKrw(n: string | number | null | undefined) {
  if (n === null || n === undefined || n === "") return "—";
  return Number(n).toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

function computedExtra(item: OrderItemRow | null) {
  if (!item) return 0;
  return Number(item.price_rub) - Number(item.prepayment_rub);
}

const thClass =
  "sticky top-0 z-20 whitespace-nowrap border-b border-zinc-200 bg-zinc-50 px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400";
const tdBase = "border-b border-zinc-200/80 px-2 py-1.5 align-middle text-sm dark:border-zinc-700/80";
const cellBtn =
  "w-full cursor-pointer rounded px-1 py-0.5 text-left transition hover:bg-black/5 dark:hover:bg-white/10";
const editingBg = "bg-sky-100 dark:bg-sky-950/50";

function groupRowClass(groupIdx: number) {
  return groupIdx % 2 === 0
    ? "bg-white dark:bg-zinc-950"
    : "bg-zinc-100/90 dark:bg-zinc-900/70";
}

export function OrdersLineItemsTable({ initialOrders }: { initialOrders: OrderWithNestedItems[] }) {
  const [flatRows, setFlatRows] = useState<FlatOrderItemRow[]>(() => flattenOrders(initialOrders));
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    setFlatRows(flattenOrders(initialOrders));
  }, [initialOrders]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!editing) return;
    const id = requestAnimationFrame(() => {
      const f = editing.field;
      if (
        f === "customer_name" ||
        f === "purchase_channel" ||
        f === "product_name" ||
        f === "product_option" ||
        f === "quantity" ||
        f === "price_rub" ||
        f === "prepayment_rub" ||
        f === "krw"
      ) {
        inputRef.current?.focus();
        inputRef.current?.select?.();
      } else {
        selectRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [editing]);

  const showError = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  const commitOrder = useCallback(
    async (orderNum: string, field: OrderEditableField, raw: string) => {
      if (savingRef.current) return;
      savingRef.current = true;
      try {
        let payload: Record<string, unknown> = {};
        if (field === "progress") {
          if (!(ORDER_PROGRESS as readonly string[]).includes(raw)) {
            showError("진행 상태가 올바르지 않습니다.");
            setEditing(null);
            return;
          }
          payload = { progress: raw };
        } else if (field === "customer_name") {
          payload = { customer_name: raw.trim() === "" ? null : raw.trim() };
        } else if (field === "gift") {
          payload = { gift: raw === "ask" ? "ask" : "no" };
        } else if (field === "photo_sent") {
          if (!(PHOTO_STATUS as readonly string[]).includes(raw)) {
            showError("사진 발송 상태가 올바르지 않습니다.");
            setEditing(null);
            return;
          }
          payload = { photo_sent: raw };
        } else if (field === "purchase_channel") {
          payload = { purchase_channel: raw.trim() === "" ? null : raw.trim() };
        }

        const supabase = createClient();
        const { data, error } = await supabase
          .from("orders")
          .update(payload)
          .eq("order_num", orderNum)
          .select(ORDER_SELECT)
          .single();

        if (error) {
          showError(error.message);
          setEditing(null);
          return;
        }

        setFlatRows((prev) => replaceOrderSegment(prev, orderNum, data as OrderWithNestedItems));
        setEditing(null);
      } finally {
        savingRef.current = false;
      }
    },
    [showError],
  );

  const commitItem = useCallback(
    async (itemId: string, orderNum: string, field: ItemEditableField, raw: string, current: OrderItemRow) => {
      if (savingRef.current) return;
      savingRef.current = true;
      try {
        const price = Number(current.price_rub);
        const prep = Number(current.prepayment_rub);
        let updates: Record<string, unknown> = {};

        if (field === "product_type") {
          if (raw !== "" && !(PRODUCT_CATEGORIES as readonly string[]).includes(raw)) {
            showError("카테고리가 올바르지 않습니다.");
            setEditing(null);
            return;
          }
          updates.product_type = raw === "" ? null : raw;
        } else if (field === "product_name") {
          updates.product_name = raw.trim();
          if (!updates.product_name) {
            showError("상품명은 비울 수 없습니다.");
            setEditing(null);
            return;
          }
        } else if (field === "product_option") {
          updates.product_option = raw.trim() === "" ? null : raw.trim();
        } else if (field === "product_set_type") {
          if (!(SET_TYPES as readonly string[]).includes(raw)) {
            showError("단품/세트 값이 올바르지 않습니다.");
            setEditing(null);
            return;
          }
          updates.product_set_type = raw;
        } else if (field === "quantity") {
          const q = Math.floor(Number(raw));
          if (!Number.isFinite(q) || q < 1) {
            showError("수량은 1 이상이어야 합니다.");
            setEditing(null);
            return;
          }
          updates.quantity = q;
        } else if (field === "price_rub") {
          const pr = Number(raw);
          if (!Number.isFinite(pr)) {
            showError("판매가를 확인하세요.");
            setEditing(null);
            return;
          }
          updates.price_rub = pr;
          updates.extra_payment_rub = pr - prep;
        } else if (field === "prepayment_rub") {
          const p = Number(raw);
          if (!Number.isFinite(p)) {
            showError("선결제를 확인하세요.");
            setEditing(null);
            return;
          }
          updates.prepayment_rub = p;
          updates.extra_payment_rub = price - p;
        } else if (field === "krw") {
          const t = raw.trim();
          updates.krw = t === "" ? null : Math.round(Number(t));
          if (updates.krw !== null && !Number.isFinite(updates.krw as number)) {
            showError("원화매입을 확인하세요.");
            setEditing(null);
            return;
          }
        }

        const supabase = createClient();
        const { error } = await supabase.from("order_items").update(updates).eq("id", itemId);

        if (error) {
          showError(error.message);
          setEditing(null);
          return;
        }

        const { data: orderFresh, error: orderErr } = await supabase
          .from("orders")
          .select(ORDER_SELECT)
          .eq("order_num", orderNum)
          .single();

        if (orderErr || !orderFresh) {
          showError(orderErr?.message ?? "주문을 다시 불러오지 못했습니다.");
          setEditing(null);
          return;
        }

        setFlatRows((prev) => replaceOrderSegment(prev, orderNum, orderFresh as OrderWithNestedItems));
        setEditing(null);
      } finally {
        savingRef.current = false;
      }
    },
    [showError],
  );

  const startEdit = (target: EditTarget, current: string) => {
    setEditing(target);
    setDraft(current);
  };

  const cancelEdit = () => setEditing(null);

  const isEditingOrder = (orderNum: string, field: OrderEditableField) =>
    editing?.kind === "order" && editing.orderNum === orderNum && editing.field === field;

  const isEditingItem = (itemId: string, field: ItemEditableField) =>
    editing?.kind === "item" && editing.itemId === itemId && editing.field === field;

  const lineCount = flatRows.length;
  const orderCount = new Set(flatRows.map((r) => r.order.order_num)).size;

  return (
    <>
      {toast ? (
        <div
          className="fixed bottom-4 right-4 z-[100] max-w-md rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg"
          role="alert"
        >
          {toast}
        </div>
      ) : null}

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        주문 {orderCount}건 · 표시 행 {lineCount}줄 (상품 단위)
      </p>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-max min-w-full border-collapse text-left text-sm">
          <thead className="text-left">
            <tr>
              <th className={`${thClass} min-w-[84px]`}>주문번호</th>
              <th className={`${thClass} min-w-[72px]`}>플랫폼</th>
              <th className={`${thClass} min-w-[64px]`}>경로</th>
              <th className={`${thClass} min-w-[88px]`}>일자</th>
              <th className={`${thClass} min-w-[112px]`}>진행</th>
              <th className={`${thClass} min-w-[120px]`}>고객</th>
              <th className={`${thClass} min-w-[52px]`}>선물</th>
              <th className={`${thClass} min-w-[80px]`}>사진</th>
              <th className={`${thClass} min-w-[88px]`}>거래처</th>
              <th className={`${thClass} min-w-[88px]`}>카테고리</th>
              <th className={`${thClass} min-w-[160px]`}>상품명</th>
              <th className={`${thClass} min-w-[120px]`}>옵션</th>
              <th className={`${thClass} min-w-[72px]`}>단품/세트</th>
              <th className={`${thClass} min-w-[48px] text-right`}>수량</th>
              <th className={`${thClass} min-w-[80px] text-right`}>판매가₽</th>
              <th className={`${thClass} min-w-[72px] text-right`}>선결제₽</th>
              <th className={`${thClass} min-w-[72px] text-right`}>잔금₽</th>
              <th className={`${thClass} min-w-[72px] text-right`}>원화매입</th>
            </tr>
          </thead>
          <tbody>
            {flatRows.map((row, idx) => {
              const { order, item, isFirstInOrder, groupColorIndex } = row;
              const g = groupRowClass(groupColorIndex);
              const on = order.order_num;

              return (
                <tr key={item ? `${on}-${item.id}` : `${on}-empty-${idx}`} className={g}>
                  <td className={`${tdBase} font-mono font-medium`}>
                    {isFirstInOrder ? (
                      <Link
                        href={`/orders/${encodeURIComponent(on)}`}
                        className="text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        {on}
                      </Link>
                    ) : null}
                  </td>
                  <td className={tdBase}>{isFirstInOrder ? order.platform : null}</td>
                  <td className={tdBase}>{isFirstInOrder ? order.order_type : null}</td>
                  <td className={`${tdBase} whitespace-nowrap`}>
                    {isFirstInOrder ? order.date?.slice(0, 10) : null}
                  </td>

                  <td className={`${tdBase} ${isEditingOrder(on, "progress") ? editingBg : ""}`}>
                    {isFirstInOrder ? (
                      isEditingOrder(on, "progress") ? (
                        <select
                          ref={selectRef}
                          className="w-full min-w-[7rem] rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                          value={draft}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraft(v);
                            void commitOrder(on, "progress", v);
                          }}
                          onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
                        >
                          {ORDER_PROGRESS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          type="button"
                          className={cellBtn}
                          onClick={() => startEdit({ kind: "order", orderNum: on, field: "progress" }, order.progress)}
                        >
                          <span
                            className={`inline-flex max-w-[180px] truncate rounded-full px-2 py-0.5 text-xs font-medium ${progressBadgeClass(order.progress)}`}
                          >
                            {order.progress}
                          </span>
                        </button>
                      )
                    ) : null}
                  </td>

                  <td className={`${tdBase} max-w-[140px] ${isEditingOrder(on, "customer_name") ? editingBg : ""}`}>
                    {isFirstInOrder ? (
                      isEditingOrder(on, "customer_name") ? (
                        <input
                          ref={inputRef}
                          className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => {
                            if (isEditingOrder(on, "customer_name")) void commitOrder(on, "customer_name", draft);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className={`${cellBtn} truncate`}
                          title={order.customer_name ?? ""}
                          onClick={() =>
                            startEdit(
                              { kind: "order", orderNum: on, field: "customer_name" },
                              order.customer_name ?? "",
                            )
                          }
                        >
                          {order.customer_name ?? "—"}
                        </button>
                      )
                    ) : null}
                  </td>

                  <td className={`${tdBase} ${isEditingOrder(on, "gift") ? editingBg : ""}`}>
                    {isFirstInOrder ? (
                      isEditingOrder(on, "gift") ? (
                        <select
                          ref={selectRef}
                          className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                          value={draft}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraft(v);
                            void commitOrder(on, "gift", v);
                          }}
                          onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
                        >
                          <option value="no">no</option>
                          <option value="ask">ask</option>
                        </select>
                      ) : (
                        <button
                          type="button"
                          className={cellBtn}
                          onClick={() =>
                            startEdit(
                              { kind: "order", orderNum: on, field: "gift" },
                              order.gift === "ask" ? "ask" : "no",
                            )
                          }
                        >
                          {order.gift === "ask" ? "ask" : "no"}
                        </button>
                      )
                    ) : null}
                  </td>

                  <td className={`${tdBase} ${isEditingOrder(on, "photo_sent") ? editingBg : ""}`}>
                    {isFirstInOrder ? (
                      isEditingOrder(on, "photo_sent") ? (
                        <select
                          ref={selectRef}
                          className="w-full min-w-[6rem] rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                          value={draft}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraft(v);
                            void commitOrder(on, "photo_sent", v);
                          }}
                          onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
                        >
                          {PHOTO_STATUS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          type="button"
                          className={`${cellBtn} truncate`}
                          onClick={() =>
                            startEdit({ kind: "order", orderNum: on, field: "photo_sent" }, order.photo_sent)
                          }
                        >
                          {order.photo_sent}
                        </button>
                      )
                    ) : null}
                  </td>

                  <td className={`${tdBase} max-w-[100px] ${isEditingOrder(on, "purchase_channel") ? editingBg : ""}`}>
                    {isFirstInOrder ? (
                      isEditingOrder(on, "purchase_channel") ? (
                        <input
                          ref={inputRef}
                          className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => {
                            if (isEditingOrder(on, "purchase_channel"))
                              void commitOrder(on, "purchase_channel", draft);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className={`${cellBtn} truncate`}
                          title={order.purchase_channel ?? ""}
                          onClick={() =>
                            startEdit(
                              { kind: "order", orderNum: on, field: "purchase_channel" },
                              order.purchase_channel ?? "",
                            )
                          }
                        >
                          {order.purchase_channel ?? "—"}
                        </button>
                      )
                    ) : null}
                  </td>

                  {!item ? (
                    <>
                      <td colSpan={9} className={`${tdBase} text-zinc-400`}>
                        등록된 상품이 없습니다.
                      </td>
                    </>
                  ) : (
                    <>
                      <ItemCells
                        item={item}
                        orderNum={on}
                        groupClass={g}
                        editing={editing}
                        draft={draft}
                        setDraft={setDraft}
                        startEdit={startEdit}
                        cancelEdit={cancelEdit}
                        commitItem={commitItem}
                        isEditingItem={isEditingItem}
                        inputRef={inputRef}
                        selectRef={selectRef}
                      />
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ItemCells({
  item,
  orderNum,
  groupClass,
  editing,
  draft,
  setDraft,
  startEdit,
  cancelEdit,
  commitItem,
  isEditingItem,
  inputRef,
  selectRef,
}: {
  item: OrderItemRow;
  orderNum: string;
  groupClass: string;
  editing: EditTarget | null;
  draft: string;
  setDraft: (s: string) => void;
  startEdit: (t: EditTarget, cur: string) => void;
  cancelEdit: () => void;
  commitItem: (
    id: string,
    on: string,
    f: ItemEditableField,
    raw: string,
    cur: OrderItemRow,
  ) => Promise<void>;
  isEditingItem: (id: string, f: ItemEditableField) => boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  selectRef: React.RefObject<HTMLSelectElement | null>;
}) {
  const id = item.id;
  const td = `${tdBase} ${groupClass}`;

  return (
    <>
      <td className={`${td} ${isEditingItem(id, "product_type") ? editingBg : ""}`}>
        {isEditingItem(id, "product_type") ? (
          <select
            ref={selectRef}
            className="w-full min-w-[5rem] rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              setDraft(v);
              void commitItem(id, orderNum, "product_type", v, item);
            }}
            onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
          >
            <option value="">—</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            className={cellBtn}
            onClick={() =>
              startEdit({ kind: "item", itemId: id, orderNum, field: "product_type" }, item.product_type ?? "")
            }
          >
            {item.product_type ?? "—"}
          </button>
        )}
      </td>

      <td className={`${td} max-w-[200px] ${isEditingItem(id, "product_name") ? editingBg : ""}`}>
        {isEditingItem(id, "product_name") ? (
          <input
            ref={inputRef}
            className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (isEditingItem(id, "product_name")) void commitItem(id, orderNum, "product_name", draft, item);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") cancelEdit();
            }}
          />
        ) : (
          <button type="button" className={`${cellBtn} line-clamp-2`} onClick={() => startEdit({ kind: "item", itemId: id, orderNum, field: "product_name" }, item.product_name)}>
            {item.product_name}
          </button>
        )}
      </td>

      <td className={`${td} max-w-[140px] ${isEditingItem(id, "product_option") ? editingBg : ""}`}>
        {isEditingItem(id, "product_option") ? (
          <input
            ref={inputRef}
            className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (isEditingItem(id, "product_option")) void commitItem(id, orderNum, "product_option", draft, item);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") cancelEdit();
            }}
          />
        ) : (
          <button
            type="button"
            className={`${cellBtn} truncate`}
            onClick={() =>
              startEdit({ kind: "item", itemId: id, orderNum, field: "product_option" }, item.product_option ?? "")
            }
          >
            {item.product_option ?? "—"}
          </button>
        )}
      </td>

      <td className={`${td} ${isEditingItem(id, "product_set_type") ? editingBg : ""}`}>
        {isEditingItem(id, "product_set_type") ? (
          <select
            ref={selectRef}
            className="w-full rounded border border-sky-400 bg-white px-1 py-0.5 text-xs dark:border-sky-600 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              setDraft(v);
              void commitItem(id, orderNum, "product_set_type", v, item);
            }}
            onKeyDown={(e) => e.key === "Escape" && cancelEdit()}
          >
            {SET_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            className={cellBtn}
            onClick={() =>
              startEdit({ kind: "item", itemId: id, orderNum, field: "product_set_type" }, item.product_set_type)
            }
          >
            {item.product_set_type}
          </button>
        )}
      </td>

      <td className={`${td} text-right tabular-nums ${isEditingItem(id, "quantity") ? editingBg : ""}`}>
        {isEditingItem(id, "quantity") ? (
          <input
            ref={inputRef}
            type="number"
            min={1}
            className="w-14 rounded border border-sky-400 bg-white px-1 py-0.5 text-right text-xs dark:border-sky-600 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (isEditingItem(id, "quantity")) void commitItem(id, orderNum, "quantity", draft, item);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") cancelEdit();
            }}
          />
        ) : (
          <button type="button" className={`${cellBtn} text-right`} onClick={() => startEdit({ kind: "item", itemId: id, orderNum, field: "quantity" }, String(item.quantity))}>
            {item.quantity}
          </button>
        )}
      </td>

      <td className={`${td} text-right tabular-nums ${isEditingItem(id, "price_rub") ? editingBg : ""}`}>
        {isEditingItem(id, "price_rub") ? (
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            className="w-20 rounded border border-sky-400 bg-white px-1 py-0.5 text-right text-xs dark:border-sky-600 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (isEditingItem(id, "price_rub")) void commitItem(id, orderNum, "price_rub", draft, item);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") cancelEdit();
            }}
          />
        ) : (
          <button type="button" className={`${cellBtn} text-right`} onClick={() => startEdit({ kind: "item", itemId: id, orderNum, field: "price_rub" }, String(item.price_rub))}>
            {fmtRub(item.price_rub)}
          </button>
        )}
      </td>

      <td className={`${td} text-right tabular-nums ${isEditingItem(id, "prepayment_rub") ? editingBg : ""}`}>
        {isEditingItem(id, "prepayment_rub") ? (
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            className="w-20 rounded border border-sky-400 bg-white px-1 py-0.5 text-right text-xs dark:border-sky-600 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (isEditingItem(id, "prepayment_rub")) void commitItem(id, orderNum, "prepayment_rub", draft, item);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") cancelEdit();
            }}
          />
        ) : (
          <button
            type="button"
            className={`${cellBtn} text-right`}
            onClick={() => startEdit({ kind: "item", itemId: id, orderNum, field: "prepayment_rub" }, String(item.prepayment_rub))}
          >
            {fmtRub(item.prepayment_rub)}
          </button>
        )}
      </td>

      <td className={`${td} text-right tabular-nums text-zinc-700 dark:text-zinc-300`}>{fmtRub(computedExtra(item))}</td>

      <td className={`${td} text-right tabular-nums ${isEditingItem(id, "krw") ? editingBg : ""}`}>
        {isEditingItem(id, "krw") ? (
          <input
            ref={inputRef}
            type="number"
            step={1}
            className="w-20 rounded border border-sky-400 bg-white px-1 py-0.5 text-right text-xs dark:border-sky-600 dark:bg-zinc-950"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (isEditingItem(id, "krw")) void commitItem(id, orderNum, "krw", draft, item);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") cancelEdit();
            }}
          />
        ) : (
          <button type="button" className={`${cellBtn} text-right`} onClick={() => startEdit({ kind: "item", itemId: id, orderNum, field: "krw" }, item.krw != null ? String(item.krw) : "")}>
            {fmtKrw(item.krw)}
          </button>
        )}
      </td>
    </>
  );
}

export type { OrderWithNestedItems };
