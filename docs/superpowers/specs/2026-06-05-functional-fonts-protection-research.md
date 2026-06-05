# Functional / "Font = Function" Web-Font PROTECTION DENYLIST — Implementation Reference

> 작성일: 2026-06-05 · 출처: deep-research 하니스 (106 서브에이전트, 109 주장 추출, 25 검증, 24 confirmed / 1 refuted, 24 소스). 종합 단계 출력 크기 한도로 압축된 것을 원본 산출물(`_recovered.txt`, 201KB)에서 재합성함.
>
> Scope: 모든 페이지의 본문 폰트를 강제 교체하는 크롬/파이어폭스 익스텐션에서 **교체하면 안 되는** 폰트(폰트 자체가 의미를 담아 교체 시 렌더링/데이터가 깨지는 것). Confidence: **[HIGH]** = 검증 투표/벤더 문서 확인, **[MED]** = 정황상 타당하나 표본 미검증, **[LOW]** = 추정.

---

## 1. 카테고리별 상세

### 1.1 Icon fonts
**원리/왜 깨지나:** 아이콘 폰트는 글리프를 PUA 코드포인트(`:before/:after content` 주입; FontAwesome, codicon) 또는 OpenType **리거처**(Material Icons는 "menu" 텍스트를 햄버거 글리프로 변환)에 매핑. 본문 폰트 강제 시 PUA는 두부(□)로, 리거처 소스("menu","search")는 일반 단어로 렌더됨.

| 식별자 (font-family substring, 소문자) | Conf | Source |
|---|---|---|
| `font awesome` ("FontAwesome","Font Awesome 5/6/7 Free/Brands/Pro/Duotone/Sharp/Kit") | HIGH | docs.fontawesome.com |
| `material icons` (+Outlined/Round/Sharp/Two Tone) | HIGH | developers.google.com/fonts/docs/material_icons |
| `material symbols` (+Outlined/Rounded/Sharp) | HIGH | developers.google.com/fonts/docs/material_symbols |
| `codicon` | HIGH | github.com/microsoft/vscode-codicons |
| `icomoon`, `katfont`, `pcgamer`, `etmodules`, `etbuilder`, `cloudapp` | HIGH | 실제 배포 익스텐션 regex (github.com/sysop84/force-my-browser-fonts) |
| `ionicons`, `bootstrap-icons`/`glyphicon(s)`, `octicons`, `phosphor`, `tabler`, `dashicons`, `remixicon`, `typicons`, `boxicons`, `weather icons`, `segoe fluent icons`, `segoe mdl2 assets`, `iconfont` | MED | github.com/idleberg/vscode-icon-fonts (24-lib map) |
| `lucide`, `feather` | LOW* | 주로 SVG 라이브러리. `feather`는 오탐 위험 (§3) |

- **PUA:** BMP PUA U+E000–U+F8FF (codicon U+EA60–U+F101; FA `\f0xx`/`\e0xx`)
- **리거처:** Material Icons/Symbols = YES(PUA 아님). FontAwesome/codicon = NO(PUA)
- **클래스 힌트(약한 2차 신호):** `fa fas far fab fal fad fa-solid fa-regular fa-brands`, `material-icons`, `material-symbols-*`, `codicon`, `glyphicon`, `octicon`, `mdi`, `ri`, `bi`, `ti`, `ph`, `typcn`, `dashicons`, `wi`, `bx` …

> **핵심 주의 (검증 REFUTED, 4표):** Font Awesome 클래스 prefix(`fa/fas/far/fab/fal/fad`)는 **신뢰할 수 있는 자동 감지 신호가 아님.** 이유: FA6/7은 long-form(`fa-solid`)로 전환, `fa-`가 임의 사이트 CSS(`fa-spin`,`fa-3x`)와 충돌, SVG+JS 모드는 `<i>`를 inline `<svg>`로 교체(폰트 자체가 없음), bare `fa`/`far` 오탐. → **computed font-family 이름으로 감지**, 클래스는 약한 2차 힌트로만.

---

### 1.2 Math typesetting
**원리/왜 깨지나:** 수식 엔진은 글리프별 metric·bounding box·stretchy 조립 데이터를 특정 폰트에 하드코딩. 본문 폰트로 바꾸면 첨자 위치/근호·괄호 조립이 무너짐.

