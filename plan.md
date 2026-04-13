# 빈 행(blank row) 버그 — 3차 수정 계획

## 스크린샷에서 확인된 증상

| 열 | 증상 | 코드 내 content |
|---|------|----------------|
| `#` (left:0) | 숫자 불표시 | `{idx + 1}` 순수 텍스트 노드 |
| 날짜 (left:32px) | 날짜 불표시 | `<button>` |
| 주문번호 (left:122px) | 색상 배경은 보이지만 텍스트 "01032202" 불표시 | `<Link>` |
| 상품명 (left:212px) | 불표시 | `<button>` |
| 옵션, 진행상태 (non-sticky) | **정상 표시** | 동일 행의 비고정 열 |

---

## 정확한 원인

### 핵심 근거: `#` 열이 blank인 이유

`#` 열의 코드:
```tsx
<td
  className={`${tdBase} sticky z-10 border-r-gray-300 text-xs text-zinc-400 dark:text-zinc-500 ${whiteBg}`}
  style={{ left: 0, width: "32px", minWidth: "32px" }}
>
  {idx + 1}  {/* 순수 텍스트 노드. button도 link도 transition도 없음 */}
</td>
```

`{idx + 1}`은 React가 생성한 숫자를 바로 렌더링하는 **텍스트 노드**다.  
- hover 이벤트 없음 → tap-target 합성 레이어 승격 없음  
- `transition` 없음 → animation compositing 레이어 없음  
- `will-change` 없음 → 명시적 GPU 레이어 없음  
- 부모 td에 `position: sticky; z-index: 10` → stacking context 생성, 합성 레이어 생성

이 텍스트 노드가 blank라는 것은: **상호작용 요소(button/link)나 CSS transition과 무관하게, `position:sticky` td 자체의 content paint가 실패함**을 의미한다.

### Chrome Android 타일링 합성기 페인트 실패

**원인**: Chrome의 합성기는 화면을 paint tile(페인트 타일)로 분할해 래스터화한다.  
`position:sticky; left:X`인 td를 `overflow-x:auto` 컨테이너 안에 배치하면:

1. **레이어 메타데이터** (background-color, border, z-index 위치) →  
   GPU 합성 트리를 통해 업데이트됨 → **항상 올바름 → 배경색 보임 ✓**

2. **페인트 타일** (텍스트 노드, inline 콘텐츠) →  
   메인 스레드 래스터라이저가 "페인트 무효화(paint invalidation)" 신호를 받아야 그림 →  
   **Chrome Android에서 vertical page scroll로 새 행이 뷰포트에 진입할 때 이 신호가 발생하지 않음 → 텍스트 미렌더링 ✗**

### 왜 배경은 보이고 텍스트는 안 보이는가

Chrome의 합성 파이프라인:
```
GPU 합성 트리 갱신 (background-color, layer transform)
    ↓
layer metadata → 항상 최신 → 색상 배경 보임 ✓

페인트 타일 래스터화 (text, inline)
    ↓
paint invalidation trigger → 수직 스크롤 진입 시 누락 → 텍스트 미렌더링 ✗
```

Fix 1 (border-collapse:separate)은 **배경 래스터화** 문제를 해결했다.  
현재 남은 문제는 **콘텐츠(텍스트) 래스터화** 문제다.

### 왜 같은 화면에서 어떤 행은 보이고 어떤 행은 안 보이는가

스크린샷에서 rows 53–55, 59–62는 정상이고 56–58, 63–72는 blank다.

- **정상 행**: 해당 스크롤 세션 시작 시 또는 이전 스크롤 단계에서 이미 뷰포트에 있었던 행 → 초기 래스터화 완료 ✓
- **blank 행**: 이 스크롤 이벤트 중 뷰포트 하단에서 새로 진입한 행 → 래스터화 트리거 누락 ✗

동일 행도 스크롤 방향·속도에 따라 정상/blank가 바뀔 수 있다 (paint invalidation 타이밍 의존).

---

