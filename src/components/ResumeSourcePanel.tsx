import { ClipboardList, Target, Sparkles, Loader2, Check } from 'lucide-react';
import { Archetype, TailorReport, TailoredExperience } from '../lib/tauri';
import { Button, Card } from './ui';

/// Where the resume's content comes from: a hand-curated archetype, or hybrid
/// retrieval against a pasted job description.
export type BuildSource = 'archetype' | 'jd';

const inputCls = "px-3 py-2 text-sm bg-paper dark:bg-charcoal-inset border border-paper-border dark:border-charcoal-border rounded text-ink dark:text-cream focus:outline-none focus:ring-2 focus:ring-sienna/30 focus:border-sienna transition-all";
const labelCls = "text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-muted dark:text-cream-muted";

const SOURCES = [
    {
        mode: 'archetype' as const,
        icon: ClipboardList,
        title: 'From an archetype',
        blurb: 'Everything you tagged to a role profile.',
    },
    {
        mode: 'jd' as const,
        icon: Target,
        title: 'From a job description',
        blurb: 'Pull only what the posting asks for.',
    },
];

interface Props {
    mode: BuildSource;
    onModeChange: (mode: BuildSource) => void;
    archetypes: Archetype[];
    selectedArchetype: number | '';
    onArchetypeChange: (id: number | '') => void;
    jd: string;
    onJdChange: (value: string) => void;
    onMatch: () => void;
    matching: boolean;
    matched: boolean;
    edited: boolean;
    tailoring: TailorReport | null;
    targetPages: number;
    onToggleExperience: (exp: TailoredExperience) => void;
}

