export type ID ='data'|'structure'|'visual'|'pyramids';
export type Substructure = 'nucleic'|'protein'|'water';

export function ID(id: ID, sub: Substructure|'', ref: string) {
    if (sub === '')
        return `${id}_${ref}`;
    return `${id}_${sub}_${ref}`;
}
