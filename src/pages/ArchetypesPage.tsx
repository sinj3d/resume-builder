import { useState, useEffect } from 'react';
import { 
    listArchetypes, createArchetype, deleteArchetype, Archetype,
    listExperiences, Experience, listSkills, Skill,
    getArchetypeExperiences, tagExperience, untagExperience,
    getArchetypeSkills, tagSkill, untagSkill
} from '../lib/tauri';
import { Plus, Trash2, Tag, CheckSquare, Square, ChevronRight, Layers } from 'lucide-react';

export default function ArchetypesPage() {
    const [archetypes, setArchetypes] = useState<Archetype[]>([]);
    const [name, setName] = useState('');
    const [selectedArchetype, setSelectedArchetype] = useState<Archetype | null>(null);

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
        try {
            if (taggedExpIds.has(expId)) {
                await untagExperience(selectedArchetype.id, expId);
                setTaggedExpIds(prev => {
                    const next = new Set(prev);
                    next.delete(expId);
                    return next;
                });
            } else {
                await tagExperience(selectedArchetype.id, expId);
                setTaggedExpIds(prev => {
                    const next = new Set(prev);
                    next.add(expId);
                    return next;
                });
            }
        } catch (error) {
            console.error('Failed to toggle experience tag', error);
        }
    };

    const toggleSkillTag = async (skillId: number) => {
        if (!selectedArchetype) return;
        try {
            if (taggedSkillIds.has(skillId)) {
                await untagSkill(selectedArchetype.id, skillId);
                setTaggedSkillIds(prev => {
                    const next = new Set(prev);
                    next.delete(skillId);
                    return next;
                });
            } else {
                await tagSkill(selectedArchetype.id, skillId);
                setTaggedSkillIds(prev => {
                    const next = new Set(prev);
                    next.add(skillId);
                    return next;
                });
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
        <div className="flex flex-col h-full gap-6">
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 flex items-center gap-3">
                <Tag className="text-blue-500" /> Archetypes
            </h1>

            <div className="flex flex-col lg:flex-row gap-6 flex-1 h-full min-h-0">
                {/* Left Panel: Archetype List */}
                <div className="w-full lg:w-1/3 flex flex-col gap-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col h-full">
                        <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
                            <input 
                                className="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="New Archetype (e.g. Frontend)" 
                                value={name} 
                                onChange={e => setName(e.target.value)} 
                                required 
                            />
                            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-colors flex items-center justify-center">
                                <Plus size={18} />
                            </button>
                        </form>

                        <div className="flex-1 overflow-y-auto">
                            <ul className="flex flex-col gap-2 pr-2">
                                {archetypes.map(a => (
                                    <li 
                                        key={a.id} 
                                        className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${
                                            selectedArchetype?.id === a.id 
                                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 shadow-sm' 
                                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
                                        }`}
                                        onClick={() => handleSelectArchetype(a)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${selectedArchetype?.id === a.id ? 'bg-blue-100 text-blue-600 dark:bg-blue-800 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                                                <Layers size={16} />
                                            </div>
                                            <span className={`font-semibold ${selectedArchetype?.id === a.id ? 'text-blue-900 dark:text-blue-100' : 'text-slate-700 dark:text-slate-300'}`}>
                                                {a.name}
                                            </span>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={(e) => handleDeleteArch(e, a.id)}
                                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                            <ChevronRight size={16} className={selectedArchetype?.id === a.id ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'} />
                                        </div>
                                    </li>
                                ))}
                                {archetypes.length === 0 && (
                                    <p className="text-sm text-slate-500 italic text-center py-8">No archetypes created yet.</p>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Dual Checkbox Matrix */}
                <div className="w-full lg:w-2/3 flex flex-col">
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col h-full overflow-hidden">
                        <div className="p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20">
                            <h2 className="font-semibold text-lg text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                {selectedArchetype ? (
                                    <>Tagging: <span className="text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 px-3 py-1 rounded-full text-sm">{selectedArchetype.name}</span></>
                                ) : (
                                    "Select an archetype to start tagging"
                                )}
                            </h2>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5">
                            {!selectedArchetype ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-3 text-center">
                                    <Tag size={48} className="opacity-20" />
                                    <p>Select an archetype from the list on the left to assign experiences and skills to it.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-10 pr-2">
                                    {/* Skills Section */}
                                    <div className="flex flex-col gap-4">
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-2">
                                            1. Include Skills
                                        </h3>
                                        <div className="flex flex-col gap-6 pl-2">
                                            {Object.entries(skillsMap).map(([category, sks]) => (
                                                <div key={category} className="flex flex-col gap-3">
                                                    <h4 className="font-semibold text-slate-700 dark:text-slate-300">{category}</h4>
                                                    <div className="flex flex-wrap gap-2">
                                                        {sks.map(skill => {
                                                            const isTagged = taggedSkillIds.has(skill.id);
                                                            return (
                                                                <button
                                                                    key={skill.id}
                                                                    onClick={() => toggleSkillTag(skill.id)}
                                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-sm ${
                                                                        isTagged 
                                                                        ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 shadow-sm font-medium' 
                                                                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                                                                    }`}
                                                                >
                                                                    {isTagged ? <CheckSquare size={16} /> : <Square size={16} />}
                                                                    {skill.name}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                            {Object.keys(skillsMap).length === 0 && (
                                                <p className="text-sm text-slate-500 italic">No skills exist yet. Add them in the Profiler tab.</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Experiences Section */}
                                    <div className="flex flex-col gap-4">
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-2">
                                            2. Include Experiences
                                        </h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 pl-2">
                                            Select entire experiences to include. All of their bullet points will be transferred automatically.
                                        </p>
                                        <div className="flex flex-col gap-3 pl-2">
                                            {experiences.map(exp => {
                                                const isTagged = taggedExpIds.has(exp.id);
                                                return (
                                                    <div 
                                                        key={exp.id}
                                                        onClick={() => toggleExpTag(exp.id)}
                                                        className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                                                            isTagged 
                                                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 shadow-md' 
                                                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
                                                        }`}
                                                    >
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-3">
                                                                <div className="text-blue-500">
                                                                    {isTagged ? <CheckSquare size={20} className="text-blue-600 dark:text-blue-400" /> : <Square size={20} className="text-slate-300 dark:text-slate-600" />}
                                                                </div>
                                                                <span className={`font-semibold text-lg ${isTagged ? 'text-blue-900 dark:text-blue-100' : 'text-slate-800 dark:text-slate-200'}`}>
                                                                    {exp.title}
                                                                </span>
                                                            </div>
                                                            <div className="pl-8 text-sm text-slate-500 dark:text-slate-400">
                                                                {exp.org} • {exp.start_date} to {exp.end_date || 'Present'}
                                                            </div>
                                                        </div>
                                                        <div className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 text-xs font-semibold px-2 py-1 rounded-md uppercase tracking-wider">
                                                            {exp.category}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {experiences.length === 0 && (
                                                <p className="text-sm text-slate-500 italic">No experiences exist yet. Go to the Experiences tab to add some.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
