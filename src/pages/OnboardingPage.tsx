import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Stepper } from '../components/ui';
import ParsedExperienceReviewList from '../components/ParsedExperienceReviewList';
import { parseResumePdf, commitParsedExperiences, ParsedExperience } from '../lib/resumeParsing';

export default function OnboardingPage() {
    const navigate = useNavigate();
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [experiences, setExperiences] = useState<ParsedExperience[] | null>(null);

    const handleSelectFile = async () => {
        try {
            const file = await open({
                multiple: false,
                filters: [{ name: 'PDF Resume', extensions: ['pdf'] }]
            });
            if (file) {
                setSelectedFile(file as string);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleExtract = async () => {
        if (!selectedFile) return;
        setLoading(true);
        setError(null);
        try {
            const data = await parseResumePdf(selectedFile);
            setExperiences(data.experiences);
            setStep(2);
        } catch (err) {
            console.error('Extraction failed', err);
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    const setExpCategory = (idx: number, category: string) => {
        setExperiences(prev => prev ? prev.map((exp, i) => (i === idx ? { ...exp, category } : exp)) : prev);
    };

    const handleCommit = async () => {
        if (!experiences) return;
        setLoading(true);
        setError(null);
        try {
            await commitParsedExperiences(experiences);
            setStep(3);
        } catch (err) {
            console.error('Commit failed', err);
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-8 pt-4">

            <div className="space-y-2 text-center">
                <h1 className="font-serif text-3xl font-semibold text-ink dark:text-cream">
                    Import your resume
                </h1>
                <p className="text-ink-muted dark:text-cream-muted">
                    We'll extract your experiences automatically with an on-device AI model — fully offline, no account or API key required.
                </p>
            </div>

            <div className="flex items-center justify-center">
                <Stepper steps={['Upload PDF', 'Verify data', 'Finish']} current={step - 1} />
            </div>

            {error && (
                <div className="flex gap-3 rounded border border-[#a1453a]/30 bg-[#a1453a]/5 p-4 text-[#a1453a] dark:border-[#d97567]/30 dark:bg-[#d97567]/5 dark:text-[#d97567]">
                    <AlertCircle className="shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            {/* Step 1: Upload */}
            {step === 1 && (
                <Card className="flex flex-col items-center justify-center gap-6 border-dashed p-12 text-center transition-colors hover:bg-paper-inset dark:hover:bg-charcoal-inset">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border border-sienna text-sienna dark:border-sienna-dark dark:text-sienna-dark">
                        <UploadCloud size={40} />
                    </div>
                    <div>
                        <h3 className="font-serif text-lg font-semibold text-ink dark:text-cream">Select your PDF resume</h3>
                        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted dark:text-cream-muted">
                            Parsing runs entirely on your device. The first import downloads a small AI model (~1&nbsp;GB), so it may take a few minutes; every import after that is instant and offline.
                        </p>
                    </div>

                    <div className="mt-4 flex w-full max-w-xs flex-col gap-4">
                        <Button variant="outline" strong onClick={handleSelectFile}>
                            {selectedFile ? selectedFile.split('\\').pop() : 'Browse files'}
                        </Button>

                        {selectedFile && (
                            <Button variant="accent" onClick={handleExtract} disabled={loading}>
                                {loading ? <><Loader2 size={18} className="animate-spin" /> Processing...</> : 'Extract experiences'}
                            </Button>
                        )}

                        {loading && (
                            <p className="-mt-1 text-center text-xs text-ink-faint dark:text-cream-faint">
                                Running the on-device parser. If this is your first import, the model is downloading (~1&nbsp;GB) — this can take a few minutes.
                            </p>
                        )}
                    </div>
                </Card>
            )}

            {/* Step 2: Verify */}
            {step === 2 && experiences && (
                <div className="flex min-h-0 flex-1 flex-col gap-6">
                    <Card className="flex items-start gap-4 p-4">
                        <FileText size={24} className="mt-1 shrink-0 text-sienna dark:text-sienna-dark" />
                        <div>
                            <h3 className="font-semibold text-ink dark:text-cream">Review extracted data</h3>
                            <p className="mt-1 text-sm text-ink-muted dark:text-cream-muted">
                                We found <b>{experiences.length}</b> experiences. Please review them below. If they look good, click "Commit to database" to finalize.
                            </p>
                        </div>
                        <Button variant="accent" className="ml-auto shrink-0" onClick={handleCommit} disabled={loading}>
                            {loading ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : <><CheckCircle2 size={18} /> Commit to database</>}
                        </Button>
                    </Card>

                    <div className="overflow-y-auto pb-8 pr-2">
                        <ParsedExperienceReviewList experiences={experiences} onCategoryChange={setExpCategory} />
                    </div>
                </div>
            )}

            {/* Step 3: Success */}
            {step === 3 && (
                <div className="m-auto flex flex-col items-center justify-center gap-6 rounded border border-[#3d6b35]/30 bg-[#3d6b35]/5 p-12 text-center dark:border-[#6fae62]/30 dark:bg-[#6fae62]/5">
                    <CheckCircle2 size={64} className="text-[#3d6b35] dark:text-[#6fae62]" />
                    <div>
                        <h3 className="font-serif text-2xl font-semibold text-ink dark:text-cream">Import successful!</h3>
                        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted dark:text-cream-muted">
                            Your resume has been transformed into structured components.
                        </p>
                    </div>

                    <Button variant="accent" onClick={() => navigate('/')}>View experiences</Button>
                </div>
            )}

        </div>
    );
}
