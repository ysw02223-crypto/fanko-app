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
