import type { BackendTypeCount, TypeDefinition } from "../ports";

export class TypesStore {
  backend_types = $state<BackendTypeCount[]>([]);
  definitions = $state<TypeDefinition[]>([]);
  active_type = $state<string | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);

  set_backend_types(types: BackendTypeCount[]) {
    this.backend_types = types;
  }

  set_definitions(definitions: TypeDefinition[]) {
    this.definitions = definitions;
  }
}
