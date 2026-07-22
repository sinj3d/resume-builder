import { Outlet, NavLink } from 'react-router-dom';

const navItems = [
    { to: "/bio", label: "Profile" },
    { to: "/", label: "Experiences" },
    { to: "/archetypes", label: "Archetypes" },
    { to: "/generate", label: "Cover Letters" },
    { to: "/applications", label: "Applications" },
    { to: "/templates", label: "Templates" },
    { to: "/latex", label: "Resume Editor" },
    { to: "/onboarding", label: "Import a PDF" },
    { to: "/settings", label: "Settings" },
];

export default function Layout() {
    return (
        <div className="flex h-screen overflow-hidden bg-paper dark:bg-charcoal">
            {/* Sidebar */}
            <nav className="flex w-[250px] shrink-0 flex-col border-r border-paper-border py-8 dark:border-charcoal-border">
                <div className="px-7 pb-[30px]">
                    <div className="font-serif text-[22px] font-semibold tracking-[-0.01em] text-ink dark:text-cream">
                        Folio
                    </div>
                    <div className="mt-[3px] text-[11px] tracking-[.04em] text-ink-muted dark:text-cream-muted">
                        RESUME BUILDER · LOCAL-FIRST
                    </div>
                </div>

                <ul className="flex flex-1 flex-col">
                    {navItems.map((item) => (
                        <li key={item.to}>
                            <NavLink
                                to={item.to}
                                end={item.to === "/"}
                                className={({ isActive }) =>
                                    `block border-l-[3px] px-7 py-[11px] text-[14.5px] transition-colors ${
                                        isActive
                                            ? 'border-sienna bg-[linear-gradient(90deg,rgba(138,61,34,.06),transparent)] font-semibold text-sienna dark:border-sienna-dark dark:bg-[linear-gradient(90deg,rgba(217,140,95,.08),transparent)] dark:text-sienna-dark'
                                            : 'border-transparent text-ink-muted-2 hover:text-ink dark:text-[#93896f] dark:hover:text-cream'
                                    }`
                                }
                            >
                                {item.label}
                            </NavLink>
                        </li>
                    ))}
                </ul>

                <div className="px-7">
                    <p className="font-serif text-[11px] italic text-ink-faint dark:text-cream-faint">
                        Everything stays on this machine.
                    </p>
                </div>
            </nav>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto p-8">
                <Outlet />
            </main>
        </div>
    );
}
