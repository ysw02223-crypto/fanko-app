# Shipter 엑셀 포맷 지원 — HEADER_MAP 수정 계획

구현 현황: **완료** (2026-04-10)

---

## 1. 접근방식

### 문제 진단

`2026_04_10_01_24_59.xlsx` (Shipter 배송 관리 엑셀) 파일을 실제로 파싱해서 확인한 결과,
현재 `HEADER_MAP`의 키값과 실제 엑셀 헤더명이 불일치하여 파싱이 실패한다.

**실제 Shipter 엑셀 헤더명 vs 현재 HEADER_MAP 비교:**

| 열 | 실제 헤더명 | 현재 HEADER_MAP | 매칭 여부 |
|----|-----------|----------------|---------|
| N (idx 13) | `"주문번호1"` | `"주문번호"`, `"주문 번호"` | ❌ 불일치 |
| P (idx 15) | `"SHIPTER 배송 번호"` | `"배송번호"`, `"운송장번호"`, `"송장번호"` | ❌ 불일치 |
| T (idx 19) | `"배송비"` | `"배송비"` | ✅ 일치 |
| AB (idx 27) | `"적용무게(KG)"` | `"무게(kg)"`, `"적용무게"` | ❌ 불일치 |

**파싱 실패 흐름:**

```
parseSheet() 호출
  → headerRow에서 "주문번호1" HEADER_MAP 조회 → undefined
  → h.toLowerCase() = "주문번호1" 조회 → undefined
  → colIdx.order_num = undefined
  → "주문번호 컬럼을 찾을 수 없습니다." 에러 반환
  → 파일 업로드 즉시 실패
```

**실제 엑셀 데이터 샘플 (확인됨):**

```
row2: { order_num: "02020901", tracking: "LV117911905UZ", fee: "13500", weight: "0.488" }
row3: { order_num: "01020802", tracking: "LV117911919UZ", fee: "11500", weight: "0.34"  }
row4: { order_num: "02020804", tracking: "LV117911922UZ", fee: "15500", weight: "0.509" }
```

배송비(`fee`)는 문자열 `"13500"` 형태로 저장됨 → 현재 `toNum()` 함수의 `Number(row[idx])` 변환으로 처리 가능.

### 해결 전략: HEADER_MAP 확장 (최소 변경)

파싱 로직은 이미 올바르게 설계되어 있다. 문제는 오직 `HEADER_MAP`에 Shipter 헤더명이 누락된 것뿐이다.
아래 3개 키를 추가하면 기존 코드 변경 없이 즉시 작동한다.

| 추가할 키 | 매칭 방식 | 대상 열 |
|----------|----------|--------|
| `"주문번호1"` | 직접 매칭 | N열 (idx 13) |
| `"shipter 배송 번호"` | `h.toLowerCase()` 경유 | P열 (idx 15) |
| `"적용무게(kg)"` | `h.toLowerCase()` 경유 | AB열 (idx 27) |

> `parseSheet()` 내부 조회 로직:
> ```typescript
> const key = HEADER_MAP[h] ?? HEADER_MAP[h.toLowerCase()];
> ```
> "SHIPTER 배송 번호".toLowerCase() = "shipter 배송 번호" → 키에 추가하면 자동 매칭됨.
> "적용무게(KG)".toLowerCase() = "적용무게(kg)" → 키에 추가하면 자동 매칭됨.

---

## 2. 코드 스니펫

### `components/delivery-import-button.tsx` — HEADER_MAP 수정

```typescript
// 변경 전
const HEADER_MAP: Record<string, keyof DeliveryImportRow> = {
  "주문번호": "order_num",
  "order_num": "order_num",
  "주문 번호": "order_num",
  "배송비": "shipping_fee",
  "shipping_fee": "shipping_fee",
  "배송 비용": "shipping_fee",
  "적용무게": "applied_weight",
  "applied_weight": "applied_weight",
  "무게": "applied_weight",
  "무게(kg)": "applied_weight",
  "배송번호": "tracking_number",
  "tracking_number": "tracking_number",
  "운송장번호": "tracking_number",
  "송장번호": "tracking_number",
};
```

