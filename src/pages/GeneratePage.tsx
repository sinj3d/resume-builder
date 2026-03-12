import { useState, useEffect } from 'react';
import { generateCoverLetter, listArchetypes, Archetype, GenerationResult } from '../lib/tauri';
import { FileText, Send, Sparkles, AlertCircle } from 'lucide-react';

export default function GeneratePage() {
    const [archetypes, setArchetypes] = useState<Archetype[]>([]);
    const [selectedArchetype, setSelectedArchetype] = useState<number>(0);
    const [jd, setJd] = useState('');
    const [result, setResult] = useState<GenerationResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        listArchetypes().then(data => {
            setArchetypes(data);
            if (data.length > 0) setSelectedArchetype(data[0].id);
        });
    }, []);

    const handleGenerate = async () => {
        if (!jd.trim()) {
            setError("Please provide a job description.");
            return;
        }
        
        setLoading(true);
        setError(null);
        setResult(null);
        
        try {
            const res = await generateCoverLetter(jd, selectedArchetype, 5); // top 5 bullets
            setResult(res);
        } catch (err) {
            console.error('Generation failed', err);
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full gap-6">
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 flex items-center gap-3">
                <Sparkles className="text-blue-500" /> Cover Letter Generator
            </h1>

            <div className="flex flex-col lg:flex-row gap-6 h-full min-h-0">
                
                {/* Input Panel */}
                <div className="flex flex-col gap-4 w-full lg:w-1/3 min-w-[300px]">
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-4 flex-1">
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

                        <div className="flex-1 flex flex-col min-h-[200px]">
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Job Description</label>
                            <textarea
                                className="w-full flex-1 p-3 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
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
                </div>

                {/* Output Panel */}
                <div className="flex flex-col gap-4 w-full lg:w-2/3">
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
                            <h2 className="font-semibold text-slate-800 dark:text-slate-200">Generated Output</h2>
                        </div>
                        
                        <div className="flex-1 p-0 overflow-hidden relative">
                            {result ? (
                                <div className="absolute inset-0 overflow-y-auto p-6 flex flex-col gap-6">
                                    <div className="prose dark:prose-invert max-w-none">
                                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-xl border border-slate-100 dark:border-slate-700/50">
                                            {result.cover_letter}
                                        </div>
                                    </div>
                                    
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
