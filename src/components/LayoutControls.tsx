import { useState } from 'react';
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { LayoutConfig } from '../lib/tauri';
import { spacingSeed, rgbToHex, hexToRgb } from '../lib/latexLayout';

interface Props {
    layout: LayoutConfig;
    disabled: boolean;
    onChange: (next: LayoutConfig) => void;
}

function Slider({ label, value, min, max, step, unit, disabled, onChange }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit: string;
    disabled: boolean;
    onChange: (v: number) => void;
}) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between items-baseline">
                <label className="text-xs font-semibold text-ink-muted-2 dark:text-cream-muted">{label}</label>
                <span className="text-xs tabular-nums text-ink-muted dark:text-cream-muted">{value}{unit}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={disabled}
                onChange={e => onChange(Number(e.target.value))}
                className="accent-sienna disabled:opacity-40"
            />
        </div>
    );
}

/**
 * Collapsible panel of visual knobs. Every change immediately produces a new
 * LayoutConfig; the parent patches the LaTeX source and schedules a recompile.
 */
export default function LayoutControls({ layout, disabled, onChange }: Props) {
    const [open, setOpen] = useState(true);

    const set = (patch: Partial<LayoutConfig>) => onChange({ ...layout, ...patch });

    const setTargetPages = (pages: number) => {
        // Page count seeds the spacing sliders with recommended values.
        onChange({ ...layout, target_pages: pages, ...spacingSeed(pages) });
    };

    return (
        <div className="bg-paper-card dark:bg-charcoal-card rounded border border-paper-border dark:border-charcoal-border shadow-sm">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-2 p-4 text-left"
            >
                <SlidersHorizontal size={16} className="text-ink-muted dark:text-cream-muted" />
                <span className="text-sm font-semibold text-ink dark:text-cream">Layout</span>
                {disabled && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#b8860b]/10 text-[#8a6d1f] border border-[#b8860b]/40 dark:bg-[#d4a83f]/10 dark:text-[#d4a83f] dark:border-[#d4a83f]/40">
                        Layout block missing — re-inject to restore controls
                    </span>
                )}
                <span className="ml-auto text-ink-faint dark:text-cream-faint">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
            </button>

            {open && (
                <div className="px-4 pb-4 flex flex-col gap-4">
                    {/* Page count + toggles + accent */}
                    <div className="flex flex-wrap gap-4 items-end">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-ink-muted dark:text-cream-muted uppercase">Page Target</label>
                            <select
                                className="px-3 py-2 text-sm bg-paper dark:bg-charcoal-inset border border-paper-border dark:border-charcoal-border rounded text-ink dark:text-cream outline-none"
                                value={layout.target_pages}
                                disabled={disabled}
                                onChange={e => setTargetPages(Number(e.target.value))}
                            >
                                <option value={1}>1 page</option>
                                <option value={2}>2 pages</option>
                                <option value={3}>3 pages</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-ink-muted dark:text-cream-muted uppercase">Accent</label>
                            <input
                                type="color"
                                className="h-9 w-14 rounded border border-paper-border dark:border-charcoal-border bg-paper dark:bg-charcoal-inset cursor-pointer"
                                value={rgbToHex(layout.accent_rgb)}
                                disabled={disabled}
                                onChange={e => set({ accent_rgb: hexToRgb(e.target.value) })}
                            />
                        </div>

                        <label className="flex items-center gap-2 text-sm text-ink-muted-2 dark:text-cream-muted pb-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={layout.section_rule}
                                disabled={disabled}
                                onChange={e => set({ section_rule: e.target.checked })}
                                className="accent-sienna"
                            />
                            Section dividers
                        </label>

                        <label className="flex items-center gap-2 text-sm text-ink-muted-2 dark:text-cream-muted pb-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={layout.header_rule}
                                disabled={disabled}
                                onChange={e => set({ header_rule: e.target.checked })}
                                className="accent-sienna"
                            />
                            Header divider
                        </label>

                        <label className="flex items-center gap-2 text-sm text-ink-muted-2 dark:text-cream-muted pb-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={layout.heading_sans}
                                disabled={disabled}
                                onChange={e => set({ heading_sans: e.target.checked })}
                                className="accent-sienna"
                            />
                            Sans-serif headings
                        </label>
                    </div>

                    {/* Sliders */}
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-3">
                        <Slider label="Body font" value={layout.body_font_pt} min={9} max={14} step={0.5} unit="pt"
                            disabled={disabled} onChange={v => set({ body_font_pt: v })} />
                        <Slider label="Bullet font" value={layout.bullet_font_pt} min={8} max={14} step={0.5} unit="pt"
                            disabled={disabled} onChange={v => set({ bullet_font_pt: v })} />
                        <Slider label="Section header font" value={layout.section_font_pt} min={10} max={22} step={0.5} unit="pt"
                            disabled={disabled} onChange={v => set({ section_font_pt: v })} />
                        <Slider label="Entry title font" value={layout.subsection_font_pt} min={9} max={16} step={0.5} unit="pt"
                            disabled={disabled} onChange={v => set({ subsection_font_pt: v })} />
                        <Slider label="Name font" value={layout.name_font_pt} min={14} max={32} step={1} unit="pt"
                            disabled={disabled} onChange={v => set({ name_font_pt: v })} />
                        <Slider label="Horizontal margins" value={layout.margin_h_in} min={0.4} max={1.5} step={0.05} unit="in"
                            disabled={disabled} onChange={v => set({ margin_h_in: v })} />
                        <Slider label="Vertical margins" value={layout.margin_v_in} min={0.4} max={1.5} step={0.05} unit="in"
                            disabled={disabled} onChange={v => set({ margin_v_in: v })} />
                        <Slider label="Bullet indent" value={layout.bullet_indent_pt} min={0} max={36} step={1} unit="pt"
                            disabled={disabled} onChange={v => set({ bullet_indent_pt: v })} />
                        <Slider label="Bullet spacing" value={layout.item_sep_pt} min={0} max={8} step={0.5} unit="pt"
                            disabled={disabled} onChange={v => set({ item_sep_pt: v })} />
                        <Slider label="Experience gap" value={layout.experience_gap_pt} min={0} max={20} step={0.5} unit="pt"
                            disabled={disabled} onChange={v => set({ experience_gap_pt: v })} />
                        <Slider label="Section gap" value={layout.section_gap_pt} min={0} max={24} step={0.5} unit="pt"
                            disabled={disabled} onChange={v => set({ section_gap_pt: v })} />
                        <Slider label="Line spacing" value={layout.line_spacing} min={0.85} max={1.5} step={0.05} unit="×"
                            disabled={disabled} onChange={v => set({ line_spacing: v })} />
                    </div>
                </div>
            )}
        </div>
    );
}
