# 주문목록 날짜 컬럼 재배치

## 목표

주문목록 테이블에 날짜 컬럼이 두 개 있음:
- **위치 2** (`# 옆, sticky`): 읽기전용 `MM/DD` 표시 (lines ~1702–1711)
- **위치 10** (`사진↔플랫폼 사이, non-sticky`): 인라인 편집 가능한 `YYYY-MM-DD` 셀 (lines ~1934–1967)

→ 위치 2(읽기전용) 제거, 위치 10(편집가능)을 위치 2 sticky 자리로 이동.
결과: 날짜 컬럼 1개, `#` 바로 옆에 인라인 편집 가능.

---

## 분석 결과

| 위치 | 역할 | 처리 |
|------|------|------|
| col 2 (46px, sticky) | 읽기전용 `MM/DD` 표시 | **제거** |
| col 10 (100px, non-sticky) | 편집 가능 날짜 | **제거 후 위치 2에 sticky로 배치** |

### sticky 오프셋 변경

| 컬럼 | 현재 `left` | 변경 후 `left` | 이유 |
|------|------------|--------------|------|
| date (새 위치 2) | — | `32px` | # 32px 이후 |
| order_num | `78px` (32+46) | `122px` (32+90) | 날짜 col 90px으로 확장 |
| product_name | `168px` (32+46+90) | `212px` (32+90+90) | 동일 이유 |

### 컬럼 수 변화

| 항목 | 현재 | 변경 후 |
|------|------|--------|
| colgroup col 수 | 23개 | 22개 |
| table minWidth | 2208px | 2152px (−100 + 44) |
| colSpan (빈 상태) | 22 | 21 |

---

## 접근방식

`components/orders-line-items-table.tsx` **한 파일만 수정**.
변경 지점 총 5곳 (colgroup, thead×2, tbody 내 td×2).

---

## 코드 스니펫

### 1. colgroup (line ~1622)

```tsx
// BEFORE: 23 cols
<col style={{ width: "32px" }} />   {/* # */}
<col style={{ width: "46px" }} />   {/* 읽기전용 날짜 ← 제거 */}
<col style={{ width: "90px" }} />   {/* order_num */}
...
{/* col 9 (88px, photo) 다음: */}
<col style={{ width: "100px" }} />  {/* 편집날짜 ← 제거 */}
<col style={{ width: "72px" }} />   {/* platform */}

// AFTER: 22 cols
<col style={{ width: "32px" }} />   {/* # */}
<col style={{ width: "90px" }} />   {/* 날짜 (편집 가능, 46→90px 확장) */}
<col style={{ width: "90px" }} />   {/* order_num */}
...
{/* col 9 (88px, photo) 다음: */}
{/* date col 삭제됨 */}
<col style={{ width: "72px" }} />   {/* platform */}
```

### 2. thead (두 군데: visible ~line 1488, sr-only ~line 1647)

```tsx
// BEFORE
<th sticky left-[32px]>{t.col_date}</th>     {/* 위치 2, sticky */}
<th sticky left-[78px]>{t.col_order_num}</th>
<th sticky left-[168px]>{t.col_product_name}</th>
...
<th>{t.col_photo}</th>
<th>{t.col_date}</th>     {/* 위치 10, non-sticky ← 제거 */}
<th>{t.col_platform}</th>

// AFTER
<th sticky left-[32px]>{t.col_date}</th>     {/* 위치 2, sticky (유지) */}
<th sticky left-[122px]>{t.col_order_num}</th>   {/* 78→122 */}
<th sticky left-[212px]>{t.col_product_name}</th> {/* 168→212 */}
...
<th>{t.col_photo}</th>
{/* col_date th 제거됨 */}
<th>{t.col_platform}</th>
```

### 3. tbody td — 위치 2: 읽기전용 date td 제거 후 editable td로 교체

