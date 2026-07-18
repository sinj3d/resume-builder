import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { LayoutConfig, ResumeData, ResumeEntryData } from '../lib/tauri';

// CSS px per LaTeX pt / per inch (browser standard: 96px = 1in = 72pt).
const PT = 96 / 72;
const IN = 96;
export const PAGE_W_PX = 8.5 * IN;
const PAGE_H_PX = 11 * IN;

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '"Helvetica Neue", Arial, sans-serif';

/// Sample content for template thumbnails when no archetype is selected.
export const SAMPLE_RESUME: ResumeData = {
    bio: {
        name: 'Jane Doe',
        location: 'Springfield, IL',
        email: 'jane@example.com',
        phone: '(555) 123-4567',
    },
    skills: [
        ['Languages', ['Rust', 'TypeScript', 'Python']],
        ['Tools', ['Git', 'Docker', 'LaTeX']],
    ],
    groups: [
        {
            heading: 'Education',
            entries: [{
                title: 'B.S. Computer Science',
                org: 'State University',
                start: '2022',
                end: '2026',
                bullets: [],
                education: {
                    experience_id: 0,
                    degree: 'B.S. Computer Science',
                    gpa: '3.9/4.0',
                    coursework: 'Algorithms, Operating Systems',
                    honors: "Dean's List",
                },
            }],
        },
        {
            heading: 'Professional Experience',
            entries: [{
                title: 'Software Engineer Intern',
                org: 'Acme Corp',
                start: 'May 2025',
                end: 'Aug 2025',
                bullets: [
                    'Shipped a feature used by 10,000 customers',
                    'Reduced API latency by 40% through caching',
                ],
                education: null,
            }],
        },
        {
            heading: 'Projects',
            entries: [{
                title: 'Resume Builder',
                org: null,
                start: null,
                end: null,
                bullets: ['Built a local-first resume generator with Tauri and Rust'],
                education: null,
            }],
        },
    ],
};

function dateRange(entry: ResumeEntryData): string {
    const s = entry.start || '';
    const e = entry.end || '';
    if (s && e) return `${s} – ${e}`;
    return s || e || '';
}

/**
 * Instant HTML approximation of the compiled resume. Maps every LayoutConfig
 * knob to CSS so slider changes render on the same frame. Line and page
 * breaks are approximate — the compiled PDF is the ground truth.
 */
