import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { 
    compileTex, injectAndCompile, getTemplates, getDefaultTemplate, 
    listArchetypes, Archetype, getArchetypeBullets
} from '../lib/tauri';
import { Document, Page, pdfjs } from 'react-pdf';
import { Play, Code, FileCode2, AlertCircle } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function LatexPage() {
    const [source, setSource] = useState('');
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [numPages, setNumPages] = useState<number>();
    const [error, setError] = useState<string | null>(null);

    // Template config
    const [templates, setTemplates] = useState<string[]>([]);
    const [selectedTemplateIdx, setSelectedTemplateIdx] = useState(0);
    const [archetypes, setArchetypes] = useState<Archetype[]>([]);
    const [selectedArchetype, setSelectedArchetype] = useState<number | ''>('');

    useEffect(() => {
        getDefaultTemplate().then(setSource).catch(console.error);
        getTemplates().then(setTemplates).catch(console.error);
        listArchetypes().then(setArchetypes).catch(console.error);
    }, []);

    const processPDFBytes = (pdfBytes: number[]) => {
        const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
    };

    const handleManualCompile = async () => {
        setLoading(true);
        setError(null);
        try {
            const pdfBytes = await compileTex(source);
            processPDFBytes(pdfBytes);
        } catch (err) {
            console.error('Compilation failed', err);
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    const handleInjectAndCompile = async () => {
        if (selectedArchetype === '') {
            setError("Please select an archetype to inject.");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            // Get bullets for the selected archetype
            const bullets = await getArchetypeBullets(selectedArchetype as number);
            if (bullets.length === 0) {
                throw new Error("No bullets found for this archetype.");
            }
            
            const bulletIds = bullets.map(b => b.id);
            const pdfBytes = await injectAndCompile(selectedArchetype as number, bulletIds, selectedTemplateIdx);
            processPDFBytes(pdfBytes);
            
            // Note: In real app, we might also want to overwrite the Editor `source` with the injected template,
            // but for safety, the rust command just compiles the template in-memory.
        } catch (err) {
            console.error('Injection failed', err);
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 flex items-center gap-3">
                    <FileCode2 className="text-blue-500" /> Resume Editor
                </h1>

                <div className="flex gap-4 items-end">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Template</label>
                        <select 
                            className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 outline-none"
                            value={selectedTemplateIdx} onChange={e => setSelectedTemplateIdx(Number(e.target.value))}
                        >
                            {templates.map((t, i) => <option key={i} value={i}>{t}</option>)}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Inject Archetype</label>
                        <select 
                            className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 outline-none"
                            value={selectedArchetype} onChange={e => setSelectedArchetype(Number(e.target.value) || '')}
                        >
                            <option value={''}>-- Select --</option>
                            {archetypes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>

                    <button 
                        onClick={handleInjectAndCompile} 
                        disabled={loading || selectedArchetype === ''}
                        className={`px-4 py-2 rounded-lg font-semibold text-white transition-all shadow-md flex items-center gap-2 ${
                            loading || selectedArchetype === ''
                            ? 'bg-slate-400 cursor-not-allowed' 
                            : 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 hover:shadow-lg'
                        }`}
                    >
                        <Play size={16} /> Auto-Inject & Build
                    </button>
                    
                    <button 
                        onClick={handleManualCompile} 
                        disabled={loading}
                        className={`px-4 py-2 rounded-lg font-semibold text-white transition-all shadow-md flex items-center gap-2 ${
                            loading 
                            ? 'bg-slate-400 cursor-not-allowed' 
                            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg'
                        }`}
                        title="Compile the Raw LaTeX inside the Editor"
                    >
                        <Code size={16} /> Compile Raw Editor
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl flex gap-3 border border-red-200 dark:border-red-800">
                    <AlertCircle className="shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-6">
                
                {/* Editor Panel */}
                <div className="w-full lg:w-1/2 flex flex-col border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-slate-100 dark:bg-slate-800 p-2 px-4 border-b border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-400">
                        main.tex
                    </div>
                    <div className="flex-1 bg-[#1e1e1e]">
                        <Editor
                            height="100%"
                            theme="vs-dark"
                            defaultLanguage="latex"
                            value={source}
                            onChange={val => setSource(val || '')}
                            options={{ 
                                minimap: { enabled: false }, 
                                wordWrap: 'on', 
                                fontSize: 13,
                                padding: { top: 16 }
                            }}
                        />
                    </div>
                </div>

                {/* PDF Output Panel */}
                <div className="w-full lg:w-1/2 flex flex-col bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-inner relative">
                    <div className="absolute inset-0 overflow-y-auto flex flex-col items-center py-6">
                        {loading ? (
                            <div className="m-auto flex flex-col items-center gap-4 text-slate-500">
                                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                                <p className="font-medium animate-pulse">Running Tectonic LaTeX Compiler...</p>
                                <p className="text-xs opacity-70">First run may take a minute to download packages.</p>
                            </div>
                        ) : pdfUrl ? (
                            <div className="bg-white shadow-2xl scale-[0.85] origin-top md:scale-[0.95] xl:scale-100 transition-transform">
                                <Document file={pdfUrl} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
                                    {Array.from(new Array(numPages), (_, index) => (
                                        <Page
                                            key={`page_${index + 1}`}
                                            pageNumber={index + 1}
                                            scale={1.2}
                                            renderTextLayer={false}
                                            renderAnnotationLayer={false}
                                            className="mb-4"
                                        />
                                    ))}
                                </Document>
                            </div>
                        ) : (
                            <div className="m-auto flex flex-col items-center gap-3 text-slate-400">
                                <FileCode2 size={48} className="opacity-20" />
                                <p className="font-medium">No PDF compiled yet.</p>
                                <p className="text-sm text-slate-500">Click "Auto-Inject & Build" to generate a resume.</p>
                            </div>
                        )}
                    </div>
                </div>
                
            </div>
        </div>
    );
}
