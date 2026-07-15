import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
    compileTex, injectTemplate, getDefaultTemplate, listArchetypes, Archetype,
    getArchetypeCategories, savePdf, getLayoutPresets, getResumeConfig,
    saveResumeConfig, LayoutConfig, LayoutPreset, SectionDef,
} from '../lib/tauri';
import {
    DEFAULT_LAYOUT, hasLayoutMarkers, patchLayoutBlock,
} from '../lib/latexLayout';
import SectionComposer, { defaultSectionsFromCategories, reconcileSections } from '../components/SectionComposer';
import LayoutControls from '../components/LayoutControls';
import { save } from '@tauri-apps/plugin-dialog';
import { Document, Page, pdfjs } from 'react-pdf';
import {
    Code, FileCode2, AlertCircle, DownloadCloud, CheckCircle2, Download, Loader2,
} from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
// Self-host the pdf.js worker (bundled by Vite) so the preview works fully
// offline — no unpkg/CDN dependency. Importing it from the same pdfjs-dist that
// react-pdf uses guarantees the worker and API versions match.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const COMPILE_DEBOUNCE_MS = 600;
const SAVE_DEBOUNCE_MS = 1200;

/**
 * Flicker-free PDF preview: the current document stays visible while the next
 * one loads and renders in an invisible layer; the swap (and the old blob
 * URL's revocation) happens only after every incoming page has rendered.
 */
function PdfPreview({ url }: { url: string | null }) {
    const [current, setCurrent] = useState<{ url: string; pages: number } | null>(null);
    const [incomingPages, setIncomingPages] = useState<number | null>(null);
    const renderedCount = useRef(0);

    const incomingUrl = url && url !== current?.url ? url : null;

    useEffect(() => {
        renderedCount.current = 0;
        setIncomingPages(null);
    }, [incomingUrl]);

    const promote = useCallback((pages: number) => {
        setCurrent(prev => {
            if (prev && prev.url !== incomingUrl) URL.revokeObjectURL(prev.url);
            return incomingUrl ? { url: incomingUrl, pages } : prev;
        });
    }, [incomingUrl]);

    const onPageRendered = () => {
        renderedCount.current += 1;
        if (incomingPages !== null && renderedCount.current >= incomingPages) {
            promote(incomingPages);
        }
    };

    if (!url) return null;

    return (
        <div className="relative">
            {current && (
                <div className="bg-white shadow-2xl">
                    <Document file={current.url} loading={null}>
                        {Array.from(new Array(current.pages), (_, i) => (
                            <Page
                                key={`cur_${i + 1}`}
                                pageNumber={i + 1}
                                scale={1.2}
                                renderTextLayer={false}
                                renderAnnotationLayer={false}
                                className="mb-4"
                            />
                        ))}
                    </Document>
                </div>
            )}
            {incomingUrl && (
                <div className={current ? 'absolute inset-0 opacity-0 pointer-events-none overflow-hidden' : 'bg-white shadow-2xl'}>
                    <Document
                        file={incomingUrl}
                        loading={null}
                        onLoadSuccess={({ numPages }) => {
                            setIncomingPages(numPages);
                            if (numPages === 0) promote(0);
                        }}
                    >
                        {incomingPages !== null && Array.from(new Array(incomingPages), (_, i) => (
                            <Page
                                key={`inc_${i + 1}`}
                                pageNumber={i + 1}
                                scale={1.2}
                                renderTextLayer={false}
                                renderAnnotationLayer={false}
                                className="mb-4"
                                onRenderSuccess={onPageRendered}
                            />
                        ))}
                    </Document>
                </div>
            )}
        </div>
    );
}

