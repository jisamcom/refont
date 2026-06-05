# 폰트 교체 익스텐션 — 설계 문서

- **작성일:** 2026-06-05
- **상태:** 승인됨 (구현 계획 작성 대기)
- **대상:** Chrome(+Chromium 계열) / Firefox 동시 지원

---

## 1. 개요 & 목표

모든 웹페이지의 본문 폰트를 사용자가 고른 폰트로 교체하되, **아이콘 폰트는 절대 건드리지 않는** 크로스브라우저 확장 프로그램.

**우선순위가 매겨진 목표**
1. **아이콘 절대 안 깨짐** (최우선) — Font Awesome, Material Icons 등 아이콘 폰트는 그대로 둔다.
2. **빠르고 동적 페이지(SPA)에서도 안정적**으로 동작.
3. 사용자가 폰트·크기·두께·간격을 세밀하게 제어.
4. 크롬/파폭 동작 동일성.

**해결하려는 문제**
기존 폰트 익스텐션들은 `* { font-family: X !important }`를 무차별 적용해 아이콘 폰트의 글리프 매핑(PUA 코드포인트 / 리거처 / `::before content`)을 깨뜨린다. 결과적으로 아이콘이 두부(네모)나 엉뚱한 글자로 표시된다. 이 익스텐션은 **요소별로 아이콘 폰트 여부를 판별해 선택적으로 건너뛴다.**

---

## 2. 아키텍처 (Manifest V3, 단일 코드베이스)

```
manifest.json          # MV3 + browser_specific_settings.gecko (파폭)
src/
  background.js        # service worker: 설정 저장, 웹폰트 fetch→dataURL, 토글/단축키/뱃지
  content.js           # document_start: CSS 주입 + JS 감지 패스 + MutationObserver
  options.html / .js   # 전체 설정 UI
  popup.html / .js     # 현재 사이트 빠른 on/off + 빠른 폰트 전환
  lib/
    font-detect.js     # canvas 폭 측정으로 설치 폰트 감지
    icon-detect.js     # 아이콘 폰트 판별 (denylist + 휴리스틱 + PUA)
    engine.js          # CSS 빌드 / 주입 / skip 표시
    storage.js         # 설정 스키마, 기본값, get/set
    messaging.js       # 타입드 메시지 패싱
```

**크로스브라우저 처리**
- `webextension-polyfill`로 `browser.*` Promise API를 양 브라우저 통일.
- Firefox는 `browser_specific_settings.gecko.id` 명시. MV3 background를 양쪽 호환 형태로 작성.
- 빌드 단계(esbuild 등)로 `dist/chrome`, `dist/firefox`에 각 매니페스트로 번들 출력.

**컴포넌트 책임**
- **content script**: 현재 호스트가 블록리스트인지 확인 → 비활성이면 아무것도 안 함. 활성이면 ① 베이스 CSS를 **user-origin**으로 주입 ② JS 아이콘 감지 패스 실행 ③ MutationObserver로 동적 노드 대응.
- **background**: `storage`에서 설정 제공, 웹폰트 파일을 fetch해 base64 data URL로 변환(CSP 우회), 툴바 클릭/단축키/컨텍스트 메뉴 처리, 탭 뱃지 갱신.
- **options/popup**: 설정 편집 및 즉시 적용 메시지 전송.

---

## 3. 폰트 소스

### 3.1 시스템 설치 폰트
- 파이어폭스엔 시스템 폰트 열거 API가 없으므로 **canvas 폭 측정 기반 감지**를 사용한다.
- 내장 후보 폰트 목록(한/영, OS별 흔한 폰트 수백 개)을 기준 폰트(`monospace`/`serif`)와 폭 비교 → 설치된 것만 드롭다운에 표시.
- + **직접 입력란**(목록에 없는 폰트명 타이핑) + **실시간 미리보기**.
- 권한 불필요, 양 브라우저 동일 동작.

### 3.2 웹폰트 URL
- **CSS/구글폰트 링크** (예: `https://fonts.googleapis.com/css2?family=Pretendard`): `@import` 또는 `<link>` 주입.
- **직접 폰트 파일 URL** (`.woff2/.ttf/.otf`): `@font-face`로 등록, 사용자가 패밀리명 지정.
- **CSP 우회 전략(기본):** background 스크립트에서 폰트 파일을 fetch → base64 **data URL**로 변환 → `@font-face { src: url(data:...) }` 주입. 페이지 CSP는 background fetch에 적용되지 않으므로 CSP가 엄격한 사이트에서도 동작.
- 실패(404/CORS/네트워크) 시 폰트 스택의 다음 후보로 폴백 + popup/options에 경고 표시.

