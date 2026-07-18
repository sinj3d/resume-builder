import { useState, useEffect } from 'react';
import {
    generateCoverLetter, listArchetypes, Archetype, GenerationResult,
    listCoverLetters, deleteCoverLetter, CoverLetter,
    listCoverLetterTemplates, CoverLetterTemplate,
} from '../lib/tauri';
import { FileText, Send, Sparkles, AlertCircle, History, Trash2, AlertTriangle, X, Copy, Check } from 'lucide-react';

const NO_MATCHES_PREFIX = 'NO_MATCHES::';

export default function GeneratePage() {
    const [archetypes, setArchetypes] = useState<Archetype[]>([]);
    const [selectedArchetype, setSelectedArchetype] = useState<number>(0);
    const [templates, setTemplates] = useState<CoverLetterTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<number>(0);
    const [jd, setJd] = useState('');
    const [result, setResult] = useState<GenerationResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [noMatchMessage, setNoMatchMessage] = useState<string | null>(null);

    // History
    const [history, setHistory] = useState<CoverLetter[]>([]);
    const [viewingHistoryId, setViewingHistoryId] = useState<number | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        listArchetypes().then(data => {
            setArchetypes(data);
            if (data.length > 0) setSelectedArchetype(data[0].id);
        });
        listCoverLetterTemplates().then(setTemplates).catch(console.error);
        loadHistory();
    }, []);

    const loadHistory = () => listCoverLetters().then(setHistory).catch(console.error);

    const handleGenerate = async () => {
        if (!jd.trim()) {
            setError("Please provide a job description.");
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);
        setViewingHistoryId(null);

        try {
            const res = await generateCoverLetter(jd, selectedArchetype || null, 8, selectedTemplate || null);
            setResult(res);
            loadHistory();
        } catch (err) {
            const msg = String(err);
            if (msg.includes(NO_MATCHES_PREFIX)) {
                setNoMatchMessage(msg.split(NO_MATCHES_PREFIX).pop() || msg);
            } else {
                console.error('Generation failed', err);
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    };

    const viewHistoryEntry = (entry: CoverLetter) => {
        setResult({ cover_letter: entry.content, bullets_used: [], prompt: '' });
        setViewingHistoryId(entry.id);
        setError(null);
    };

    const handleDeleteHistory = async (id: number) => {
        try {
            await deleteCoverLetter(id);
            if (viewingHistoryId === id) {
                setResult(null);
                setViewingHistoryId(null);
            }
            loadHistory();
        } catch (err) {
            setError(String(err));
        }
    };

    const handleCopy = async () => {
        if (!result) return;
        await navigator.clipboard.writeText(result.cover_letter);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
        return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    };

    return (
        <div className="flex flex-col h-full gap-6">
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 flex items-center gap-3">
                <Sparkles className="text-blue-500" /> Cover Letter Generator
            </h1>

            {/* No-matches popup */}
            {noMatchMessage && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setNoMatchMessage(null)}>
                    <div
                        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-amber-200 dark:border-amber-800 max-w-md w-full mx-4 p-6 animate-in zoom-in-95 fade-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                                <AlertTriangle className="text-amber-600 dark:text-amber-400" size={24} />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">No matching experiences</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">{noMatchMessage}</p>
                                <p className="text-xs text-slate-500 mt-3">
                                    No letter was generated — a cover letter without concrete experiences wouldn't be worth sending.
                                </p>
                            </div>
                            <button onClick={() => setNoMatchMessage(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="flex justify-end mt-5">
                            <button
                                onClick={() => setNoMatchMessage(null)}
                                className="px-5 py-2 rounded-lg font-semibold text-white bg-amber-600 hover:bg-amber-700 transition-colors"
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6 h-full min-h-0">

                {/* Input Panel + History */}
                <div className="flex flex-col gap-4 w-full lg:w-1/3 min-w-[300px] min-h-0">
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Target Archetype</label>
                            <select
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                value={selectedArchetype}
                                onChange={e => setSelectedArchetype(Number(e.target.value))}
                            >
                                <option value={0}>Any / General</option>
                                {archetypes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Template</label>
                            <select
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                value={selectedTemplate}
                                onChange={e => setSelectedTemplate(Number(e.target.value))}
                            >
                                <option value={0}>No template (default)</option>
                                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>

                        <div className="flex flex-col">
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Job Description</label>
                            <textarea
                                className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-y min-h-[160px]"
                                placeholder="Paste the exact job description here..."
                                value={jd}
                                onChange={e => setJd(e.target.value)}
                            />
                        </div>

                        <button
                            onClick={handleGenerate}
                            disabled={loading}
                            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-white transition-all shadow-md ${
                                loading
                                ? 'bg-slate-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg'
                            }`}
                        >
                            {loading ? (
                                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating...</>
                            ) : (
                                <><Send size={18} /> Generate Letter</>
                            )}
                        </button>
                    </div>

                    {/* History */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
                        <div className="p-3 px-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20 flex items-center gap-2 shrink-0">
                            <History size={16} className="text-slate-500" />
                            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">History</h2>
                            <span className="text-xs text-slate-400 ml-auto">{history.length} letters</span>
                        </div>
                        <div className="flex-1 overflow-y-auto flex flex-col">
                            {history.length === 0 ? (
                                <p className="text-xs text-slate-400 italic p-4 text-center">Generated letters will appear here.</p>
                            ) : (
                                history.map(entry => (
                                    <button
                                        key={entry.id}
                                        onClick={() => viewHistoryEntry(entry)}
                                        className={`shrink-0 text-left px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 group transition-colors ${
                                            viewingHistoryId === entry.id
                                            ? 'bg-blue-50 dark:bg-blue-900/20'
                                            : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-semibold text-slate-500">{formatDate(entry.created_at)}</span>
                                            <span
                                                role="button"
                                                onClick={e => { e.stopPropagation(); handleDeleteHistory(entry.id); }}
                                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all"
                                                title="Delete"
                                            >
                                                <Trash2 size={13} />
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">
                                            {entry.job_description}
                                        </p>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Output Panel */}
                <div className="flex flex-col gap-4 w-full lg:w-2/3 min-h-0">
                    {/* Error Banner */}
                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl flex gap-3 border border-red-200 dark:border-red-800">
                            <AlertCircle className="shrink-0" />
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    )}

                    {/* Result Container */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col flex-1 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20 flex items-center gap-2">
                            <FileText size={18} className="text-slate-500" />
                            <h2 className="font-semibold text-slate-800 dark:text-slate-200">
                                {viewingHistoryId !== null ? 'From History' : 'Generated Output'}
                            </h2>
                            {result && (
                                <button
                                    onClick={handleCopy}
                                    className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                    {copied ? <><Check size={13} className="text-emerald-500" /> Copied</> : <><Copy size={13} /> Copy</>}
                                </button>
                            )}
                        </div>

                        <div className="flex-1 p-0 overflow-hidden relative">
                            {result ? (
                                <div className="absolute inset-0 overflow-y-auto p-6 flex flex-col gap-6">
                                    <div className="prose dark:prose-invert max-w-none">
                                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-xl border border-slate-100 dark:border-slate-700/50">
                                            {result.cover_letter}
                                        </div>
                                    </div>

                                    {result.bullets_used.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Retrieved Experiences Used</h3>
                                            <ul className="flex flex-col gap-2">
                                                {result.bullets_used.map((b, i) => (
                                                    <li key={i} className="text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                                                        {b}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-3 p-6 text-center">
                                    <FileText size={48} className="opacity-20" />
                                    <p>Select an archetype, paste a job description, and hit generate to craft a tailored cover letter.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
