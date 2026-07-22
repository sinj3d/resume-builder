import { useState, useEffect } from 'react';
import {
    listArchetypes, createArchetype, deleteArchetype, Archetype,
    listExperiences, Experience, listSkills, Skill,
    getArchetypeExperiences, tagExperience, untagExperience,
    getArchetypeSkills, tagSkill, untagSkill
} from '../lib/tauri';
import { PageHeader, Button, Card, EmptyState, CategoryLabel } from '../components/ui';

const inputCls = "w-full px-3 py-2 bg-paper dark:bg-charcoal-inset border border-paper-border dark:border-charcoal-border rounded text-sm text-ink dark:text-cream placeholder:text-ink-faint dark:placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sienna/30 focus:border-sienna transition-all";
const labelCls = "text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-muted dark:text-cream-muted";

interface ArchetypeCounts {
    exp: number;
    skill: number;
}

export default function ArchetypesPage() {
    const [archetypes, setArchetypes] = useState<Archetype[]>([]);
    const [name, setName] = useState('');
    const [selectedArchetype, setSelectedArchetype] = useState<Archetype | null>(null);
    const [archetypeCounts, setArchetypeCounts] = useState<Record<number, ArchetypeCounts>>({});

    // Master lists
    const [experiences, setExperiences] = useState<Experience[]>([]);
    const [skillsMap, setSkillsMap] = useState<Record<string, Skill[]>>({});

    // Tagged states for the selected archetype
    const [taggedExpIds, setTaggedExpIds] = useState<Set<number>>(new Set());
    const [taggedSkillIds, setTaggedSkillIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        loadArchetypes();
        loadMasterLists();
    }, []);

    const loadArchetypes = async () => {
        try {
            const data = await listArchetypes();
            setArchetypes(data);
            const counts = await Promise.all(data.map(async a => {
                const [exps, sks] = await Promise.all([getArchetypeExperiences(a.id), getArchetypeSkills(a.id)]);
                return [a.id, { exp: exps.length, skill: sks.length }] as const;
            }));
            setArchetypeCounts(Object.fromEntries(counts));
        } catch (error) {
            console.error('Failed to load archetypes', error);
        }
    };

    const loadMasterLists = async () => {
        try {
            const exps = await listExperiences();
            setExperiences(exps);

            const skills = await listSkills();
            const sm: Record<string, Skill[]> = {};
            for (const s of skills) {
                if (!sm[s.category]) sm[s.category] = [];
                sm[s.category].push(s);
            }
            setSkillsMap(sm);
        } catch (error) {
            console.error('Failed to load master lists', error);
        }
    };

    const handleSelectArchetype = async (arch: Archetype) => {
        setSelectedArchetype(arch);
        try {
            const exps = await getArchetypeExperiences(arch.id);
            setTaggedExpIds(new Set(exps.map(e => e.id)));

            const sks = await getArchetypeSkills(arch.id);
            setTaggedSkillIds(new Set(sks.map(s => s.id)));
        } catch (error) {
            console.error('Failed to fetch archetype tags', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createArchetype(name);
            setName('');
            loadArchetypes();
        } catch (error) {
            console.error('Failed to create archetype', error);
        }
    };

    const toggleExpTag = async (expId: number) => {
        if (!selectedArchetype) return;
        const archId = selectedArchetype.id;
        try {
            if (taggedExpIds.has(expId)) {
                await untagExperience(archId, expId);
                setTaggedExpIds(prev => {
                    const next = new Set(prev);
                    next.delete(expId);
                    return next;
                });
                setArchetypeCounts(prev => ({
                    ...prev,
                    [archId]: { ...prev[archId], exp: (prev[archId]?.exp ?? 1) - 1 },
                }));
            } else {
                await tagExperience(archId, expId);
                setTaggedExpIds(prev => {
                    const next = new Set(prev);
                    next.add(expId);
                    return next;
                });
                setArchetypeCounts(prev => ({
                    ...prev,
                    [archId]: { ...prev[archId], exp: (prev[archId]?.exp ?? 0) + 1 },
                }));
            }
        } catch (error) {
            console.error('Failed to toggle experience tag', error);
        }
    };

    const toggleSkillTag = async (skillId: number) => {
        if (!selectedArchetype) return;
        const archId = selectedArchetype.id;
        try {
            if (taggedSkillIds.has(skillId)) {
                await untagSkill(archId, skillId);
                setTaggedSkillIds(prev => {
                    const next = new Set(prev);
                    next.delete(skillId);
                    return next;
                });
                setArchetypeCounts(prev => ({
                    ...prev,
                    [archId]: { ...prev[archId], skill: (prev[archId]?.skill ?? 1) - 1 },
                }));
            } else {
                await tagSkill(archId, skillId);
                setTaggedSkillIds(prev => {
                    const next = new Set(prev);
                    next.add(skillId);
                    return next;
                });
                setArchetypeCounts(prev => ({
                    ...prev,
                    [archId]: { ...prev[archId], skill: (prev[archId]?.skill ?? 0) + 1 },
                }));
            }
        } catch (error) {
            console.error('Failed to toggle skill tag', error);
        }
    };

    const handleDeleteArch = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        try {
            await deleteArchetype(id);
            if (selectedArchetype?.id === id) {
                setSelectedArchetype(null);
                setTaggedExpIds(new Set());
                setTaggedSkillIds(new Set());
            }
            loadArchetypes();
        } catch (error) {
            console.error('Failed to delete archetype', error);
        }
    };

    return (
        <div className="flex h-full flex-col gap-6">
            <PageHeader title="Archetypes" subtitle="One record, many tellings — a profile per kind of role" />

            <div className="flex h-full min-h-0 flex-1 flex-col gap-5 lg:flex-row">
                {/* Left Panel: Archetype List */}
                <div className="flex w-full flex-col lg:w-[300px] lg:shrink-0">
                    <Card className="flex h-full flex-col p-5">
                        <form onSubmit={handleSubmit} className="mb-4 flex gap-2">
                            <input
                                className={`flex-1 ${inputCls}`}
                                placeholder="Name a new archetype…"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                            />
                            <Button type="submit" variant="outline" strong size="sm">Add</Button>
                        </form>

                        <div className="flex-1 overflow-y-auto">
                            <ul className="flex flex-col gap-2.5 pr-1">
                                {archetypes.map(a => {
                                    const isSelected = selectedArchetype?.id === a.id;
                                    const counts = archetypeCounts[a.id];
                                    return (
                                        <li key={a.id}>
                                            <Card
                                                selected={isSelected}
                                                onClick={() => handleSelectArchetype(a)}
                                                className="group flex items-center justify-between p-4"
                                            >
                                                <div>
                                                    <div className={`font-serif text-[17px] font-semibold ${isSelected ? 'text-sienna dark:text-sienna-dark' : 'text-ink dark:text-cream'}`}>
                                                        {a.name}
                                                    </div>
                                                    <div className="mt-[3px] text-[11.5px] text-ink-muted dark:text-cream-muted">
                                                        {counts ? `${counts.exp} experiences · ${counts.skill} skills` : '—'}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2.5">
                                                    <Button
                                                        variant="ghost-text"
                                                        className="opacity-0 group-hover:opacity-100"
                                                        onClick={e => handleDeleteArch(e, a.id)}
                                                    >
                                                        remove
                                                    </Button>
                                                    <span className={isSelected ? 'text-sienna dark:text-sienna-dark' : 'text-ink-faint dark:text-cream-faint'}>›</span>
                                                </div>
                                            </Card>
                                        </li>
                                    );
                                })}
                                {archetypes.length === 0 && (
                                    <p className="py-8 text-center text-sm italic text-ink-muted dark:text-cream-muted">
                                        No archetypes created yet.
                                    </p>
                                )}
                            </ul>
                        </div>
                    </Card>
                </div>

                {/* Right Panel: Tagging */}
                <div className="flex w-full flex-1 flex-col">
                    <Card className="flex h-full flex-col overflow-hidden">
                        <div className="border-b border-paper-inset-border bg-paper-inset px-6 py-4 text-sm text-ink dark:border-charcoal-inset-border dark:bg-charcoal-inset dark:text-cream">
                            {selectedArchetype ? (
                                <>Tagging <span className="font-serif font-semibold italic text-sienna dark:text-sienna-dark">{selectedArchetype.name}</span></>
                            ) : (
                                'Select an archetype to start tagging'
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {!selectedArchetype ? (
                                <EmptyState
                                    title="Nothing selected"
                                    description="Select an archetype from the list on the left to assign experiences and skills to it."
                                />
                            ) : (
                                <div className="flex flex-col gap-8">
                                    {/* Skills Section */}
                                    <div className="flex flex-col gap-3">
                                        <div className={labelCls}>1 · Skills to include</div>
                                        <div className="flex flex-col gap-5">
                                            {Object.entries(skillsMap).map(([category, sks]) => (
                                                <div key={category} className="flex flex-col gap-2.5">
                                                    <h4 className="text-sm font-semibold text-ink dark:text-cream">{category}</h4>
                                                    <div className="flex flex-wrap gap-2">
                                                        {sks.map(skill => {
                                                            const isTagged = taggedSkillIds.has(skill.id);
                                                            return (
                                                                <button
                                                                    key={skill.id}
                                                                    onClick={() => toggleSkillTag(skill.id)}
                                                                    className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-all ${
                                                                        isTagged
                                                                            ? 'border border-sienna bg-[rgba(138,61,34,.06)] text-sienna dark:border-sienna-dark dark:bg-[rgba(217,140,95,.10)] dark:text-sienna-dark'
                                                                            : 'border border-paper-border text-ink-muted-2 hover:border-ink-muted dark:border-charcoal-border dark:text-cream-muted'
                                                                    }`}
                                                                >
                                                                    {isTagged ? '✓ ' : ''}{skill.name}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                            {Object.keys(skillsMap).length === 0 && (
                                                <p className="text-sm italic text-ink-muted dark:text-cream-muted">No skills exist yet. Add them on the Profile page.</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Experiences Section */}
                                    <div className="flex flex-col gap-3">
                                        <div className={labelCls}>
                                            2 · Experiences to include{' '}
                                            <span className="normal-case tracking-normal text-ink-faint dark:text-cream-faint">— all of their bullets travel with them</span>
                                        </div>
                                        <div className="flex flex-col gap-2.5">
                                            {experiences.map(exp => {
                                                const isTagged = taggedExpIds.has(exp.id);
                                                return (
                                                    <Card
                                                        key={exp.id}
                                                        selected={isTagged}
                                                        onClick={() => toggleExpTag(exp.id)}
                                                        className="flex items-center justify-between p-3.5"
                                                    >
                                                        <div className="flex items-baseline gap-3">
                                                            <span className={isTagged ? 'font-semibold text-sienna dark:text-sienna-dark' : 'text-ink-faint dark:text-cream-faint'}>
                                                                {isTagged ? '✓' : '◻'}
                                                            </span>
                                                            <span className="font-serif text-base font-semibold text-ink dark:text-cream">
                                                                {exp.title}
                                                            </span>
                                                            <span className="text-[12.5px] italic text-ink-muted dark:text-cream-muted">{exp.org}</span>
                                                        </div>
                                                        <CategoryLabel muted={!isTagged}>{exp.category}</CategoryLabel>
                                                    </Card>
                                                );
                                            })}
                                            {experiences.length === 0 && (
                                                <p className="text-sm italic text-ink-muted dark:text-cream-muted">No experiences exist yet. Go to the Experiences page to add some.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
