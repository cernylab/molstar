import { Filters } from './filters';

export namespace ReDNATCOMspApi {
    export type CoordinatesFormat = 'cif' | 'pdb';
    export type DensityMapFormat = 'ccp4' | 'dsn6';
    export type DensityMapKind = '2fo-fc' | 'fo-fc' | 'em';

    export namespace Payloads {
        export type StepSelection = {
            name: string;
            reference?: {
                NtC: string,
                color: number,
            };
        }
        export function StepSelection(name: string, reference?: StepSelection['reference']): StepSelection {
            return { name, reference };
        }
    }

    export namespace Commands {
        export type Type = 'deselect-step' | 'filter' | 'redraw' | 'select-step' | 'switch-model';

        export type DeselectStep = { type: 'deselect-step' }
        export function DeselectStep(): DeselectStep {
            return { type: 'deselect-step' };
        }

        export type Filter = { type: 'filter', filter: Filters.All };
        export function Filter(filter: Filters.All): Filter {
            return { type: 'filter', filter };
        }

        export type Redraw = { type: 'redraw' }
        export function Redraw(): Redraw { return { type: 'redraw' }; }

        export type SelectStep = {
            type: 'select-step';
            step: Payloads.StepSelection
            prev?: Payloads.StepSelection;
            next?: Payloads.StepSelection
        }
        export function SelectStep(step: Payloads.StepSelection, prev: Payloads.StepSelection | undefined, next: Payloads.StepSelection | undefined): SelectStep {
            return { type: 'select-step', step, prev, next };
        }

        export type SwitchModel = { type: 'switch-model', model: number };
        export function SwitchModel(model: number): SwitchModel { return { type: 'switch-model', model }; }
    }
    export type Command =
        Commands.DeselectStep |
        Commands.Filter |
        Commands.Redraw |
        Commands.SelectStep |
        Commands.SwitchModel;

    export namespace Events {
        export type Type = 'filter' | 'ready' | 'step-deselected' | 'step-requested' | 'step-selected' | 'structure-loaded';

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

        export type StepDeselected = { type: 'step-deselected' }
        export function StepDeselected(): StepDeselected {
            return { type: 'step-deselected' };
        }

        export type StepRequested = { type: 'step-requested', name: string }
        export function StepRequested(name: string): StepRequested {
            return { type: 'step-requested', name };
        }

        export type StepSelected = { type: 'step-selected', success: boolean, name: string }
        export function StepSelectedOk(name: string): StepSelected {
            return { type: 'step-selected', success: true, name };
        }
        export function StepSelectedFail(): StepSelected {
            return { type: 'step-selected', success: false, name: '' };
        }

        export type StructureLoaded = { type: 'structure-loaded' }
        export function StructureLoaded(): StructureLoaded {
            return { type: 'structure-loaded' };
        }
    }
    export type Event =
        Events.Filter |
        Events.Ready |
        Events.StepDeselected |
        Events.StepRequested |
        Events.StepSelected |
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
