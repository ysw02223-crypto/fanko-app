export const PLATFORMS = ["avito", "telegram", "vk"] as const;
export const ORDER_ROUTES = ["KOREA", "RUSSIA"] as const;
export const PRODUCT_CATEGORIES = [
  "Cosmetic",
  "Clothes",
  "Toy",
  "ETC",
] as const;
export const SET_TYPES = ["Single", "SET"] as const;
export const ORDER_PROGRESS = [
  "PAY",
  "BUY IN KOREA",
  "ARRIVE KOR",
  "IN DELIVERY",
  "ARRIVE RUS",
  "RU DELIVERY",
  "DONE",
  "WAIT CUSTOMER",
  "PROBLEM",
  "CANCEL",
] as const;
export const PHOTO_STATUS = ["Not sent", "Sent 1", "Sent 2"] as const;

export type Platform = (typeof PLATFORMS)[number];
export type OrderRoute = (typeof ORDER_ROUTES)[number];
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export type SetType = (typeof SET_TYPES)[number];
export type OrderProgress = (typeof ORDER_PROGRESS)[number];
export type PhotoStatus = (typeof PHOTO_STATUS)[number];

export type OrderRow = {
  order_num: string;
  platform: Platform;
  order_type: OrderRoute;
  date: string;
  progress: OrderProgress;
  customer_name: string | null;
  gift: string;
  photo_sent: PhotoStatus;
  purchase_channel: string | null;
  created_at: string;
  updated_at: string;
  // 배송 데이터 (엑셀 import)
  shipping_fee: number | null;
  applied_weight: number | null;
  tracking_number: string | null;
};

export type OrderItemRow = {
  id: string;
  order_num: string;
  product_type: ProductCategory | null;
  product_name: string;
  product_option: string | null;
  product_set_type: SetType;
  quantity: number;
  price_rub: string;
  prepayment_rub: string;
  extra_payment_rub: string;
  krw: string | null;
  progress: string | null;
  gift: string | null;
  photo_sent: string | null;
};

// ─── Finance Types ────────────────────────────────────────────────

export type FinKrTransaction = {
  id: string;
  date: string;
  type: "income" | "expense";
  category: string;
  subcategory: string | null;
  detail: string | null;
  description: string;
  amount: number;
  payment_method: string | null;
  selling_price: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type FinRuTransaction = {
  id: string;
  date: string;
  type: "income" | "expense";
  category: string;
  subcategory: string | null;
  description: string;
  amount_rub: number;
  exchange_rate: number | null;
  amount_krw: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type FinExchangeRecord = {
  id: string;
  date: string;
  description: string;
  rub_amount: number;
  exchange_rate: number;
  krw_amount: number;
  book_rate: number | null;
  fx_profit: number | null;
  note: string | null;
  created_at: string;
};

// ─── 수입 기록 ────────────────────────────────────────────────
export const INCOME_CATEGORIES_CONST = [
  "러시아판매",
  "도매",
  "국내판매",
  "기타",
] as const;
export type IncomeCategoryType = (typeof INCOME_CATEGORIES_CONST)[number];

export type FinIncomeRecord = {
  id: string;
  date: string;
  category: IncomeCategoryType;
  sub_category: string | null;
  product_name: string;
  product_type: string | null;
  sale_currency: "KRW" | "RUB";
  sale_amount: number;
  sale_rate: number | null;
  sale_krw: number | null;
  purchase_currency: "KRW" | "RUB";
  purchase_amount: number;
  purchase_rate: number | null;
  purchase_krw: number | null;
  profit_krw: number | null;
  source: "order" | "manual";
  order_item_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

// ─── 지출 기록 ────────────────────────────────────────────────
export type FinExpenseRecord = {
  id: string;
  date: string;
  major_category: string;
  mid_category: string | null;
  minor_category: string | null;
  description: string;
  currency: "KRW" | "RUB";
  amount: number;
  rate: number | null;
  amount_krw: number | null;
  memo: string | null;
  source: "order" | "manual";
  order_num: string | null;
  created_at: string;
  updated_at: string;
};

export const FIN_ACCOUNTS = [
  "toss",
  "kookmin",
  "olive_coupon",
  "culture_coupon",
  "sber",
  "tinkoff",
  "receivable",
] as const;
export type FinAccount = (typeof FIN_ACCOUNTS)[number];

export type FinAccountSnapshot = {
  id: string;
  year_month: string;
  account: FinAccount;
  balance: number;
  currency: "KRW" | "RUB";
  created_at: string;
};
