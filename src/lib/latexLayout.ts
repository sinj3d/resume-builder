// TypeScript mirror of src-tauri/src/latex/layout.rs.
//
// `generateLayoutBlock` must stay byte-identical to the Rust
// `generate_layout_block` — the Rust side is canonical and unit-tested; this
// mirror exists so slider changes can patch the Monaco source on the same
// frame without an IPC round-trip. If you change one, change both.

import type { LayoutConfig } from './tauri';

export const LAYOUT_BEGIN =
  '% === LAYOUT:BEGIN (auto-generated - edits inside are overwritten by layout controls) ===';
export const LAYOUT_END = '% === LAYOUT:END ===';

/// Classic Maroon at a 1-page density (mirror of `LayoutConfig::default()`).
export const DEFAULT_LAYOUT: LayoutConfig = {
  body_font_pt: 11.0,
  bullet_font_pt: 11.0,
  section_font_pt: 14.0,
  subsection_font_pt: 12.0,
  name_font_pt: 24.0,
  margin_h_in: 1.0,
  margin_v_in: 1.0,
  bullet_indent_pt: 18.0,
  item_sep_pt: 0.0,
  experience_gap_pt: 3.0,
  section_gap_pt: 4.0,
  line_spacing: 1.0,
  accent_rgb: [128, 0, 0],
  heading_sans: false,
  section_rule: false,
  target_pages: 1,
};

/// Mirror of `layout::spacing_seed`: recommended spacing for a page-count
/// target, used to seed the spacing sliders when the page count changes.
export function spacingSeed(targetPages: number): Pick<LayoutConfig, 'section_gap_pt' | 'experience_gap_pt' | 'item_sep_pt'> {
  switch (targetPages) {
    case 1:
      return { section_gap_pt: 4.0, experience_gap_pt: 3.0, item_sep_pt: 0.0 };
    case 2:
      return { section_gap_pt: 10.0, experience_gap_pt: 8.0, item_sep_pt: 1.0 };
    default:
      return { section_gap_pt: 16.0, experience_gap_pt: 12.0, item_sep_pt: 2.0 };
  }
}

// Explicit round-then-divide keeps exact ties (e.g. 4.5 * 0.5 = 2.25)
// deterministic across JS (toFixed rounds ties up) and Rust ({:.1} rounds
// ties to even) — see `pt` in layout.rs.
const pt = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
const inches = (x: number) => (Math.round(x * 100) / 100).toFixed(2);

/// Mirror of `layout::generate_layout_block` (markers included).
export function generateLayoutBlock(cfg: LayoutConfig): string {
  const sans = cfg.heading_sans ? '\\sffamily' : '';
  const rule = cfg.section_rule ? '[\\color{accent}\\titlerule]' : '';
  const [r, g, b] = cfg.accent_rgb;

  return String.raw`${LAYOUT_BEGIN}
\usepackage[hmargin=${inches(cfg.margin_h_in)}in,vmargin=${inches(cfg.margin_v_in)}in]{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{xcolor}
\pagestyle{empty}

\definecolor{accent}{RGB}{${r}, ${g}, ${b}}

\makeatletter
\renewcommand\normalsize{\@setfontsize\normalsize{${pt(cfg.body_font_pt)}pt}{${pt(cfg.body_font_pt * 1.2 * cfg.line_spacing)}pt}}
\makeatother

\setlength{\parindent}{0pt}
\setlength{\parskip}{${pt(Math.max(cfg.item_sep_pt, 1.0))}pt}

\titleformat{\section}
  {\normalfont\fontsize{${pt(cfg.section_font_pt)}pt}{${pt(cfg.section_font_pt * 1.2)}pt}\selectfont${sans}\bfseries\color{accent}}
  {}{0pt}{}${rule}
\titleformat{\subsection}
  {\normalfont\fontsize{${pt(cfg.subsection_font_pt)}pt}{${pt(cfg.subsection_font_pt * 1.2)}pt}\selectfont${sans}\bfseries}
  {}{0pt}{}

\titlespacing*{\section}{0pt}{${pt(cfg.section_gap_pt)}pt}{${pt(cfg.section_gap_pt * 0.6)}pt}
\titlespacing*{\subsection}{0pt}{${pt(cfg.experience_gap_pt)}pt}{1.0pt}

\newcommand{\bulletsize}{\fontsize{${pt(cfg.bullet_font_pt)}pt}{${pt(cfg.bullet_font_pt * 1.2 * cfg.line_spacing)}pt}\selectfont}
\setlist[itemize]{leftmargin=${pt(cfg.bullet_indent_pt)}pt, itemsep=${pt(cfg.item_sep_pt)}pt, topsep=2.0pt, parsep=0.0pt, partopsep=0.0pt, before=\bulletsize}

\newcommand{\namesize}{\fontsize{${pt(cfg.name_font_pt)}pt}{${pt(cfg.name_font_pt * 1.2)}pt}\selectfont}
\newcommand{\expvspace}{\vspace{${pt(cfg.experience_gap_pt * 0.5)}pt}}
${LAYOUT_END}`;
}

export function hasLayoutMarkers(source: string): boolean {
  const begin = source.indexOf(LAYOUT_BEGIN);
  const end = source.indexOf(LAYOUT_END);
  return begin !== -1 && end !== -1 && end > begin;
}

/// Mirror of `layout::patch_layout_block`: splice a regenerated layout block
/// between the markers, leaving everything else (manual edits included)
/// untouched. Returns null when the markers are missing or out of order.
export function patchLayoutBlock(source: string, cfg: LayoutConfig): string | null {
  const begin = source.indexOf(LAYOUT_BEGIN);
  const end = source.indexOf(LAYOUT_END);
  if (begin === -1 || end === -1 || end < begin) return null;

  const afterEnd = end + LAYOUT_END.length;
  return source.slice(0, begin) + generateLayoutBlock(cfg) + source.slice(afterEnd);
}

// ── Color helpers for the accent picker ──

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const h = (v: number) => v.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
