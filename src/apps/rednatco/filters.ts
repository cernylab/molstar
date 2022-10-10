export namespace Filters {
    export type Kind = 'empty'|'slices';

    export type Empty = {
        kind: 'empty',
    };
    export function Empty(): Empty {
        return { kind: 'empty' };
    }

    export type Slices = {
        kind: 'slices',
        slices: {
            chain: string;
            residues?: number[];
            altIds?: string[];
        }[];
    };
    export function Slices(slices: Slices['slices']): Slices {
        return { kind: 'slices', slices };
    }

    export type All = Empty|Slices;
}
