import { useState, useEffect, useMemo } from 'react';
import {
    listExperiences, createExperience, updateExperience, deleteExperience, Experience,
    listBullets, createBullet, deleteBullet, updateBullet, BulletPoint,
    getEducationDetails, upsertEducationDetails, deleteEducationDetails,
} from '../lib/tauri';
import { GraduationCap } from 'lucide-react';
import { PageHeader, Button, Card, FilterPills, EmptyState, Toast, CategoryLabel } from '../components/ui';

/// Mirrors the education arm of `normalize_category` in latex/template.rs.
const isEducationCategory = (cat: string) =>
    ['education', 'school', 'academic'].includes(cat.trim().toLowerCase());

const EMPTY_EDU_FORM = { degree: '', gpa: '', coursework: '', honors: '' };

/// Split pasted/typed multi-line text into clean bullet strings, stripping
/// leading bullet glyphs copied from other documents.
const splitBulletLines = (text: string): string[] =>
    text
        .split(/\r?\n/)
        .map(l => l.replace(/^\s*[•·▪‣◦*\-–—]\s*/, '').trim())
        .filter(l => l.length > 0);

const inputCls = "w-full px-3 py-2 bg-paper dark:bg-charcoal-inset border border-paper-border dark:border-charcoal-border rounded text-sm text-ink dark:text-cream placeholder:text-ink-faint dark:placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sienna/30 focus:border-sienna transition-all";
const labelCls = "text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-muted dark:text-cream-muted";

