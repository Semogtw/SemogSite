export type AuthorizationIdListBounds = {
  minimumItems?: number;
  maximumItems?: number;
  maximumLength?: number;
};

function bounded(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

export function normalizeBoundedUniqueIds(
  value: unknown,
  bounds: AuthorizationIdListBounds = {},
): readonly string[] | null {
  const minimumItems = bounds.minimumItems ?? 0;
  const maximumItems = bounds.maximumItems ?? 10_000;
  const maximumLength = bounds.maximumLength ?? 200;
  if (
    !Number.isSafeInteger(minimumItems) ||
    minimumItems < 0 ||
    !Number.isSafeInteger(maximumItems) ||
    maximumItems < minimumItems ||
    !Number.isSafeInteger(maximumLength) ||
    maximumLength < 1 ||
    !Array.isArray(value) ||
    value.length < minimumItems ||
    value.length > maximumItems
  ) {
    return null;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const normalized: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      !bounded(descriptor.value, maximumLength)
    ) {
      return null;
    }
    normalized.push(descriptor.value);
  }

  if (new Set(normalized).size !== normalized.length) return null;
  return normalized.sort((left, right) => left.localeCompare(right, "en"));
}
