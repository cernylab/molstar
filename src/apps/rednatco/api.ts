import { Filters } from './filters';

export namespace ReDNATCOMspApi {
    export type CoordinatesFormat = 'cif' | 'pdb';
    export type DensityMapFormat = 'ccp4' | 'dsn6';
    export type DensityMapKind = '2fo-fc' | 'fo-fc' | 'em';

    export namespace Payloads {
        export type StepSelection = {
            type: 'step',
            name: string;
            reference?: {
                NtC: string,
                color: number,
            };
        }
        export function StepSelection(name: string, reference?: StepSelection['reference']): StepSelection {
            return { type: 'step', name, reference };
        }

        export type ResidueSelection = {
            type: 'residue',
            model: number, // pdbx_PDB_model_num
            chain: string, // (label|auth)_asym_id
            seqId: number, // (label|auth)_seq_id
            insCode: string, // pdbx_PDB_ins_code
            altId: string, // label_alt_id
            color: number,
        }
        export function ResidueSelection(model: number, chain: string, seqId: number, insCode: string, altId: string, color: number): ResidueSelection {
            return { type: 'residue', model, chain, seqId, insCode, altId, color };
        }

        export type AtomSelection = {
            type: 'atom',
            model: number, // pdbx_PDB_model_num
            id: number, // label_atom_id
            color: number,
        }
        export function AtomSelection(model: number, id: number, color: number): AtomSelection {
            return { type: 'atom', model, id, color };
        }

        export type StructureSelection = StepSelection | ResidueSelection | AtomSelection;
    }

    export namespace Commands {
        export type Type = Command['type'];

        export type DeselectStructures = { type: 'deselect-structures' }
        export function DeselectStep(): DeselectStructures {
            return { type: 'deselect-structures' };
        }

        export type Filter = { type: 'filter', filter: Filters.All };
        export function Filter(filter: Filters.All): Filter {
            return { type: 'filter', filter };
        }

        export type Redraw = { type: 'redraw' }
        export function Redraw(): Redraw { return { type: 'redraw' }; }

        export type StructureSelection = (SelectStep | SelectResidue | SelectAtom);
        export type StructureSelectionType = StructureSelection['type'];

        export type SelectStructure = {
            type: 'select-structure',
            selection: StructureSelection,
        }
        export function SelectStructure(selection: StructureSelection): SelectStructure {
            return { type: 'select-structure', selection };
        }

        export type SelectStep = {
            type: 'step',
            step: Payloads.StepSelection,
            prev?: Payloads.StepSelection,
            next?: Payloads.StepSelection,
        }
        export function SelectStep(step: Payloads.StepSelection, prev: Payloads.StepSelection | undefined, next: Payloads.StepSelection | undefined): SelectStep {
            return { type: 'step', step, prev, next };
        }

        export type SelectResidue = {
            type: 'residue',
            residue: Payloads.ResidueSelection,
        }
        export function SelectResidue(model: number, chain: string, seqId: number, insCode: string, altId: string, color: number): SelectResidue {
            return { type: 'residue', residue: Payloads.ResidueSelection(model, chain, seqId, insCode, altId, color) };
        }

        export type SelectAtom = {
            type: 'atom',
            atom: Payloads.AtomSelection,
        }
        export function SelectAtom(model: number, id: number, color: number): SelectAtom {
            return { type: 'atom', atom: Payloads.AtomSelection(model, id, color) };
        }

        export type SwitchModel = { type: 'switch-model', model: number };
        export function SwitchModel(model: number): SwitchModel { return { type: 'switch-model', model }; }
    }
    export type Command =
        Commands.DeselectStructures |
        Commands.Filter |
        Commands.Redraw |
        Commands.SelectStructure |
        Commands.SwitchModel;

    export namespace Events {
        export type Type = Event['type'];

        export type Filter = { type: 'filter', success: boolean, message: string }
        export function FilterApplied(): Filter {
            return { type: 'filter', success: true, message: '' };
        }
        export function FilterFailed(message: string): Filter {
            return { type: 'filter', success: false, message };
        }
        export type Ready = { type: 'ready' }
        export function Ready(): Ready {
            return { type: 'ready' };
        }

        export type StructuresDeselected = { type: 'structures-deselected' }
        export function StructuresDeselected(): StructuresDeselected {
            return { type: 'structures-deselected' };
        }

        export type StructureRequested = { type: 'structure-requested', selection: Payloads.StructureSelection }
        export function StructureRequested(selection: Payloads.StructureSelection): StructureRequested {
            return { type: 'structure-requested', selection };
        }

        export type StructureSelected = StructureSelectedOk | StructureSelectedFail;
        export type StructureSelectedOk = { type: 'structure-selected', success: true, selection: Commands.StructureSelection }
        export type StructureSelectedFail = { type: 'structure-selected', success: false }
        export function StructureSelectedOk(selection: Commands.StructureSelection): StructureSelectedOk {
            return { type: 'structure-selected', success: true, selection };
        }
        export function StructureSelectedFail(): StructureSelectedFail {
            return { type: 'structure-selected', success: false };
        }

        export type StructureLoaded = { type: 'structure-loaded' }
        export function StructureLoaded(): StructureLoaded {
            return { type: 'structure-loaded' };
        }
    }
    export type Event =
        Events.Filter |
        Events.Ready |
        Events.StructuresDeselected |
        Events.StructureRequested |
        Events.StructureSelected |
        Events.StructureLoaded;

    export namespace Queries {
        export type Type = 'current-filter' | 'current-model-number' | 'selected-step';

        export type CurrentFilter = { type: 'current-filter', filter: Filters.All }
        export function CurrentFilter(filter: Filters.All): CurrentFilter {
            return { type: 'current-filter', filter };
        }

        export type CurrentModelNumber = { type: 'current-model-number', num: number };
        export function CurrentModelNumber(num: number): CurrentModelNumber {
            return { type: 'current-model-number', num };
        }

        export type SelectedStep = { type: 'selected-step', selected?: Payloads.StepSelection }
        export function SelectedStep(selected?: Payloads.StepSelection): SelectedStep {
            return { type: 'selected-step', selected };
        }
    }
    export type Response = Queries.CurrentFilter | Queries.CurrentModelNumber | Queries.SelectedStep;
    export type ResponseTypes = {
        'current-filter': Queries.CurrentFilter,
        'current-model-number': Queries.CurrentModelNumber,
        'selected-step': Queries.SelectedStep,
    }

    export interface Object {
        command: (cmd: Command) => Promise<void>;
        event: (evt: Event) => void;
        init: (elemId: string, onEvent?: (evt: Event) => void) => void;
        isReady: () => boolean;
        loadStructure: (coords: { data: string, type: CoordinatesFormat }, densityMaps: { data: Uint8Array, type: DensityMapFormat, kind: DensityMapKind }[] | null) => void;
        query: <T extends Queries.Type>(type: T) => ResponseTypes[T];
    }
}
