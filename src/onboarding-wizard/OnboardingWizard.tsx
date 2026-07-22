import { useState } from 'react';
import { setAppSetting } from '../lib/tauri';
import { parseResumePdf, commitParsedExperiences, ParsedExperience } from '../lib/resumeParsing';
import { Stepper } from '../components/ui';
import Step1Welcome from './Step1Welcome';
import Step2Verify from './Step2Verify';
import Step3Profile from './Step3Profile';

const STEPS = ['1 Import', '2 Verify', '3 Profile'];

interface OnboardingWizardProps {
    onDone: () => void;
}

/**
 * First-run wizard, shown before the main app UI. Not a route — a sibling
 * render branch in App.tsx swapped via local state, so it can't be
 * revisited by navigating after first run.
 */
export default function OnboardingWizard({ onDone }: OnboardingWizardProps) {
    const [step, setStep] = useState<'welcome' | 'verify' | 'profile'>('welcome');
    const [experiences, setExperiences] = useState<ParsedExperience[] | null>(null);
    const [filePath, setFilePath] = useState<string | null>(null);
    const [reparsing, setReparsing] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [verifyError, setVerifyError] = useState<string | null>(null);

    const currentIndex = step === 'welcome' ? 0 : step === 'verify' ? 1 : 2;

    const complete = () => {
        // Best-effort: a failed write here shouldn't trap the user in the
        // wizard forever — worst case they see it again next launch.
        setAppSetting('onboarding_complete', '1').catch(console.error);
        onDone();
    };

    const handleParsed = (exps: ParsedExperience[], path: string) => {
        setExperiences(exps);
        setFilePath(path);
        setVerifyError(null);
        setStep('verify');
    };

    const handleCategoryChange = (idx: number, category: string) => {
        setExperiences(prev => (prev ? prev.map((exp, i) => (i === idx ? { ...exp, category } : exp)) : prev));
    };

    const handleReparse = async () => {
        if (!filePath) return;
        setReparsing(true);
        setVerifyError(null);
        try {
            const data = await parseResumePdf(filePath);
            setExperiences(data.experiences);
        } catch (err) {
            console.error('Re-parse failed', err);
            setVerifyError(String(err));
        } finally {
            setReparsing(false);
        }
    };

    const handleConfirmVerify = async () => {
        if (!experiences) return;
        setCommitting(true);
        setVerifyError(null);
        try {
            await commitParsedExperiences(experiences);
            setStep('profile');
        } catch (err) {
            console.error('Commit failed', err);
            setVerifyError(String(err));
        } finally {
            setCommitting(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center bg-paper px-6 pb-12 pt-16 dark:bg-charcoal">
            <button
                onClick={complete}
                className="fixed right-8 top-8 text-sm text-ink-muted hover:text-ink dark:text-cream-muted dark:hover:text-cream"
            >
                Skip setup
            </button>

            <div className="flex w-full flex-1 flex-col items-center justify-center">
                {step === 'welcome' && (
                    <Step1Welcome onParsed={handleParsed} onStartBlank={() => setStep('profile')} />
                )}
                {step === 'verify' && experiences && filePath && (
                    <Step2Verify
                        experiences={experiences}
                        filePath={filePath}
                        onCategoryChange={handleCategoryChange}
                        onReparse={handleReparse}
                        onConfirm={handleConfirmVerify}
                        reparsing={reparsing}
                        committing={committing}
                        error={verifyError}
                    />
                )}
                {step === 'profile' && <Step3Profile onDone={complete} />}
            </div>

            <div className="mt-auto pt-10">
                <Stepper steps={STEPS} current={currentIndex} />
            </div>
        </div>
    );
}
