# 모바일 친화적 주문 목록 UI 전환 계획

## 근본 문제

현재 주문 테이블은 **데스크탑 전용 설계**다.

| 문제 | 원인 | 결과 |
|------|------|------|
| 22개 열 가로 스크롤 | 터치 드래그와 충돌 | 사용 불편 |
| `position:sticky` 4개 열 | Chrome Android GPU 렌더링 버그 | 텍스트 blank (클릭 시만 표시) |
| 셀 클릭→인라인 편집 | 마우스 기반 UX | 태블릿에서 오탭/오입력 |
| 헤더 고정 (top:108px) | 화면 비율 계산 | 모바일에서 오프셋 틀어짐 |

`will-change: transform` 등의 땜질은 Chrome 버전마다 다르게 작동한다.  
**테이블 구조 자체**가 터치 기기에 맞지 않으므로 레이아웃을 분리한다.

---

## 접근방식: 반응형 이중 레이아웃

| 뷰포트 | 레이아웃 | 설명 |
|--------|----------|------|
| `lg` 이상 (≥1024px) | 기존 테이블 (유지) | 데스크탑/와이드 태블릿 |
| `lg` 미만 (<1024px) | 카드 리스트 뷰 (신규) | 태블릿/휴대폰 |

Tailwind 브레이크포인트로 분기:
- 기존 테이블 wrapper: `hidden lg:block`
- 신규 모바일 뷰: `block lg:hidden`

**상태는 하나로 공유**: `filteredRows`, `editing`, `draft`, 저장 함수 모두 동일하게 재사용.

---

## 모바일 카드 레이아웃 설계

### 화면 구조

```
┌─────────────────────────────────────────┐
│ [필터바] [검색]                          │  ← subheader (기존 유지)
├─────────────────────────────────────────┤
│  주문 32건 · 78줄                        │
│                                         │
│ ┌───────────────────────────────────┐   │
│ │ [01032202]  2026-03-22  ▼ 3개     │   │ ← 주문 헤더 (탭으로 펼침)
│ │ 고객명: Мария · telegram · RUSSIA │   │
│ │ [IN DELIVERY]                     │   │
│ ├───────────────────────────────────┤   │
│ │ 1. Clio Kill Cover Founwear set   │   │ ← 상품 카드 (탭으로 편집)
│ │    (19C Light) · 1개 · ₽2,500    │   │
│ │    [사진: Not sent] [선물: no]    │   │
│ ├───────────────────────────────────┤   │
│ │ 2. Someproduct                    │   │
│ │    (Ocean blue) · 1개 · ₽2,000   │   │
│ └───────────────────────────────────┘   │
│                                         │
│ ┌───────────────────────────────────┐   │
│ │ [03032201]  2026-03-22  ▼ 2개     │   │
│ └───────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### 상품 카드 탭 → 편집 드로어 (하단 슬라이드)

```
┌─────────────────────────────────────────┐
│ 상품 수정                         ✕     │  ← 드로어 헤더
├─────────────────────────────────────────┤
│ 상품명   [Clio Kill Cover Founwear  ]   │
│ 옵션     [(19C Light)               ]   │
│ 진행     [IN DELIVERY         ▼    ]   │
│ 수량     [1                         ]   │
│ 판매가₽  [2500                       ]  │
│ 선결제₽  [1000                       ]  │
│ 원화매입 [45000                      ]  │
│ 사진     [Not sent              ▼   ]   │
│ 선물     [no                   ▼    ]   │
│ 단품/세트[단품                  ▼    ]  │
│ 카테고리 [SKIN                  ▼    ]  │
├─────────────────────────────────────────┤
│ 주문 공통 필드 (모든 상품에 적용)       │
│ 일자     [2026-03-22                 ]  │
│ 플랫폼   [telegram              ▼   ]   │
│ 경로     [RUSSIA               ▼    ]   │
│ 고객명   [Мария                      ]  │
│ 거래처   [fanko                      ]  │
├─────────────────────────────────────────┤
│        [취소]          [저장]           │
└─────────────────────────────────────────┘
```

---

## 구현 범위

### 신규 컴포넌트

#### `components/orders-mobile-view.tsx` (신규 파일)
```
props:
  - filteredRows: FlatOrderItemRow[]          ← 공유 데이터
  - onSaveItemField: (...)  => Promise<void>  ← 공유 저장 함수
  - onSaveOrderField: (...) => Promise<void>
  - onRefresh: () => void

