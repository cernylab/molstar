import { Filters } from './filters';

export namespace ReDNATCOMspApi {
    export namespace Commands {
        export type Type = 'deselect-step'|'filter'|'redraw'|'select-step'|'switch-model';

        export type DeselectStep = { type: 'deselect-step' }
        export function DeselectStep(): DeselectStep {
            return { type: 'deselect-step' };
        }

        export type Filter = { type: 'filter', filter: Filters.All };
        export function Filter(filter: Filters.All) {
            return { type: 'filter', filter };
        }

        export type Redraw = { type: 'redraw' }
        export function Redraw(): Redraw { return { type: 'redraw' }; }

        export type SelectStep = {
            type: 'select-step';
            stepName: string;
            prevStepName: string|undefined;
            nextStepName: string|undefined;
            referenceNtC: string;
            references: ('sel'|'prev'|'next')[];
        }
        export function SelectStep(stepName: string, prevStepName: string|undefined, nextStepName: string|undefined, referenceNtC = '', references = ['sel', 'prev', 'next']): SelectStep {
            return {
                type: 'select-step',
                stepName,
                prevStepName,
                nextStepName,
                referenceNtC,
                references: references as ('sel'|'prev'|'next')[],
            };
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
        export type Type = 'filter'|'ready'|'step-deselected'|'step-requested'|'step-selected'|'structure-loaded';

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

        export type StepSelected = { type: 'step-selected', success: boolean, name: string, rmsd?: number }
        export function StepSelectedOk(name: string, rmsd?: number): StepSelected {
            return { type: 'step-selected', success: true, name, rmsd };
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
        export type Type = 'current-filter'|'selected-step';

        export type CurrentFilter = { type: 'current-filter', filter: Filters.All }
        export function CurrentFilter(filter: Filters.All): CurrentFilter {
            return { type: 'current-filter', filter };
        }

        export type SelectedStep = { type: 'selected-step', name: string, rmsd?: number }
        export function SelectedStep(name: string, rmsd?: number): SelectedStep {
            return { type: 'selected-step', name, rmsd };
        }
    }
    export type Response = Queries.CurrentFilter|Queries.SelectedStep;

    export interface Object {
        command: (cmd: Command) => void;
        event: (evt: Event) => void;
        init: (elemId: string, onEvent?: (evt: Event) => void) => void;
        isReady: () => boolean;
        loadStructure: (data: string, type: 'cif'|'pdb') => void;
        query: (type: Queries.Type) => Response;
    }
}
