import { describe, expect, it } from "vitest";
import {
  isSafeGitRefName,
  isValidGitObjectId,
  parseGitHubRepositoryIdentity,
} from "./github-identifiers";

describe("GitHub identifier policy", () => {
  it.each([
    ["Semogtw/SemogSite", { owner: "Semogtw", name: "SemogSite", fullName: "Semogtw/SemogSite" }],
    [" semogtw/repo.name ", { owner: "semogtw", name: "repo.name", fullName: "semogtw/repo.name" }],
  ] as const)("parses canonical repository identity %s", (value, expected) => {
    expect(parseGitHubRepositoryIdentity(value)).toEqual(expected);
  });

  it.each([
    "owner-/repo",
    "owner--name/repo",
    "-owner/repo",
    "owner/.",
    "owner/..",
    "owner/repo/extra",
    "owner name/repo",
    "owner/user:secret",
    "",
  ])("rejects unsafe repository identity %s", (value) => {
    expect(parseGitHubRepositoryIdentity(value)).toBeNull();
  });

  it.each([
    "main",
    "develop/foundation-bootstrap",
    "release-2026.08",
    "feature_1",
  ])("accepts safe Git ref %s", (value) => {
    expect(isSafeGitRefName(value)).toBe(true);
  });

  it.each([
    "",
    "feature branch",
    "bad..branch",
    ".hidden",
    "main.",
    "main.lock",
    "refs//heads/main",
    "branch@{1}",
    "feature~1",
    "feature^2",
    "feature:child",
    "feature?child",
    "feature*child",
    "feature[child",
    "feature\\child",
  ])("rejects unsafe Git ref %s", (value) => {
    expect(isSafeGitRefName(value)).toBe(false);
  });

  it.each(["abcdef1", "ABCDEF1234567", "a".repeat(64)])(
    "accepts Git object ID %s",
    (value) => {
      expect(isValidGitObjectId(value)).toBe(true);
    },
  );

  it.each(["abcdef", "g123456", "a".repeat(65), "sha-abcdef1", ""])(
    "rejects invalid Git object ID %s",
    (value) => {
      expect(isValidGitObjectId(value)).toBe(false);
    },
  );
});
