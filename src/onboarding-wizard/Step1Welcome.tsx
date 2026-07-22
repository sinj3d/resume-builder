import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Upload, PenLine, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui';
import { parseResumePdf, ParsedExperience } from '../lib/resumeParsing';

interface Step1WelcomeProps {
    onParsed: (experiences: ParsedExperience[], filePath: string) => void;
    onStartBlank: () => void;
}

export default function Step1Welcome({ onParsed, onStartBlank }: Step1WelcomeProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleImport = async () => {
        setError(null);
        try {
            const file = await open({
                multiple: false,
                filters: [{ name: 'PDF Resume', extensions: ['pdf'] }],
            });
            if (!file) return;
            setLoading(true);
            const path = file as string;
            const data = await parseResumePdf(path);
            onParsed(data.experiences, path);
        } catch (err) {
            console.error('Import failed', err);
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-14 text-center">
            <div className="max-w-xl">
                <div className="font-serif text-2xl font-semibold text-sienna dark:text-sienna-dark">Folio</div>
                <h1 className="mt-[22px] font-serif text-[44px] font-semibold tracking-[-0.015em] text-ink dark:text-cream">
                    Begin your record
                </h1>
                <p className="mt-3 font-serif text-[17px] italic leading-relaxed text-ink-muted dark:text-cream-muted">
                    Everything you add stays on this machine — no account, no cloud, no API key.
                </p>
            </div>

            {error && (
                <div className="flex w-full max-w-xl gap-3 rounded border border-[#a1453a]/30 bg-[#a1453a]/5 p-4 text-[#a1453a] dark:border-[#d97567]/30 dark:bg-[#d97567]/5 dark:text-[#d97567]">
                    <AlertCircle className="shrink-0" size={18} />
                    <p className="text-left text-sm font-medium">{error}</p>
                </div>
            )}

            <div className="flex flex-col gap-6 sm:flex-row">
                <div className="w-[360px] rounded border border-sienna bg-paper-card p-9 text-left shadow-sm dark:border-sienna-dark dark:bg-charcoal-card">
                    <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-sienna text-sienna dark:border-sienna-dark dark:text-sienna-dark">
                        <Upload size={22} />
                    </div>
                    <h3 className="mt-5 font-serif text-xl font-semibold text-ink dark:text-cream">Import your resume</h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-ink-muted dark:text-cream-muted">
                        Drop in a PDF and an on-device model will read your experiences into a structured record you can verify and edit.
                    </p>
                    <Button variant="accent" className="mt-6 w-full" onClick={handleImport} disabled={loading}>
                        {loading ? <><Loader2 size={16} className="animate-spin" /> Parsing…</> : 'Choose a PDF'}
                    </Button>
                    <p className="mt-2.5 text-center text-[11.5px] italic text-ink-faint dark:text-cream-faint">
                        Parsed offline · nothing leaves your computer
                    </p>
                </div>

                <div className="w-[360px] rounded border border-paper-border bg-paper-card p-9 text-left dark:border-charcoal-border dark:bg-charcoal-card">
                    <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-paper-border text-ink-muted dark:border-charcoal-border dark:text-cream-muted">
                        <PenLine size={22} />
                    </div>
                    <h3 className="mt-5 font-serif text-xl font-semibold text-ink dark:text-cream">Start from blank</h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-ink-muted dark:text-cream-muted">
                        Write your experiences and bullet points by hand — paste whole lists straight in, one bullet per line.
                    </p>
                    <Button variant="outline" strong className="mt-6 w-full" onClick={onStartBlank}>
                        Begin writing
                    </Button>
                    <p className="mt-2.5 text-center text-[11.5px] italic text-ink-faint dark:text-cream-faint">
                        You can import a PDF later, any time
                    </p>
                </div>
            </div>
        </div>
    );
}