| 식별자 | Conf | Source |
|---|---|---|
| `katex_` (12 family: KaTeX_AMS, _Caligraphic, _Fraktur, _Main, _Math, _SansSerif, _Script, _Size1~4, _Typewriter) | HIGH | github.com/KaTeX/katex-fonts/blob/master/fonts.less |
| `mjxtex` (MJXTEX, -B, -I, -C, -S1~S4), `mjxzero` | HIGH | github.com/mathjax/MathJax-src tex.ts |
| `mathjax_` (v2/v3 CSS: MathJax_Math/Main/AMS/Size1-4/Caligraphic) | HIGH | docs.mathjax.org/en/latest/output/fonts.html |
| `stix two math`, `stix two text`, `stixgeneral` | MED | en.wikipedia.org/wiki/STIX_Fonts_project |
| `latin modern math`, `xits`, `asana math` | MED | docs.mathjax.org |

> **주의:** MathJax를 **패키지명**(`mathjax-tex`,`mathjax-newcm`,`mathjax-stix2`)으로 denylist 하지 말 것 — 이는 npm/config 식별자이지 DOM에 노출되는 CSS font-family가 아님(검증 REFUTED). `MJXTEX`/`MJXZERO` family 또는 `mjx-container` 요소로 감지.

- **DOM 힌트:** MathJax = `<mjx-container>`, KaTeX = `.katex` span
- **PUA/리거처:** KaTeX/MathJax는 metric-keyed 실폰트(PUA·리거처 의존 없음). STIX/LM Math는 OpenType MATH 테이블.

---

### 1.3 Music notation (SMuFL)
**원리/왜 깨지나:** SMuFL은 ~3000 음악 기호를 **PUA U+E000+**에 배치. 비-SMuFL 폰트로 바꾸면 음표·음자리표가 두부가 됨.

| 식별자 | Conf |
|---|---|
| `bravura`, `bravura text` | HIGH |
| `petaluma`, `leland`, `gonville` | HIGH |
| `gootville`, `emmentaler`, `sebastian`, `finale maestro` | MED |

- **Unicode/PUA:** PUA U+E000+; Unicode Musical Symbols 블록 U+1D100–U+1D1FF
- **참고:** VexFlow v1–v4는 음악을 inline SVG `<path>`로 렌더(font-family 미설정 → 영향 없음). VexFlow 5부터 SMuFL OTF/WOFF 직접 로드 → 위 family명 적용. `maestro` 단독은 오탐 경미.

---

### 1.4 Barcode / QR
**원리/왜 깨지나:** 문자→바/스페이스 1:1 인코딩. 폰트를 바꾸면 바가 다시 글자로 돌아가 **스캔 불가**.

| 식별자 | Conf |
|---|---|
| `libre barcode` ("Libre Barcode 39/128/EAN13 (Text/Extended)") | HIGH |
| `code128`, `code 128`, `code39`, `code 39`, `code 3 of 9`, `barcode`, `idautomation` | MED |

- **PUA:** 없음(ASCII). 일부 ligature(start/stop/checksum). 2차 신호: Google Fonts `@font-face` URL `...Libre+Barcode`.

---

### 1.5 Dingbat / Symbol
**원리/왜 깨지나:** ASCII(0x20–0xFF)에 임의 기호 글리프를 덮어쓰고 Mac-Roman/MS-Symbol cmap만 제공(실 Unicode 없음). 브라우저는 U+0020–U+00FF를 PUA **U+F020–U+F0FF**로 매핑. 폰트 교체 시 기호가 원래 글자("J" 등)로 보임.

| 식별자 | Conf |
|---|---|
| `wingdings`, `wingdings 2`, `wingdings 3` | HIGH |
| `webdings`, `marlett` | HIGH |
| `symbol` (Adobe/MS "Symbol" — **위험한 generic substring, §3**) | HIGH(폰트)/오탐(substring) |
| `zapf dingbats`, `dingbats` | MED |

- **Unicode/PUA:** **U+F020–U+F0FF**가 레거시 심볼 감지 핵심 범위.

---

### 1.6 7-segment / Display
**원리/왜 깨지나:** LCD/LED 흉내(콜론 폭=스페이스, 마침표 advance=0, "all-off" 글리프를 `!`에 매핑). 다른 폰트로 바꾸면 표시기가 어긋난 일반 텍스트가 됨.

| 식별자 | Conf |
|---|---|
| `dseg` ("DSEG7 Classic/Modern","DSEG14 …","DSEGWeather") | HIGH |
| `7 segment`, `seven segment`, `14 segment`, `nixie` | MED/LOW |

- `lcd`/`segment`/`display` 단독은 너무 generic → substring 금지. `dseg` prefix만.

---

