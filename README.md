<div align="center">
  <img src="public/icons/icon-128.png" width="76" alt="Refont">
  <h1>Refont</h1>
  <p>웹페이지의 본문 글꼴을 원하는 폰트로 바꿔 주는 브라우저 확장프로그램.<br>
  단, 아이콘·수식·바코드·이모지처럼 <b>폰트가 곧 기능</b>인 글꼴은 건드리지 않습니다.</p>
</div>

<p align="center">
  <img src="docs/store-assets/screenshot-1-hero.png" width="640" alt="Refont 미리보기">
</p>

---

## 무엇을 하나요

대부분의 폰트 교체 도구는 페이지의 **모든** 글꼴을 바꿔 버려서 아이콘이 네모(□)로
깨지거나 수식이 망가집니다. Refont는 **본문 글꼴만** 바꾸고 기능성 폰트는 자동으로
감지해 보호합니다.

## 주요 기능

- **기능성 폰트 자동 보호** — 아이콘(Font Awesome, Material Symbols 등), 수식(KaTeX·MathJax·STIX),
  악보(SMuFL·Bravura), 바코드, 딩벳(Wingdings), 이모지, 안티스크래핑 PUA 폰트까지.
  폰트 이름 + 사용자 영역(PUA) 문자 + 아이콘 클래스 힌트를 종합해 판별합니다.
- **원하는 폰트로** — 설치된 폰트(한글 폰트는 한글 이름으로 표시) 또는 웹폰트.
  웹폰트는 Google Fonts CSS 링크, 또는 `.woff2/.ttf/.otf` 직접 URL(백그라운드에서
  받아 `data:` 폰트로 주입 → CSP 엄격 사이트도 동작).
- **코드 글꼴 분리** — 코드/고정폭 영역에만 별도 폰트.
- **세밀한 조정** — 크기 배율, 최소 글자 크기, 굵기(제목 굵기 유지 옵션), 줄간격, 자간,
  가변 폰트 축(`opsz`, `wdth` 등). 편집 중 현재 탭에 실시간 적용.
- **사이트별 제어** — 사이트 제외(블록리스트), 요소별 제외(CSS 선택자),
  단축키 `Alt+Shift+F`로 현재 사이트 토글.
- **사생활 보호** — 계정·서버·추적 없음. 설정은 기기에만 저장. [개인정보처리방침](docs/PRIVACY.md)

크로스 브라우저(Chrome + Firefox), Manifest V3.

## 설치

### 스토어에서 (출시 후)

- Chrome Web Store: _준비 중_
- Firefox Add-ons (AMO): _준비 중_

### 소스에서 직접

```bash
npm ci
npm run build          # dist/chrome 와 dist/firefox 생성
```

- **Chrome:** `chrome://extensions` → 개발자 모드 ON → "압축해제된 확장 프로그램을 로드" → `dist/chrome` 선택
- **Firefox:** `about:debugging#/runtime/this-firefox` → "임시 부가 기능 로드" → `dist/firefox/manifest.json` 선택

## 개발

```bash
npm test               # vitest (jsdom)
npm run build          # 양쪽 타깃 빌드
npm run package        # 스토어용 zip 3종 생성 (dist/)
npm run screenshots    # 스토어 스크린샷 PNG 생성 (docs/store-assets/)
```

빌드는 의존성 없는 도구로만 동작합니다(esbuild 번들 + 순수 Node 패키징/아이콘/스크린샷 스크립트).

## 문서

- [개인정보처리방침](docs/PRIVACY.md)
- [스토어 등록 정보(한국어)](docs/STORE-LISTING.md)
- [AMO 심사자용 빌드 안내](docs/REVIEWERS.md)

## 라이선스

[MIT](LICENSE)
