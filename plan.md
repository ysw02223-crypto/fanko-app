# 셀 편집 UX 개선 — 데스크탑 팝업 에디터 + 모바일 키보드 위 시트

> **목표 ①**: 데스크탑에서 셀 클릭 시 셀 위에 넓고 긴 팝업 편집 UI 표시  
> **목표 ②**: 모바일·태블릿에서 셀 클릭 시 가상 키보드 바로 위에 바텀시트 에디터 표시  
> **목표 ③**: 기존 Supabase 저장 · 이력 기록 · undo/redo 로직 100% 재사용

---

## 1. 접근방식

### 1-1. 2-모드 에디터 전략

| 환경 | 메커니즘 | 트리거 |
|------|----------|--------|
| 데스크탑 (≥ 1024px) | AG Grid `cellEditorPopup: true` | 셀 더블클릭 or 타이핑 시작 |
| 모바일·태블릿 (< 1024px) | `CellEditSheet` (React Portal) | `onCellClicked` 인터셉터 |

```
[셀 클릭]
    ↓
[isMobile? (window.innerWidth < 1024)]
  ├── No  → AG Grid 기본 편집 진입
  │         cellEditorPopup: true → 셀 위 넓은 팝업 표시
  │         onCellValueChanged → Supabase 저장 (기존 로직 유지)
  └── Yes → AG Grid 편집 억제 (suppressClickEdit)
            editingCell 상태 저장 { field, currentValue, rowData }
            CellEditSheet 렌더링 (position: fixed, bottom = keyboardHeight)
            저장 클릭 → handleSheetSave → 기존 handleCellValueChanged 재사용
```

### 1-2. 데스크탑: AG Grid Popup Editor

`buildColDefs()` 안의 모든 editable 컬럼에 두 개 prop 추가:

```ts
cellEditorPopup: true,
cellEditorPopupPosition: "over",   // 셀 위(위쪽)에 팝업 표시
```

AG Grid는 팝업을 그리드 컨테이너 내부에 absolute 위치로 렌더링. 기본 너비가 컬럼 너비를 따르므로 `app/globals.css`에서 `.ag-popup-editor` 최소 너비를 280px로 강제 확장.

### 1-3. 모바일: CellEditSheet + visualViewport

```
┌────────────────────────────────────────┐  window.innerHeight
│  그리드 (dimmed)                        │
│  ...                                   │
├────────────────────────────────────────┤  ← visualViewport 하단
│  [필드명]                        [✕]   │
│  현재: 1500 ₽                          │  CellEditSheet
│  ┌──────────────────────────────────┐  │  position: fixed
│  │  입력 or 셀렉트                  │  │  bottom: keyboardHeight
│  └──────────────────────────────────┘  │
│  [취소]                      [저장]    │
├────────────────────────────────────────┤
│  가상 키보드 (keyboardHeight px)        │
└────────────────────────────────────────┘
```

`window.visualViewport` resize 이벤트로 키보드 높이를 실시간 감지:
```ts
keyboardHeight = Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop)
```

select 필드(진행상태, 플랫폼 등)는 네이티브 `<select>` 사용 → iOS 기본 picker UI 활용, 키보드 없이 동작.  
text/number 필드는 `<input>` focus 시 키보드 올라옴 → visualViewport resize 이벤트 감지.

### 1-4. handleCellValueChanged 재사용

모바일 저장 시 기존 `handleCellValueChanged`에 synthetic event를 전달해 Supabase 저장·이력·toast 로직을 완전히 재사용:

```ts
// 공통 saveFieldChange 함수로 추출
async function saveFieldChange(
  field: keyof OrderGridRow,
  rowData: OrderGridRow,
  oldValue: OrderGridRow[typeof field],
  newValue: OrderGridRow[typeof field],
  revertFn: () => void,
) { ... }
// Desktop onCellValueChanged → saveFieldChange 호출
// Mobile handleSheetSave   → saveFieldChange 호출
```

기존 `handleCellValueChanged` 내부 로직을 독립 함수로 추출하여 양쪽에서 호출. `event.node.setDataValue` rollback은 `revertFn` 콜백으로 추상화.

---

## 2. 코드 스니펫