---

## 4. 아이콘 안전 (핵심 메커니즘)

요소가 아래 조건 중 **하나라도** 해당하면 폰트 교체에서 제외한다. 제외 요소엔 `data-fontchanger-skip` 속성을 달고, 주입 CSS가 해당 요소를 `font-family: revert !important`로 되돌린다.

**자동 감지 계층**
1. **아이콘 폰트 패밀리 denylist** — 요소의 computed `font-family`가 다음 중 하나에 매칭:
   - Font Awesome (4/5/6, Free/Brands/Pro), Material Icons, Material Symbols (Outlined/Rounded/Sharp), Ionicons, Glyphicons Halflings, Bootstrap Icons, Remix Icon, Tabler Icons, Lucide, Feather, Octicons, Phosphor, Foundation Icons, Typicons, Weather Icons, Dashicons(WordPress), Segoe MDL2/Fluent Assets, VS Code codicon 등.
2. **아이콘 클래스 패턴 힌트** — 정규식: `(^|[\s_-])(icon|fa|fas|far|fab|fal|fad|material-icons|material-symbols|glyphicon|mi|ms|ti|bi|ri|lucide|ph|octicon|codicon)([\s_-]|$)` (단독 근거가 아닌 보조 신호).
3. **PUA 내용 감지** — 요소(및 `::before`/`::after`)의 텍스트가 전부 Private Use Area 코드포인트(U+E000–U+F8FF, U+F0000+, U+100000+).
4. **생성 콘텐츠 보호** — `::before`/`::after`의 font-family는 **아예 손대지 않는다.**

**수동 제외 (자동이 놓친 경우)**
- 사용자가 **폰트 패밀리명 / CSS 선택자 / 사이트** 단위로 제외 항목을 추가할 수 있다.
- denylist에 없는 커스텀 아이콘 폰트가 깨지면 사용자가 직접 등록 → 같은 `data-fontchanger-skip` 메커니즘으로 처리.
- (향후) 사용자가 추가한 denylist 항목을 기본 denylist 업데이트로 제안받는 흐름 고려.

---

## 5. 텍스트 처리 규칙

| 대상 | 처리 |
|------|------|
| 본문 텍스트 | 선택한 본문 폰트로 교체. 폰트 스택 맨 앞에 삽입 + user-origin `!important`. |
| 코드/고정폭 | **별도 monospace 폰트 설정.** `code`, `pre`, `kbd`, `samp`, computed monospace 요소 대상. |
| 크기(scale) | 기존 크기 × **배율**(예 ×1.1)로 상대 위계 유지. + 선택적 **최소 크기 하한**(예 14px 미만은 14px로). |
| 두께(weight) | 기본 weight 지정 시, computed `font-weight`가 normal(≈400)인 요소에만 적용하고 더 굵은(bold 등) 요소는 그대로 둬서 **볼드 위계 보존**. 이 조건 판단은 JS 감지 패스가 수행하고 해당 요소에만 weight를 부여. (`weight: 0`이면 두께 미변경) |
| 줄간격·자간 | line-height / letter-spacing 조절(선택). |

---

## 6. 사이트 제어

- **기본: 모든 사이트 ON** + **블록리스트**로 특정 사이트 비활성 (예: `docs.google.com/spreadsheets`).
- 블록리스트는 도메인 / 서브도메인 / 경로 패턴 지원.
- popup 버튼 또는 키보드 단축키로 현재 사이트 즉석 토글(블록리스트 자동 추가/제거).

---

## 7. 추가 기능

- **실시간 미리보기** — 설정 변경 시 reload 없이 활성 탭에 즉시 재적용(메시지 패싱).
- **설정 가져오기/내보내기** — 전체 설정을 JSON으로 백업/복원·공유.
- **빠른 토글** — 툴바 버튼 + 키보드 단축키(`commands` API)로 현재 사이트 on/off.

---