내부 상태:
  - expandedOrders: Set<string>     ← 펼쳐진 주문번호 목록
  - editingItem: { id, orderNum }   ← 드로어에 열린 상품
  - drawerDraft: Record<string, string>  ← 드로어 내 임시 편집값
```

구현 내용:
1. `filteredRows`를 주문번호 기준으로 그룹화 (`Map<orderNum, rows[]>`)
2. 주문 헤더 카드 (탭으로 펼침/접힘)
3. 펼쳐진 상태에서 상품 카드 목록
4. 상품 카드 탭 → `editingItem` 설정 → 드로어 표시
5. 드로어: 모든 item 필드 + order 필드 폼
6. [저장] 버튼 탭 → `onSaveItemField` + `onSaveOrderField` 호출
7. 저장 완료 시 드로어 닫힘

#### `components/orders-mobile-drawer.tsx` (신규 파일)
드로어 자체 UI 컴포넌트.  
- 하단에서 슬라이드 업 애니메이션 (`translate-y` transition)
- 배경 오버레이 탭 시 닫힘
- 폼 필드 (text input, select, date input)

### 기존 컴포넌트 수정

#### `components/orders-line-items-table.tsx` (수정)
```tsx
// 기존 테이블 wrapper에 반응형 클래스 추가
<div className="hidden lg:block">
  {/* 기존 sticky 헤더 + 테이블 전체 */}
</div>

// 모바일 뷰 추가
<div className="block lg:hidden">
  <OrdersMobileView
    filteredRows={filteredRows}
    onSaveItemField={saveItemField}
    onSaveOrderField={saveOrderField}
    onRefresh={fetchOrders}
  />
</div>
```

저장 함수(`saveItemField`, `saveOrderField`) signature를 확인하여  
모바일 뷰에서 재사용 가능한 형태로 추출하거나 props로 전달한다.

---

## 파일 경로

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `components/orders-line-items-table.tsx` | 수정 | 데스크탑 `hidden lg:block`, 모바일 뷰 삽입 |
| `components/orders-mobile-view.tsx` | 신규 | 카드 리스트 + 주문 그룹화 |
| `components/orders-mobile-drawer.tsx` | 신규 | 하단 드로어 편집 폼 |

---

## 트레이드오프 상세설명

### 이중 레이아웃 (채택)

| | **이중 레이아웃** (채택) | 단일 반응형 테이블 | CSS 수정만 |
|---|---|---|---|
| sticky 렌더링 버그 | 완전 회피 | 지속 | 지속 |
| 모바일 편집 UX | 자연스러운 드로어 | 오탭 발생 | 기존 유지 |
| 코드 복잡도 | 신규 파일 2개 | 중간 | 낮음 |
| 데스크탑 영향 | 없음 | 있을 수 있음 | 있음 |
| 기능 동등성 | 드로어에서 전체 편집 가능 | 제한적 | 제한적 |

### 드로어 vs 페이지 이동

| | **하단 드로어** (채택) | 상세 페이지로 이동 |
|---|---|---|
| 맥락 유지 | 목록 보면서 편집 | 맥락 끊김 |
| 구현 복잡도 | 중간 | 낮음 (기존 /orders/[id] 활용) |
| UX | 모바일 앱 느낌 | 웹 페이지 느낌 |
| 배치 편집 | 가능 (다음 카드로 이동) | 불가 |

→ 드로어 방식을 채택. 단, 기존 `/orders/[order_num]` 상세 페이지로 이동하는 링크도 드로어 내에 제공.

### `lg` 브레이크포인트 기준

iPad(768px), iPad Pro(1024px)를 고려:
- `lg` = 1024px: iPad Pro 가로는 테이블, 세로/일반 태블릿·폰은 카드
- `md` = 768px로 낮추면 iPad Pro 가로도 카드 뷰 → 필요 시 조정

---

## 구현 순서

- [x] `orders-line-items-table.tsx` — 데스크탑 wrapper `hidden lg:block` 적용
- [x] `orders-mobile-view.tsx` — 주문 그룹화 + 카드 리스트 (펼침/접힘) 구현
- [x] `orders-mobile-drawer.tsx` — 하단 드로어 + 폼 필드 구현
- [x] `orders-line-items-table.tsx` — `<OrdersMobileView>` 삽입 및 props 연결
- [x] typecheck 실행 → 오류 없음 확인
- [ ] 태블릿 실제 확인
