export type ID ='data'|'trajectory'|'model'|'structure'|'visual'|'pyramids'|'superposition';
export type Substructure = 'nucleic'|'protein'|'water'|'selected-slice'|'remainder-slice';

export function ID(id: ID, sub: Substructure|'', ref: string) {
    if (sub === '')
        return `${ref}_${id}`;
    return `${ref}_${sub}_${id}`;
}

export function isVisual(ident: string) {
    return ident.endsWith('_visual');
}