```tsx
// BEFORE: 위치 2에 읽기전용 td (제거)
<td className={`${tdBase} sticky z-10 ... ${dateBgClass(...)}`}
    style={{ left: "32px", width: "46px", minWidth: "46px" }}>
  {order.date ? `${MM}/${DD}` : "—"}
</td>

// AFTER: 위치 2에 편집 가능 td (기존 위치 10 td를 이동, sticky 추가)
<td className={`${tdBase} sticky z-10 whitespace-nowrap ${isEditingOrder(rowKey, "date") ? editingBg : whiteBg}`}
    style={{ left: "32px", width: "90px", minWidth: "90px" }}>
  {/* 기존 편집 가능 date td 내용 그대로 */}
  {isEditingOrder(rowKey, "date") ? (
    <input type="date" ... />
  ) : (
    <button onClick={() => startEdit(...)}>{order.date?.slice(0, 10) ?? "—"}</button>
  )}
</td>
```

### 4. tbody td — 위치 10: 기존 편집 날짜 td 제거 (위치 2로 이동했으므로)

```tsx
// 위치 10의 {/* 일자 — order 필드 */} 블록 전체 삭제
```

### 5. order_num / product_name td 의 sticky left 값 업데이트

```tsx
// order_num td
style={{ left: "78px", ... }}  →  style={{ left: "122px", ... }}

// product_name td
style={{ left: "168px", ... }}  →  style={{ left: "212px", ... }}
```

---

## 파일 경로

| 파일 | 변경 내용 | 신규/수정 |
|------|---------|---------|
| `components/orders-line-items-table.tsx` | 컬럼 재배치 (5개 지점) | **수정** |

> TypeScript 변경 없음. 타입/로직은 그대로이고 JSX 구조만 변경.

---

## 트레이드오프 상세설명

### 1. 날짜 컬럼 너비: 46px vs 90px

| | **90px** (채택) | 46px 유지 |
|---|---|---|
| YYYY-MM-DD 표시 | 잘림 없음 | 잘림 발생 |
| date picker 열렸을 때 | 충분한 너비 | 너무 좁음 |
| sticky 오프셋 변경 | order_num/product_name 업데이트 필요 | 불필요 |

→ **편집 가능 컬럼이므로 90px 채택. sticky 오프셋은 함께 수정.**

### 2. 표시 형식: YYYY-MM-DD vs MM/DD

| | **YYYY-MM-DD** (채택) | MM/DD |
|---|---|---|
| 편집 시 `<input type="date">` value | 그대로 사용 가능 | 변환 필요 |
| 연도 표시 | ✅ | ❌ |
| 너비 필요 | 90px 이상 | 46px |

→ **편집 input의 value 포맷이 YYYY-MM-DD이므로 그대로 표시.**

### 3. 수정 범위: 단일 파일 vs 다중 파일

날짜 컬럼 렌더링은 `orders-line-items-table.tsx`에만 존재.
서버 액션, 타입, i18n 변경 불필요.

→ **수정 파일 1개, TypeScript 타입 변경 없음.**

---

## 구현 순서

- [x] Step 1: `colgroup` — col 2 너비 46→90px, col 10 (100px date) 제거 / minWidth 2208→2152
- [x] Step 2: `thead` ×2 위치 — non-sticky `col_date` th 제거, sticky th의 offset 그대로 유지
- [x] Step 3: `thead` ×2 위치 — order_num `left-[78px]→left-[122px]`, product_name `left-[168px]→left-[212px]`
- [x] Step 4: `tbody` — 위치 2 읽기전용 date td 제거 → 편집 가능 date td로 교체 (sticky 스타일 추가)
- [x] Step 5: `tbody` — 위치 10 기존 편집 date td 블록 제거
- [x] Step 6: `tbody` — order_num td `left: "78px"→"122px"`, product_name td `left: "168px"→"212px"`
- [x] Step 7: typecheck 실행 → 오류 없음 확인
