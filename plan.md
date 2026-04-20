# 수식 입력줄(Formula Bar) — 데스크탑 상단 고정 + 모바일 키보드 위 고정

> **참고 UI**: 구글 시트 / 안드로이드 스프레드시트 앱의 수식 입력줄(Formula Bar)  
> **목표 ①**: 셀을 클릭하면 선택한 셀의 내용이 그리드 **위에** 수식 입력줄로 표시됨  
> **목표 ②**: 모바일에서는 같은 입력줄이 **키보드 바로 위에** 고정 표시됨  
> **목표 ③**: 입력줄에서 수정 후 ✓ 또는 Enter → Supabase 저장

---

## 1. 접근방식

### 1-1. 구현 목표 UI

```
[데스크탑]
┌──────────────────────────────────────────────────────┐
│  통계 카드 4개                                        │  ← #crm-subheader-portal
├──────────────────────────────────────────────────────┤
│  필터 드롭다운들  [초기화]  [배송 import]  [검색]     │
├──────────────────────────────────────────────────────┤
│  fx │ 상품명  │  Laneige Neo Cushion The Matte set …  │ [✗] [✓]  │  ← FormulaBar (44px)
├──────────────────────────────────────────────────────┤
│  AG Grid (나머지 높이 100%)                           │
└──────────────────────────────────────────────────────┘

[모바일 — 키보드 닫힌 상태]
┌─────────────────────────────┐
│  통계 + 필터바 (portal)      │
├─────────────────────────────┤
│  AG Grid                    │
├─────────────────────────────┤
│  fx │ 상품명 │ Laneige …  [✗][✓]  │  ← FormulaBar fixed bottom
└─────────────────────────────┘

[모바일 — 키보드 열린 상태]
┌─────────────────────────────┐
│  AG Grid (일부 가려짐)       │
├─────────────────────────────┤
│  fx │ 상품명 │ Laneige …  [✗][✓]  │  ← bottom = keyboardHeight
├─────────────────────────────┤
│  가상 키보드                 │
└─────────────────────────────┘
```

### 1-2. 핵심 메커니즘

```
[셀 클릭 (탭)]
    ↓
AG Grid onCellFocused 이벤트 발생
    ↓
gridRef.api.getDisplayedRowAtIndex(rowIndex) 로 rowData 조회
    ↓
focusedCell 상태 업데이트 { field, fieldLabel, currentValue, rowData }
    ↓
FormulaBar에 값 표시 + input 준비
    ↓
[사용자가 입력줄에서 수정]
    ↓
✓ 클릭 or Enter → saveFieldChange(field, rowData, oldVal, newVal) → Supabase 저장
✗ 클릭 or Escape → 원래 값으로 복원
```

### 1-3. AG Grid 인라인 편집 처리

FormulaBar가 유일한 편집 인터페이스이므로 그리드 내 직접 편집을 비활성화:

```ts
// AgGridReact props
suppressClickEdit={true}       // 클릭으로 인라인 편집 시작 억제
// 각 ColDef에서 cellEditorPopup 제거 (불필요)
```

`editable: true` 는 유지 (AG Grid가 셀을 편집 가능 여부 판별에 사용).

### 1-4. 데스크탑 레이아웃 — flex column

현재 `<main className="min-h-0 flex-1 overflow-hidden">` 안에 `OrdersAgGrid`가 렌더링됨.  
컴포넌트 최상위에 flex column 래퍼를 추가해 FormulaBar + 그리드를 수직 배치:

```tsx
// OrdersAgGrid return
<div className="flex h-full flex-col">
  {/* 데스크탑 FormulaBar (lg 이상) */}
  <FormulaBar ... className="hidden lg:flex shrink-0" />

  {/* AG Grid — 나머지 높이 채움 */}
  <div className="min-h-0 flex-1">
    <AgGridReact ... style={{ height: "100%" }} />
  </div>
</div>
```

### 1-5. 모바일 레이아웃 — position fixed + visualViewport

모바일에서는 FormulaBar를 `document.body`에 portal로 렌더링:

```tsx
// FormulaBar 내부
const keyboardHeight = useKeyboardHeight(); // 기존 훅 재사용

if (isMobile) {
  return createPortal(
    <div style={{ position: "fixed", bottom: keyboardHeight, left: 0, right: 0 }}>
      {barContent}
    </div>,
    document.body,
  );
}
// 데스크탑: 일반 div 반환
return <div>{barContent}</div>;
```

---

## 2. 코드 스니펫