/** One row of the include/exclude list: a checkbox plus why it's in or out. */
function ExperienceRow({ exp, onToggle }: {
    exp: TailoredExperience;
    onToggle: (exp: TailoredExperience) => void;
}) {
    const note = exp.excluded
        ? 'switched off'
        : exp.dropped_for_space
            ? 'no room at this page target'
            : `${exp.kept_bullets} of ${exp.matched_bullets} ${exp.matched_bullets === 1 ? 'bullet' : 'bullets'}`;

    return (
        <button
            onClick={() => onToggle(exp)}
            title={exp.kept ? 'Leave this experience out' : 'Force this experience in'}
            className={`flex w-full items-center gap-2.5 border-b border-paper-inset-border px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-paper-inset dark:border-charcoal-inset-border dark:hover:bg-charcoal-inset ${
                exp.kept ? '' : 'opacity-55'
            }`}
        >
            <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
                    exp.kept
                        ? 'border-sienna bg-sienna text-paper dark:border-sienna-dark dark:bg-sienna-dark dark:text-charcoal'
                        : 'border-paper-border dark:border-charcoal-border'
                }`}
            >
                {exp.kept && <Check size={11} strokeWidth={3} />}
            </span>

            <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-ink dark:text-cream">
                    {exp.title}
                    {exp.org && <span className="font-normal text-ink-muted dark:text-cream-muted"> · {exp.org}</span>}
                </span>
                <span className={`block text-[10.5px] ${
                    exp.dropped_for_space && !exp.excluded
                        ? 'text-[#8a6d1f] dark:text-[#d4a83f]'
                        : 'text-ink-faint dark:text-cream-faint'
                }`}>
                    {exp.heading} — {note}
                </span>
            </span>

            {exp.pinned && exp.kept && (
                <span className="shrink-0 rounded-full bg-sienna/10 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-sienna dark:bg-sienna-dark/10 dark:text-sienna-dark">
                    kept in
                </span>
            )}
        </button>
    );
}

/**
 * The first decision of the page: where the resume's content comes from.
 * Archetype mode is the curated path; job-description mode runs hybrid
 * retrieval over the whole record and trims the result to the page target,
 * then lets the user overrule it experience by experience.
 */
export default function ResumeSourcePanel({
    mode, onModeChange, archetypes, selectedArchetype, onArchetypeChange,
    jd, onJdChange, onMatch, matching, matched, edited, tailoring, targetPages,
    onToggleExperience,
}: Props) {
    return (
        // Capped so a long match list scrolls inside the panel instead of
        // squeezing the design controls below it out of the column.
        <Card className="shrink-0 max-h-[58%] overflow-y-auto p-4 flex flex-col gap-3">
            <span className={labelCls}>Resume content</span>

            {/* The choice itself */}
            <div className="grid grid-cols-2 gap-2">
                {SOURCES.map(({ mode: m, icon: Icon, title, blurb }) => {
                    const active = mode === m;
                    return (
                        <button
                            key={m}
                            onClick={() => onModeChange(m)}
                            className={`flex flex-col gap-1 rounded border p-3 text-left transition-all ${
                                active
                                    ? 'border-sienna bg-[rgba(138,61,34,.05)] shadow-sm dark:border-sienna-dark dark:bg-[rgba(217,140,95,.07)]'
                                    : 'border-paper-border bg-paper hover:border-ink-faint dark:border-charcoal-border dark:bg-charcoal-inset dark:hover:border-cream-faint'
                            }`}
                        >
                            <span className="flex items-center gap-2">
                                <span
                                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 ${
                                        active
                                            ? 'border-sienna dark:border-sienna-dark'
                                            : 'border-ink-faint dark:border-cream-faint'
                                    }`}
                                >
                                    {active && <span className="h-1.5 w-1.5 rounded-full bg-sienna dark:bg-sienna-dark" />}
                                </span>
                                <Icon
                                    size={14}
                                    className={active ? 'text-sienna dark:text-sienna-dark' : 'text-ink-muted dark:text-cream-muted'}
                                />
                                <span className={`text-[12.5px] font-semibold ${
                                    active ? 'text-sienna dark:text-sienna-dark' : 'text-ink dark:text-cream'
                                }`}>
                                    {title}
                                </span>
                            </span>
                            <span className="text-[10.5px] leading-snug text-ink-muted dark:text-cream-muted">
                                {blurb}
                            </span>
                        </button>
                    );
                })}
            </div>

            {mode === 'archetype' ? (
                <select
                    className={`${inputCls} w-full`}
                    value={selectedArchetype}
                    onChange={e => onArchetypeChange(Number(e.target.value) || '')}
                >
                    <option value=''>-- Select archetype --</option>
                    {archetypes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
            ) : (
                <>
                    <textarea
                        className={`${inputCls} min-h-[88px] w-full resize-y`}
                        placeholder="Paste the posting here — the closest experiences and bullets from your record get pulled in."
                        value={jd}
                        onChange={e => onJdChange(e.target.value)}
                    />

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <Button variant="accent" size="sm" onClick={onMatch} disabled={matching || !jd.trim()}>
                            {matching ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                            {matched ? 'Re-match' : 'Match experiences'}
                        </Button>

                        <select
                            className={`${inputCls} py-1.5 text-xs`}
                            value={selectedArchetype}
                            onChange={e => onArchetypeChange(Number(e.target.value) || '')}
                            title="Optionally restrict retrieval to one archetype"
                        >
                            <option value=''>Search all experiences</option>
                            {archetypes.map(a => <option key={a.id} value={a.id}>Only: {a.name}</option>)}
                        </select>

                        {edited && (
                            <span className="text-[11px] italic text-ink-faint dark:text-cream-faint">
                                posting edited — re-match to update
                            </span>
                        )}
                    </div>

                    {tailoring && (tailoring.matched_bullets === 0 ? (
                        <p className="rounded border border-paper-inset-border bg-paper-inset px-3 py-2 text-[11.5px] text-ink-muted dark:border-charcoal-inset-border dark:bg-charcoal-inset dark:text-cream-muted">
                            Nothing in your record matched this posting. Try pasting more of it, or
                            add the experiences it asks for.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <p className="text-[11.5px] leading-relaxed text-ink-muted dark:text-cream-muted">
                                Kept <strong className="text-ink dark:text-cream">{tailoring.kept_bullets}</strong> of{' '}
                                {tailoring.matched_bullets} matching bullets across{' '}
                                <strong className="text-ink dark:text-cream">{tailoring.kept_entries}</strong>{' '}
                                {tailoring.kept_entries === 1 ? 'experience' : 'experiences'} — about{' '}
                                {tailoring.estimated_pages.toFixed(1)} of {targetPages}{' '}
                                {targetPages === 1 ? 'page' : 'pages'}.
                                {tailoring.budget_exhausted && (
                                    <> {tailoring.dropped_entries} didn't fit — raise the page target, or switch one off below.</>
                                )}
                            </p>

                            <div className="overflow-hidden rounded border border-paper-inset-border dark:border-charcoal-inset-border">
                                <div className="flex items-center gap-2 border-b border-paper-inset-border bg-paper-inset px-3 py-1.5 dark:border-charcoal-inset-border dark:bg-charcoal-inset">
                                    <span className={labelCls}>Experiences pulled</span>
                                    <span className="ml-auto text-[11px] text-ink-muted dark:text-cream-muted">
                                        {tailoring.experiences.filter(e => e.kept).length}/{tailoring.experiences.length}
                                    </span>
                                </div>
                                <div className="max-h-44 overflow-y-auto">
                                    {tailoring.experiences.map(exp => (
                                        <ExperienceRow
                                            key={exp.experience_id}
                                            exp={exp}
                                            onToggle={onToggleExperience}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </Card>
    );
}
