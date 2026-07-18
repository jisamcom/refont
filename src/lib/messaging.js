// Message type constants shared between background, content, options, popup.
export const MSG = {
  GET_SETTINGS: 'GET_SETTINGS',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  FETCH_FONT: 'FETCH_FONT',
  // A document announces itself active (on load and BFCache pageshow) so the
  // background makes it the owner of its frame's USER sheet.
  CSS_REGISTER: 'CSS_REGISTER',
  // Install `css` for the sender's document, serialized in the background so
  // overlapping preview/committed swaps can't leave a stale sheet behind; an op
  // from a document that no longer owns its frame is discarded.
  REPLACE_CSS: 'REPLACE_CSS',
  TOGGLE_SITE: 'TOGGLE_SITE',
  REAPPLY: 'REAPPLY',
  GET_PAGE_FONTS: 'GET_PAGE_FONTS',
  PREVIEW_SETTINGS: 'PREVIEW_SETTINGS',
};
