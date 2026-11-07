export const icons = {
  file: {
    source: require("../../assets/figma/10_1115_imgIconFileMusic.svg"),
    width: 24,
    height: 24,
  },
  privacy: {
    source: require("../../assets/figma/10_1115_imgIconShieldLock.svg"),
    width: 20,
    height: 20,
  },
  history: {
    source: require("../../assets/figma/10_1115_imgIconHistory1.svg"),
    width: 20,
    height: 20,
  },
  upload: {
    source: require("../../assets/figma/10_1115_imgLeadingActionIcon1.svg"),
    width: 20,
    height: 20,
  },
  microphone: {
    source: require("../../assets/figma/10_1115_imgLeadingActionIcon2.svg"),
    width: 20,
    height: 20,
  },
  sparkles: {
    source: require("../../assets/figma/10_1115_imgLeadingActionIcon3.svg"),
    width: 20,
    height: 20,
  },
  more: {
    source: require("../../assets/figma/10_1115_imgIconPlayerPlay.svg"),
    width: 24,
    height: 24,
  },
  back: {
    source: require("../../assets/figma/10_1209_imgIconArrowLeft.svg"),
    width: 20,
    height: 20,
  },
  check: {
    source: require("../../assets/figma/10_1209_imgIconCheck.svg"),
    width: 20,
    height: 20,
  },
  close: {
    source: require("../../assets/figma/10_1209_imgLeadingActionIcon.svg"),
    width: 20,
    height: 20,
  },
  pencilBlue: {
    source: require("../../assets/figma/10_1263_imgIconPencil.svg"),
    width: 14,
    height: 14,
  },
  pencilGreen: {
    source: require("../../assets/figma/10_1263_imgIconPencil1.svg"),
    width: 14,
    height: 14,
  },
  playSmall: {
    source: require("../../assets/figma/10_1263_imgIconPlayerPlay2.svg"),
    width: 16,
    height: 16,
  },
  playWhite: {
    source: require("../../assets/figma/12_31_imgTablerOutlinePlayerPlay.svg"),
    width: 24,
    height: 24,
  },
  pause: {
    source: require("../../assets/figma/10_1263_imgIconPlayerPlay.svg"),
    width: 24,
    height: 24,
  },
  rewind: {
    source: require("../../assets/figma/10_1263_imgIconRewindBackward15.svg"),
    width: 24,
    height: 24,
  },
  forward: {
    source: require("../../assets/figma/10_1263_imgIconRewindForward15.svg"),
    width: 24,
    height: 24,
  },
  export: {
    source: require("../../assets/figma/10_1263_imgIconFileExport.svg"),
    width: 20,
    height: 20,
  },
  trash: {
    source: require("../../assets/figma/10_1532_imgIconTrash.svg"),
    width: 20,
    height: 20,
  },
  trashRed: {
    source: require("../../assets/figma/90_6724_imgLeadingActionIcon2.svg"),
    width: 20,
    height: 20,
  },
  pencil: {
    source: require("../../assets/figma/90_6724_imgLeadingActionIcon1.svg"),
    width: 20,
    height: 20,
  },
  saveWhite: {
    source: require("../../assets/figma/10_1579_imgLeadingActionIcon1.svg"),
    width: 20,
    height: 20,
  },
  save: {
    source: require("../../assets/figma/76_2551_imgLeadingActionIcon1.svg"),
    width: 20,
    height: 20,
  },
  microphoneWhite: {
    source: require("../../assets/figma/76_1737_imgLeadingActionIcon.svg"),
    width: 20,
    height: 20,
  },
  pauseDark: {
    source: require("../../assets/figma/76_2015_imgLeadingActionIcon.svg"),
    width: 20,
    height: 20,
  },
  playDark: {
    source: require("../../assets/figma/76_2281_imgLeadingActionIcon.svg"),
    width: 20,
    height: 20,
  },
  stopWhite: {
    source: require("../../assets/figma/76_2015_imgLeadingActionIcon1.svg"),
    width: 20,
    height: 20,
  },
  uploadDark: {
    source: require("../../assets/figma/76_1737_imgTablerOutlineFileUpload.svg"),
    width: 20,
    height: 20,
  },
  replace: {
    source: require("../../assets/figma/replace.svg"),
    width: 20,
    height: 20,
  },
  refresh: {
    source: require("../../assets/figma/refresh.svg"),
    width: 20,
    height: 20,
  },
  document: {
    source: require("../../assets/figma/document.svg"),
    width: 20,
    height: 20,
  },
  headphones: {
    source: require("../../assets/figma/headphones.svg"),
    width: 24,
    height: 24,
  },
  jsonPreview: {
    source: require("../../assets/figma/jsonPreview.svg"),
    width: 20,
    height: 20,
  },
  exportWhite: {
    source: require("../../assets/figma/exportWhite.svg"),
    width: 20,
    height: 20,
  },
} as const;
export type IconName = keyof typeof icons;
