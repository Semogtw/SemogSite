export type OwnDataArrayBounds = {
  minimumItems?: number;
  maximumItems?: number;
};

export function readOwnDataArray(
  value: unknown,
  bounds: OwnDataArrayBounds = {},
): readonly unknown[] | null {
  const minimumItems = bounds.minimumItems ?? 0;
  const maximumItems = bounds.maximumItems ?? 10_000;
  if (
    !Number.isSafeInteger(minimumItems) ||
    minimumItems < 0 ||
    !Number.isSafeInteger(maximumItems) ||
    maximumItems < minimumItems ||
    !Array.isArray(value) ||
    value.length < minimumItems ||
    value.length > maximumItems
  ) {
    return null;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const values: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      return null;
    }
    values.push(descriptor.value);
  }
  return values;
}