### 1.7 Emoji — (skip이 아니라 fallback로 보존)
**핵심:** 이모지는 실제 Unicode 코드포인트(U+1F600 등)라 **폰트 fallback으로 생존**. 본문을 비-이모지 폰트로 바꿔도 브라우저가 시스템 컬러 이모지 폰트로 fallback. → **요소를 skip하지 말고**, 교체 폰트 스택 **끝에 이모지 폰트를 append**해서 fallback 유지. 단일 폰트 `!important`로 fallback을 죽이지 말 것.

권장 스택: `"<UserFont>", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`

식별자(스택 유지용): `apple color emoji`[MED], `segoe ui emoji`[MED], `noto color emoji`[MED], `noto emoji`/`twemoji`/`joypixels`[LOW]

---

### 1.8 Anti-scraping / Obfuscation (데이터 무결성)
**원리/왜 깨지나:** cmap을 **PUA(U+E000–U+F8FF)** 또는 치환 위치로 remap, HTML엔 스크램블된 코드포인트가 들어가 해당 폰트에서만 올바른 값으로 렌더(매핑은 페이지 로드마다 재생성). 폰트 교체 시 raw 잘못된 숫자/문자 노출.

- **Maoyan(猫眼):** family `stonefont`, WOFF, 숫자→PUA(`&#xea90;`), 동적
- **inter-obfuscated:** 글리프 테이블 치환(0↔5,1↔6…) — DOM "7579" → 렌더 "2024"
- 관련: Dianping(大众点评), `ma-pony/font-obfuscator`

**감지(정적 이름 목록 X — 랜덤/해시 family명):**
1. inline `@font-face` + 랜덤/해시 family + WOFF, 페이지별 로드
2. 숫자/데이터 맥락에서 텍스트가 **PUA(U+E000–U+F8FF)** 코드포인트
3. (강력) DOM `textContent` vs canvas 렌더 불일치 비교

이름 substring(약함): `stonefont`[HIGH/사이트별]. 일반적으로 **PUA 콘텐츠 휴리스틱에 의존.**

---

### 1.9 Legacy / minority-script PUA
**원리/왜 깨지나:** SIL 등이 소수/레거시 문자를 폰트 고유 규약으로 PUA에 인코딩(보편 Unicode 아님). 폰트 교체 시 언어 데이터가 두부.

식별자: `doulos`[MED], `charis sil`[MED], `andika`[MED], `gentium`[MED], `apparatus sil`[LOW]
- **PUA:** BMP PUA + 보충면 15/16. `charis`/`gentium`은 일반 텍스트 폰트이기도 함 → **이름 + PUA 콘텐츠** 조합 권장.

---

### 1.10 Blank / Sentinel
**원리/왜 깨지나:** Adobe Blank은 ~111만 코드포인트를 폭 0·invisible 글리프로 매핑. 웹폰트 로드 전 fallback 억제·폭 측정 로더의 "빈" 비교 폰트로 사용. 교체 시 **숨긴 텍스트 노출** 또는 측정 로직 파손.

식별자: `adobe blank`, `adobeblank` ("Adobe Blank 2") [HIGH] — **이름으로 감지**(거의 전 범위 커버라 range 무의미).

---

### 1.11 Chess/Game·Braille (덤프에 미발견 — 참고)
체스/게임 폰트 구체 식별자는 덤프에 없음[LOW]: 후보 `chess`,`merida`,`playing card`,`mahjong`,`domino`(코로보레이션 후 추가). Braille(U+2800–U+28FF)는 실 Unicode라 fallback 생존 → 조치 불필요.

---

## 2. Master Denylist (paste-ready JS)

```js
// COMPUTED font-family 문자열에 대해 소문자/대소문자 무시 substring 매칭.
const FONT_FAMILY_DENYLIST = [
  // Icon (HIGH)
  "font awesome","fontawesome","material icons","material symbols","codicon",
  "icomoon","katfont","pcgamer","etmodules","etbuilder","cloudapp",
  // Icon (MED)
  "ionicons","bootstrap-icons","glyphicons","glyphicon","octicons",
  "phosphor","tabler","dashicons","remixicon","typicons","boxicons",
  "weather icons","segoe fluent icons","segoe mdl2 assets","iconfont",
  // Math (HIGH) — prefix via substring
  "katex_","mjxtex","mjxzero","mathjax_",
  // Math (MED)
  "stix two math","stix two text","stixgeneral","latin modern math","xits","asana math",
  // Music / SMuFL
  "bravura","petaluma","leland","gonville","gootville","emmentaler","sebastian","finale maestro",
  // Barcode
  "libre barcode","code128","code 128","code39","code 39","code 3 of 9","barcode","idautomation",
  // Dingbat / Symbol
  "wingdings","webdings","marlett","zapf dingbats","dingbats",
  // Display / 7-seg
  "dseg","7 segment","seven segment","14 segment","nixie",
  // Anti-scraping (사이트별; PUA 휴리스틱 우선)
  "stonefont",
  // Legacy / minority PUA
  "doulos","charis sil","andika","gentium",
  // Blank / sentinel
  "adobe blank","adobeblank",
];

// 위험/generic — 활성화 전 검토 (§3). exact-token 매칭만 권장.
const FONT_FAMILY_DENYLIST_RISKY = [ "symbol", "maestro" ];
```

