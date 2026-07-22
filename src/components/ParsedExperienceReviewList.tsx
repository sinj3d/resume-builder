import { ParsedExperience } from '../lib/resumeParsing';
import { Card } from './ui';

const CATEGORY_OPTIONS = ['Professional Experience', 'Education', 'Project', 'Competition', 'Leadership', 'Volunteer'];

const inputCls = "px-3 py-1.5 text-sm bg-paper dark:bg-charcoal-inset border border-paper-border dark:border-charcoal-border rounded text-ink dark:text-cream focus:outline-none focus:ring-2 focus:ring-sienna/30 focus:border-sienna transition-all";
const labelCls = "text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-muted dark:text-cream-muted";

interface ParsedExperienceReviewListProps {
    experiences: ParsedExperience[];
    onCategoryChange: (idx: number, category: string) => void;
}

/** Read-only review of parsed experiences (title/org/dates/bullets) with an
 *  editable category dropdown per row — used by both the standalone PDF
 *  import page and the first-run onboarding wizard's verify step. */
export default function ParsedExperienceReviewList({ experiences, onCategoryChange }: ParsedExperienceReviewListProps) {
    return (
        <div className="flex flex-col gap-4">
            {experiences.map((exp, idx) => (
                <Card key={idx} className="p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h4 className="font-serif text-lg font-semibold text-ink dark:text-cream">
                                {exp.title} <span className="font-normal italic text-ink-muted dark:text-cream-muted">at {exp.org}</span>
                            </h4>
                            <p className="mb-4 text-sm text-ink-muted dark:text-cream-muted">{exp.start_date} - {exp.end_date}</p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1">
                            <label className={labelCls}>Category</label>
                            <select
                                className={inputCls}
                                value={CATEGORY_OPTIONS.includes(exp.category) ? exp.category : exp.category || ''}
                                onChange={e => onCategoryChange(idx, e.target.value)}
                            >
                                {!CATEGORY_OPTIONS.includes(exp.category) && exp.category && (
                                    <option value={exp.category}>{exp.category}</option>
                                )}
                                {CATEGORY_OPTIONS.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <ul className="flex flex-col gap-2">
                        {exp.bullets.map((b, i) => (
                            <li key={i} className="flex items-start gap-3 rounded border border-paper-inset-border bg-paper-inset p-3 dark:border-charcoal-inset-border dark:bg-charcoal-inset">
                                <span className="mt-0.5 text-sienna dark:text-sienna-dark">—</span>
                                <p className="text-sm text-ink dark:text-cream">{b}</p>
                            </li>
                        ))}
                    </ul>
                </Card>
            ))}
        </div>
    );
}
