# 스토어 제출 런북

Chrome Web Store와 Firefox AMO에 Refont를 올리는 순서. 등록 문구는
[STORE-LISTING.md](STORE-LISTING.md)에서 복사해서 씁니다.

> 자동화할 수 없는(계정 생성·결제·폼 입력·검수 제출) 단계는 사람이 직접 해야 합니다.
> 아래는 그 단계들을 빠짐없이 정리한 체크리스트입니다.

---

## 0. 제출 전 준비 (로컬)

```bash
npm ci
npm test            # 전부 통과 확인
npm run package     # dist/ 에 zip 3종 생성
npm run screenshots # docs/store-assets/ 에 PNG 6종 생성 (이미 있으면 생략 가능)
```

생성물:

| 파일 | 용도 |
| --- | --- |
| `dist/refont-chrome-0.1.0.zip` | Chrome Web Store 업로드 |
| `dist/refont-firefox-0.1.0.zip` | Firefox AMO 업로드(빌드 결과물) |
| `dist/refont-source-0.1.0.zip` | Firefox AMO 소스 코드 제출 |
| `docs/store-assets/screenshot-*.png` | 스크린샷 5장 (1280×800) |
| `docs/store-assets/promo-tile-440x280.png` | Chrome 소형 프로모 타일(선택) |

준비물 체크:
- [ ] 아이콘 128×128 (`public/icons/icon-128.png`) — 보유
- [ ] 스크린샷 최소 1장 (Chrome 필수) — 5장 보유
- [ ] 개인정보처리방침 URL (아래 1번) 준비

---

## 1. 개인정보처리방침 호스팅

두 스토어 모두 개인정보처리방침 URL을 요구합니다(자체 호스팅 링크 허용). 셋 중 택1:

- **가장 간단 (추천):** GitHub에 올라간 파일 링크를 그대로 사용
  `https://github.com/jisamcom/refont/blob/master/docs/PRIVACY.md`
- **GitHub Pages:** 저장소 Settings → Pages → 소스 `master`/`docs` 지정 후
  `https://jisamcom.github.io/refont/PRIVACY` 형태 URL 사용
- **별도 호스팅:** 노션/블로그 등에 [PRIVACY.md](PRIVACY.md) 내용을 붙여넣고 그 URL 사용

→ 정한 URL을 [STORE-LISTING.md](STORE-LISTING.md)의 "개인정보처리방침 URL" 자리에 채워 둡니다.

---

## 2. Chrome Web Store

1. **개발자 등록** — https://chrome.google.com/webstore/devconsole
   계정당 **일회성 $5** 등록비. (최초 1회)
2. **새 항목** → `dist/refont-chrome-0.1.0.zip` 업로드.
3. **스토어 등록 정보** 탭 (STORE-LISTING.md → "Chrome Web Store"에서 복사):
   - 요약(132자), 상세 설명
   - 카테고리: 접근성(Accessibility)
   - 언어: 한국어
   - 아이콘: 128×128 (zip에 포함되어 자동 인식되기도 하나, 요청 시 별도 업로드)
   - 스크린샷: `screenshot-1…5` 업로드 (최소 1장)
   - (선택) 소형 프로모 타일 440×280: `promo-tile-440x280.png`
4. **개인정보 보호 관행** 탭:
   - 단일 목적(Single purpose) 문구 입력
   - 권한별 사유: storage / scripting / tabs / host(`<all_urls>`) — STORE-LISTING.md 참고
   - 데이터 수집: 전부 "수집 안 함"
   - 인증 체크박스 3개 모두 체크
   - 개인정보처리방침 URL 입력
5. **검수 제출(Submit for review)**. 보통 수 시간~수 일.

체크리스트:
- [ ] zip 업로드
- [ ] 요약/설명/카테고리/언어
- [ ] 스크린샷 ≥1
- [ ] 단일 목적 + 권한 사유 + 데이터 수집(없음) + 방침 URL
- [ ] 제출

---

## 3. Firefox AMO

1. **계정 등록(무료)** — https://addons.mozilla.org/developers/
2. **Submit a New Add-on** → 배포 방식 "On this site"(목록 등록) 선택.
3. **빌드 결과물 업로드** → `dist/refont-firefox-0.1.0.zip`. 자동 검증 통과 확인.
4. **소스 코드 업로드** — 번들링을 쓰므로 소스 제출이 필수. 메시지가 뜨면
   `dist/refont-source-0.1.0.zip` 업로드. (빌드 재현 안내는 zip 안 `REVIEWERS.md`)
5. **등록 정보** (STORE-LISTING.md → "Firefox AMO"에서 복사):
   - 요약(250자), 상세 설명
   - 카테고리: Appearance
   - 태그, 라이선스: **MIT**
   - 스크린샷 업로드
   - 개인정보처리방침 URL
   - 데이터 동의는 매니페스트의 `data_collection_permissions: ["none"]`로 이미 "없음" 처리됨
6. **제출**. 자동/수동 검수 진행.

체크리스트:
- [ ] 결과물 zip 업로드 + 검증 통과
- [ ] 소스 zip 업로드
- [ ] 요약/설명/카테고리/태그/라이선스
- [ ] 스크린샷, 방침 URL
- [ ] 제출

---

## 4. 업데이트(새 버전) 낼 때

버전 번호는 **세 곳**을 똑같이 올려야 합니다:

- `package.json` → `version`
- `public/manifest.chrome.json` → `version`
- `public/manifest.firefox.json` → `version`

그다음:

```bash
npm test && npm run package
```

새로 만들어진 `dist/refont-*-<새버전>.zip`을 각 스토어 대시보드에서 "새 버전"으로
업로드합니다. (Firefox는 소스 zip도 매번 함께 업로드)