### 2-1. `hooks/use-keyboard-height.ts` (신규)

```ts
"use client";

import { useEffect, useState } from "react";

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const kbHeight = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop,
      );
      setHeight(kbHeight);
    };

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return height;
}
```

### 2-2. `components/cell-edit-sheet.tsx` (신규)

```tsx
"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useKeyboardHeight } from "@/hooks/use-keyboard-height";
import {
  ORDER_PROGRESS, PLATFORMS, ORDER_ROUTES,
  PRODUCT_CATEGORIES, SET_TYPES, PHOTO_STATUS,
} from "@/lib/schema";
import type { OrderGridRow } from "@/lib/orders-ag-grid-types";

// ── 공개 타입 (orders-ag-grid-table.tsx에서도 import) ─────────────────────
export type EditingCell = {
  field: keyof OrderGridRow;
  fieldLabel: string;
  currentValue: string | number | null;
  rowData: OrderGridRow;
};

type Props = {
  cell: EditingCell | null;
  onSave: (
    field: keyof OrderGridRow,
    rowData: OrderGridRow,
    newValue: string | number | null,
  ) => void;
  onClose: () => void;
};

// ── select 필드 → 선택지 매핑 ────────────────────────────────────────────
const SELECT_OPTIONS: Partial<Record<keyof OrderGridRow, readonly string[]>> = {
  item_progress:    ORDER_PROGRESS,
  platform:         PLATFORMS,
  order_type:       ORDER_ROUTES,
  product_type:     ["", ...PRODUCT_CATEGORIES],
  product_set_type: SET_TYPES,
  item_gift:        ["no", "ask"],
  order_gift:       ["no", "ask"],
  item_photo_sent:  PHOTO_STATUS,
  order_photo_sent: PHOTO_STATUS,
};

const NUMBER_FIELDS = new Set<keyof OrderGridRow>([
  "quantity", "price_rub", "krw", "prepayment_rub",
]);

export function CellEditSheet({ cell, onSave, onClose }: Props) {
  const keyboardHeight = useKeyboardHeight();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cell) return;
    setValue(cell.currentValue != null ? String(cell.currentValue) : "");
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [cell]);

  if (!cell || typeof document === "undefined") return null;

  const options  = SELECT_OPTIONS[cell.field];
  const isNumber = NUMBER_FIELDS.has(cell.field);

  const handleSave = () => {
    const parsed: string | number | null = isNumber
      ? (value === "" ? null : Number(value))
      : value || null;
    onSave(cell.field, cell.rowData, parsed);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[300]"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30" />

      <div
        className="absolute left-0 right-0 rounded-t-2xl bg-white px-4 pb-6 pt-3 shadow-2xl dark:bg-zinc-900"
        style={{ bottom: keyboardHeight }}
      >
        {/* 드래그 핸들 */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700" />

        {/* 헤더 */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {cell.fieldLabel}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        {/* 현재값 */}
        <p className="mb-2 text-xs text-zinc-400">
          현재: <span className="font-medium text-zinc-600 dark:text-zinc-300">{cell.currentValue ?? "—"}</span>
        </p>

        {/* 입력 UI */}
        {options ? (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            {options.map((opt) => (
              <option key={opt} value={opt}>{opt || "（없음）"}</option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef}
            type={isNumber ? "number" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")  handleSave();
              if (e.key === "Escape") onClose();
            }}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            inputMode={isNumber ? "numeric" : "text"}
          />
        )}

        {/* 버튼 */}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            저장
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

### 2-3. `orders-ag-grid-table.tsx` 수정 부분

#### ① import 추가
```tsx
import { CellEditSheet, type EditingCell } from "@/components/cell-edit-sheet";
import type { CellClickedEvent } from "ag-grid-community";
```

#### ② isMobile 상태
```tsx
const [isMobile, setIsMobile] = useState(false);
useEffect(() => {
  const check = () => setIsMobile(window.innerWidth < 1024);
  check();
  window.addEventListener("resize", check);
  return () => window.removeEventListener("resize", check);
}, []);
```

#### ③ editingCell 상태
```tsx
const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
```

#### ④ handleCellValueChanged → saveFieldChange 리팩토링

기존 `handleCellValueChanged` 내부 로직을 아래 독립 함수로 추출:

```tsx
const saveFieldChange = useCallback(
  async (
    field: keyof OrderGridRow,
    row: OrderGridRow,
    oldVal: unknown,
    newVal: unknown,
    revertFn: () => void,
  ) => {
    const oldStr = String(oldVal ?? "");
    const newStr = String(newVal ?? "");
    if (oldStr === newStr) return;

    try {
      if (ORDER_FIELDS.has(field)) {
        const dbCol = ORDER_DB_COL[field] ?? (field as string);
        const { error } = await supabase
          .from("orders")
          .update({ [dbCol]: newStr || null })
          .eq("order_num", row.order_num);
        if (error) throw new Error(error.message);
        setAllRows((prev) =>
          prev.map((r) =>
            r.order_num === row.order_num ? { ...r, [field]: newStr || null } : r,
          ),
        );
      } else if (row.item_id) {
        const dbCol = ITEM_DB_COL[field] ?? (field as string);
        const basePayload: Record<string, string | number | null> = {
          [dbCol]: newStr || null,
        };
        if (field === "price_rub" || field === "prepayment_rub") {
          const newNum = Number(newStr);
          const price  = field === "price_rub"    ? newNum : row.price_rub;
          const prepay = field === "prepayment_rub" ? newNum : row.prepayment_rub;
          basePayload["extra_payment_rub"] = price - prepay;
        }
        if (["quantity", "price_rub", "prepayment_rub", "krw"].includes(field as string)) {
          basePayload[dbCol] = newStr === "" ? null : Number(newStr);
        }
        const { error } = await supabase
          .from("order_items")
          .update(basePayload)
          .eq("id", row.item_id)
          .eq("order_num", row.order_num);
        if (error) throw new Error(error.message);
        setAllRows((prev) =>
          prev.map((r) => {
            if (r.item_id !== row.item_id) return r;
            const updated = { ...r, [field]: newVal };
            if ("extra_payment_rub" in basePayload) {
              updated.extra_payment_rub = basePayload["extra_payment_rub"] as number;
            }
            return updated;
          }),
        );
      }

      await insertOrderHistoryAction({
        order_num: row.order_num,
        field: field as string,
        old_value: oldStr,
        new_value: newStr,
        changed_by: "수동변경",
      });
      setHistory((prev) => [
        { id: `${Date.now()}-${Math.random()}`, at: Date.now(), orderNum: row.order_num,
          field: field as string, oldDisplay: oldStr || "（비어 있음）", newDisplay: newStr || "（비어 있음）" },
        ...prev.slice(0, 29),
      ]);
      setToastType("success");
      setToast("저장했습니다.");
    } catch (err) {
      revertFn();
      setToastType("error");
      setToast(err instanceof Error ? err.message : "저장 실패");
    }
  },
  [supabase],
);

