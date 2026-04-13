# 태블릿 테이블 렌더링 버그 수정

## 확인된 버그 원인 (코드 + DB 조사 결과)

| 원인 | 파일:라인 | 증상 |
|------|-----------|------|
| `border-collapse:collapse` + `position:sticky` | `orders-line-items-table.tsx:1460,1617` | Chrome Android: sticky 셀 배경 repaint 안 됨 → 행 전체 blank |
| `overflowY:"visible"` → 강제 `auto` 변환 | `orders-line-items-table.tsx:1615` | scroll container 이중 생성 → sticky 기준축 불안정 |
| `backdrop-blur` → GPU 컴포지팅 레이어 생성 | `crm-shell.tsx:14` | 스크롤 중 GPU 타일 repaint 실패, blank 영역 발생 |
| 헤더·바디 분리 테이블 + JS scroll sync | `orders-line-items-table.tsx:521–531` | 가로 스크롤 시 헤더·바디 컬럼 위치 순간 어긋남 |

---

## 접근방식

### Fix 1 — `border-collapse: separate` + `borderSpacing: 0` (1순위, 주원인 직접 해결)

Chrome Android의 Chromium 버그: `border-collapse: collapse`인 테이블에서 `position: sticky` td 셀이 스크롤 중 배경(background)을 repaint하지 않아 투명해짐. 해결책은 `border-collapse: separate; border-spacing: 0`으로 변경. `borderSpacing: 0`이면 셀 간 간격이 없으므로 기존 `border-b border-r` 스타일로 동일한 시각적 결과를 유지.

### Fix 2 — `overflowY: "clip"` (2순위, CSS 스펙 준수)

`overflow-x: auto`가 있으면 브라우저가 `overflow-y: visible`을 `auto`로 강제 변환 (W3C CSS Overflow 3 §overflow). 이로 인해 테이블 div가 수직 scroll container가 되어 sticky 기준축이 뒤틀림. `overflow-y: clip`은 scroll container를 생성하지 않으므로 이 문제를 방지. Chrome 90+, Safari 16+ 지원.

### Fix 3 — `backdrop-blur` 제거 (3순위, GPU 부하 감소)

`backdrop-filter: blur()`는 브라우저가 헤더를 별도 GPU 컴포지팅 레이어로 승격시킴. 현재 z-index 계층이 z-50(header) / z-40(subheader) / z-20(table header) / z-30(th) / z-10(td)로 5단계인 상황에서, backdrop-blur가 추가 레이어를 생성하면 태블릿 GPU가 스크롤 중 모든 레이어를 동시 repaint하지 못하고 일부 타일을 blank로 남김.

### Fix 4 — 헤더·바디 단일 테이블 병합 (4순위, 구조적 근본 해결)

현재: 헤더 테이블 + 바디 테이블(별도) + JS scroll 동기화.
목표: 하나의 `<table>` 안에 `<thead sticky>` + `<tbody>`, JS sync 제거.
Fix 2(`overflow-y: clip`)가 적용되면 `overflow-x: auto` div가 수직 scroll container가 아니게 되므로, `<thead>`의 `position: sticky; top: 108px`이 뷰포트 기준으로 올바르게 작동함.

---

## 코드 스니펫

### Fix 1: border-collapse 변경 (두 테이블 모두)

```tsx
// BEFORE (line ~1460 헤더 테이블, line ~1617 바디 테이블 — 동일 패턴)
<table
  className="min-w-full border-collapse text-left text-sm"
  style={{ tableLayout: "fixed", width: "100%", minWidth: 2152 }}
>

// AFTER — border-collapse 클래스 제거, style에 separate+spacing 추가
<table
  className="min-w-full text-left text-sm"
  style={{ tableLayout: "fixed", width: "100%", minWidth: 2152,
           borderCollapse: "separate", borderSpacing: 0 }}
>
```

### Fix 2: overflowY 변경

```tsx
// BEFORE (line 1615)
<div ref={tableRef} style={{ overflowX: "auto", overflowY: "visible" }}>

// AFTER
<div ref={tableRef} style={{ overflowX: "auto", overflowY: "clip" }}>
```

### Fix 3: backdrop-blur 제거

```tsx
// BEFORE (crm-shell.tsx line 14)
<header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">

// AFTER — backdrop-blur 제거, 불투명 배경으로 교체
<header className="sticky top-0 z-50 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
```

### Fix 4: 단일 테이블 구조 (선택)

