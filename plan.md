# 테이블 렌더링 버그 — 2차 수정 계획

## 확인된 버그 (스크린샷 기반)

| # | 증상 | 발생 위치 |
|---|------|-----------|
| Bug 1 | 헤더 행이 2~3번 행 사이에 표시됨 (sticky 작동 안 함) | `orders-line-items-table.tsx` |
| Bug 2 | 고정 열(sticky td) 뒤로 다른 열이 겹쳐 보임 | 동일 파일 |

---

## 정확한 원인

### Bug 1: 헤더가 mid-table에 떠있는 이유

**원인: `position: sticky` on `<thead>` inside `overflow-x: auto` container**

현재 구조 (Fix 4 적용 후):
```
<div style={{ overflowX: "auto", overflowY: "clip" }}>   ← scroll container
  <table>
    <thead className="sticky z-20" style={{ top: 108 }}>  ← sticky 대상
    <tbody> ... </tbody>
  </table>
</div>
```

CSS Overflow 3 스펙: `overflow-x: auto`는 해당 element를 **scroll container**로 만든다.
Chrome의 sticky positioning 알고리즘: sticky 요소의 수직 기준으로 **가장 가까운 scroll container 조상**을 사용한다.
→ `overflow-x: auto` div가 가장 가까운 scroll container로 선택됨.
→ 이 div는 수직으로 스크롤되지 않음 (overflow-y: clip) → `top: 108` 조건이 절대 충족되지 않음.
→ thead는 `position: sticky`임에도 `position: relative`처럼 동작 → 테이블 흐름 내 자연 위치에 머무름.

스크린샷에서 행 1~2가 thead 위에 보이는 이유: 사용자가 페이지를 스크롤하면 thead는 그대로 있고
행 1~2가 뷰포트 상단에 위치하는 시점에, thead(자연 위치)가 행 1~2 바로 아래인 것처럼 보임.

**`overflow-y: clip`을 설정해도 이 문제가 해결되지 않는 이유:**
`overflow-y: clip`은 수직 scroll container 생성을 막지만, `overflow-x: auto`가 이미 scroll container를
성립시킨다. Chrome은 이 컨테이너를 두 축 모두의 sticky 기준으로 사용하며, 이는 브라우저 구현 수준의 동작이다.

### Bug 2: 고정 열 뒤로 다른 열이 겹쳐 보이는 이유

**Bug 1의 직접적 증상.**

thead (z-30인 sticky th 셀 포함)가 sticky 동작을 하지 못하고 테이블 중간에 물리적으로 위치.
→ th 셀(z-30, bg-zinc-50 배경)이 tbody의 td 행들 사이에 삽입된 것처럼 렌더링.
→ z-30인 th 셀이 주변 z-10/z-auto인 td 셀 위에 그려짐 → "다른 열이 겹쳐 보이는" 현상.

Bug 1을 수정하면 Bug 2도 함께 해결된다.

---

## 접근방식: Fix 4 되돌리기 + 헤더 div를 overflow 컨테이너 밖으로 분리

`position: sticky`는 **scroll container 밖에 있어야 뷰포트 기준으로 동작**한다.
헤더 테이블을 `overflow-x: auto` div 밖에, 별도의 `sticky` div에 두면 window가 scroll container가 되어
올바르게 동작한다. 이것이 Fix 4 이전 구조이며, Fix 1~3(border-separate, overflow-y:clip, backdrop-blur 제거)은 그대로 유지한다.

```
[sticky div: top 108, z-20, overflow-x: hidden]  ← window 기준 sticky ✓
  └── [header table: thead만 포함]
[overflow-x: auto div]                            ← 가로 스크롤만 담당
  └── [body table: colgroup + tbody만 포함]
JS: body.scrollLeft → header.scrollLeft 동기화    ← 1-frame 오프셋 허용
```

---

## 코드 스니펫 (현재 코드베이스 기반)

### 변경 1: ref 선언 복원 (`orders-line-items-table.tsx` line 280~)

```tsx
// BEFORE (현재):
const tableRef = useRef<HTMLDivElement>(null);
const wrapperRef = useRef<HTMLDivElement>(null);

// AFTER — 두 ref 추가:
const tableRef = useRef<HTMLDivElement>(null);
const headerWrapRef = useRef<HTMLDivElement>(null);
const headerTableRef = useRef<HTMLTableElement>(null);
const wrapperRef = useRef<HTMLDivElement>(null);
```

### 변경 2: JS scroll sync useEffect 복원 (현재 `useEffect(() => { if (!editing) return; ...` 앞에 추가)

```tsx
useEffect(() => {
  const bodyEl = tableRef.current;
  const headerWrap = headerWrapRef.current;
  if (!bodyEl || !headerWrap) return;
  const onScroll = () => { headerWrap.scrollLeft = bodyEl.scrollLeft; };
  onScroll();
  bodyEl.addEventListener("scroll", onScroll);
  return () => bodyEl.removeEventListener("scroll", onScroll);
}, []);
```

### 변경 3: 헤더 div 복원 (tableRef div 바로 위에 삽입)

현재 위치 기준: `<div ref={tableRef} style={{ overflowX: "auto", overflowY: "clip" }}>` 바로 위.