// 기존 handleCellValueChanged는 saveFieldChange를 래핑
const handleCellValueChanged = useCallback(
  (event: CellValueChangedEvent<OrderGridRow>) => {
    const field = event.colDef.field as keyof OrderGridRow | undefined;
    if (!field) return;
    void saveFieldChange(
      field,
      event.data,
      event.oldValue,
      event.newValue,
      () => event.node.setDataValue(field as string, event.oldValue),
    );
  },
  [saveFieldChange],
);

// 모바일 시트 저장
const handleSheetSave = useCallback(
  (field: keyof OrderGridRow, rowData: OrderGridRow, newValue: string | number | null) => {
    void saveFieldChange(field, rowData, rowData[field], newValue, () => {});
  },
  [saveFieldChange],
);
```

#### ⑤ onCellClicked (모바일 인터셉터)
```tsx
const handleCellClicked = useCallback(
  (event: CellClickedEvent<OrderGridRow>) => {
    if (!isMobile) return;
    const field = event.colDef.field as keyof OrderGridRow | undefined;
    const editable = typeof event.colDef.editable === "boolean"
      ? event.colDef.editable
      : event.colDef.editable?.(event as Parameters<typeof event.colDef.editable>[0]);
    if (!field || !editable || !event.data) return;
    event.api.stopEditing(true);
    setEditingCell({
      field,
      fieldLabel: event.colDef.headerName ?? (field as string),
      currentValue: event.data[field] as string | number | null,
      rowData: event.data,
    });
  },
  [isMobile],
);
```

#### ⑥ buildColDefs — cellEditorPopup 추가 (text/number 컬럼)
```tsx
// 텍스트 컬럼 예시 (product_name, product_option, customer_name, purchase_channel)
{
  field: "product_name",
  headerName: "상품명",
  width: 200,
  editable: true,
  cellEditor: "agTextCellEditor",
  cellEditorPopup: true,
  cellEditorPopupPosition: "over",
},

