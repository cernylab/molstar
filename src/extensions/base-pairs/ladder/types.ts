import { itemLabel } from './behavior';
import { BasePairsTypes } from '../types';
import { Sphere3D } from '../../../mol-math/geometry/primitives/sphere3d';
import { DataLocation } from '../../../mol-model/location';
import { DataLoci } from '../../../mol-model/loci';

export namespace BasePairsLadderTypes {
    export interface Location extends DataLocation<{
        object: {
            kind: 'base',
            base: BasePairsTypes.PairedBase,
            pair: BasePairsTypes.BasePair,
        } | {
            kind: 'ball',
            pair: BasePairsTypes.BasePair,
        } | {
            kind: 'unpaired',
        }
    }, {}> {}

    export function Location(object: Location['data']['object']): Location {
        return DataLocation(BasePairsTypes.DataTag, { object }, {});
    }

    export function isLocation(x: any): x is Location {
        return !!x && x.kind === 'data-location' && x.tag === BasePairsTypes.DataTag;
    }

    export type LociItem =
        BasePairsTypes.UnpairedResidue & { instanceName: string } |
        BasePairsTypes.BasePair & { instanceNameA: string, instanceNameB: string };

    export interface Loci extends DataLoci<BasePairsTypes.Item[], number> {}

    export function Loci(data: LociItem[], itemIndices: number[], elements: number[], boundingSphere?: Sphere3D): Loci {
        return DataLoci(
            BasePairsTypes.DataTag,
            data,
            elements,
            boundingSphere ? () => boundingSphere : undefined,
            () => itemIndices[0] !== undefined ? itemLabel(data[itemIndices[0]]) : ''
        );
    }

    export function isLoci(x: any): x is Loci {
        return !!x && x.kind === 'data-loci' && x.tag === BasePairsTypes.DataTag;
    }
}
