// The canvas of a drawn video per aspect ratio, in the units scene code draws in: its size, the picture area
// (art: [left, top, right, bottom]), the ground line, the picture's centre (camera pivot), where the caption sits,
// and the size of the finished MP4.

export const FORMATS = {
  '9:16': { w: 720, h: 1280, art: [40, 120, 680, 800], ground: 760, center: [360, 470], captionTop: 870, sheetBottom: 905, caption: { size: 42, line: 54, width: 620 }, out: [1080, 1920], label: 'Reels / TikTok / Shorts' },
  '16:9': { w: 1280, h: 720, art: [60, 50, 1220, 500], ground: 470, center: [640, 270], captionTop: 540, sheetBottom: 565, caption: { size: 40, line: 50, width: 1100 }, out: [1920, 1080], label: 'YouTube' },
  '1:1': { w: 1080, h: 1080, art: [60, 70, 1020, 760], ground: 720, center: [540, 410], captionTop: 820, sheetBottom: 850, caption: { size: 46, line: 58, width: 940 }, out: [1080, 1080], label: 'Feed persegi' },
  '4:5': { w: 1080, h: 1350, art: [60, 90, 1020, 980], ground: 940, center: [540, 530], captionTop: 1060, sheetBottom: 1095, caption: { size: 48, line: 60, width: 940 }, out: [1080, 1350], label: 'Feed Instagram' },
};
export const FORMAT_IDS = Object.keys(FORMATS);
export const DEFAULT_FORMAT = '9:16';
export const layoutOf = (format) => FORMATS[format] || FORMATS[DEFAULT_FORMAT];