export default function ExperiencesPage() {
    const [experiences, setExperiences] = useState<Experience[]>([]);
    const [expandedExpId, setExpandedExpId] = useState<number | null>(null);
    const [bullets, setBullets] = useState<Record<number, BulletPoint[]>>({});
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    // View state
    const [view, setView] = useState<'list' | 'create'>('list');
    const [notification, setNotification] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Form state (editingExp !== null means the form updates an existing experience)
    const [editingExp, setEditingExp] = useState<Experience | null>(null);
    const [expForm, setExpForm] = useState({ title: '', org: '', start_date: '', end_date: '', category: '' });
    const [isCurrentJob, setIsCurrentJob] = useState(false);
    const [customCategory, setCustomCategory] = useState('');
    const [eduForm, setEduForm] = useState(EMPTY_EDU_FORM);
    const [bulletsText, setBulletsText] = useState('');

    // Bullet state
    const [newBulletContent, setNewBulletContent] = useState('');
    const [editingBulletId, setEditingBulletId] = useState<number | null>(null);
    const [editBulletContent, setEditBulletContent] = useState('');

    useEffect(() => {
        loadExperiences();
    }, []);

    // Clear notification after 3 seconds
    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    // Clear error after 5 seconds
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const loadExperiences = async () => {
        try {
            const data = await listExperiences();
            setExperiences(data);
            // Eager-load bullets for every experience so collapsed cards can show
            // "{N} bullets" without requiring an expand first.
            const bulletLists = await Promise.all(data.map(exp => listBullets(exp.id)));
            setBullets(Object.fromEntries(data.map((exp, i) => [exp.id, bulletLists[i]])));
        } catch (error) {
            console.error('Failed to load experiences', error);
        }
    };

    const loadBullets = async (expId: number) => {
        try {
            const data = await listBullets(expId);
            setBullets(prev => ({ ...prev, [expId]: data }));
        } catch (error) {
            console.error(`Failed to load bullets for exp ${expId}`, error);
        }
    };

    const toggleExpand = (expId: number) => {
        if (expandedExpId === expId) {
            setExpandedExpId(null);
        } else {
            setExpandedExpId(expId);
            if (!bullets[expId]) {
                loadBullets(expId);
            }
        }
    };

    const resetForm = () => {
        setExpForm({ title: '', org: '', start_date: '', end_date: '', category: '' });
        setIsCurrentJob(false);
        setCustomCategory('');
        setEduForm(EMPTY_EDU_FORM);
        setBulletsText('');
        setEditingExp(null);
    };

    const startEdit = (exp: Experience) => {
        setEditingExp(exp);
        const isPresent = (exp.end_date || '').toLowerCase() === 'present';
        setExpForm({
            title: exp.title,
            org: exp.org || '',
            start_date: exp.start_date || '',
            end_date: isPresent ? '' : (exp.end_date || ''),
            category: exp.category,
        });
        setIsCurrentJob(isPresent);
        setCustomCategory('');
        setEduForm(EMPTY_EDU_FORM);
        if (isEducationCategory(exp.category)) {
            getEducationDetails(exp.id)
                .then(details => {
                    if (details) {
                        setEduForm({
                            degree: details.degree || '',
                            gpa: details.gpa || '',
                            coursework: details.coursework || '',
                            honors: details.honors || '',
                        });
                    }
                })
                .catch(console.error);
        }
        setView('create');
    };

    const handleSubmitExp = async (e: React.FormEvent) => {
        e.preventDefault();

        let finalCategory = expForm.category;
        if (finalCategory === 'Other') {
            finalCategory = customCategory;
        }

        let finalEndDate = expForm.end_date;
        if (isCurrentJob) {
            finalEndDate = 'Present';
        }

        try {
            let expId: number;
            if (editingExp) {
                await updateExperience(editingExp.id, expForm.title, expForm.org, expForm.start_date, finalEndDate, finalCategory);
                expId = editingExp.id;
                setNotification('Experience updated!');
            } else {
                const created = await createExperience(expForm.title, expForm.org, expForm.start_date, finalEndDate, finalCategory);
                expId = created.id;
                for (const line of splitBulletLines(bulletsText)) {
                    await createBullet(expId, line);
                }
                setNotification('Experience successfully added!');
            }

            if (isEducationCategory(finalCategory)) {
                await upsertEducationDetails({
                    experience_id: expId,
                    degree: eduForm.degree || null,
                    gpa: eduForm.gpa || null,
                    coursework: eduForm.coursework || null,
                    honors: eduForm.honors || null,
                });
            } else if (editingExp && isEducationCategory(editingExp.category)) {
                // Category changed away from education: drop the stale details.
                await deleteEducationDetails(expId);
            }
            resetForm();

            await loadExperiences();
            setError(null);
            setView('list');
        } catch (err: any) {
            console.error('Failed to save experience', err);
            setError(typeof err === 'string' ? err : err.message || JSON.stringify(err));
        }
    };

    const handleCreateBullet = async (expId: number, e: React.FormEvent) => {
        e.preventDefault();
        if (!newBulletContent.trim()) return;
        try {
            await createBullet(expId, newBulletContent);
            setNewBulletContent('');
            loadBullets(expId);
        } catch (error) {
            console.error('Failed to create bullet', error);
        }
    };

    /** Pasting a multi-line list into the bullet input creates one bullet per
     *  line immediately (leading bullet glyphs are stripped). */
    const handleBulletPaste = async (expId: number, e: React.ClipboardEvent<HTMLInputElement>) => {
        const text = e.clipboardData.getData('text');
        if (!text.includes('\n')) return; // single line: default paste behavior
        e.preventDefault();
        const lines = splitBulletLines(text);
        try {
            for (const line of lines) {
                await createBullet(expId, line);
            }
            setNewBulletContent('');
            loadBullets(expId);
            setNotification(`Added ${lines.length} bullet points from paste.`);
        } catch (error) {
            console.error('Failed to paste bullets', error);
        }
    };

    const handleUpdateBullet = async (expId: number, bulletId: number, order: number) => {
        if (!editBulletContent.trim()) return;
        try {
            await updateBullet(bulletId, editBulletContent, order);
            setEditingBulletId(null);
            loadBullets(expId);
        } catch (error) {
            console.error('Failed to update bullet', error);
        }
    };

    // Calculate unique categories for the dropdown
    const availableCategories = useMemo(() => {
        const defaults = ['Professional Experience', 'Education', 'Project', 'Leadership', 'Volunteer'];
        const existing = experiences.map(e => e.category);
        return Array.from(new Set([...defaults, ...existing]));
    }, [experiences]);

    const categoryFilterOptions = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const exp of experiences) {
            counts[exp.category] = (counts[exp.category] || 0) + 1;
        }
        return [
            { key: 'all', label: 'All', count: experiences.length },
            ...Object.entries(counts).map(([cat, count]) => ({ key: cat, label: cat, count })),
        ];
    }, [experiences]);

    const filteredExperiences = useMemo(
        () => (categoryFilter === 'all' ? experiences : experiences.filter(e => e.category === categoryFilter)),
        [experiences, categoryFilter],
    );

    const totalBullets = useMemo(
        () => Object.values(bullets).reduce((sum, arr) => sum + arr.length, 0),
        [bullets],
    );

    // Format YYYY-MM to something nicer if needed, or leave it as is if it's Present
    const displayDate = (dateStr: string) => {
        if (!dateStr) return '';
        if (dateStr.toLowerCase() === 'present') return 'Present';

        // Try parsing YYYY-MM
        const [year, month] = dateStr.split('-');
        if (year && month) {
            const date = new Date(parseInt(year), parseInt(month) - 1);
            return date.toLocaleDateString('default', { month: 'short', year: 'numeric' });
        }
        return dateStr;
    };

    return (
        <div className="relative flex h-full flex-col gap-6">
            <PageHeader
                title="Experiences"
                subtitle={`Your master record — ${experiences.length} ${experiences.length === 1 ? 'entry' : 'entries'}, ${totalBullets} bullet points`}
                action={
                    view === 'list' ? (
                        <Button onClick={() => { resetForm(); setView('create'); }}>Add an entry</Button>
                    ) : (
                        <Button variant="outline" onClick={() => { resetForm(); setView('list'); }}>Back to list</Button>
                    )
                }
            />

            <Toast message={notification} variant="success" />
            <Toast message={error} variant="error" />

            {view === 'list' && experiences.length > 0 && (
                <FilterPills options={categoryFilterOptions} active={categoryFilter} onChange={setCategoryFilter} />
            )}

            {view === 'create' && (
                <Card className="max-w-3xl p-6 animate-in fade-in zoom-in-95 duration-200">
                    <h2 className="mb-6 font-serif text-xl font-semibold text-ink dark:text-cream">
                        {editingExp ? 'Edit experience' : 'New experience details'}
                    </h2>

                    <form onSubmit={handleSubmitExp} className="flex flex-col gap-5">
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                                <label className={labelCls}>Role title</label>
                                <input className={inputCls}
                                    placeholder="e.g. Software Engineer"
                                    value={expForm.title}
                                    onChange={e => setExpForm({ ...expForm, title: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className={labelCls}>Organization / company</label>
                                <input className={inputCls}
                                    placeholder="e.g. Acme Corp"
                                    value={expForm.org}
                                    onChange={e => setExpForm({ ...expForm, org: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className={labelCls}>Start date</label>
                                <input
                                    type="month"
                                    className={inputCls}
                                    value={expForm.start_date}
                                    onChange={e => setExpForm({ ...expForm, start_date: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between">
                                    <label className={labelCls}>End date</label>
                                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted hover:text-ink dark:text-cream-muted dark:hover:text-cream">
                                        <input
                                            type="checkbox"
                                            checked={isCurrentJob}
                                            onChange={e => setIsCurrentJob(e.target.checked)}
                                            className="accent-sienna"
                                        />
                                        I currently work here
                                    </label>
                                </div>
                                <input
                                    type="month"
                                    disabled={isCurrentJob}
                                    className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-50`}
                                    value={isCurrentJob ? '' : expForm.end_date}
                                    onChange={e => setExpForm({ ...expForm, end_date: e.target.value })}
                                    required={!isCurrentJob}
                                />
                            </div>

                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label className={labelCls}>Category</label>
                                <div className="flex gap-3">
                                    <select
                                        className={`flex-1 ${inputCls}`}
                                        value={expForm.category}
                                        onChange={e => setExpForm({ ...expForm, category: e.target.value })}
                                        required
                                    >
                                        <option value="" disabled>Select a category...</option>
                                        {availableCategories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                        <option value="Other">Other (Type custom...)</option>
                                    </select>

                                    {expForm.category === 'Other' && (
                                        <input className={`flex-1 ${inputCls} animate-in fade-in slide-in-from-left-2`}
                                            placeholder="Enter custom category"
                                            value={customCategory}
                                            onChange={e => setCustomCategory(e.target.value)}
                                            required
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Bullet points (create only — existing entries manage bullets on their card) */}
                            {!editingExp && (
                                <div className="flex flex-col gap-1.5 md:col-span-2">
                                    <label className={labelCls}>
                                        Bullet points <span className="text-[10px] font-normal normal-case tracking-normal text-ink-faint dark:text-cream-faint">(one per line — paste a list directly)</span>
                                    </label>
                                    <textarea
                                        className={`${inputCls} min-h-[90px] resize-y`}
                                        placeholder={"Built a REST API serving 10k req/s\nReduced deployment time by 60%"}
                                        value={bulletsText}
                                        onChange={e => setBulletsText(e.target.value)}
                                    />
                                </div>
                            )}

                            {/* Education-specific fields */}
                            {isEducationCategory(expForm.category === 'Other' ? customCategory : expForm.category) && (
                                <div className="flex flex-col gap-4 rounded border border-paper-inset-border bg-paper-inset p-4 dark:border-charcoal-inset-border dark:bg-charcoal-inset md:col-span-2 animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-sienna dark:text-sienna-dark">
                                        <GraduationCap size={16} /> Education details <span className="text-xs font-normal text-ink-faint dark:text-cream-faint">(all optional)</span>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <div className="flex flex-col gap-1.5">
                                            <label className={labelCls}>Degree &amp; major</label>
                                            <input className={inputCls}
                                                placeholder="e.g. B.S. Computer Science"
                                                value={eduForm.degree}
                                                onChange={e => setEduForm({ ...eduForm, degree: e.target.value })}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className={labelCls}>GPA</label>
                                            <input className={inputCls}
                                                placeholder="e.g. 3.87/4.0"
                                                value={eduForm.gpa}
                                                onChange={e => setEduForm({ ...eduForm, gpa: e.target.value })}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5 md:col-span-2">
                                            <label className={labelCls}>Relevant coursework</label>
                                            <textarea className={`${inputCls} min-h-[60px] resize-y`}
                                                placeholder="e.g. Algorithms, Operating Systems, Machine Learning"
                                                value={eduForm.coursework}
                                                onChange={e => setEduForm({ ...eduForm, coursework: e.target.value })}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5 md:col-span-2">
                                            <label className={labelCls}>Honors / awards</label>
                                            <input className={inputCls}
                                                placeholder="e.g. Dean's List, magna cum laude"
                                                value={eduForm.honors}
                                                onChange={e => setEduForm({ ...eduForm, honors: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mt-4 flex justify-end border-t border-paper-inset-border pt-4 dark:border-charcoal-inset-border">
                            <Button type="submit" variant="accent">
                                {editingExp ? 'Update experience' : 'Save experience'}
                            </Button>
                        </div>
                    </form>
                </Card>
            )}

            {/* Experience List */}
            {view === 'list' && (
                <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto pb-6 pr-2">
                    {experiences.length === 0 ? (
                        <EmptyState
                            title="No experiences yet"
                            description='Click "Add an entry" above to get started, or import a resume from the onboarding page.'
                        />
                    ) : filteredExperiences.length === 0 ? (
                        <p className="p-8 text-center text-sm italic text-ink-muted dark:text-cream-muted">
                            No experiences in this category.
                        </p>
                    ) : (
                        filteredExperiences.map(exp => (
                            // shrink-0: without it the fixed-height flex column compresses
                            // the (overflow-hidden) cards instead of letting the list scroll.
                            <Card key={exp.id} className="shrink-0 overflow-hidden animate-in fade-in duration-300 slide-in-from-bottom-2">
                                <div
                                    className="flex cursor-pointer items-start justify-between p-[22px] px-[26px]"
                                    onClick={() => toggleExpand(exp.id)}
                                >
                                    <div>
                                        <div className="font-serif text-xl font-semibold text-ink dark:text-cream">
                                            {exp.title} <span className="font-normal italic text-ink-muted dark:text-cream-muted">at {exp.org}</span>
                                        </div>
                                        <div className="mt-[7px] flex items-center gap-3.5">
                                            <CategoryLabel>{exp.category}</CategoryLabel>
                                            <span className="text-[12.5px] text-ink-muted dark:text-cream-muted">
                                                {displayDate(exp.start_date)} — {displayDate(exp.end_date)}
                                            </span>
                                        </div>
                                    </div>
                                    {expandedExpId === exp.id ? (
                                        <div className="flex shrink-0 items-center gap-1.5">
                                            <Button variant="ghost-text" onClick={e => { e.stopPropagation(); startEdit(exp); }}>edit</Button>
                                            <span className="text-ink-faint dark:text-cream-faint">·</span>
                                            <Button variant="ghost-text" onClick={e => { e.stopPropagation(); deleteExperience(exp.id).then(loadExperiences); }}>remove</Button>
                                            <span className="text-ink-faint dark:text-cream-faint">·</span>
                                            <Button variant="ghost-text" onClick={e => { e.stopPropagation(); toggleExpand(exp.id); }}>collapse</Button>
                                        </div>
                                    ) : (
                                        <span className="shrink-0 text-[13px] text-ink-muted dark:text-cream-muted">
                                            {bullets[exp.id]?.length ?? 0} bullets ›
                                        </span>
                                    )}
                                </div>

                                {expandedExpId === exp.id && (
                                    <div className="border-t border-paper-inset-border bg-paper-inset px-[26px] pb-6 pt-5 dark:border-charcoal-inset-border dark:bg-charcoal-inset">
                                        <div className="mb-3.5 text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-muted dark:text-cream-muted">
                                            Bullet points · {bullets[exp.id]?.length || 0}
                                        </div>

                                        <div className="flex flex-col gap-2.5">
                                            {bullets[exp.id]?.map(bullet => (
                                                <div key={bullet.id} className="group flex items-start gap-3 text-sm leading-[1.55]">
                                                    {editingBulletId === bullet.id ? (
                                                        <div className="flex flex-1 gap-2">
                                                            <input
                                                                autoFocus
                                                                className={inputCls}
                                                                value={editBulletContent}
                                                                onChange={e => setEditBulletContent(e.target.value)}
                                                                onKeyDown={e => { if (e.key === 'Enter') handleUpdateBullet(exp.id, bullet.id, bullet.sort_order); }}
                                                            />
                                                            <Button size="sm" onClick={() => handleUpdateBullet(exp.id, bullet.id, bullet.sort_order)}>
                                                                Save
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <span className="text-sienna dark:text-sienna-dark">—</span>
                                                            <span className="flex-1 text-ink dark:text-cream">{bullet.content}</span>
                                                            <div className="hidden shrink-0 items-center gap-2 group-hover:flex">
                                                                <Button variant="ghost-text" onClick={() => { setEditingBulletId(bullet.id); setEditBulletContent(bullet.content); }}>
                                                                    edit
                                                                </Button>
                                                                <Button variant="ghost-text" onClick={() => deleteBullet(bullet.id).then(() => loadBullets(exp.id))}>
                                                                    delete
                                                                </Button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            ))}
                                            {(!bullets[exp.id] || bullets[exp.id].length === 0) && (
                                                <p className="text-sm italic text-ink-faint dark:text-cream-faint">
                                                    No bullet points yet. Add accomplishments below.
                                                </p>
                                            )}
                                        </div>

                                        <form onSubmit={e => handleCreateBullet(exp.id, e)} className="mt-[18px] flex gap-2.5">
                                            <input
                                                className={`flex-1 ${inputCls}`}
                                                placeholder="Add an accomplishment — or paste a whole list…"
                                                value={newBulletContent}
                                                onChange={e => setNewBulletContent(e.target.value)}
                                                onPaste={e => handleBulletPaste(exp.id, e)}
                                            />
                                            <Button type="submit" variant="outline" strong size="sm">Add</Button>
                                        </form>
                                    </div>
                                )}
                            </Card>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
