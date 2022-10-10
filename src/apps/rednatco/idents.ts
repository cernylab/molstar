/* eslint-disable array-bracket-spacing, no-multi-spaces, indent */

export type ID =
    'data' |             /* Source structural data */
    'trajectory' |       /* Source data parsed into trajectory */
    'model' |            /* Currently active model */
    'entire-structure' | /* Entire structure (as Molstar structure PSO) of the active model */
    'structure' |        /* Possibly filtered structure as PSO - this is what shall be used to create visuals from */
    'visual' |           /* Visual PSO - the thing that is actually drawn on the screen */
    'pyramids'|'superposition'; /* Additional identifiers for DNATCO-specific objects */
export type Substructure = 'nucleic'|'protein'|'water'|'selected-slice'|'remainder-slice';

export function ID(id: ID, sub: Substructure|'', ref: string) {
    if (sub === '')
        return `${ref}_${id}`;
    return `${ref}_${sub}_${id}`;
}

export function isVisual(ident: string) {
    return ident.endsWith('_visual');
}