## 수정 접근방식

`will-change: transform`을 4개의 sticky td `style`에 추가한다.

**원리**:  
`will-change: transform`은 Chrome에게 "이 요소는 transform이 변경될 것"임을 미리 알려 **요소 전체(배경 + 텍스트)를 하나의 GPU 합성 레이어로 사전 래스터화**하도록 지시한다. 이 레이어는:
- 메인 스레드 페인트 타일과 독립적으로 관리됨
- 뷰포트 진입 전 eager 래스터화 수행 (lazy paint 대신)
- 레이어 내 배경과 텍스트가 항상 함께 유지됨

`will-change`는 CSS hint이므로 `display:table-cell` 제약을 받지 않는다 (`transform` 직접 적용과 다름). `<td>`에 직접 적용 가능.

---

## 코드 스니펫

### Fix: 4개 sticky td에 `willChange: "transform"` 추가

**`#` 열 (line ~1691)**
```tsx
// BEFORE:
style={{ left: 0, width: "32px", minWidth: "32px" }}

// AFTER:
style={{ left: 0, width: "32px", minWidth: "32px", willChange: "transform" }}
```

**날짜 열 (line ~1700)**
```tsx
// BEFORE:
style={{ left: "32px", width: "90px", minWidth: "90px" }}

// AFTER:
style={{ left: "32px", width: "90px", minWidth: "90px", willChange: "transform" }}
```

**주문번호 열 (line ~1738)**
```tsx
// BEFORE:
style={{ left: "122px", width: "90px", minWidth: "90px" }}

// AFTER:
style={{ left: "122px", width: "90px", minWidth: "90px", willChange: "transform" }}
```

**상품명 열 (line ~1751)**
```tsx
// BEFORE:
style={{ left: "212px", width: "320px", minWidth: "320px" }}

// AFTER:
style={{ left: "212px", width: "320px", minWidth: "320px", willChange: "transform" }}
```

---

## 파일 경로

| 파일 | 변경 내용 |
|------|-----------|
| `components/orders-line-items-table.tsx` | `filteredRows.map()` 내부 4개 sticky td style에 `willChange: "transform"` 추가 |

---

## 트레이드오프 상세설명

### `will-change: transform` 적용 (채택)

| | **적용** (채택) | 미적용 |
|---|---|---|
| 텍스트 blank 버그 | 해결 (eager rasterize) | 지속 |
| GPU 합성 레이어 수 | 4개 sticky col × 가시 행 수 (~40행) = 최대 160개 추가 | 0 |
| 오프스크린 레이어 | Chrome이 자동 evict/re-rasterize 관리 | 불필요 |
| 태블릿 GPU 부하 | 약간 증가, 단 160개는 현대 모바일에서 수용 가능 | 기본 |
| 코드 변경량 | 4줄 (style 추가) | — |
| 리스크 | 매우 낮음 | — |

### `transform: translateZ(0)` 내부 wrapper 방식과의 비교

| | **`willChange:"transform"` on td** (채택) | `transform:translateZ(0)` on child div |
|---|---|---|
| `display:table-cell` 제약 | 없음 (will-change는 hint) | 있음 (transform 직접 적용 불가) |
| 기존 레이아웃 영향 | 없음 | wrapper div로 구조 변경 필요 |
| 구현 복잡도 | style 1줄 추가 | 4개 td 내부 전체 wrapping |
| 효과 | 동일 (eager compositing) | 유사하나 table-cell 제약으로 불가 |

---

## 구현 순서

- [x] `orders-line-items-table.tsx` — `#` td style에 `willChange: "transform"` 추가
- [x] `orders-line-items-table.tsx` — 날짜 td style에 `willChange: "transform"` 추가
- [x] `orders-line-items-table.tsx` — 주문번호 td style에 `willChange: "transform"` 추가
- [x] `orders-line-items-table.tsx` — 상품명 td style에 `willChange: "transform"` 추가
- [x] typecheck 실행 → 오류 없음 확인