```js
// 약한 2차 힌트. 단독 사용 금지 — 짧은 텍스트(1~3자) OR PUA 콘텐츠와 결합 필수.
const ICON_CLASS_HINT_RE =
  /\b(fa|fas|far|fab|fal|fad|fa-solid|fa-regular|fa-brands|fa-light|fa-duotone|fa-thin|fa-sharp|material-icons|material-symbols(?:-outlined|-rounded|-sharp)?|glyphicon|codicon|octicon|mdi|zmdi|ri|bi|ti|ph|typcn|dashicons|wi|bx|oi|el|ai|icon|iconfont)\b/i;
```

```js
const PUA_RANGES = [
  { name: "BMP PUA",             start: 0xE000,   end: 0xF8FF   },
  { name: "Supplementary PUA-A", start: 0xF0000,  end: 0xFFFFD  },
  { name: "Supplementary PUA-B", start: 0x100000, end: 0x10FFFD },
];
// 음악 콘텐츠 신호(PUA 아님): Unicode Musical Symbols U+1D100–U+1D1FF
const MUSICAL_SYMBOLS_BLOCK = { start: 0x1D100, end: 0x1D1FF };
```

---

## 3. False-Positive 경고

- **`"symbol"` substring**: 위험. "Symbol"/"Symbola"/"SymbolMT" 외 일반 텍스트 폰트도 매칭. → **exact whole-token**(`=== "symbol"`)로만.
- **`"feather"`/`"lucide"`**: 주로 SVG. 웹폰트 빌드 드묾 → substring denylist에서 제외/주시.
- **`"maestro"` 단독**: "Maestro"/"November"는 실 단어/브랜드 → `finale maestro`/`november2`만.
- **`"lcd"`/`"segment"`/`"display"`**: 너무 generic → 금지. `dseg`만.
- **`charis`/`gentium`/`doulos`**: 일반 Latin 텍스트 폰트이기도 함 → **이름 + PUA 콘텐츠** 결합.
- **Emoji**: skip 금지. fallback 스택 끝에 append.
- **MathJax 패키지명**: computed family와 절대 매칭 안 됨 → `MJXTEX`/`mjx-container` 사용.

---

## 4. 감지 알고리즘 (요소/텍스트노드별, 첫 SKIP에서 중단)

1. **Computed font-family 이름 매칭 (1순위·최고 신뢰).** 요소(및 `::before/::after`)의 computed `font-family`를 소문자화해 `FONT_FAMILY_DENYLIST` substring + risky exact-token 검사. 매칭 → **SKIP**.
2. **PUA/기능 콘텐츠 검사 (이름 모르는/난독화 폰트 포착).** 노드 텍스트에 `PUA_RANGES`(U+E000–F8FF, U+F0000–FFFFD, U+100000–10FFFD) 또는 레거시 심볼 U+F020–F0FF, 음악 U+1D100–1D1FF 코드포인트가 상당 비율 → **SKIP**. (Maoyan류 랜덤 family명에 대한 유일 방어; 데이터 필드는 canvas 렌더 비교 옵션)
3. **클래스 힌트 + 짧은/PUA 텍스트 (약한 3차·단독 금지).** `ICON_CLASS_HINT_RE` 매칭 AND 텍스트 ≤~3자 또는 리거처 단어/PUA → **SKIP**. (FA 클래스 prefix REFUTED라 짧은텍스트 공동조건 필수)
4. **그 외 → REPLACE.** 사용자 폰트 적용 + 스택 끝에 이모지 폰트·generic fallback append.

**신뢰도:** 1~2단계가 HIGH로 의사결정 주도, 3단계는 MED 백스톱. 클래스 prefix보다 family명 + PUA 콘텐츠 우선.