```tsx
{/* ── 수직 sticky 헤더 테이블 (overflow-x:auto 밖에 위치) ── */}
<div
  ref={headerWrapRef}
  className="sticky z-20 bg-white dark:bg-zinc-950"
  style={{ top: 108, overflowX: "hidden" }}
>
  <table
    ref={headerTableRef}
    className="min-w-full text-left text-sm"
    style={{ tableLayout: "fixed", width: "100%", minWidth: 2152, borderCollapse: "separate", borderSpacing: 0 }}
  >
    <colgroup>
      <col style={{ width: "32px" }} />
      <col style={{ width: "90px" }} />
      <col style={{ width: "90px" }} />
      <col style={{ width: "320px" }} />
      <col style={{ width: "180px" }} />
      <col style={{ width: "112px" }} />
      <col style={{ width: "72px" }} />
      <col style={{ width: "52px" }} />
      <col style={{ width: "88px" }} />
      <col style={{ width: "72px" }} />
      <col style={{ width: "72px" }} />
      <col style={{ width: "140px" }} />
      <col style={{ width: "88px" }} />
      <col style={{ width: "88px" }} />
      <col style={{ width: "48px" }} />
      <col style={{ width: "88px" }} />
      <col style={{ width: "88px" }} />
      <col style={{ width: "80px" }} />
      <col style={{ width: "72px" }} />
      <col style={{ width: "80px" }} />
      <col style={{ width: "80px" }} />
      <col style={{ width: "120px" }} />
    </colgroup>
    <thead>
      <tr>
        <th className={`${thClass} sticky left-0 z-30`}>{t.col_num}</th>
        <th className={`${thClass} sticky left-[32px] z-30`}>{t.col_date}</th>
        <th className={`${thClass} sticky left-[122px] z-30`}>{t.col_order_num}</th>
        <th className={`${thClass} sticky left-[212px] z-30 text-left`}>{t.col_product_name}</th>
        <th className={`${thClass} text-left`}>{t.col_option}</th>
        <th className={thClass}>{t.col_progress}</th>
        <th className={`${thClass} th-ru-xs`}>{t.col_set_type}</th>
        <th className={`${thClass} th-ru-xs`}>{t.col_gift}</th>
        <th className={thClass}>{t.col_photo}</th>
        <th className={thClass}>{t.col_platform}</th>
        <th className={thClass}>{t.col_route}</th>
        <th className={thClass}>{t.col_customer}</th>
        <th className={thClass}>{t.col_channel}</th>
        <th className={thClass}>{t.col_category}</th>
        <th className={thClass}>{t.col_quantity}</th>
        <th className={thClass}>{t.col_price_rub}</th>
        <th className={thClass}>{t.col_krw}</th>
        <th className={thClass}>{t.col_prepay_rub}</th>
        <th className={thClass}>{t.col_balance_rub}</th>
        <th className={thClass}>{t.col_shipping_fee}</th>
        <th className={thClass}>{t.col_weight}</th>
        <th className={`${thClass} border-r-0`}>{t.col_tracking}</th>
      </tr>
    </thead>
  </table>
</div>
```

### 변경 4: 바디 테이블 내 thead를 sr-only로 변경

```tsx
// BEFORE (현재):
<thead className="sticky z-20 bg-white dark:bg-zinc-950" style={{ top: 108 }}>

// AFTER:
<thead className="sr-only">
```

---

## 파일 경로

| 파일 | 변경 내용 |
|------|-----------|
| `components/orders-line-items-table.tsx` | ref 2개 추가, scroll sync useEffect 추가, 헤더 div 복원, tbody thead sr-only 변경 |

---

## 트레이드오프 상세설명

### Fix 4 되돌리기 (채택)

| | **2-테이블 구조** (채택) | Fix 4 단일 테이블 |
|---|---|---|
| 수직 sticky 작동 | ✅ window 기준, 정상 | ❌ overflow-x 컨테이너 기준, 작동 안 함 |
| 가로 스크롤 헤더 동기화 | JS scrollLeft sync (1-frame 오프셋 가능) | CSS 자동 ✓ |
| 모바일 쾌적도 | fast scroll 시 헤더 1px 오프셋 순간 가능 | 헤더 완전 비정상 |
| 코드 복잡도 | 높음 (ref 2개, useEffect 1개 추가) | 낮음 |
| 실용적 선택 | ✅ 헤더 표시 자체가 우선 | — |

**결론**: 단일 테이블은 CSS Overflow 스펙 + 브라우저 구현 제약으로 인해 `overflow-x: auto` 내부에서
수직 sticky가 동작하지 않는다. 2-테이블 구조의 1-frame JS sync lag는 실사용에서 무시 가능하며,
헤더가 아예 없는 것보다 훨씬 낫다.

### JS scroll sync 개선 여지

현재 sync 코드는 `scroll` 이벤트로 즉시 동기화하므로 이미 최선. 추가 개선이 필요하면:
- `{ passive: true }` (이미 기본값)
- CSS scroll-timeline 활용 (Chrome 115+, 실험적)

---

## 구현 순서

- [x] `orders-line-items-table.tsx` — ref 2개 (`headerWrapRef`, `headerTableRef`) 추가
- [x] `orders-line-items-table.tsx` — scroll sync useEffect 복원
- [x] `orders-line-items-table.tsx` — 헤더 div 복원 (colgroup 22개 + thead 22개 th)
- [x] `orders-line-items-table.tsx` — tbody 내 thead → `className="sr-only"` 변경
- [x] typecheck 실행 → 오류 없음 확인
