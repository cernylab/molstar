import { OrderedSet } from '../../mol-data/int/ordered-set';
import { ElementIndex, StructureElement, Unit } from '../../mol-model/structure';

export function lociElements(loci: StructureElement.Loci) {
    const es = loci.elements[0]; // Ignore anything but the first chuck

    if (!Unit.isAtomic(es.unit))
        return [];

    const elems = new Array<ElementIndex>();
    OrderedSet.forEach(es.indices, uI => elems.push(es.unit.elements[uI]));
    return elems;
}