```tsx
// 제거 대상:
// - headerWrapRef div 전체 (lines 1453–1514)
// - sr-only thead (lines 1644–1669)
// - JS scroll sync useEffect (lines 521–531)
// - headerWrapRef, headerTableRef ref 선언 (lines 282–283)

// 변경 후: 하나의 overflow div 안에 sticky thead 포함
<div ref={tableRef} style={{ overflowX: "auto", overflowY: "clip" }}>
  <table
    className="min-w-full text-left text-sm"
    style={{ tableLayout: "fixed", width: "100%", minWidth: 2152,
             borderCollapse: "separate", borderSpacing: 0 }}
  >
    <colgroup>...</colgroup>
    {/* thead: 수직 sticky — overflow-y:clip이므로 뷰포트 기준으로 작동 */}
    <thead className="sticky z-20 bg-white dark:bg-zinc-950" style={{ top: 108 }}>
      <tr>
        <th className={`${thClass} sticky left-0 z-30`}>{t.col_num}</th>
        <th className={`${thClass} sticky left-[32px] z-30`}>{t.col_date}</th>
        <th className={`${thClass} sticky left-[122px] z-30`}>{t.col_order_num}</th>
        <th className={`${thClass} sticky left-[212px] z-30 text-left`}>{t.col_product_name}</th>
        {/* 나머지 th 동일 */}
      </tr>
    </thead>
    <tbody>
      {/* 기존 tbody 완전 동일 */}
    </tbody>
  </table>
</div>
```

---

## 파일 경로

| 파일 | Fix | 변경 내용 |
|------|-----|----------|
| `components/orders-line-items-table.tsx` | 1, 2 | 두 `<table>`의 `border-collapse` 클래스 제거 + style 추가; `overflowY` 변경 |
| `components/crm-shell.tsx` | 3 | `backdrop-blur`, `bg-white/90` 제거 |
| `components/orders-line-items-table.tsx` | 4 (선택) | 헤더 div + sr-only thead + JS sync 제거, sticky thead 추가 |

---

## 트레이드오프 상세설명

### Fix 1: border-separate 전환

| | **border-separate** (채택) | border-collapse 유지 |
|---|---|---|
| Chrome Android sticky 버그 | 해결됨 | 버그 지속 |
| 시각적 차이 | `border-b border-r`만 사용 중이므로 없음 | — |
| `border-spacing: 0` 필수 여부 | 필수 (없으면 셀 간 4px 간격 생김) | 불필요 |
| 코드 변경량 | 2줄 (두 테이블) | — |
| 리스크 | 매우 낮음 | — |

### Fix 2: overflowY: clip

| | **clip** (채택) | visible (현재) | hidden |
|---|---|---|---|
| scroll container 생성 | ❌ 생성 안 함 | auto로 강제 변환 | ❌ 생성 안 함 |
| sticky 수직 기준 | 뷰포트 ✓ | 불안정 | 뷰포트 ✓ |
| 콘텐츠 클리핑 | 하지 않음 | — | 함 (overflow 잘림) |
| 브라우저 지원 | Chrome 90+ / Safari 16+ | 모든 브라우저 | 모든 브라우저 |

→ 구형 Android 지원이 필요한 경우: `overflow-y: clip` 대신 그냥 `overflowY: "visible"` 제거(명시 않음)해도 동일 문제 발생. 안전한 폴백으로 `overflowY: "auto"` 명시도 가능하나, Fix 4(단일 테이블)와 함께 써야 함.

### Fix 3: backdrop-blur 제거

| | **제거** (채택) | 유지 |
|---|---|---|
| GPU 레이어 수 | 감소 | backdrop-blur로 인한 추가 레이어 |
| 태블릿 scroll repaint | 안정 | 과부하 가능 |
| 시각적 차이 | 헤더 완전 불투명 (차이 거의 안 보임) | 반투명 블러 |
| 데스크탑 영향 | 사실상 없음 | — |

### Fix 4: 단일 테이블 (선택)

| | **단일 테이블** | 현재 이중 테이블 |
|---|---|---|
| JS scroll sync | 불필요 (제거) | 필요, 모바일에서 지연 가능 |
| 헤더·바디 정렬 | CSS로 보장 | JS 이벤트 의존 |
| Fix 2 의존성 | `overflow-y: clip` 필수 | 무관 |
| 변경량 | 많음 (~80줄 삭제·수정) | — |
| 리스크 | 보통 (구조 변경) | — |

→ Fix 1~3만으로 blank rows 버그가 해결됨. Fix 4는 드래그 스크롤 시 헤더 어긋남까지 완전 제거하고 싶을 때 추가 적용.

---

## 구현 순서

- [x] Fix 1a: `orders-line-items-table.tsx` — 헤더 테이블(line ~1460) `border-collapse` 클래스 제거 + `borderCollapse:"separate", borderSpacing:0` 추가
- [x] Fix 1b: `orders-line-items-table.tsx` — 바디 테이블(line ~1617) 동일 변경
- [x] Fix 2: `orders-line-items-table.tsx` — `overflowY:"visible"` → `overflowY:"clip"` (line 1615)
- [x] Fix 3: `crm-shell.tsx` — `backdrop-blur` 제거, `bg-white/90` → `bg-white` (line 14)
- [x] typecheck 실행 → 오류 없음 확인
- [x] (선택) Fix 4: 헤더 div 제거 + sr-only thead 제거 + JS sync useEffect 제거 + sticky thead 추가
- [x] (선택) typecheck 재실행
