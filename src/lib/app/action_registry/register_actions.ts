import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { register_full_actions } from "$lib/app/full/register_full_actions";

export function register_actions(input: ActionRegistrationInput) {
  register_full_actions(input);
}
