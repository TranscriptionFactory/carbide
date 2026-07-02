type SpecValue = string | number | Record<string, unknown>

function camel_to_kebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function is_unitless(key: string): boolean {
  return /weight|lineHeight|opacity/i.test(key)
}

function to_css_value(key: string, value: string | number): string {
  if (typeof value !== 'number') return String(value)
  return is_unitless(key) ? String(value) : `${value}px`
}

/**
 * Flattens a nested typography spec into a flat map of CSS custom properties.
 * Prefix defaults to `--editor-` to match Carbide's editor var namespace.
 * Numbers become `${n}px` except for weight/lineHeight/opacity which stay unitless.
 * String values pass through as-is (supporting calc(), em, etc.).
 */
export function flatten_typography(
  obj: Record<string, SpecValue>,
  prefix = '--editor-'
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [key, value] of Object.entries(obj)) {
    const css_key = `${prefix}${camel_to_kebab(key)}`

    if (value === null || value === undefined) continue

    if (typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten_typography(value as Record<string, SpecValue>, `${css_key}-`))
      continue
    }

    if (typeof value !== 'string' && typeof value !== 'number') continue

    result[css_key] = to_css_value(key, value as string | number)
  }

  return result
}
