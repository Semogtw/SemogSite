export type GitHubRepositoryIdentity = {
  owner: string;
  name: string;
  fullName: string;
};

const ownerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/u;
const repositoryPattern = /^[A-Za-z0-9._-]{1,100}$/u;
const refCharacterPattern = /^[^\u0000-\u0020\u007f]{1,255}$/u;
const objectIdPattern = /^[0-9a-f]{7,64}$/u;

export function parseGitHubRepositoryIdentity(
  value: string,
): GitHubRepositoryIdentity | null {
  const fullName = value.trim();
  const parts = fullName.split("/");
  if (parts.length !== 2) return null;
  const [owner, name] = parts;
  if (!owner || !name || name === "." || name === "..") return null;
  if (!ownerPattern.test(owner) || !repositoryPattern.test(name)) return null;
  return { owner, name, fullName: `${owner}/${name}` };
}

export function isSafeGitRefName(value: string): boolean {
  const name = value.trim();
  return (
    name === value &&
    refCharacterPattern.test(name) &&
    !/[~^:?*[\\]/u.test(name) &&
    !name.startsWith("/") &&
    !name.endsWith("/") &&
    !name.startsWith(".") &&
    !name.endsWith(".") &&
    !name.endsWith(".lock") &&
    !name.includes("..") &&
    !name.includes("@{") &&
    !name.includes("//")
  );
}

export function isValidGitObjectId(value: string): boolean {
  return objectIdPattern.test(value.trim().toLowerCase());
}
