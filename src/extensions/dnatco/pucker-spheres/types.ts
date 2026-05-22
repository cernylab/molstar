import { puckerSphereLabel } from './behavior';
import { PuckerData, PuckerResidue } from './property';
import { DataLoci } from '../../../mol-model/loci';

const DataTag = 'pucker-spheres';

export namespace PuckerSpheresTypes {
    export interface Loci extends DataLoci<PuckerResidue[], number> {}

    export function Loci(data: PuckerData, elements: ReadonlyArray<number>): Loci {
        return DataLoci(DataTag, data.residues, elements, undefined,
            () => elements[0] !== undefined ? puckerSphereLabel(data.residues[elements[0]]) : '');
    }

    export function isLoci(x: any): x is Loci {
        return !!x && x.kind === 'data-loci' && x.tag === DataTag;
    }
}
