import { Filters } from './filters';

export namespace ReDNATCOMspApi {
    export type CoordinatesFormat = 'cif' | 'pdb';
    export type DensityMapFormat = 'ccp4' | 'dsn6';
    export type DensityMapKind = '2fo-fc' | 'fo-fc' | 'em';

    export namespace Payloads {
        export type StepReference = {
            NtC: string,
            color: number,
        };
        export type StepSelection = {
            type: 'step',
            name: string;
            reference?: StepReference,
        }
        export function StepSelection(name: string, reference?: StepSelection['reference']): StepSelection {
            return { type: 'step', name, reference };
        }

        export type ResidueSelection = {
            type: 'residue',
            modelNum: number, // pdbx_PDB_model_num
            chain: string, // auth_asym_id
            cifChain: string, // label_asym_id - we need both because some chains might have the same auth name but different cif id. Crystallographgers are insane
            seqId: number, // auth_seq_id
            insCode: string, // pdbx_PDB_ins_code
            altId: string, // label_alt_id
            color: number,
        }
        export function ResidueSelection(modelNum: number, chain: string, cifChain: string, seqId: number, insCode: string, altId: string, color: number): ResidueSelection {
            return { type: 'residue', modelNum, chain, cifChain, seqId, insCode, altId, color };
        }

        export type AtomSelection = {
            type: 'atom',
            modelNum: number, // pdbx_PDB_model_num
            chain: string, // auth_asym_id
            cifChain: string, // label_asym_id - we need both because some chains might have the same auth name but different cif id. Crystallographgers are insane
            seqId: number, // auth_seq_id
            insCode: string, // pdbx_PDB_ins_code
            altId: string, // label_alt_id
            cifAtomId: string, // label_atom_id
            color: number,
        }
        export function AtomSelection(modelNum: number, chain: string, cifChain: string, seqId: number, insCode: string, altId: string, cifAtomId: string, color: number): AtomSelection {
            return {
                type: 'atom',
                modelNum,
                chain,
                cifChain,
                seqId,
                insCode,
                altId,
                cifAtomId,
                color
            };
        }

        export type StructureSelection = StepSelection | ResidueSelection | AtomSelection;
    }

    export namespace Commands {
        export type Type = Command['type'];

        export type DeselectStructures = { type: 'deselect-structures' }
        export function DeselectStructures(): DeselectStructures {
            return { type: 'deselect-structures' };
        }

        export type Filter = { type: 'filter', filter: Filters.All };
        export function Filter(filter: Filters.All): Filter {
            return { type: 'filter', filter };
        }

        export type Freeze = { type: 'freeze', freeze: boolean };
        export function Freeze(freeze: boolean): Freeze {
            return { type: 'freeze', freeze };
        }

        export type Highlight = { type: 'highlight', highlights: Payloads.AtomSelection[] };
        export function Highlight(highlights: Payloads.AtomSelection[]): Highlight {
            return { type: 'highlight', highlights };
        }

        export type Redraw = { type: 'redraw' }
        export function Redraw(): Redraw { return { type: 'redraw' }; }

        export type StructureSelection = StepSelection | ResidueSelection | AtomSelection;
        export type StructureSelectionType = StructureSelection['type'];

        export type SelectStructures = {
            type: 'select-structures',
            selections: StructureSelection[],
        }
        export function SelectStructures(selections: StructureSelection[]): SelectStructures {
            return { type: 'select-structures', selections };
        }

        export type StepSelection = {
            type: 'step',
            step: Payloads.StepSelection,
            prev?: Payloads.StepSelection,
            next?: Payloads.StepSelection,
        }
        export function StepSelection(step: Payloads.StepSelection, prev: Payloads.StepSelection | undefined, next: Payloads.StepSelection | undefined): StepSelection {
            return { type: 'step', step, prev, next };
        }

        export type ResidueSelection = {
            type: 'residue',
            residue: Payloads.ResidueSelection,
        }
        export function ResidueSelection(model: number, chain: string, cifChain: string, seqId: number, insCode: string, altId: string, color: number): ResidueSelection {
            return { type: 'residue', residue: Payloads.ResidueSelection(model, chain, cifChain, seqId, insCode, altId, color) };
        }

        export type AtomSelection = {
            type: 'atom',
            atom: Payloads.AtomSelection,
        }
        export function AtomSelection(modelNum: number, chain: string, cifChain: string, seqId: number, insCode: string, altId: string, cifAtomId: string, color: number): AtomSelection {
            return { type: 'atom', atom: Payloads.AtomSelection(modelNum, chain, cifChain, seqId, insCode, altId, cifAtomId, color) };
        }

        export type SwitchModel = { type: 'switch-model', model: number };
        export function SwitchModel(model: number): SwitchModel { return { type: 'switch-model', model }; }

        export type SwitchSelectionGranularity = { type: 'switch-selection-granularity', granularity: 'two-residues' | 'residue' };
        export function SwitchSelectionGranularity(granularity: SwitchSelectionGranularity['granularity']): SwitchSelectionGranularity {
            return { type: 'switch-selection-granularity', granularity };
        }

        export type Unhighlight = { type: 'unhighlight' };
        export function Unhighlight(): Unhighlight {
            return { type: 'unhighlight' };
        }
    }
    export type Command =
        Commands.DeselectStructures |
        Commands.Filter |
        Commands.Freeze |
        Commands.Highlight |
        Commands.Redraw |
        Commands.SelectStructures |
        Commands.SwitchModel |
        Commands.SwitchSelectionGranularity |
        Commands.Unhighlight;

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

        export type StructuresSelected = StructuresSelectedOk | StructuresSelectedFail;
        export type StructuresSelectedOk = { type: 'structures-selected', success: true, selections: Payloads.StructureSelection[] }
        export type StructuresSelectedFail = { type: 'structures-selected', success: false }
        export function StructuresSelectedOk(selections: Payloads.StructureSelection[]): StructuresSelectedOk {
            return { type: 'structures-selected', success: true, selections };
        }
        export function StructuresSelectedFail(): StructuresSelectedFail {
            return { type: 'structures-selected', success: false };
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
        Events.StructuresSelected |
        Events.StructureLoaded;

    export type Queries = {
        'current-filter': Filters.All,
        'current-model-number': number,
        'selected-structures': Payloads.StructureSelection[],
    }

    export interface Object {
        command: (cmd: Command) => Promise<void>;
        event: (evt: Event) => void;
        init: (elemId: string, onEvent?: (evt: Event) => void) => void;
        isReady: () => boolean;
        loadStructure: (coords: { data: string, type: CoordinatesFormat, modelNumber: number }, densityMaps: { data: Uint8Array, type: DensityMapFormat, kind: DensityMapKind }[] | null) => void;
        query: <K extends keyof Queries>(type: K) => Queries[K],
    }
}
