export type ID ='data'|'structure'|'visual'|'pyramids';

export function ID(id: ID, ref: string) {
    return `${id}_${ref}`;
}
