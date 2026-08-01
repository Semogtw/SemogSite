export function parseCommitList(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(/[\s,]+/u)
        .map((commit) => commit.trim().toLowerCase())
        .filter((commit) => commit.length > 0),
    ),
  ];
}
