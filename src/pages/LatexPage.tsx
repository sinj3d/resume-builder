import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import Editor from '@monaco-editor/react';
import {
    compileTex, injectTemplate, getTemplates, getDefaultTemplate,
    listArchetypes, Archetype, getArchetypeSections, savePdf
} from '../lib/tauri';
import { save } from '@tauri-apps/plugin-dialog';
import { Document, Page, pdfjs } from 'react-pdf';
import {
    Code, FileCode2, AlertCircle, DownloadCloud, CheckCircle2,
    GripVertical, Layers, Download
} from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const DEFAULT_SECTION_ORDER = [
    'Education',
    'Professional Experience',
    'Projects',
    'Leadership',
    'Volunteer Experience',
];

export default function LatexPage() {
    const [source, setSource] = useState('');
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfBytes, setPdfBytes] = useState<number[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [numPages, setNumPages] = useState<number>();
    const [error, setError] = useState<string | null>(null);
    const [notification, setNotification] = useState<string | null>(null);

    // Template config
    const [templates, setTemplates] = useState<string[]>([]);
    const [selectedTemplateIdx, setSelectedTemplateIdx] = useState(0);
    const [archetypes, setArchetypes] = useState<Archetype[]>([]);
    const [selectedArchetype, setSelectedArchetype] = useState<number | ''>('');
    const [targetPages, setTargetPages] = useState(1);

    // Section ordering
    const [availableSections, setAvailableSections] = useState<string[]>([]);
    const [sectionOrder, setSectionOrder] = useState<string[]>([]);
    const [sectionsLoading, setSectionsLoading] = useState(false);

    useEffect(() => {
        getDefaultTemplate().then(setSource).catch(console.error);
        getTemplates().then(setTemplates).catch(console.error);
        listArchetypes().then(setArchetypes).catch(console.error);
    }, []);

    // When archetype changes, fetch available sections
    useEffect(() => {
        if (selectedArchetype === '') {
            setAvailableSections([]);
            setSectionOrder([]);
            return;
        }
        setSectionsLoading(true);
        getArchetypeSections(selectedArchetype as number)
            .then(sections => {
                setAvailableSections(sections);
                // Initialise order: default order for known sections, then the rest
                const ordered = DEFAULT_SECTION_ORDER.filter(s => sections.includes(s));
                const rest = sections.filter(s => !DEFAULT_SECTION_ORDER.includes(s));
                setSectionOrder([...ordered, ...rest]);
            })
            .catch(console.error)
            .finally(() => setSectionsLoading(false));
    }, [selectedArchetype]);

    useEffect(() => {
        if (notification) {
            const t = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(t);
        }
    }, [notification]);

    const processPDFBytes = (bytes: number[]) => {
        setPdfBytes(bytes);
        const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
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
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    const handleInject = async () => {
        if (selectedArchetype === '') {
            setError('Please select an archetype to inject.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const rawLatex = await injectTemplate(
                selectedArchetype as number,
                selectedTemplateIdx,
                targetPages,
                sectionOrder,
            );
            setSource(rawLatex);
            setNotification('Template injected! You can now review and compile.');
        } catch (err) {
            setError(String(err));
        } finally {
            setLoading(false);
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
        } catch (err) {
            setError(String(err));
        }
    };

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const next = Array.from(sectionOrder);
        const [moved] = next.splice(result.source.index, 1);
        next.splice(result.destination.index, 0, moved);
        setSectionOrder(next);
    };

    return (
        <div className="flex flex-col h-full gap-4">
            {/* ── Header Row ── */}
            <div className="flex flex-wrap justify-between items-center gap-4">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 flex items-center gap-3">
                    <FileCode2 className="text-blue-500" /> Resume Editor
                </h1>

                <div className="flex flex-wrap gap-3 items-end">
                    {/* Template */}
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Template</label>
                        <select
                            className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 outline-none"
                            value={selectedTemplateIdx}
                            onChange={e => setSelectedTemplateIdx(Number(e.target.value))}
                        >
                            {templates.map((t, i) => <option key={i} value={i}>{t}</option>)}
                        </select>
                    </div>

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

                    {/* Page Length */}
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Page Length</label>
                        <select
                            className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 outline-none"
                            value={targetPages}
                            onChange={e => setTargetPages(Number(e.target.value))}
                        >
                            <option value={1}>1 page</option>
                            <option value={2}>2 pages</option>
                            <option value={3}>3 pages</option>
                        </select>
                    </div>

                    {/* Inject Button */}
                    <button
                        onClick={handleInject}
                        disabled={loading || selectedArchetype === ''}
                        className={`px-4 py-2 rounded-lg font-semibold text-white transition-all shadow-md flex items-center gap-2 ${
                            loading || selectedArchetype === ''
                            ? 'bg-slate-400 cursor-not-allowed'
                            : 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 hover:shadow-lg'
                        }`}
                    >
                        <DownloadCloud size={16} /> Inject to Editor
                    </button>

                    {/* Compile Button */}
                    <button
                        onClick={handleManualCompile}
                        disabled={loading}
                        className={`px-4 py-2 rounded-lg font-semibold text-white transition-all shadow-md flex items-center gap-2 ${
                            loading
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
                        <p className="text-sm font-medium">{error}</p>
                    </div>
                )}
            </div>

            {/* ── Section Order Preview (DnD) ── */}
            {availableSections.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Layers size={16} className="text-slate-500" />
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            Section Order
                        </span>
                        <span className="text-xs text-slate-400 ml-1">— drag to reorder</span>
                        {sectionsLoading && (
                            <div className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin ml-2" />
                        )}
                    </div>
                    <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable droppableId="sections" direction="horizontal">
                            {(provided) => (
                                <div
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                    className="flex flex-wrap gap-2"
                                >
                                    {sectionOrder.map((section, index) => (
                                        <Draggable key={section} draggableId={section} index={index}>
                                            {(provided, snapshot) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    {...provided.dragHandleProps}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border select-none transition-all ${
                                                        snapshot.isDragging
                                                        ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-400 text-blue-800 dark:text-blue-200 shadow-lg rotate-2'
                                                        : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                                    }`}
                                                >
                                                    <GripVertical size={13} className="opacity-50" />
                                                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 mr-0.5">{index + 1}.</span>
                                                    {section}
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext>
                </div>
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
                                <p className="text-sm text-slate-500">Select an archetype and click "Inject to Editor", then compile.</p>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
