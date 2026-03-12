import { useState } from 'react';
import { extractResumePdf, createExperience, createBullet, Experience } from '../lib/tauri';
import { open } from '@tauri-apps/plugin-dialog';
import { UploadCloud, FileText, CheckCircle2, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function OnboardingPage() {
    const navigate = useNavigate();
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [parsedData, setParsedData] = useState<{ experiences: (Experience & { bullets: string[] })[] } | null>(null);

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
            const result = await extractResumePdf(selectedFile);
            // Clean up potential markdown wrapper from LLM
            const cleanResult = result.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
            const data = JSON.parse(cleanResult);
            if (data.experiences) {
                setParsedData(data);
                setStep(2);
            } else {
                setError("Parsed JSON didn't contain an 'experiences' array.");
            }
        } catch (err) {
            console.error('Extraction failed', err);
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    const handleCommit = async () => {
        if (!parsedData) return;
        setLoading(true);
        setError(null);
        try {
            // Write each experience and its bullets to the DB sequentially
            for (const exp of parsedData.experiences) {
                const createdExp = await createExperience(exp.title, exp.org, exp.start_date, exp.end_date, exp.category);
                for (const bText of exp.bullets) {
                    await createBullet(createdExp.id, bText);
                }
            }
            setStep(3);
        } catch (err) {
            console.error('Commit failed', err);
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full gap-8 max-w-4xl mx-auto w-full pt-4">
            
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500">
                    Import Your Resume
                </h1>
                <p className="text-slate-500 dark:text-slate-400">
                    We'll extract your experiences automatically using Gemini AI so you don't have to type them all out.
                </p>
            </div>

            {/* Stepper */}
            <div className="flex items-center justify-center gap-4 text-sm font-semibold">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${step >= 1 ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'text-slate-400'}`}>
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">1</span> Upload PDF
                </div>
                <ChevronRight className="text-slate-300" />
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${step >= 2 ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'text-slate-400'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>2</span> Verify Data
                </div>
                <ChevronRight className="text-slate-300" />
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${step >= 3 ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' : 'text-slate-400'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step >= 3 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>3</span> Finish
                </div>
            </div>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl flex gap-3 border border-red-200 dark:border-red-800">
                    <AlertCircle className="shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            {/* Step 1: Upload */}
            {step === 1 && (
                <div className="flex flex-col items-center justify-center gap-6 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-12 text-center transition-all hover:bg-slate-50 dark:hover:bg-slate-800/80">
                    <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-full flex items-center justify-center">
                        <UploadCloud size={40} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Select your PDF Resume</h3>
                        <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-sm mx-auto text-sm">
                            Make sure you've set up your Gemini API key in the settings first.
                        </p>
                    </div>

                    <div className="flex flex-col gap-4 mt-4 w-full max-w-xs">
                        <button 
                            onClick={handleSelectFile}
                            className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-6 py-3 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                            {selectedFile ? selectedFile.split('\\').pop() : 'Browse Files'}
                        </button>

                        {selectedFile && (
                            <button 
                                onClick={handleExtract}
                                disabled={loading}
                                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md"
                            >
                                {loading ? <><Loader2 size={18} className="animate-spin" /> Processing...</> : 'Extract Experiences'}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Step 2: Verify */}
            {step === 2 && parsedData && (
                <div className="flex flex-col gap-6 flex-1 min-h-0">
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-blue-200 dark:border-blue-800 flex items-start gap-4">
                        <FileText size={24} className="text-blue-500 shrink-0 mt-1" />
                        <div>
                            <h3 className="font-semibold text-slate-800 dark:text-slate-200">Review Extracted Data</h3>
                            <p className="text-sm text-slate-500 mt-1">
                                We found <b>{parsedData.experiences.length}</b> experiences. Please review them below. If they look good, click "Commit to Database" to finalize.
                            </p>
                        </div>
                        <button 
                            onClick={handleCommit}
                            disabled={loading}
                            className="ml-auto flex items-center gap-2 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors shadow-sm"
                        >
                            {loading ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : <><CheckCircle2 size={18} /> Commit to Database</>}
                        </button>
                    </div>

                    <div className="flex flex-col gap-4 overflow-y-auto pr-2 pb-8">
                        {parsedData.experiences.map((exp, idx) => (
                            <div key={idx} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
                                <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">{exp.title} <span className="text-slate-500 font-normal">at {exp.org}</span></h4>
                                <p className="text-sm text-slate-500 mb-4">{exp.start_date} - {exp.end_date} • {exp.category}</p>
                                
                                <ul className="flex flex-col gap-2">
                                    {exp.bullets.map((b, i) => (
                                        <li key={i} className="flex items-start gap-3 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                                            <p className="text-sm text-slate-700 dark:text-slate-300">{b}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Step 3: Success */}
            {step === 3 && (
                <div className="flex flex-col items-center justify-center gap-6 bg-emerald-50 dark:bg-emerald-900/10 rounded-3xl border border-emerald-200 dark:border-emerald-800/50 p-12 text-center m-auto">
                    <CheckCircle2 size={64} className="text-emerald-500" />
                    <div>
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Import Successful!</h3>
                        <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-sm mx-auto text-m">
                            Your resume has been completely transformed into structural components.
                        </p>
                    </div>

                    <button 
                        onClick={() => navigate('/')}
                        className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-semibold shadow-md transition-colors"
                    >
                        View Experiences
                    </button>
                </div>
            )}

        </div>
    );
}