### 2-1. `components/formula-bar.tsx` (신규 — CellEditSheet 대체)

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

export type FocusedCell = {
  field: keyof OrderGridRow;
  fieldLabel: string;
  currentValue: string | number | null;
  rowData: OrderGridRow;
};

type Props = {
  cell: FocusedCell | null;
  isMobile: boolean;
  onSave: (field: keyof OrderGridRow, rowData: OrderGridRow, newValue: string | number | null) => void;
  onCancel: () => void;
};

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

export function FormulaBar({ cell, isMobile, onSave, onCancel }: Props) {
  const keyboardHeight = useKeyboardHeight();
  const [value, setValue] = useState("");
  const [dirty, setDirty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 셀 변경 시 값 초기화
  useEffect(() => {
    setValue(cell?.currentValue != null ? String(cell.currentValue) : "");
    setDirty(false);
  }, [cell]);

  if (!cell) {
    // 셀 미선택: 빈 bar 표시 (데스크탑) / 숨김 (모바일)
    const emptyBar = (
      <div className="flex h-11 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 dark:border-zinc-700 dark:bg-zinc-900">
        <span className="select-none font-mono text-xs font-bold text-zinc-400">fx</span>
        <span className="text-sm text-zinc-400">셀을 선택하세요</span>
      </div>
    );
    if (isMobile) return null;
    return emptyBar;
  }

  const options  = SELECT_OPTIONS[cell.field];
  const isNumber = NUMBER_FIELDS.has(cell.field);

  const handleConfirm = () => {
    if (!dirty) { onCancel(); return; }
    const parsed: string | number | null = isNumber
      ? (value === "" ? null : Number(value))
      : (value || null);
    onSave(cell.field, cell.rowData, parsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter")  handleConfirm();
    if (e.key === "Escape") { setValue(String(cell.currentValue ?? "")); setDirty(false); onCancel(); }
  };

  const bar = (
    <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-zinc-300 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900">
      {/* fx 아이콘 + 필드명 */}
      <span className="select-none font-mono text-xs font-bold text-emerald-500">fx</span>
      <span className="min-w-[60px] shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        {cell.fieldLabel}
      </span>

      {/* 구분선 */}
      <div className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-600" />

      {/* 입력 필드 */}
      {options ? (
        <select
          value={value}
          onChange={(e) => { setValue(e.target.value); setDirty(true); }}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-800 focus:outline-none dark:text-zinc-100"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt || "（없음）"}</option>
          ))}
        </select>
      ) : (
        <input
          ref={inputRef}
          type={isNumber ? "number" : "text"}
          inputMode={isNumber ? "numeric" : "text"}
          value={value}
          onChange={(e) => { setValue(e.target.value); setDirty(true); }}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-800 focus:outline-none dark:text-zinc-100"
        />
      )}

      {/* 취소 버튼 */}
      <button
        type="button"
        onClick={() => { setValue(String(cell.currentValue ?? "")); setDirty(false); onCancel(); }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
      >
        ✕
      </button>

      {/* 확인 버튼 */}
      <button
        type="button"
        onClick={handleConfirm}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-lg transition ${
          dirty
            ? "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            : "text-zinc-300 dark:text-zinc-600"
        }`}
      >
        ✓
      </button>
    </div>
  );

  // 모바일: portal로 fixed bottom
  if (isMobile && typeof document !== "undefined") {
    return createPortal(
      <div
        className="z-[300] border-t border-zinc-300 shadow-lg dark:border-zinc-700"
        style={{ position: "fixed", bottom: keyboardHeight, left: 0, right: 0, background: "white" }}
      >
        {bar}
      </div>,
      document.body,
    );
  }

  // 데스크탑: 일반 흐름 (flex column 안에서 shrink-0)
  return bar;
}
```

### 2-2. `orders-ag-grid-table.tsx` 수정 부분

#### ① import 변경
```tsx
// 제거
import { CellEditSheet, type EditingCell } from "@/components/cell-edit-sheet";
import type { CellClickedEvent } from "ag-grid-community";

// 추가
import { FormulaBar, type FocusedCell } from "@/components/formula-bar";
import type { CellFocusedEvent } from "ag-grid-community";
```

#### ② gridRef 추가
```tsx
const gridRef = useRef<AgGridReact<OrderGridRow>>(null);
```

#### ③ 상태 변경
```tsx
// 제거
const [isMobile, ...]
const [editingCell, ...]

// 추가
const [isMobile, setIsMobile] = useState(false);       // 유지
const [focusedCell, setFocusedCell] = useState<FocusedCell | null>(null);
```

#### ④ onCellFocused 핸들러 (onCellClicked 대체)
```tsx
const handleCellFocused = useCallback(
  (event: CellFocusedEvent) => {
    const { rowIndex, column } = event;
    if (rowIndex === null || rowIndex === undefined || !column) {
      setFocusedCell(null);
      return;
    }
    const api = gridRef.current?.api;
    if (!api) return;

    const colId = column.getColId();
    const colDef = api.getColumnDef(colId);
    const rowNode = api.getDisplayedRowAtIndex(rowIndex);

    if (!colDef || colDef.editable !== true || !rowNode?.data) {
      setFocusedCell(null);
      return;
    }

    const field = colId as keyof OrderGridRow;
    setFocusedCell({
      field,
      fieldLabel: colDef.headerName ?? colId,
      currentValue: rowNode.data[field] as string | number | null,
      rowData: rowNode.data,
    });
  },
  [],
);
```

#### ⑤ handleSheetSave → handleFormulaSave (이름만 변경, 로직 동일)
```tsx
const handleFormulaSave = useCallback(
  (field: keyof OrderGridRow, rowData: OrderGridRow, newValue: string | number | null) => {
    void saveFieldChange(field, rowData, rowData[field] as string | number | null, newValue, () => {});
    setFocusedCell(null);
  },
  [saveFieldChange],
);
```

#### ⑥ AgGridReact props 수정
```tsx
<AgGridReact
  ref={gridRef}
  ...
  onCellFocused={handleCellFocused}
  suppressClickEdit={true}        // 인라인 편집 비활성화 (FormulaBar가 유일한 편집 UI)
  // onCellClicked 제거
  // onCellValueChanged 유지 (혹시 다른 방식으로 편집이 발생할 경우 대비)
/>
```

#### ⑦ 렌더링 — FormulaBar를 그리드 위에 배치
```tsx
// CellEditSheet 제거, FormulaBar로 교체
return (
  <>
    {/* Toast, 이력 패널, 이력 버튼 — 기존 유지 */}
    {/* Portal: 통계 카드 + 필터바 — 기존 유지 */}

    {/* FormulaBar + 그리드를 flex column으로 묶기 */}
    <div className="flex h-full flex-col">
      {/* 데스크탑: FormulaBar를 그리드 위에 표시 */}
      {!isMobile && (
        <FormulaBar
          cell={focusedCell}
          isMobile={false}
          onSave={handleFormulaSave}
          onCancel={() => setFocusedCell(null)}
        />
      )}

      {/* AG Grid */}
      <div className="min-h-0 flex-1">
        <AgGridReact ... style={{ height: "100%" }} />
      </div>
    </div>

    {/* 모바일: FormulaBar fixed bottom (portal 방식) */}
    {isMobile && (
      <FormulaBar
        cell={focusedCell}
        isMobile={true}
        onSave={handleFormulaSave}
        onCancel={() => setFocusedCell(null)}
      />
    )}
  </>
);
```

#### ⑧ buildColDefs — cellEditorPopup 제거
```tsx
// 모든 컬럼에서 제거:
// cellEditorPopup: true,
// cellEditorPopupPosition: "over",
// (AG Grid 인라인 에디터를 사용하지 않으므로 불필요)
```

### 2-3. `app/globals.css` — .ag-popup-editor 스타일 제거 (불필요)

---

## 3. 파일 경로

### 신규 파일

| 파일 | 용도 |
|------|------|
| `components/formula-bar.tsx` | 수식 입력줄 컴포넌트 (데스크탑 인라인 / 모바일 fixed bottom) |

### 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `components/orders-ag-grid-table.tsx` | gridRef 추가, onCellFocused, FormulaBar 렌더링, suppressClickEdit, cellEditorPopup 제거 |
| `app/globals.css` | .ag-popup-editor 스타일 제거 |

### 삭제 파일

| 파일 | 이유 |
|------|------|
| `components/cell-edit-sheet.tsx` | FormulaBar로 완전 대체 |

### 유지 파일

| 파일 | 이유 |
|------|------|
| `hooks/use-keyboard-height.ts` | FormulaBar 내부에서 재사용 |
| `lib/orders-ag-grid-types.ts` | 타입 무변경 |
| `lib/schema.ts` | 상수 무변경 |
| `components/crm-shell.tsx` | 레이아웃 무변경 |

---

## 4. 트레이드오프 상세설명

### 4-1. FormulaBar 배치 방식 비교

| | **flex column (채택)** | #crm-subheader-portal 안에 배치 |
|---|---|---|
| 구현 방식 | `<main>` 안에서 flex column | portal로 filter bar 아래에 렌더링 |
| 높이 계산 | flex 자동 (AG Grid가 나머지 차지) | 수동 계산 필요 |
| 다른 페이지 영향 | 없음 (OrdersAgGrid 내부) | 모든 페이지에 formula bar 표시 위험 |
| 구현 복잡도 | 낮음 | 중간 |

### 4-2. onCellFocused vs onCellClicked

| | **onCellFocused (채택)** | onCellClicked |
|---|---|---|
| 발생 시점 | 키보드 탐색(화살표), Tab, 클릭 모두 | 마우스/터치 클릭만 |
| rowData 접근 | gridRef.api.getDisplayedRowAtIndex() 필요 | event.data로 직접 접근 |
| 스프레드시트 UX | 일치 (구글 시트와 동일 동작) | 불일치 |

`onCellFocused`는 이벤트에 rowData가 없어 `gridRef.api`로 별도 조회가 필요하지만, 키보드 탐색까지 지원하는 진짜 스프레드시트 UX를 제공.

### 4-3. suppressClickEdit: true 전환의 영향

`cellEditorPopup` 기반 편집을 제거하고 FormulaBar로 일원화:

| 영향 | 내용 |
|------|------|
| undoRedoCellEditing | FormulaBar 저장은 AG Grid undo 스택 밖 — 단, `saveFieldChange`의 DB 저장·이력 기록은 유지 |
| 편집 진입점 | 클릭 → focus → FormulaBar 하나로 통일 (모든 기기 동일 UX) |
| select 필드 | FormulaBar의 `<select>`로 처리 (네이티브 picker 활용) |

### 4-4. 모바일에서 focusedCell 클리어 타이밍

`onCellFocused`는 사용자가 FormulaBar input을 클릭할 때도 AG Grid 셀 focus가 해제되어 발생할 수 있음.  
해결: FormulaBar가 focus를 받을 때(input.onFocus) setFocusedCell을 클리어하지 않도록, `onCellFocused`에서 `FloatingElement`(FormulaBar) 안을 클릭한 경우 무시:

```ts
// relatedTarget이 FormulaBar 안이면 focusedCell 유지
const handleCellFocused = (event: CellFocusedEvent) => {
  // rowIndex === null = 그리드 외부 클릭 → FormulaBar 유지
  if (event.rowIndex === null) return;
  // ... 나머지 로직
};
```

AG Grid의 `onCellFocused`에서 `rowIndex === null`은 그리드 외부 클릭 시 발생하므로 이 경우 focusedCell을 초기화하지 않으면 됨.

### 4-5. 기존 CellEditSheet·cellEditorPopup 제거의 영향

이전 구현(CellEditSheet + cellEditorPopup)은 FormulaBar로 완전 대체됨:
- `CellEditSheet` 파일 삭제
- `orders-ag-grid-table.tsx`에서 관련 import·state·handler 제거
- `globals.css`에서 `.ag-popup-editor` 스타일 제거
- `cell-edit-sheet.tsx`가 삭제되어도 `hooks/use-keyboard-height.ts`는 FormulaBar에서 재사용

---

## 5. 구현 순서

```
Phase 1 — FormulaBar 컴포넌트 (0.5일)
  [x] components/formula-bar.tsx 생성
  [x] 데스크탑 모드: 인라인 bar UI (fx 아이콘 + 필드명 + input + ✗/✓)
  [x] 모바일 모드: portal fixed bottom + useKeyboardHeight
  [x] typecheck 통과 확인

Phase 2 — orders-ag-grid-table.tsx 교체 (1일)
  [x] CellEditSheet import/state/handler 제거
  [x] FormulaBar import + focusedCell 상태 추가
  [x] gridRef 추가 (useRef<AgGridReact<OrderGridRow>>)
  [x] onCellFocused 핸들러 구현
  [x] handleFormulaSave 추가
  [x] suppressClickEdit={true} 설정
  [x] buildColDefs: cellEditorPopup 관련 prop 전체 제거
  [x] return JSX: flex column 구조 + FormulaBar 배치
  [x] typecheck 통과 확인

Phase 3 — 정리 (0.25일)
  [x] components/cell-edit-sheet.tsx 삭제
  [x] globals.css: .ag-popup-editor 스타일 제거
  [x] typecheck + build 통과 확인
```
