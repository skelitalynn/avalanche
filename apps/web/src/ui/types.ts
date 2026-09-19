import type { FormEvent, ReactNode } from "react";
import type {
  DemoAction,
  Page,
  Role,
  Scenario,
  Situation,
  Terms,
} from "../data/types";

export type ActionButton = (
  label: string,
  action: DemoAction,
  enabled?: boolean,
  secondary?: boolean,
  next?: Page,
) => ReactNode;
/** Read-only view data and existing App callbacks; no service access in pages. */
export interface DemoPageProps {
  s: Situation;
  t: Terms;
  role: Role;
  now: number;
  busy: boolean;
  participant: boolean;
  idx: number;
  roleName: string;
  days: number;
  consent: boolean;
  setConsent: (value: boolean) => void;
  setVoteChoice: (value: boolean | null) => void;
  actionButton: ActionButton;
  create: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  changeScene: (scene: Scenario) => void;
}
export interface DemoControlsProps extends Pick<
  DemoPageProps,
  "s" | "role" | "now" | "busy" | "changeScene" | "actionButton"
> {
  presentation: boolean;
  setPresentation: (value: boolean) => void;
  controls: boolean;
  setControls: (value: boolean) => void;
  act: (action: DemoAction, next?: Page) => Promise<void>;
}
