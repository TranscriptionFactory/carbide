import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { register_core_actions } from "$lib/app/action_registry/register_core_actions";
import { register_git_actions } from "$lib/features/git";

export function register_full_actions(input: ActionRegistrationInput) {
  register_core_actions(input);
  register_git_actions(input);
}
