export type SmartLinkRule = {
  id: string;
  name: string;
  enabled: boolean;
  weight: number;
};

export type SmartLinkRuleGroup = {
  id: string;
  name: string;
  enabled: boolean;
  rules: SmartLinkRule[];
};

export type SmartLinkRuleMatch = {
  ruleId: string;
  rawScore: number;
};

export type SmartLinkSuggestion = {
  targetPath: string;
  targetTitle: string;
  score: number;
  rules: SmartLinkRuleMatch[];
};

export type SmartLinksStatus = "idle" | "loading" | "ready" | "error";

export class SmartLinksStore {
  rule_groups = $state<SmartLinkRuleGroup[]>([]);
  rules_status = $state<SmartLinksStatus>("idle");
  rules_error = $state<string | null>(null);

  set_rule_groups(groups: SmartLinkRuleGroup[]) {
    this.rule_groups = groups;
    this.rules_status = "ready";
    this.rules_error = null;
  }

  start_rules_load() {
    this.rules_status = "loading";
    this.rules_error = null;
  }

  set_rules_error(error: string) {
    this.rules_status = "error";
    this.rules_error = error;
  }

  update_rule(
    group_id: string,
    rule_id: string,
    updates: Partial<Pick<SmartLinkRule, "enabled" | "weight">>,
  ) {
    this.rule_groups = this.rule_groups.map((group) => {
      if (group.id !== group_id) return group;
      return {
        ...group,
        rules: group.rules.map((rule) => {
          if (rule.id !== rule_id) return rule;
          return { ...rule, ...updates };
        }),
      };
    });
  }

  update_group_enabled(group_id: string, enabled: boolean) {
    this.rule_groups = this.rule_groups.map((group) => {
      if (group.id !== group_id) return group;
      return { ...group, enabled };
    });
  }

  clear() {
    this.rule_groups = [];
    this.rules_status = "idle";
    this.rules_error = null;
  }

  reset() {
    this.clear();
  }
}