export default function LatexPage() {
    const [source, setSource] = useState('');
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfBytes, setPdfBytes] = useState<number[] | null>(null);
    const [compiling, setCompiling] = useState(false);
    const [injecting, setInjecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notification, setNotification] = useState<string | null>(null);

    // Config state
    const [presets, setPresets] = useState<LayoutPreset[]>([]);
    const [layout, setLayout] = useState<LayoutConfig>(DEFAULT_LAYOUT);
    const [sections, setSections] = useState<SectionDef[]>([]);
    const [archetypes, setArchetypes] = useState<Archetype[]>([]);
    const [selectedArchetype, setSelectedArchetype] = useState<number | ''>('');
    const [autoCompile, setAutoCompile] = useState(true);

    const markersPresent = useMemo(() => hasLayoutMarkers(source), [source]);

    // ── Compile pipeline: debounce → background compile → in-place swap.
    // A generation counter drops stale results; if a compile is requested
    // while one is in flight, only the latest source is compiled afterwards.
    const compileGen = useRef(0);
    const inFlight = useRef(false);
    const pendingSource = useRef<string | null>(null);
    const compileTimer = useRef<number | undefined>(undefined);
    const saveTimer = useRef<number | undefined>(undefined);

    const runCompile = useCallback(async (src: string) => {
        // Never overlap Tectonic processes: queue the latest source instead.
        if (inFlight.current) {
            pendingSource.current = src;
            return;
        }
        const gen = ++compileGen.current;
        inFlight.current = true;
        setCompiling(true);
        try {
            const bytes = await compileTex(src);
            if (gen === compileGen.current) {
                setPdfBytes(bytes);
                const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
                setPdfUrl(URL.createObjectURL(blob));
                setError(null);
            }
        } catch (err) {
            if (gen === compileGen.current) setError(String(err));
        } finally {
            inFlight.current = false;
            if (gen === compileGen.current) setCompiling(false);
            if (pendingSource.current !== null) {
                const next = pendingSource.current;
                pendingSource.current = null;
                runCompile(next);
            }
        }
    }, []);

    const scheduleCompile = useCallback((src: string) => {
        window.clearTimeout(compileTimer.current);
        compileTimer.current = window.setTimeout(() => runCompile(src), COMPILE_DEBOUNCE_MS);
    }, [runCompile]);

    const scheduleSave = useCallback((nextLayout: LayoutConfig, nextSections: SectionDef[], archetypeId: number | '') => {
        if (archetypeId === '') return;
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
            saveResumeConfig(archetypeId as number, nextLayout, nextSections).catch(console.error);
        }, SAVE_DEBOUNCE_MS);
    }, []);

    useEffect(() => () => {
        window.clearTimeout(compileTimer.current);
        window.clearTimeout(saveTimer.current);
    }, []);

    useEffect(() => {
        getDefaultTemplate().then(setSource).catch(console.error);
        getLayoutPresets().then(setPresets).catch(console.error);
        listArchetypes().then(setArchetypes).catch(console.error);
    }, []);

    // When the archetype changes, load its saved config (or defaults derived
    // from its categories).
    useEffect(() => {
        if (selectedArchetype === '') {
            setSections([]);
            return;
        }
        (async () => {
            try {
                const [cats, cfg] = await Promise.all([
                    getArchetypeCategories(selectedArchetype as number),
                    getResumeConfig(selectedArchetype as number),
                ]);

                let nextLayout: LayoutConfig = { ...DEFAULT_LAYOUT };
                if (cfg?.layout_json) {
                    try { nextLayout = { ...DEFAULT_LAYOUT, ...JSON.parse(cfg.layout_json) }; } catch (e) { console.error('Bad layout_json', e); }
                }
                let nextSections = defaultSectionsFromCategories(cats);
                if (cfg?.sections_json) {
                    try { nextSections = reconcileSections(JSON.parse(cfg.sections_json), cats); } catch (e) { console.error('Bad sections_json', e); }
                }

                setLayout(nextLayout);
                setSections(nextSections);
            } catch (err) {
                console.error(err);
            }
        })();
    }, [selectedArchetype]);

    useEffect(() => {
        if (notification) {
            const t = setTimeout(() => setNotification(null), 4000);
            return () => clearTimeout(t);
        }
    }, [notification]);

    // ── Change handlers ──

    /** Slider/toggle change: patch the layout block in place (same frame),
     *  then let the debounced pipeline recompile and persist. */
    const handleLayoutChange = (next: LayoutConfig) => {
        setLayout(next);
        const patched = patchLayoutBlock(source, next);
        if (patched !== null) {
            setSource(patched);
            if (autoCompile) scheduleCompile(patched);
        }
        scheduleSave(next, sections, selectedArchetype);
    };

    const handleSectionsChange = (next: SectionDef[]) => {
        setSections(next);
        scheduleSave(layout, next, selectedArchetype);
    };

    /** Manual edits in Monaco also feed the auto-compile pipeline. */
    const handleSourceChange = (val: string | undefined) => {
        const next = val || '';
        setSource(next);
        if (autoCompile && next.trim()) scheduleCompile(next);
    };

    const handleManualCompile = () => {
        if (source.includes('% {INJECT_')) {
            setNotification('Template still contains placeholders — click "Inject to Editor" first, or the PDF will be empty.');
        }
        window.clearTimeout(compileTimer.current);
        runCompile(source);
    };

    const handleInject = async () => {
        if (selectedArchetype === '') {
            setError('Please select an archetype to inject.');
            return;
        }
        setInjecting(true);
        setError(null);
        try {
            const rawLatex = await injectTemplate(selectedArchetype as number, layout, sections);
            setSource(rawLatex);
            // Drift tripwire: the TS layout mirror must reproduce the Rust
            // block byte-for-byte. If not, patching would fight injection.
            const roundTrip = patchLayoutBlock(rawLatex, layout);
            if (roundTrip !== null && roundTrip !== rawLatex) {
                console.warn('latexLayout.ts drifted from layout.rs — regenerated block differs from injected block');
            }
            setNotification('Resume injected! Compiling…');
            window.clearTimeout(compileTimer.current);
            runCompile(rawLatex);
        } catch (err) {
            setError(String(err));
        } finally {
            setInjecting(false);
        }
    };

    const handleDownload = async () => {
        if (!pdfBytes) return;
        try {
            const path = await save({
                defaultPath: 'resume.pdf',
                filters: [{ name: 'PDF', extensions: ['pdf'] }],
            });
            if (!path) return; // user cancelled
            await savePdf(path, pdfBytes);
            setNotification('PDF saved!');
        } catch (err) {
            setError(String(err));
        }
    };

    return (
        <div className="flex flex-col h-full gap-4">
            {/* ── Header Row ── */}
            <div className="flex flex-wrap justify-between items-center gap-4">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 flex items-center gap-3">
                    <FileCode2 className="text-blue-500" /> Resume Editor
                </h1>

                <div className="flex flex-wrap gap-3 items-end">
                    {/* Archetype */}
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Archetype</label>
                        <select
                            className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 outline-none"
                            value={selectedArchetype}
                            onChange={e => setSelectedArchetype(Number(e.target.value) || '')}
                        >
                            <option value=''>-- Select --</option>
                            {archetypes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>

                    {/* Auto-compile toggle */}
                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 pb-2.5 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={autoCompile}
                            onChange={e => setAutoCompile(e.target.checked)}
                            className="rounded text-blue-600"
                        />
                        Auto-compile
                    </label>

                    {/* Inject Button */}
                    <button
                        onClick={handleInject}
                        disabled={injecting || selectedArchetype === ''}
                        className={`px-4 py-2 rounded-lg font-semibold text-white transition-all shadow-md flex items-center gap-2 ${
                            injecting || selectedArchetype === ''
                            ? 'bg-slate-400 cursor-not-allowed'
                            : 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 hover:shadow-lg'
                        }`}
                    >
                        <DownloadCloud size={16} /> Inject to Editor
                    </button>

                    {/* Compile Button */}
                    <button
                        onClick={handleManualCompile}
                        disabled={compiling}
                        className={`px-4 py-2 rounded-lg font-semibold text-white transition-all shadow-md flex items-center gap-2 ${
                            compiling
                            ? 'bg-slate-400 cursor-not-allowed'
                            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg'
                        }`}
                    >
                        <Code size={16} /> Compile
                    </button>

                    {/* Download Button */}
                    {pdfUrl && (
                        <button
                            onClick={handleDownload}
                            className="px-4 py-2 rounded-lg font-semibold text-white transition-all shadow-md flex items-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 hover:shadow-lg"
                        >
                            <Download size={16} /> Download PDF
                        </button>
                    )}
                </div>
            </div>

            {/* ── Notifications ── */}
            <div className="flex gap-4 relative">
                {notification && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-4 py-2 rounded-full border border-emerald-200 dark:border-emerald-800 shadow-lg flex items-center gap-2 animate-in slide-in-from-top-4 fade-in duration-300">
                        <CheckCircle2 size={16} />
                        <span className="text-sm font-semibold">{notification}</span>
                    </div>
                )}
                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl flex gap-3 border border-red-200 dark:border-red-800 w-full">
                        <AlertCircle className="shrink-0" />
                        <p className="text-sm font-medium whitespace-pre-wrap">{error}</p>
                    </div>
                )}
            </div>

            {/* ── Layout Controls ── */}
            <LayoutControls
                layout={layout}
                presets={presets}
                disabled={!markersPresent}
                onChange={handleLayoutChange}
            />

            {/* ── Section Composer ── */}
            {sections.length > 0 && (
                <SectionComposer sections={sections} onChange={handleSectionsChange} />
            )}

            {/* ── Editor + PDF ── */}
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
                            onChange={handleSourceChange}
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
                    {/* Recompiling badge overlays the (still visible) old PDF */}
                    {compiling && (
                        <div className="absolute top-3 right-3 z-10 flex items-center gap-2 bg-blue-600/90 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg">
                            <Loader2 size={13} className="animate-spin" /> Recompiling…
                        </div>
                    )}
                    <div className="absolute inset-0 overflow-y-auto flex flex-col items-center py-6">
                        {pdfUrl ? (
                            <div className="scale-[0.85] origin-top md:scale-[0.95] xl:scale-100 transition-transform">
                                <PdfPreview url={pdfUrl} />
                            </div>
                        ) : compiling ? (
                            <div className="m-auto flex flex-col items-center gap-4 text-slate-500">
                                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                                <p className="font-medium animate-pulse">Running Tectonic LaTeX Compiler...</p>
                                <p className="text-xs opacity-70">First run may take a minute to download packages.</p>
                            </div>
                        ) : (
                            <div className="m-auto flex flex-col items-center gap-3 text-slate-400">
                                <FileCode2 size={48} className="opacity-20" />
                                <p className="font-medium">No PDF compiled yet.</p>
                                <p className="text-sm text-slate-500">Select an archetype and click "Inject to Editor".</p>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