```typescript
// 변경 후 — Shipter 포맷 헤더명 3개 추가
const HEADER_MAP: Record<string, keyof DeliveryImportRow> = {
  // 주문번호
  "주문번호": "order_num",
  "order_num": "order_num",
  "주문 번호": "order_num",
  "주문번호1": "order_num",           // ← Shipter: N열 "주문번호1"

  // 배송비
  "배송비": "shipping_fee",
  "shipping_fee": "shipping_fee",
  "배송 비용": "shipping_fee",
  // T열 "배송비" 는 기존 키로 이미 매칭됨

  // 적용무게
  "적용무게": "applied_weight",
  "applied_weight": "applied_weight",
  "무게": "applied_weight",
  "무게(kg)": "applied_weight",
  "적용무게(kg)": "applied_weight",   // ← Shipter: AB열 "적용무게(KG)" → toLowerCase 경유

  // 배송번호
  "배송번호": "tracking_number",
  "tracking_number": "tracking_number",
  "운송장번호": "tracking_number",
  "송장번호": "tracking_number",
  "shipter 배송 번호": "tracking_number", // ← Shipter: P열 "SHIPTER 배송 번호" → toLowerCase 경유
};
```

**변경 라인 수: 3줄 추가, 나머지 코드 전혀 건드리지 않음.**

---

## 3. 파일경로

| 작업 | 파일 | 종류 |
|------|------|------|
| HEADER_MAP에 Shipter 헤더 3개 추가 | `components/delivery-import-button.tsx` | 기존 파일 수정 (3줄) |

**수정하지 않는 파일:**
- `lib/actions/delivery-import.ts` — Server Action 로직 변경 없음
- `lib/schema.ts` — OrderRow 타입 변경 없음
- `components/orders-line-items-table.tsx` — UI 변경 없음

---

## 4. 트레이드오프

### ✅ 이 방식의 장점

**최소 변경, 최대 효과**
- 파싱 로직(`parseSheet`)은 건드리지 않음.
- `HEADER_MAP` 3줄 추가만으로 Shipter 포맷 완전 지원.
- 기존에 동작하던 범용 포맷(직접 작성한 엑셀)은 그대로 유지됨.

**toLowerCase 활용으로 대소문자 내성 확보**
- "SHIPTER 배송 번호" → "shipter 배송 번호": 대문자 변형이 와도 동일하게 매칭됨.
- "적용무게(KG)" → "적용무게(kg)": KG/kg/Kg 모두 처리됨.

**"주문번호1" vs "주문번호2" 분리**
- Shipter 엑셀의 N열이 "주문번호1", O열이 "주문번호2"임.
- "주문번호1"만 `order_num`으로 매핑하여 FANKO 주문번호(N열)만 정확히 읽음.
- O열("주문번호2")은 무시됨 — 현재 DB 구조상 필요 없음.

**배송비 문자열 처리 기존 로직으로 해결**
- Shipter T열 배송비: `"13500"` (문자열)
- `toNum()` 함수: `Number("13500")` = `13500` → 정상 처리됨.
- 기존 코드 변경 필요 없음.

### ⚠️ 주의사항 및 한계

**Shipter 헤더명 변경 시 재대응 필요**
- Shipter가 추후 "주문번호1" 을 다른 이름으로 바꾸면 또 다시 실패함.
- 근본적인 해결책은 열 인덱스(N=13, P=15, T=19, AB=27) 기반 파싱이지만,
  그렇게 하면 Shipter 전용 로직이 되어 범용성이 없어짐.
- **현재 규모에서는 HEADER_MAP 확장이 유지보수 면에서 더 적합함.**

**배송비 0원 처리 불가 (기존 설계 한계)**
- `toNum()`: `Number.isFinite(v) && v !== 0` 조건 → 0이면 `null` 반환.
- 배송비가 실제로 0원인 행이 있다면 DB에 `null`로 저장됨.
- 실무상 배송비가 0인 경우는 없으므로 현재는 무방함.

**"주문번호2" (O열) 무시**
- Shipter 일부 건은 O열("주문번호2")에 분할 주문번호가 있을 수 있음.
- 현재 계획은 N열("주문번호1")만 읽음. 복수 주문번호 매핑은 향후 필요 시 별도 구현 필요.

---

## 구현 체크리스트

- [x] `components/delivery-import-button.tsx` HEADER_MAP에 3개 키 추가
- [x] 로컬 빌드 확인 (`npm run build`)
- [ ] `2026_04_10_01_24_59.xlsx` 파일로 실제 업로드 테스트
  - 미리보기 모달: 24건 표시 확인
  - "확인 · 업로드" 후 결과 메시지 `24건 업데이트됨` 확인
  - 주문 목록 테이블에서 배송비/배송번호/적용무게 컬럼 값 반영 확인
- [x] GitHub 푸시 + Vercel 배포
