import { useState, useEffect } from 'react';
import {
    generateCoverLetter, listArchetypes, Archetype, GenerationResult,
    listCoverLetters, deleteCoverLetter, CoverLetter,
    listCoverLetterTemplates, CoverLetterTemplate,
    createApplication, ApplicationStatus, APPLICATION_STATUSES,
} from '../lib/tauri';
import { PageHeader, Button, Card, Modal, STATUS_TOKENS } from '../components/ui';

const inputCls = "w-full px-3 py-2 bg-paper dark:bg-charcoal-inset border border-paper-border dark:border-charcoal-border rounded text-sm text-ink dark:text-cream placeholder:text-ink-faint dark:placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sienna/30 focus:border-sienna transition-all";
const labelCls = "text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-muted dark:text-cream-muted";

const EMPTY_TRACK_FORM = {
    company: '',
    role_title: '',
    url: '',
    status: 'applied' as ApplicationStatus,
    applied_at: new Date().toISOString().slice(0, 10),
    notes: '',
};

const NO_MATCHES_PREFIX = 'NO_MATCHES::';

export default function GeneratePage() {
    const [archetypes, setArchetypes] = useState<Archetype[]>([]);
    const [selectedArchetype, setSelectedArchetype] = useState<number>(0);
    const [templates, setTemplates] = useState<CoverLetterTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<number>(0);
    const [jd, setJd] = useState('');
    const [result, setResult] = useState<GenerationResult | null>(null);
    const [streamText, setStreamText] = useState('');
    const [streamBullets, setStreamBullets] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [noMatchMessage, setNoMatchMessage] = useState<string | null>(null);

    // History
    const [history, setHistory] = useState<CoverLetter[]>([]);
    const [viewingHistoryId, setViewingHistoryId] = useState<number | null>(null);
    const [copied, setCopied] = useState(false);

    // Track application
    const [trackModalOpen, setTrackModalOpen] = useState(false);
    const [trackForm, setTrackForm] = useState(EMPTY_TRACK_FORM);
    const [tracked, setTracked] = useState(false);
    const [trackError, setTrackError] = useState<string | null>(null);

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
        setStreamText('');
        setStreamBullets([]);
        setViewingHistoryId(null);
        setTracked(false);
        setTrackForm(EMPTY_TRACK_FORM);

        try {
            const res = await generateCoverLetter(jd, selectedArchetype || null, 8, selectedTemplate || null, e => {
                if (e.event === 'started') {
                    setStreamBullets(e.data.bulletsUsed);
                } else {
                    setStreamText(prev => prev + e.data.chunk);
                }
            });
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
        setResult({ cover_letter: entry.content, bullets_used: [], prompt: '', cover_letter_id: entry.id });
        setStreamText('');
        setStreamBullets([]);
        setViewingHistoryId(entry.id);
        setTracked(false);
        setTrackModalOpen(false);
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

    const handleTrackSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!result) return;
        try {
            await createApplication({
                company: trackForm.company,
                role_title: trackForm.role_title,
                url: trackForm.url || null,
                status: trackForm.status,
                applied_at: trackForm.applied_at || null,
                notes: trackForm.notes || null,
                cover_letter_id: result.cover_letter_id,
                archetype_id: selectedArchetype || null,
            });
            setTracked(true);
            setTrackModalOpen(false);
            setTrackError(null);
        } catch (err) {
            setTrackError(String(err));
        }
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
        return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    };

    return (
        <div className="flex h-full flex-col gap-6">
            <PageHeader title="Cover Letters" subtitle="Grounded in your own record — nothing invented." />

            {/* No-matches popup */}
            <Modal
                open={!!noMatchMessage}
                onClose={() => setNoMatchMessage(null)}
                title="No matching experiences"
                maxWidth="max-w-md"
                footer={
                    <div className="flex justify-end">
                        <Button variant="accent" onClick={() => setNoMatchMessage(null)}>Got it</Button>
                    </div>
                }
            >
                <p className="text-sm text-ink-muted dark:text-cream-muted">{noMatchMessage}</p>
                <p className="mt-3 text-xs italic text-ink-faint dark:text-cream-faint">
                    No letter was generated — a cover letter without concrete experiences wouldn't be worth sending.
                </p>
            </Modal>

            <div className="flex h-full min-h-0 flex-col gap-6 lg:flex-row">

                {/* Input Panel + History */}
                <div className="flex w-full min-h-0 flex-col gap-3.5 lg:w-[340px] lg:shrink-0">
                    <Card className="flex flex-col gap-3.5 p-5">
                        <div>
                            <label className={labelCls}>Archetype</label>
                            <select
                                className={`mt-1.5 ${inputCls}`}
                                value={selectedArchetype}
                                onChange={e => setSelectedArchetype(Number(e.target.value))}
                            >
                                <option value={0}>Any / General</option>
                                {archetypes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className={labelCls}>Template</label>
                            <select
                                className={`mt-1.5 ${inputCls}`}
                                value={selectedTemplate}
                                onChange={e => setSelectedTemplate(Number(e.target.value))}
                            >
                                <option value={0}>No template (default)</option>
                                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className={labelCls}>Job description</label>
                            <textarea
                                className={`mt-1.5 ${inputCls} min-h-[130px] resize-y`}
                                placeholder="Paste the exact job description here..."
                                value={jd}
                                onChange={e => setJd(e.target.value)}
                            />
                        </div>

                        <Button onClick={handleGenerate} disabled={loading} variant="accent" className="w-full">
                            {loading ? (
                                <>
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper dark:border-charcoal/30 dark:border-t-charcoal" />
                                    Generating...
                                </>
                            ) : 'Draft the letter'}
                        </Button>
                    </Card>

                    {/* History */}
                    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <div className="flex shrink-0 items-center gap-2 border-b border-paper-inset-border bg-paper-inset px-4 py-3 dark:border-charcoal-inset-border dark:bg-charcoal-inset">
                            <span className={labelCls}>Past letters</span>
                            <span className="ml-auto text-[12px] text-ink-muted dark:text-cream-muted">{history.length}</span>
                        </div>
                        <div className="flex flex-1 flex-col overflow-y-auto">
                            {history.length === 0 ? (
                                <p className="p-4 text-center text-xs italic text-ink-muted dark:text-cream-muted">Generated letters will appear here.</p>
                            ) : (
                                history.map((entry, i) => (
                                    <button
                                        key={entry.id}
                                        onClick={() => viewHistoryEntry(entry)}
                                        className={`group shrink-0 border-b border-paper-inset-border px-4 py-3 text-left transition-colors dark:border-charcoal-inset-border ${
                                            viewingHistoryId === entry.id || i === 0
                                                ? 'bg-paper-inset dark:bg-charcoal-inset'
                                                : 'hover:bg-paper-inset/60 dark:hover:bg-charcoal-inset/60'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className={`text-[11.5px] font-semibold ${i === 0 ? 'text-sienna dark:text-sienna-dark' : 'text-ink-muted dark:text-cream-muted'}`}>
                                                {formatDate(entry.created_at)}
                                            </span>
                                            <span
                                                role="button"
                                                onClick={e => { e.stopPropagation(); handleDeleteHistory(entry.id); }}
                                                className="text-[11px] text-ink-faint opacity-0 transition-opacity hover:text-sienna group-hover:opacity-100 dark:text-cream-faint dark:hover:text-sienna-dark"
                                            >
                                                remove
                                            </span>
                                        </div>
                                        <p className="mt-1 line-clamp-2 text-xs text-ink-muted dark:text-cream-muted">
                                            {entry.job_description}
                                        </p>
                                    </button>
                                ))
                            )}
                        </div>
                    </Card>
                </div>

                {/* Output Panel */}
                <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
                    {error && (
                        <div className="rounded border border-[#a1453a]/30 bg-[#a1453a]/5 p-4 text-[#a1453a] dark:border-[#d97567]/30 dark:bg-[#d97567]/5 dark:text-[#d97567]">
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    )}

                    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <div className="flex shrink-0 items-center gap-2 border-b border-paper-inset-border bg-paper-inset px-5 py-3 dark:border-charcoal-inset-border dark:bg-charcoal-inset">
                            <span className={labelCls}>{viewingHistoryId !== null ? 'From history' : 'Drafted letter'}</span>
                            <div className="ml-auto flex items-center gap-2">
                                {result && viewingHistoryId === null && (
                                    tracked ? (
                                        <span className="rounded-full bg-[#3d6b35]/10 px-3.5 py-1.5 text-xs font-semibold text-[#3d6b35] dark:bg-[#6fae62]/10 dark:text-[#6fae62]">
                                            Tracked ✓
                                        </span>
                                    ) : (
                                        <Button variant="outline" pill onClick={() => setTrackModalOpen(true)}>Track application</Button>
                                    )
                                )}
                                {result && (
                                    <Button variant="outline" pill onClick={handleCopy}>{copied ? 'Copied' : 'Copy'}</Button>
                                )}
                            </div>
                        </div>

                        <div className="relative flex-1 overflow-hidden p-0">
                            {result || streamText || streamBullets.length > 0 ? (
                                <div className="absolute inset-0 flex flex-col gap-6 overflow-y-auto p-8">
                                    <div className="whitespace-pre-wrap rounded border border-paper-inset-border bg-paper-inset p-9 font-serif text-[14.5px] leading-[1.75] text-[#3a352b] dark:border-charcoal-inset-border dark:bg-charcoal-inset dark:text-cream">
                                        {result ? result.cover_letter : streamText}
                                    </div>

                                    {(result ? result.bullets_used : streamBullets).length > 0 && (
                                        <div>
                                            <div className={`mb-3 ${labelCls}`}>Drawn from your record</div>
                                            <ul className="flex flex-col gap-1.5 text-[12px] text-ink-muted dark:text-cream-muted">
                                                {(result ? result.bullets_used : streamBullets).map((b, i) => (
                                                    <li key={i} className="flex gap-2.5">
                                                        <span className="shrink-0 text-sienna dark:text-sienna-dark">—</span>{b}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-ink-muted dark:text-cream-muted">
                                    <p className="max-w-xs text-sm">
                                        Select an archetype, paste a job description, and hit "Draft the letter" to craft a tailored cover letter.
                                    </p>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>

            </div>

            {/* Track application modal */}
            <Modal
                open={trackModalOpen}
                onClose={() => setTrackModalOpen(false)}
                title="Track this application"
                footer={
                    <div className="flex justify-end">
                        <Button type="submit" form="track-application-form" variant="accent">Save</Button>
                    </div>
                }
            >
                <form id="track-application-form" onSubmit={handleTrackSubmit} className="flex flex-col gap-4">
                    {trackError && (
                        <div className="rounded bg-[#a1453a]/10 p-3 text-sm text-[#a1453a] dark:bg-[#d97567]/10 dark:text-[#d97567]">
                            {trackError}
                        </div>
                    )}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                            <label className={labelCls}>Company</label>
                            <input
                                className={inputCls}
                                value={trackForm.company}
                                onChange={e => setTrackForm({ ...trackForm, company: e.target.value })}
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className={labelCls}>Role title</label>
                            <input
                                className={inputCls}
                                value={trackForm.role_title}
                                onChange={e => setTrackForm({ ...trackForm, role_title: e.target.value })}
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-1.5 md:col-span-2">
                            <label className={labelCls}>Job posting URL</label>
                            <input
                                className={inputCls}
                                placeholder="https://..."
                                value={trackForm.url}
                                onChange={e => setTrackForm({ ...trackForm, url: e.target.value })}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className={labelCls}>Status</label>
                            <select
                                className={inputCls}
                                value={trackForm.status}
                                onChange={e => setTrackForm({ ...trackForm, status: e.target.value as ApplicationStatus })}
                            >
                                {APPLICATION_STATUSES.map(s => <option key={s} value={s}>{STATUS_TOKENS[s].label}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className={labelCls}>Date applied</label>
                            <input
                                type="date"
                                className={inputCls}
                                value={trackForm.applied_at}
                                onChange={e => setTrackForm({ ...trackForm, applied_at: e.target.value })}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5 md:col-span-2">
                            <label className={labelCls}>Notes</label>
                            <textarea
                                className={`${inputCls} min-h-[70px] resize-y`}
                                value={trackForm.notes}
                                onChange={e => setTrackForm({ ...trackForm, notes: e.target.value })}
                            />
                        </div>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