// 숫자 컬럼 예시 (price_rub, krw, prepayment_rub, quantity)
{
  field: "price_rub",
  headerName: "판매가₽",
  width: 105,
  editable: true,
  cellEditor: "agNumberCellEditor",
  cellEditorParams: { min: 0 },
  cellEditorPopup: true,
  cellEditorPopupPosition: "over",
  valueFormatter: rubFormatter,
},
```

#### ⑦ AgGridReact props 수정
```tsx
<AgGridReact<OrderGridRow>
  ...
  suppressClickEdit={isMobile}
  onCellClicked={handleCellClicked}
  onCellValueChanged={handleCellValueChanged}
/>
```

#### ⑧ CellEditSheet 렌더링 (return 안에 추가)
```tsx
<CellEditSheet
  cell={editingCell}
  onSave={handleSheetSave}
  onClose={() => setEditingCell(null)}
/>
```

### 2-4. `app/globals.css` 추가 (데스크탑 팝업 스타일)

```css
/* AG Grid 팝업 에디터 스타일 — 데스크탑 전용 */
@media (min-width: 1024px) {
  .ag-popup-editor {
    min-width: 280px !important;
    border-radius: 10px !important;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.14) !important;
    border: 1px solid #e4e4e7 !important;
    overflow: hidden;
  }
  .ag-popup-editor input,
  .ag-popup-editor select {
    font-size: 14px;
    padding: 8px 12px;
    min-height: 40px;
  }
}
```

---

## 3. 파일 경로

### 신규 파일

| 파일 | 용도 |
|------|------|
| `hooks/use-keyboard-height.ts` | visualViewport 기반 가상 키보드 높이 훅 |
| `components/cell-edit-sheet.tsx` | 모바일 바텀시트 에디터 컴포넌트 |

### 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `components/orders-ag-grid-table.tsx` | saveFieldChange 추출, isMobile 감지, onCellClicked, suppressClickEdit, cellEditorPopup, CellEditSheet 렌더링 |
| `app/globals.css` | `.ag-popup-editor` 팝업 스타일 (데스크탑) |

### 유지 파일 (변경 없음)

| 파일 | 이유 |
|------|------|
| `lib/orders-ag-grid-types.ts` | 타입 무변경 |
| `lib/schema.ts` | 상수 무변경 |
| `lib/actions/order-history.ts` | saveFieldChange에서 그대로 호출 |
| `components/crm-shell.tsx` | 셀 에디터와 무관 |

---

## 4. 트레이드오프 상세설명

### 4-1. 데스크탑: AG Grid cellEditorPopup vs 완전 커스텀 에디터

| | **AG Grid cellEditorPopup (채택)** | ICellEditorComp 완전 커스텀 |
|---|---|---|
| 구현 복잡도 | prop 2개 추가 | ICellEditorComp 인터페이스 구현 필요 |
| undo/redo | undoRedoCellEditing과 자동 연동 | 별도 스택 관리 필요 |
| 위치 제어 | over/under 2가지 | 완전 자유 위치 |
| 기존 onCellValueChanged | 그대로 사용 | 별도 저장 흐름 필요 |
| 팝업 크기 | CSS로만 제어 가능 | JSX로 완전 제어 |

결론: 기존 코드 변경 최소화 + undo/redo 유지를 위해 cellEditorPopup 채택.  
팝업 크기·스타일은 `.ag-popup-editor` CSS 오버라이드로 충분히 제어 가능.

### 4-2. 모바일: visualViewport vs resize 이벤트

**visualViewport API** (채택):
- `vv.height` = 키보드를 제외한 실제 가시 영역 높이
- iOS Safari, Chrome 61+ 지원 (글로벌 99%+)
- `scroll` 이벤트도 필요 — iOS에서 키보드 오픈 시 viewport가 scroll되는 경우 있음

**window.resize fallback**:
- `window.innerHeight` 변화로 키보드 감지 시도
- iOS Safari에서 `innerHeight`가 키보드 오픈 시 변하지 않는 경우 있음 → 신뢰 불가

```ts
// visualViewport 미지원 시 fallback: bottom: 0 (키보드에 가려질 수 있음)
const keyboardHeight = vv ? Math.max(0, ...) : 0;
```

### 4-3. suppressClickEdit + onCellClicked 조합 주의점

`suppressClickEdit: true`는 그리드 전체에 적용. `isMobile`이 false로 바뀌어도 즉시 반영되지 않을 수 있음 (React state 비동기 특성).

해결: `isMobile` 계산 시 debounce 적용:
```ts
const timeoutId = setTimeout(check, 200);
return () => clearTimeout(timeoutId);
```

또한 `suppressClickEdit`이 true일 때 데스크탑에서 실수로 `isMobile = true`가 되면 편집이 막힘. 리사이즈 이벤트 + 초기값 정확성 중요.

### 4-4. saveFieldChange 추출 트레이드오프

**현재 구조**: `handleCellValueChanged` 안에 Supabase 업데이트 + 이력 + toast 로직이 인라인

**리팩토링 후**: `saveFieldChange(field, row, oldVal, newVal, revertFn)` 독립 함수

| | Before | After |
|---|---|---|
| 코드 중복 | 모바일 저장 시 복붙 필요 | 0 |
| 타입 안전성 | CellValueChangedEvent 의존 | 순수 인자만 의존 |
| 테스트 용이성 | AG Grid 이벤트 mock 필요 | 인자만으로 단위 테스트 가능 |
| rollback 처리 | event.node.setDataValue 직접 | revertFn 콜백으로 추상화 |

모바일 시트에서는 rollback이 불필요(AG Grid 셀이 아님)하므로 `revertFn: () => {}`로 전달.

### 4-5. 모바일 select vs 커스텀 드롭다운

**네이티브 `<select>` (채택)**:
- iOS: 드럼 롤 picker UI, 키보드 없이 동작 → visualViewport 변화 없음 → `bottom: 0` 고정
- Android: 팝업 다이얼로그 UI
- 접근성(a11y) 자동 지원
- 추가 구현 없음

**커스텀 드롭다운**:
- 일관된 디자인 가능
- 키보드 탐색 직접 구현 필요
- AG Grid SELECT_OPTIONS와 별도 스타일 관리

현재 CRM 도구 특성상 빠른 입력이 중요 → 네이티브 select가 모바일 UX에서 더 효율적.

---

## 5. 구현 순서

```
Phase 1 — 기반 훅 + 컴포넌트 (0.5일)
  [x] hooks/use-keyboard-height.ts 생성
  [x] components/cell-edit-sheet.tsx 생성
  [x] typecheck 통과 확인

Phase 2 — AG Grid 통합 (1일)
  [x] orders-ag-grid-table.tsx: handleCellValueChanged → saveFieldChange 리팩토링
  [x] isMobile 감지 + editingCell 상태 추가
  [x] onCellClicked 인터셉터 추가
  [x] suppressClickEdit={isMobile} 추가
  [x] buildColDefs: 모든 editable 컬럼에 cellEditorPopup 추가
  [x] CellEditSheet 렌더링 추가
  [x] typecheck 통과 확인

Phase 3 — 스타일 (0.25일)
  [x] app/globals.css: .ag-popup-editor 스타일 추가
  [x] typecheck 통과 확인

Phase 4 — 검증 (0.25일)
  [ ] 데스크탑: text/number 셀 클릭 → 팝업 표시 확인
  [ ] 데스크탑: select 셀 클릭 → AG Grid select 팝업 표시 확인
  [ ] 모바일: 셀 클릭 → 바텀시트 표시 + 키보드 오픈 후 위치 확인
  [ ] 모바일: 저장 → Supabase 반영 + toast 확인
```
