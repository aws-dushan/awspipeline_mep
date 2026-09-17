import type { DropdownTypeKey } from '@prisma/client'

/**
 * Admin-configured field linkage, e.g. "when Probability = 100% then Status =
 * Won" and its mirror "when Status = Won then Probability = 100%".
 *
 * The engine is intentionally data-driven and runs in both places:
 *   - in the Add/Edit drawer, so the user watches the linked field change as
 *     they pick a value, rather than being surprised on save;
 *   - on the server before persisting, because the client copy is a
 *     convenience and never the authority.
 */

export type AutomationRule = {
  id: string
  whenType: DropdownTypeKey
  whenValueId: string
  thenType: DropdownTypeKey
  thenValueId: string
  isActive: boolean
  /** Labels, for explaining the rule in the UI. */
  whenLabel: string
  thenLabel: string
}

/** The dropdown-backed fields an automation rule can read or write. */
export type DropdownSelection = Partial<Record<DropdownTypeKey, string | null>>

export type AutomationOutcome = {
  selection: DropdownSelection
  /** Rules that fired, so the UI can say why a field changed. */
  applied: {
    ruleId: string
    thenType: DropdownTypeKey
    fromValueId: string | null
    toValueId: string
    whenLabel: string
    thenLabel: string
  }[]
}

const MAX_PASSES = 5

/**
 * Apply the rule set to a selection until it settles.
 *
 * `changedType` is the field the user just touched. Only rules triggered by a
 * field the user actually changed - or by a field a rule has since changed -
 * fire, so opening an old record does not silently rewrite it.
 *
 * Cascades are bounded by MAX_PASSES and a per-field write guard, so a
 * misconfigured pair of rules that point at each other cannot loop forever.
 */
export function applyAutomationRules(
  selection: DropdownSelection,
  rules: AutomationRule[],
  changedType: DropdownTypeKey | null,
): AutomationOutcome {
  const active = rules.filter((rule) => rule.isActive)
  if (active.length === 0 || !changedType) {
    return { selection, applied: [] }
  }

  const next: DropdownSelection = { ...selection }
  const applied: AutomationOutcome['applied'] = []
  // A field is written at most once per run: the field the user edited wins
  // over any rule that would overwrite it back.
  const written = new Set<DropdownTypeKey>([changedType])
  let frontier = new Set<DropdownTypeKey>([changedType])

  for (let pass = 0; pass < MAX_PASSES && frontier.size > 0; pass += 1) {
    const nextFrontier = new Set<DropdownTypeKey>()

    for (const rule of active) {
      if (!frontier.has(rule.whenType)) continue
      if (next[rule.whenType] !== rule.whenValueId) continue
      if (written.has(rule.thenType)) continue
      if (next[rule.thenType] === rule.thenValueId) continue

      applied.push({
        ruleId: rule.id,
        thenType: rule.thenType,
        fromValueId: next[rule.thenType] ?? null,
        toValueId: rule.thenValueId,
        whenLabel: rule.whenLabel,
        thenLabel: rule.thenLabel,
      })
      next[rule.thenType] = rule.thenValueId
      written.add(rule.thenType)
      nextFrontier.add(rule.thenType)
    }

    frontier = nextFrontier
  }

  return { selection: next, applied }
}

/** Human sentence for the settings screen and the drawer hint. */
export function describeRule(rule: Pick<AutomationRule, 'whenType' | 'thenType' | 'whenLabel' | 'thenLabel'>): string {
  return `When ${typeLabel(rule.whenType)} is "${rule.whenLabel}", set ${typeLabel(
    rule.thenType,
  )} to "${rule.thenLabel}"`
}

function typeLabel(type: DropdownTypeKey): string {
  switch (type) {
    case 'STATUS':
      return 'Status'
    case 'LOCATION':
      return 'Location'
    case 'MATERIAL':
      return 'Material'
    case 'PROBABILITY':
      return 'Probability'
  }
}

/**
 * Rules an admin gets by default on a new company, matching the agreed
 * behaviour: a 100% probability means the job is Won, and marking it Won means
 * the probability is 100%. Both are editable and can be switched off.
 */
export const DEFAULT_RULE_PAIRS: {
  whenType: DropdownTypeKey
  whenLabel: string
  thenType: DropdownTypeKey
  thenLabel: string
}[] = [
  { whenType: 'PROBABILITY', whenLabel: '100%', thenType: 'STATUS', thenLabel: 'Won' },
  { whenType: 'STATUS', whenLabel: 'Won', thenType: 'PROBABILITY', thenLabel: '100%' },
  { whenType: 'STATUS', whenLabel: 'Lost', thenType: 'PROBABILITY', thenLabel: '0%' },
  { whenType: 'PROBABILITY', whenLabel: '0%', thenType: 'STATUS', thenLabel: 'Lost' },
]
