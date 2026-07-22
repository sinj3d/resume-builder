import { useState, useEffect, useMemo } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
    listApplications, createApplication, updateApplication, deleteApplication,
    Application, ApplicationStatus, APPLICATION_STATUSES,
    listCoverLetters, CoverLetter,
    listArchetypes, Archetype,
} from '../lib/tauri';
import { ExternalLink } from 'lucide-react';
import { PageHeader, Button, Card, FilterPills, StatusBadge, STATUS_TOKENS, EmptyState, Modal, Toast } from '../components/ui';

const inputCls = "w-full px-3 py-2 bg-paper dark:bg-charcoal-inset border border-paper-border dark:border-charcoal-border rounded text-sm text-ink dark:text-cream placeholder:text-ink-faint dark:placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sienna/30 focus:border-sienna transition-all";
const labelCls = "text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-muted dark:text-cream-muted";

const EMPTY_FORM = {
    company: '',
    role_title: '',
    url: '',
    status: 'applied' as ApplicationStatus,
    applied_at: new Date().toISOString().slice(0, 10),
    notes: '',
    archetype_id: 0,
};

export default function ApplicationsPage() {
    const [applications, setApplications] = useState<Application[]>([]);
    const [archetypes, setArchetypes] = useState<Archetype[]>([]);
    const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');
    const [view, setView] = useState<'list' | 'form'>('list');
    const [editingApp, setEditingApp] = useState<Application | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [error, setError] = useState<string | null>(null);
    const [notification, setNotification] = useState<string | null>(null);

    // "View letter" modal
    const [viewingApp, setViewingApp] = useState<Application | null>(null);
    const [letters, setLetters] = useState<CoverLetter[] | null>(null);

    useEffect(() => {
        loadApplications();
        listArchetypes().then(setArchetypes).catch(console.error);
    }, []);

    useEffect(() => {
        if (notification) {
            const t = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(t);
        }
    }, [notification]);

    useEffect(() => {
        if (error) {
            const t = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(t);
        }
    }, [error]);

    const loadApplications = () => listApplications().then(setApplications).catch(console.error);

    const filtered = useMemo(
        () => statusFilter === 'all' ? applications : applications.filter(a => a.status === statusFilter),
        [applications, statusFilter],
    );

    const filterOptions = useMemo(() => [
        { key: 'all', label: 'All', count: applications.length },
        ...APPLICATION_STATUSES.map(s => ({
            key: s,
            label: STATUS_TOKENS[s].label,
            count: applications.filter(a => a.status === s).length,
        })),
    ], [applications]);

    const subtitle = useMemo(() => {
        const total = applications.length;
        if (total === 0) return 'Nothing tracked yet.';
        const interviewing = applications.filter(a => a.status === 'interviewing').length;
        if (interviewing === 0) return `${total} in motion`;
        return `${total} in motion — ${interviewing} conversation${interviewing === 1 ? '' : 's'} underway`;
    }, [applications]);

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setEditingApp(null);
    };

    const startCreate = () => {
        resetForm();
        setView('form');
    };

    const startEdit = (app: Application) => {
        setEditingApp(app);
        setForm({
            company: app.company,
            role_title: app.role_title,
            url: app.url || '',
            status: app.status,
            applied_at: app.applied_at || '',
            notes: app.notes || '',
            archetype_id: app.archetype_id || 0,
        });
        setView('form');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingApp) {
                await updateApplication({
                    id: editingApp.id,
                    company: form.company,
                    role_title: form.role_title,
                    url: form.url || null,
                    status: form.status,
                    applied_at: form.applied_at || null,
                    notes: form.notes || null,
                });
                setNotification('Application updated!');
            } else {
                await createApplication({
                    company: form.company,
                    role_title: form.role_title,
                    url: form.url || null,
                    status: form.status,
                    applied_at: form.applied_at || null,
                    notes: form.notes || null,
                    archetype_id: form.archetype_id || null,
                });
                setNotification('Application tracked!');
            }
            resetForm();
            setView('list');
            loadApplications();
        } catch (err) {
            setError(String(err));
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await deleteApplication(id);
            loadApplications();
        } catch (err) {
            setError(String(err));
        }
    };

    const handleStatusChange = async (app: Application, status: ApplicationStatus) => {
        try {
            await updateApplication({ id: app.id, status });
            loadApplications();
        } catch (err) {
            setError(String(err));
        }
    };

    const openViewLetter = (app: Application) => {
        setViewingApp(app);
        if (letters === null) {
            listCoverLetters().then(setLetters).catch(() => setLetters([]));
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
        return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
    };

    const viewingLetter = viewingApp?.cover_letter_id != null && letters
        ? letters.find(l => l.id === viewingApp.cover_letter_id) || null
        : undefined;

    return (
        <div className="relative flex h-full flex-col gap-6">
            <PageHeader
                title="Applications"
                subtitle={subtitle}
                action={
                    view === 'list' ? (
                        <Button onClick={startCreate}>Track an application</Button>
                    ) : (
                        <Button variant="outline" onClick={() => { resetForm(); setView('list'); }}>Back to list</Button>
                    )
                }
            />

            <Toast message={notification} variant="success" />
            <Toast message={error} variant="error" />

            {view === 'form' && (
                <Card className="max-w-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
                    <h2 className="mb-6 font-serif text-xl font-semibold text-ink dark:text-cream">
                        {editingApp ? 'Edit application' : 'Track new application'}
                    </h2>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                                <label className={labelCls}>Company</label>
                                <input className={inputCls}
                                    placeholder="e.g. Acme Corp"
                                    value={form.company}
                                    onChange={e => setForm({ ...form, company: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className={labelCls}>Role title</label>
                                <input className={inputCls}
                                    placeholder="e.g. Software Engineer II"
                                    value={form.role_title}
                                    onChange={e => setForm({ ...form, role_title: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label className={labelCls}>Job posting URL</label>
                                <input className={inputCls}
                                    placeholder="https://..."
                                    value={form.url}
                                    onChange={e => setForm({ ...form, url: e.target.value })}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className={labelCls}>Status</label>
                                <select
                                    className={inputCls}
                                    value={form.status}
                                    onChange={e => setForm({ ...form, status: e.target.value as ApplicationStatus })}
                                >
                                    {APPLICATION_STATUSES.map(s => <option key={s} value={s}>{STATUS_TOKENS[s].label}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className={labelCls}>Date applied</label>
                                <input
                                    type="date"
                                    className={inputCls}
                                    value={form.applied_at}
                                    onChange={e => setForm({ ...form, applied_at: e.target.value })}
                                />
                            </div>
                            {!editingApp && (
                                <div className="flex flex-col gap-1.5 md:col-span-2">
                                    <label className={labelCls}>Archetype (optional)</label>
                                    <select
                                        className={inputCls}
                                        value={form.archetype_id}
                                        onChange={e => setForm({ ...form, archetype_id: Number(e.target.value) })}
                                    >
                                        <option value={0}>None</option>
                                        {archetypes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label className={labelCls}>Notes</label>
                                <textarea
                                    className={`${inputCls} min-h-[80px] resize-y`}
                                    placeholder="Recruiter contact, interview notes, follow-up dates..."
                                    value={form.notes}
                                    onChange={e => setForm({ ...form, notes: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end border-t border-paper-inset-border pt-4 dark:border-charcoal-inset-border">
                            <Button type="submit" variant="accent">
                                {editingApp ? 'Update application' : 'Save application'}
                            </Button>
                        </div>
                    </form>
                </Card>
            )}

            {view === 'list' && (
                <>
                    <FilterPills options={filterOptions} active={statusFilter} onChange={key => setStatusFilter(key as ApplicationStatus | 'all')} />

                    <div className="flex flex-1 flex-col gap-3 overflow-y-auto pb-6 pr-2">
                        {filtered.length === 0 ? (
                            <EmptyState
                                title="No applications yet"
                                description='Track a job application manually, or hit "Track application" after generating a cover letter.'
                            />
                        ) : (
                            filtered.map(app => (
                                <Card key={app.id} className="flex shrink-0 items-center gap-4 p-4 animate-in fade-in duration-300 slide-in-from-bottom-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline gap-2">
                                            <span className="truncate font-serif text-lg font-semibold text-ink dark:text-cream">{app.role_title}</span>
                                            <span className="shrink-0 italic text-ink-muted dark:text-cream-muted">at {app.company}</span>
                                            {app.url && (
                                                <button
                                                    onClick={() => openUrl(app.url!).catch(console.error)}
                                                    className="shrink-0 text-ink-faint transition-colors hover:text-sienna dark:text-cream-faint dark:hover:text-sienna-dark"
                                                    title="Open job posting"
                                                >
                                                    <ExternalLink size={13} />
                                                </button>
                                            )}
                                        </div>
                                        <p className="mt-[3px] truncate text-[12.5px] text-ink-muted dark:text-cream-muted">
                                            Applied {formatDate(app.applied_at)}{app.cover_letter_id != null ? ' · letter attached' : ''}
                                        </p>
                                    </div>

                                    <StatusBadge status={app.status} interactive onChange={s => handleStatusChange(app, s)} />

                                    <div className="flex shrink-0 items-center gap-1.5">
                                        {app.cover_letter_id != null && (
                                            <>
                                                <Button variant="ghost-text" onClick={() => openViewLetter(app)}>letter</Button>
                                                <span className="text-ink-faint dark:text-cream-faint">·</span>
                                            </>
                                        )}
                                        <Button variant="ghost-text" onClick={() => startEdit(app)}>edit</Button>
                                        <span className="text-ink-faint dark:text-cream-faint">·</span>
                                        <Button variant="ghost-text" onClick={() => handleDelete(app.id)}>remove</Button>
                                    </div>
                                </Card>
                            ))
                        )}
                    </div>
                </>
            )}

            <Modal
                open={!!viewingApp}
                onClose={() => setViewingApp(null)}
                title={viewingApp ? `Cover Letter — ${viewingApp.company}` : ''}
            >
                {letters === null ? (
                    <p className="text-sm italic text-ink-muted dark:text-cream-muted">Loading...</p>
                ) : viewingLetter === null ? (
                    <p className="text-sm italic text-ink-muted dark:text-cream-muted">This letter no longer exists — it may have been deleted from History.</p>
                ) : (
                    <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-ink dark:text-cream">
                        {viewingLetter!.content}
                    </div>
                )}
            </Modal>
        </div>
    );
}