export default function HtmlResume({ data, layout }: { data: ResumeData; layout: LayoutConfig }) {
    const accent = `rgb(${layout.accent_rgb[0]}, ${layout.accent_rgb[1]}, ${layout.accent_rgb[2]})`;
    const headingFont = layout.heading_sans ? SANS : SERIF;
    const parskip = Math.max(layout.item_sep_pt, 1.0) * PT;

    // Page-break guides: dashed lines at each letter-page boundary that falls
    // inside the rendered content.
    const sheetRef = useRef<HTMLDivElement>(null);
    const [pageGuides, setPageGuides] = useState<number[]>([]);
    useEffect(() => {
        const el = sheetRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => {
            const pages = Math.floor((el.scrollHeight - 8) / PAGE_H_PX);
            setPageGuides(Array.from({ length: Math.max(pages, 0) }, (_, i) => (i + 1) * PAGE_H_PX));
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const sectionHeadingStyle: CSSProperties = {
        color: accent,
        fontFamily: headingFont,
        fontWeight: 700,
        fontSize: layout.section_font_pt * PT,
        lineHeight: 1.2,
        marginTop: layout.section_gap_pt * PT,
        marginBottom: layout.section_gap_pt * 0.6 * PT,
        borderBottom: layout.section_rule ? `1px solid ${accent}` : 'none',
    };

    const entryHeadingStyle: CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        fontFamily: headingFont,
        fontWeight: 700,
        fontSize: layout.subsection_font_pt * PT,
        lineHeight: 1.2,
        marginTop: layout.experience_gap_pt * PT,
        marginBottom: 1 * PT,
    };

    const details = [
        data.bio.location, data.bio.email, data.bio.phone,
        data.bio.linkedin, data.bio.github, data.bio.website,
    ].filter((d): d is string => !!d && d.length > 0);

    return (
        <div
            ref={sheetRef}
            className="bg-white shadow-2xl relative"
            style={{
                width: PAGE_W_PX,
                minHeight: PAGE_H_PX,
                boxSizing: 'border-box',
                padding: `${layout.margin_v_in * IN}px ${layout.margin_h_in * IN}px`,
                fontFamily: SERIF,
                fontSize: layout.body_font_pt * PT,
                lineHeight: 1.2 * layout.line_spacing,
                color: '#1a1a1a',
            }}
        >
            {/* Page-break guides */}
            {pageGuides.map((top, i) => (
                <div key={i} className="absolute left-0 right-0 pointer-events-none" style={{ top }}>
                    <div className="border-t-2 border-dashed border-blue-300" />
                    <span className="absolute right-1 -top-2.5 text-[10px] font-sans text-blue-400 bg-white/80 px-1 rounded">
                        page {i + 2}
                    </span>
                </div>
            ))}

            {/* Bio header */}
            {(data.bio.name || details.length > 0) && (
                <div style={{ textAlign: 'center' }}>
                    {data.bio.name && (
                        <div style={{ fontSize: layout.name_font_pt * PT, fontWeight: 700, lineHeight: 1.2 }}>
                            {data.bio.name}
                        </div>
                    )}
                    {details.length > 0 && (
                        <div style={{ marginTop: 2 * PT }}>{details.join(' · ')}</div>
                    )}
                </div>
            )}
            {layout.header_rule && (
                <div style={{ borderBottom: `1.5px solid ${accent}`, marginTop: 4 * PT }} />
            )}
            <div style={{ height: 10 * PT }} />

            {/* Skills */}
            {data.skills.length > 0 && (
                <div>
                    <div style={sectionHeadingStyle}>Skills</div>
                    {data.skills.map(([category, names]) => (
                        <div key={category} style={{ marginBottom: parskip }}>
                            <b>{category}:</b> {names.join(', ')}
                        </div>
                    ))}
                    <div style={{ height: layout.experience_gap_pt * 0.5 * PT }} />
                </div>
            )}

            {/* Sections */}
            {data.groups.map(group => group.entries.length > 0 && (
                <div key={group.heading}>
                    <div style={sectionHeadingStyle}>{group.heading}</div>
                    {group.entries.map((entry, i) => {
                        const edu = entry.education;
                        const headline = edu
                            ? (entry.org || entry.title)
                            : (entry.org ? `${entry.title} – ${entry.org}` : entry.title);
                        const degreeLine: string[] = [];
                        if (edu) {
                            const degree = (edu.degree || '').trim();
                            if (degree) degreeLine.push(degree);
                            else if (entry.org) degreeLine.push(entry.title);
                            const gpa = (edu.gpa || '').trim();
                            if (gpa) degreeLine.push(`GPA: ${gpa}`);
                        }
                        return (
                            <div key={i} style={{ marginBottom: layout.experience_gap_pt * 0.5 * PT }}>
                                <div style={entryHeadingStyle}>
                                    <span>{headline}</span>
                                    <span style={{ whiteSpace: 'nowrap' }}>{dateRange(entry)}</span>
                                </div>
                                {edu && degreeLine.length > 0 && (
                                    <div style={{ marginBottom: parskip }}>{degreeLine.join(' | ')}</div>
                                )}
                                {edu && (edu.coursework || '').trim() && (
                                    <div style={{ marginBottom: parskip }}>
                                        <i>Relevant Coursework:</i> {edu.coursework}
                                    </div>
                                )}
                                {edu && (edu.honors || '').trim() && (
                                    <div style={{ marginBottom: parskip }}>
                                        <i>Honors:</i> {edu.honors}
                                    </div>
                                )}
                                {entry.bullets.length > 0 && (
                                    <ul
                                        style={{
                                            listStyleType: 'disc',
                                            paddingLeft: layout.bullet_indent_pt * PT,
                                            marginTop: 2 * PT,
                                            fontSize: layout.bullet_font_pt * PT,
                                        }}
                                    >
                                        {entry.bullets.map((bullet, j) => (
                                            <li key={j} style={{ marginBottom: layout.item_sep_pt * PT }}>
                                                {bullet}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}

            {data.groups.length === 0 && data.skills.length === 0 && !data.bio.name && (
                <div className="text-slate-400 text-center font-sans" style={{ marginTop: 200 }}>
                    Select an archetype with tagged experiences to preview your resume.
                </div>
            )}
        </div>
    );
}