## 8. 데이터 스키마 (`browser.storage.local`)

```js
{
  enabled: true,
  bodyFont: {
    source: "system" | "weburl",
    name: "Pretendard",          // 패밀리명
    url: null,                    // weburl일 때
    urlType: "css" | "file"
  },
  codeFont: { /* bodyFont와 동일 구조 */ } | null,
  scale: 1.0,                     // 배율
  minSize: 0,                     // px, 0 = off
  weight: 0,                      // 0 = 원본 유지, 또는 기본 weight
  preserveBold: true,
  lineHeight: 0,                  // 0 = off
  letterSpacing: 0,              // 0 = off
  blocklist: ["docs.google.com/spreadsheets"],
  manualExclusions: { "<host>": ["<selector | fontFamily>"] },
  iconDenylistExtra: []           // 사용자 추가 아이콘 폰트
}
```

설정 스키마는 버전 필드를 두고 마이그레이션 함수로 호환 유지.

---

## 9. 폰트 교체 엔진 (하이브리드)

1. **CSS 주입 (user-origin)** — `chrome.scripting.insertCSS({origin:'USER'})` / 파폭 `browser.tabs.insertCSS({cssOrigin:'user'})`.
   - user-origin `!important`는 사이트의 author `!important`를 캐스케이드에서 **이긴다** → 익스텐션이 닿을 수 있는 최고 우선순위.
   - 본문/코드 폰트 스택, 크기 배율, 두께, 줄간격·자간, 그리고 `[data-fontchanger-skip]` revert 규칙을 한 번에 정의.
   - CSS이므로 동적으로 새로 생긴 요소도 자동 적용(SPA 강함).
2. **JS 감지 패스** — 초기 1회 + MutationObserver. computed style / 내용을 검사해 아이콘 요소에 `data-fontchanger-skip` 부여(섹션 4). 수동 제외도 여기서 적용.
3. **두 레이어 조합** — CSS의 속도·동적성 + JS의 per-element 아이콘 정밀 감지.

> **렌더러 레벨 치환을 쓰지 않는 이유:** `chrome.fontSettings`는 (a) 페이지가 폰트를 명시하지 않은 경우만 적용돼 현대 사이트 대부분에서 무력하고 (b) 크롬 전용이라 크로스브라우저가 깨지며 (c) 일괄 치환이라 아이콘을 더 깨뜨린다. 아이콘 선택적 제외는 per-element 검사가 필요하고 이는 DOM/CSSOM 레이어에만 존재한다. 따라서 CSS/JS가 이 요구사항엔 올바른 레이어다.

---

## 10. 에러 처리

- **웹폰트 로드 실패** → 폰트 스택 다음 후보로 폴백 + 경고 표시, 페이지는 깨지지 않음.
- **CSP 차단** → background fetch + data URL 주입으로 우회.
- **감지 오탐**(실제 텍스트를 아이콘으로 오인) → 사용자가 수동으로 제외 해제, 드묾.
- **사이트의 공격적 `!important`** → user-origin `!important` + 높은 특이성으로 우선.
- **storage 용량** → 웹폰트 바이트는 저장하지 않고 런타임에 fetch/캐시.

---

## 11. 테스트 전략

**유닛 테스트 (순수 모듈, vitest 등)**
- `icon-detect`: PUA 코드포인트 판별, denylist 매칭, 클래스 패턴.
- `font-detect`: canvas 측정 로직(설치/미설치 구분).
- `storage`: 스키마 기본값, 마이그레이션.
- `engine`: CSS 빌더 출력 검증.

**수동/통합 테스트 매트릭스**
- Font Awesome 사이트 (의사요소 아이콘)
- Material Icons 사이트 (리거처 아이콘)
- Glyphicons 사이트
- PUA 기반 아이콘 사이트 (예: Claude 사이드바)
- Google Sheets (블록리스트 동작)
- CSP 엄격 사이트 (웹폰트 data URL 우회)
- SPA (동적 콘텐츠 MutationObserver 대응)

---

## 12. 범위 제외 (YAGNI)

- 사이트별 전체 프로필(사이트마다 다른 폰트 세트) — 우선 on/off만.
- 색상/대비/테마 변경 — 폰트 전용.
- 난독증 프리셋 — 미선택.
- 브라우저 sync 외 클라우드 동기화.
