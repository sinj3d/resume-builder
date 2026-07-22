import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui';
import ParsedExperienceReviewList from '../components/ParsedExperienceReviewList';
import { ParsedExperience } from '../lib/resumeParsing';

interface Step2VerifyProps {
    experiences: ParsedExperience[];
    filePath: string;
    onCategoryChange: (idx: number, category: string) => void;
    onReparse: () => void;
    onConfirm: () => void;
    reparsing: boolean;
    committing: boolean;
    error: string | null;
}

export default function Step2Verify({
    experiences, filePath, onCategoryChange, onReparse, onConfirm, reparsing, committing, error,
}: Step2VerifyProps) {
    const fileName = filePath.split(/[\\/]/).pop() || filePath;
    const totalBullets = experiences.reduce((sum, e) => sum + e.bullets.length, 0);

    return (
        <div className="flex w-full max-w-3xl flex-col items-center gap-9">
            <div className="max-w-2xl text-center">
                <h1 className="font-serif text-[36px] font-semibold tracking-[-0.015em] text-ink dark:text-cream">
                    Does this look right?
                </h1>
                <p className="mt-2 font-serif text-base italic text-ink-muted dark:text-cream-muted">
                    Read from <span className="not-italic text-ink-muted-2 dark:text-cream-muted">{fileName}</span> — {experiences.length} experience{experiences.length === 1 ? '' : 's'}, {totalBullets} bullet{totalBullets === 1 ? '' : 's'}. Fix the categories if we guessed wrong.
                </p>
            </div>

            {error && (
                <div className="flex w-full gap-3 rounded border border-[#a1453a]/30 bg-[#a1453a]/5 p-4 text-[#a1453a] dark:border-[#d97567]/30 dark:bg-[#d97567]/5 dark:text-[#d97567]">
                    <AlertCircle className="shrink-0" size={18} />
                    <p className="text-left text-sm font-medium">{error}</p>
                </div>
            )}

            <div className="max-h-[52vh] w-full overflow-y-auto pr-1">
                <ParsedExperienceReviewList experiences={experiences} onCategoryChange={onCategoryChange} />
            </div>

            <div className="flex w-full items-center justify-between">
                <p className="font-serif text-[13px] italic text-ink-faint dark:text-cream-faint">
                    Nothing is saved until you confirm.
                </p>
                <div className="flex gap-2.5">
                    <Button variant="outline" onClick={onReparse} disabled={reparsing || committing}>
                        {reparsing ? <><Loader2 size={16} className="animate-spin" /> Re-parsing…</> : 'Re-parse'}
                    </Button>
                    <Button variant="accent" onClick={onConfirm} disabled={committing || reparsing}>
                        {committing ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Looks right — add to my record'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
