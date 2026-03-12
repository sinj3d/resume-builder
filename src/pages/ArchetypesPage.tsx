import { useState, useEffect } from 'react';
import { 
    listArchetypes, createArchetype, deleteArchetype, Archetype,
    listExperiences, listBullets, Experience, BulletPoint,
    getArchetypeBullets, tagBullet, untagBullet
} from '../lib/tauri';
import { Plus, Trash2, Tag, CheckSquare, Square, ChevronRight, Layers } from 'lucide-react';

export default function ArchetypesPage() {
    const [archetypes, setArchetypes] = useState<Archetype[]>([]);
    const [name, setName] = useState('');
    const [selectedArchetype, setSelectedArchetype] = useState<Archetype | null>(null);

    // To display the master list of bullets to tag
    const [experiences, setExperiences] = useState<Experience[]>([]);
    const [allBullets, setAllBullets] = useState<Record<number, BulletPoint[]>>({}); // expId -> bullets
    
    // To track which bullets belong to the selected archetype
    const [taggedBulletIds, setTaggedBulletIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        loadArchetypes();
        loadMasterList();
    }, []);

    const loadArchetypes = async () => {
        try {
            const data = await listArchetypes();
            setArchetypes(data);
        } catch (error) {
            console.error('Failed to load archetypes', error);
        }
    };

    const loadMasterList = async () => {
        try {
            const exps = await listExperiences();
            setExperiences(exps);
            const bulletsMap: Record<number, BulletPoint[]> = {};
            for (const exp of exps) {
                const b = await listBullets(exp.id);
                bulletsMap[exp.id] = b;
            }
            setAllBullets(bulletsMap);
        } catch (error) {
            console.error('Failed to load master list', error);
        }
    };

    const handleSelectArchetype = async (arch: Archetype) => {
        setSelectedArchetype(arch);
        try {
            const bullets = await getArchetypeBullets(arch.id);
            setTaggedBulletIds(new Set(bullets.map(b => b.id)));
        } catch (error) {
            console.error('Failed to fetch archetype bullets', error);
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

    const toggleTag = async (bulletId: number) => {
        if (!selectedArchetype) return;
        try {
            if (taggedBulletIds.has(bulletId)) {
                await untagBullet(selectedArchetype.id, bulletId);
                setTaggedBulletIds(prev => {
                    const next = new Set(prev);
                    next.delete(bulletId);
                    return next;
                });
            } else {
                await tagBullet(selectedArchetype.id, bulletId);
                setTaggedBulletIds(prev => {
                    const next = new Set(prev);
                    next.add(bulletId);
                    return next;
                });
            }
        } catch (error) {
            console.error('Failed to toggle tag', error);
        }
    };

    const handleDeleteArch = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        try {
            await deleteArchetype(id);
            if (selectedArchetype?.id === id) {
                setSelectedArchetype(null);
                setTaggedBulletIds(new Set());
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

                {/* Right Panel: Checkbox Matrix */}
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
                                    <p>Select an archetype from the list on the left to assign bullet points to it.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-8 pr-2">
                                    {experiences.map(exp => {
                                        const expBullets = allBullets[exp.id] || [];
                                        if (expBullets.length === 0) return null; // Skip empty experiences

                                        return (
                                            <div key={exp.id} className="flex flex-col gap-3">
                                                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-2">
                                                    {exp.title} <span className="text-slate-500 font-normal">at {exp.org}</span>
                                                </h3>
                                                
                                                <ul className="flex flex-col gap-2">
                                                    {expBullets.map(bullet => {
                                                        const isTagged = taggedBulletIds.has(bullet.id);
                                                        return (
                                                            <li 
                                                                key={bullet.id}
                                                                onClick={() => toggleTag(bullet.id)}
                                                                className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                                                                    isTagged 
                                                                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 shadow-sm' 
                                                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                                                                }`}
                                                            >
                                                                <div className="mt-0.5 shrink-0 text-blue-500 transition-transform">
                                                                    {isTagged ? <CheckSquare size={18} className="text-blue-600 dark:text-blue-400" /> : <Square size={18} className="text-slate-300 dark:text-slate-600" />}
                                                                </div>
                                                                <div className={`flex-1 text-sm ${isTagged ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-600 dark:text-slate-400'}`}>
                                                                    {bullet.content}
                                                                </div>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        );
                                    })}

                                    {experiences.every(exp => (allBullets[exp.id] || []).length === 0) && (
                                        <p className="text-sm text-slate-500 italic">No bullet points exist yet. Go to the Experiences tab to add some.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
