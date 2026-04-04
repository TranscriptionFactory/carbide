import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { register_core_actions } from "$lib/app/action_registry/register_core_actions";

export function register_lite_actions(input: ActionRegistrationInput) {
  register_core_actions(input);
}
