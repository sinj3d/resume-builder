import { extractResumePdf, createExperience, createBullet, Experience } from './tauri';

export type ParsedExperience = Experience & { bullets: string[] };

/** Extract resume text from a PDF and parse it into structured experiences via
 *  the local specialized model. Strips a markdown code-fence wrapper if the
 *  model added one, and validates the result actually has an experiences array. */
export async function parseResumePdf(path: string): Promise<{ experiences: ParsedExperience[] }> {
    const result = await extractResumePdf(path);
    const cleanResult = result.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    const data = JSON.parse(cleanResult);
    if (!data.experiences) {
        throw new Error("Parsed JSON didn't contain an 'experiences' array.");
    }
    return data;
}

/** Write parsed experiences and their bullets to the database sequentially. */
export async function commitParsedExperiences(experiences: ParsedExperience[]): Promise<void> {
    for (const exp of experiences) {
        const createdExp = await createExperience(exp.title, exp.org, exp.start_date, exp.end_date, exp.category);
        for (const bText of exp.bullets) {
            await createBullet(createdExp.id, bText);
        }
    }
}
