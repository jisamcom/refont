// src/lib/i18n.js
// In-app UI string dictionary. NOT native _locales — the UI language is a stored
// setting that can be switched at runtime, which chrome.i18n cannot do. Every
// user-facing settings string lives here for both locales. `{name}` placeholders
// are filled by t(key, vars). Keys are dotted and grouped by UI area.
export const LOCALES = ['ko', 'en'];

export const messages = {
  ko: {
    'toggle.on': '이 사이트 켜짐',
    'toggle.off': '이 사이트 꺼짐',
    'toggle.onAll': '전체 켜짐',
    'toggle.offAll': '전체 꺼짐',
    'src.system': '시스템 폰트',
    'src.weburl': '웹폰트 URL',
    'src.fontLabel': '폰트 · 검색하거나 직접 입력',
    'src.loadLocal': '설치된 폰트 정확히 불러오기',
    'web.css': 'CSS / 구글폰트 링크',
    'web.file': '폰트 파일(.woff2)',
    'web.familyLabel': '패밀리명',
    'web.familyPlaceholder': '예: Pretendard',
    'web.optional': '레이아웃 시프트 최소화 (font-display: optional)',
    'size.presetA11y': '읽기 좋게 (접근성)',
    'size.presetHint': '최소 크기·줄간격·자간을 한 번에 (한글 포함)',
    'metric.scale': '크기 배율',
    'metric.min': '최소 크기',
    'metric.lineHeight': '줄간격',
    'metric.letterSpacing': '자간',
    'metric.wordSpacing': '어절 간격',
    'metric.weight': '두께',
    'metric.width': '너비',
    'metric.off': '끔',
    'metric.original': '원본',
    'opsz.off': 'opsz 끔',
    'check.preserveBold': '볼드 위계 보존',
    'check.fine': '미세조정 (variable)',
    'check.optical': '광학 크기 자동',
    'axes.summary': '추가 가변 축 (variable axes)',
    'axes.placeholder': '예: slnt -6, ital 1, GRAD 50',
    'axes.hint': 'tag value 쌍을 쉼표로. 두께·너비·광학 크기는 위 컨트롤로 조절하세요. 등록 축은 표준 속성으로, 커스텀 축(대문자)은 font-variation-settings로 적용됩니다.',
    'code.hint': '코드·고정폭 전용',
    'code.enable': '코드/고정폭에 별도 폰트 사용',
    'scope.title': '이 사이트 제외',
    'scope.addHost': '+ 추가',
    'scope.blocklistLabel': '블록리스트 (한 줄에 하나)',
    'scope.advSummary': '고급: 이 사이트의 특정 요소 제외 (CSS 선택자)',
    'scope.selPlaceholder': '한 줄에 하나 — 예: .sidebar, code.hljs, [data-no-font]',
    'scope.selPopupNote': '팝업에서 사이트별로 설정하세요.',
    'scope.allowlistSummary': '항상 켤 사이트 (차단 규칙 예외)',
    'scope.allowlistPlaceholder': '한 줄에 하나 — 상위/경로 규칙으로 차단돼도 이 호스트는 켜짐',
    'scope.hostNone': '현재 사이트 없음 — 팝업에서 사이트별로 설정',
    'scope.hostAdded': '✓ 추가됨',
    'protect.title': '보호 폰트',
    'protect.inUse': '이 페이지에서 사용 중',
    'protect.summary': '수동 보호 목록',
    'protect.placeholder': 'family명 일부 — 자동 감지가 놓친 아이콘/기능성 폰트',
    'protect.addTitle': '보호 목록에 추가',
    'pageFonts.popupHint': '팝업에서 페이지별로 확인',
    'pageFonts.none': '이 페이지에서 감지된 폰트 없음',
    'tag.functional': '기능성',
    'tag.body': '본문',
    'footer.reset': '기본값으로 초기화',
    'footer.resetConfirm': '한번 더 눌러 초기화',
    'action.save': '저장',
    'action.saved': '✓ 저장됨',
    'action.saveFail': '저장 실패',
    'action.export': '내보내기',
    'action.import': '가져오기',
    'action.importInvalid': '잘못된 파일',
    'action.fullTitle': '전체 화면 옵션 탭으로 열기',
    'loadLocal.added': '✓ {n}개 추가됨',
    'loadLocal.denied': '권한 거부됨',
    'lang.label': '언어',
    'lang.auto': '자동',
    'lang.ko': '한국어',
    'lang.en': 'English',
  },
  en: {
    'toggle.on': 'On for this site',
    'toggle.off': 'Off for this site',
    'toggle.onAll': 'On everywhere',
    'toggle.offAll': 'Off everywhere',
    'src.system': 'System font',
    'src.weburl': 'Web font URL',
    'src.fontLabel': 'Font · search or type',
    'src.loadLocal': 'Load exact installed fonts',
    'web.css': 'CSS / Google Fonts link',
    'web.file': 'Font file (.woff2)',
    'web.familyLabel': 'Family name',
    'web.familyPlaceholder': 'e.g. Pretendard',
    'web.optional': 'Minimize layout shift (font-display: optional)',
    'size.presetA11y': 'Easy reading (accessibility)',
    'size.presetHint': 'Min size, line height & letter spacing at once (Korean-friendly)',
    'metric.scale': 'Size scale',
    'metric.min': 'Min size',
    'metric.lineHeight': 'Line height',
    'metric.letterSpacing': 'Letter spacing',
    'metric.wordSpacing': 'Word spacing',
    'metric.weight': 'Weight',
    'metric.width': 'Width',
    'metric.off': 'Off',
    'metric.original': 'Original',
    'opsz.off': 'opsz off',
    'check.preserveBold': 'Preserve bold hierarchy',
    'check.fine': 'Fine-tune (variable)',
    'check.optical': 'Optical sizing auto',
    'axes.summary': 'Extra variable axes',
    'axes.placeholder': 'e.g. slnt -6, ital 1, GRAD 50',
    'axes.hint': 'Comma-separated tag value pairs. Adjust weight, width and optical size with the controls above. Registered axes apply as standard properties; custom axes (uppercase) via font-variation-settings.',
    'code.hint': 'Code / monospace only',
    'code.enable': 'Use a separate font for code/monospace',
    'scope.title': 'Exclude this site',
    'scope.addHost': '+ Add',
    'scope.blocklistLabel': 'Blocklist (one per line)',
    'scope.advSummary': 'Advanced: exclude specific elements on this site (CSS selectors)',
    'scope.selPlaceholder': 'One per line — e.g. .sidebar, code.hljs, [data-no-font]',
    'scope.selPopupNote': 'Set per-site from the popup.',
    'scope.allowlistSummary': 'Always-on sites (block-rule exceptions)',
    'scope.allowlistPlaceholder': 'One per line — kept on even if a broader rule blocks it',
    'scope.hostNone': 'No current site — set per-site from the popup',
    'scope.hostAdded': '✓ Added',
    'protect.title': 'Protected fonts',
    'protect.inUse': 'In use on this page',
    'protect.summary': 'Manual protection list',
    'protect.placeholder': 'Part of a family name — icon/functional fonts auto-detection missed',
    'protect.addTitle': 'Add to protection list',
    'pageFonts.popupHint': 'Check per-page from the popup',
    'pageFonts.none': 'No fonts detected on this page',
    'tag.functional': 'Functional',
    'tag.body': 'Body',
    'footer.reset': 'Reset to defaults',
    'footer.resetConfirm': 'Press again to reset',
    'action.save': 'Save',
    'action.saved': '✓ Saved',
    'action.saveFail': 'Save failed',
    'action.export': 'Export',
    'action.import': 'Import',
    'action.importInvalid': 'Invalid file',
    'action.fullTitle': 'Open in full-screen options tab',
    'loadLocal.added': '✓ {n} added',
    'loadLocal.denied': 'Permission denied',
    'lang.label': 'Language',
    'lang.auto': 'Auto',
    'lang.ko': '한국어',
    'lang.en': 'English',
  },
};

Object.freeze(messages.ko);
Object.freeze(messages.en);
Object.freeze(messages);
Object.freeze(LOCALES);

// 'auto' (or anything not a known locale) resolves from the browser language:
// Korean when the primary language subtag is 'ko', English otherwise.
export function resolveLocale(setting, navLang = (typeof navigator !== 'undefined' ? navigator.language : '')) {
  if (setting === 'ko' || setting === 'en') return setting;
  return String(navLang || '').toLowerCase().split('-')[0] === 'ko' ? 'ko' : 'en';
}

// Build a translator for a resolved locale. Missing key -> ko -> the key itself
// (so a gap is visible, never blank). vars fill {name} placeholders.
export function createT(locale) {
  const dict = messages[locale] || messages.ko;
  return (key, vars) => {
    let s = dict[key] != null ? dict[key] : (messages.ko[key] != null ? messages.ko[key] : key);
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  };
}
