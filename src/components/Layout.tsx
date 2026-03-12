import { Outlet, NavLink } from 'react-router-dom';
import { Briefcase, Tags, FileText, FileCode2, Settings, PenTool, UserCircle } from 'lucide-react';

export default function Layout() {
    const navItems = [
        { to: "/bio", label: "Profiler", icon: UserCircle },
        { to: "/", label: "Experiences", icon: Briefcase },
        { to: "/archetypes", label: "Archetypes", icon: Tags },
        { to: "/generate", label: "Cover Letter", icon: FileText },
        { to: "/latex", label: "Resume Editor", icon: FileCode2 },
        { to: "/onboarding", label: "PDF Import", icon: PenTool },
        { to: "/settings", label: "Settings", icon: Settings },
    ];

    return (
        <div className="flex h-screen bg-transparent overflow-hidden">
            {/* Sidebar */}
            <nav className="w-64 glass-panel flex flex-col p-6 m-4 rounded-2xl z-10 shrink-0">
                <div className="mb-10 flex items-center gap-3 px-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-400 flex items-center justify-center text-white font-bold shadow-lg">
                        R
                    </div>
                    <h2 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-indigo-500 dark:from-blue-400 dark:to-indigo-300">
                        ResumeBuilder
                    </h2>
                </div>
                
                <ul className="flex flex-col gap-2 flex-1">
                    {navItems.map((item) => (
                        <li key={item.to}>
                            <NavLink 
                                to={item.to}
                                className={({ isActive }) => 
                                    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
                                        isActive 
                                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-sm border border-blue-500/20' 
                                        : 'hover:bg-black/5 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                    }`
                                }
                            >
                                <item.icon size={20} className="shrink-0" />
                                {item.label}
                            </NavLink>
                        </li>
                    ))}
                </ul>
                
                <div className="mt-auto px-2">
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Local-first architecture</p>
                </div>
            </nav>

            {/* Main Content Area */}
            <main className="flex-1 p-4 pb-4 pr-4 pl-0 overflow-y-auto relative z-0">
                <div className="glass w-full h-full rounded-2xl p-8 overflow-y-auto relative">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
