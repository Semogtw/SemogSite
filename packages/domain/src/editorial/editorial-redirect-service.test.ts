import { describe, expect, it, vi } from "vitest";
import {
  EditorialRedirectService,
  type EditorialRedirectEventSnapshot,
  type EditorialRedirectRepository,
  type EditorialRedirectTargetSnapshot,
} from "./editorial-redirect-service";

const t0 = "2026-08-02T22:00:00.000Z";
const t1 = "2026-08-02T22:10:00.000Z";

function target(
  change: Partial<EditorialRedirectTargetSnapshot> = {},
): EditorialRedirectTargetSnapshot {
  return {
    id: "document-1",
    kind: "note",
    slug: "nota-canonica",
    publicationStatus: "published",
    updatedAt: t0,
    ...change,
  };
}

function event(
  change: Partial<EditorialRedirectEventSnapshot> = {},
): EditorialRedirectEventSnapshot {
  return {
    id: "redirect-event-1",
    sourceSlug: "nota-antiga",
    kind: "note",
    targetDocumentId: "document-1",
    sequence: 1,
    action: "created",
    actor: "semogtw-owner",
    reason: "Preservar URL pública anterior.",
    occurredAt: t0,
    idempotencyKey: "redirect-create-key-1",
    correlationId: "redirect-create-correlation-1",
    ...change,
  };
}

function repository(): EditorialRedirectRepository {
  return {
    findReplay: vi.fn().mockResolvedValue(null),
    findCanonicalDocumentBySlug: vi.fn().mockResolvedValue(null),
    findTargetDocument: vi.fn().mockResolvedValue(target()),
    findLatestEvent: vi.fn().mockResolvedValue(null),
    appendCreate: vi.fn().mockResolvedValue({
      status: "created",
      event: event(),
    }),
    appendRevoke: vi.fn().mockResolvedValue({
      status: "created",
      event: event({
        id: "redirect-event-2",
        sequence: 2,
        action: "revoked",
        reason: "Alias não deve mais redirecionar.",
        occurredAt: t1,
        idempotencyKey: "redirect-revoke-key-1",
        correlationId: "redirect-revoke-correlation-1",
      }),
    }),
  };
}

const createContext = {
  actorId: "semogtw-owner",
  eventId: "redirect-event-1",
  idempotencyKey: "redirect-create-key-1",
  correlationId: "redirect-create-correlation-1",
  now: t0,
} as const;

const createRequest = {
  sourceSlug: "nota-antiga",
  kind: "note",
  targetDocumentId: "document-1",
  reason: " Preservar URL pública anterior. ",
  confirmed: true,
} as const;

describe("EditorialRedirectService", () => {
  it("creates an audited alias only for a published same-kind target", async () => {
    const store = repository();
    const service = new EditorialRedirectService(store);

    await expect(service.create(createRequest, createContext)).resolves.toEqual({
      ok: true,
      event: event(),
      duplicate: false,
    });
    expect(store.appendCreate).toHaveBeenCalledWith(
      {
        id: "redirect-event-1",
        sourceSlug: "nota-antiga",
        kind: "note",
        targetDocumentId: "document-1",
        action: "created",
        actor: "semogtw-owner",
        reason: "Preservar URL pública anterior.",
        occurredAt: t0,
        idempotencyKey: "redirect-create-key-1",
        correlationId: "redirect-create-correlation-1",
      },
      {
        expectedLatestEventId: null,
        expectedTargetUpdatedAt: t0,
      },
    );
  });

  it("fails closed for unpublished or wrong-kind targets", async () => {
    const unpublishedStore = repository();
    vi.mocked(unpublishedStore.findTargetDocument).mockResolvedValue(
      target({ publicationStatus: "withdrawn" }),
    );
    const wrongKindStore = repository();
    vi.mocked(wrongKindStore.findTargetDocument).mockResolvedValue(
      target({ kind: "project" }),
    );

    await expect(
      new EditorialRedirectService(unpublishedStore).create(
        createRequest,
        createContext,
      ),
    ).resolves.toEqual({ ok: false, code: "TARGET_NOT_PUBLISHED" });
    await expect(
      new EditorialRedirectService(wrongKindStore).create(
        createRequest,
        createContext,
      ),
    ).resolves.toEqual({ ok: false, code: "TARGET_KIND_MISMATCH" });
  });

  it("rejects aliases that collide with canonical slugs or the target slug", async () => {
    const canonicalStore = repository();
    vi.mocked(canonicalStore.findCanonicalDocumentBySlug).mockResolvedValue(
      target({ id: "document-2", slug: "nota-antiga" }),
    );
    const sameSlugStore = repository();

    await expect(
      new EditorialRedirectService(canonicalStore).create(
        createRequest,
        createContext,
      ),
    ).resolves.toEqual({ ok: false, code: "SOURCE_CANONICAL_CONFLICT" });
    await expect(
      new EditorialRedirectService(sameSlugStore).create(
        { ...createRequest, sourceSlug: "nota-canonica" },
        createContext,
      ),
    ).resolves.toEqual({ ok: false, code: "SOURCE_MATCHES_TARGET" });
  });

  it("prevents a second active alias but allows reactivation after revocation", async () => {
    const activeStore = repository();
    vi.mocked(activeStore.findLatestEvent).mockResolvedValue(event());
    const revokedStore = repository();
    vi.mocked(revokedStore.findLatestEvent).mockResolvedValue(
      event({ id: "redirect-event-old-revoke", sequence: 2, action: "revoked" }),
    );
    vi.mocked(revokedStore.appendCreate).mockResolvedValue({
      status: "created",
      event: event({ sequence: 3 }),
    });

    await expect(
      new EditorialRedirectService(activeStore).create(createRequest, createContext),
    ).resolves.toEqual({ ok: false, code: "REDIRECT_ALREADY_ACTIVE" });
    await expect(
      new EditorialRedirectService(revokedStore).create(createRequest, createContext),
    ).resolves.toEqual({
      ok: true,
      event: event({ sequence: 3 }),
      duplicate: false,
    });
    expect(revokedStore.appendCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        expectedLatestEventId: "redirect-event-old-revoke",
      }),
    );
  });

  it("replays a persisted identity before consulting current target state", async () => {
    const store = repository();
    vi.mocked(store.findReplay).mockResolvedValue(event());
    const service = new EditorialRedirectService(store);

    await expect(
      service.create(createRequest, { ...createContext, now: t1 }),
    ).resolves.toEqual({ ok: true, event: event(), duplicate: true });
    expect(store.findTargetDocument).not.toHaveBeenCalled();
    expect(store.appendCreate).not.toHaveBeenCalled();
  });

  it("rejects replay identity reuse with divergent intent", async () => {
    const store = repository();
    vi.mocked(store.findReplay).mockResolvedValue(event());

    await expect(
      new EditorialRedirectService(store).create(
        { ...createRequest, reason: "Outro motivo." },
        createContext,
      ),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });
    expect(store.findTargetDocument).not.toHaveBeenCalled();
  });

  it("revokes only the exact active alias by appending a new event", async () => {
    const store = repository();
    vi.mocked(store.findLatestEvent).mockResolvedValue(event());
    const service = new EditorialRedirectService(store);

    await expect(
      service.revoke(
        {
          sourceSlug: "nota-antiga",
          kind: "note",
          targetDocumentId: "document-1",
          reason: " Alias não deve mais redirecionar. ",
          confirmed: true,
        },
        {
          actorId: "semogtw-owner",
          eventId: "redirect-event-2",
          idempotencyKey: "redirect-revoke-key-1",
          correlationId: "redirect-revoke-correlation-1",
          now: t1,
        },
      ),
    ).resolves.toEqual({
      ok: true,
      event: event({
        id: "redirect-event-2",
        sequence: 2,
        action: "revoked",
        reason: "Alias não deve mais redirecionar.",
        occurredAt: t1,
        idempotencyKey: "redirect-revoke-key-1",
        correlationId: "redirect-revoke-correlation-1",
      }),
      duplicate: false,
    });
    expect(store.appendRevoke).toHaveBeenCalledWith(
      expect.objectContaining({ action: "revoked" }),
      { expectedLatestEventId: "redirect-event-1" },
    );
  });

  it("rejects revocation when the alias is absent, already revoked or mismatched", async () => {
    const absentStore = repository();
    const revokedStore = repository();
    vi.mocked(revokedStore.findLatestEvent).mockResolvedValue(
      event({ action: "revoked" }),
    );
    const mismatchStore = repository();
    vi.mocked(mismatchStore.findLatestEvent).mockResolvedValue(event());
    const context = {
      actorId: "semogtw-owner",
      eventId: "redirect-event-2",
      idempotencyKey: "redirect-revoke-key-1",
      correlationId: "redirect-revoke-correlation-1",
      now: t1,
    } as const;
    const request = {
      sourceSlug: "nota-antiga",
      kind: "note",
      targetDocumentId: "document-1",
      reason: "Revogar alias.",
      confirmed: true,
    } as const;

    await expect(
      new EditorialRedirectService(absentStore).revoke(request, context),
    ).resolves.toEqual({ ok: false, code: "REDIRECT_NOT_ACTIVE" });
    await expect(
      new EditorialRedirectService(revokedStore).revoke(request, context),
    ).resolves.toEqual({ ok: false, code: "REDIRECT_NOT_ACTIVE" });
    await expect(
      new EditorialRedirectService(mismatchStore).revoke(
        { ...request, targetDocumentId: "document-2" },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });
  });

  it("validates bounded slug, reason and explicit confirmation", async () => {
    const store = repository();
    const service = new EditorialRedirectService(store);

    await expect(
      service.create(
        {
          ...createRequest,
          sourceSlug: "Slug Inválido",
          reason: " ",
          confirmed: false,
        },
        createContext,
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: [
        "SOURCE_SLUG_INVALID",
        "REASON_REQUIRED",
        "CONFIRMATION_REQUIRED",
      ],
    });
    expect(store.findReplay).not.toHaveBeenCalled();
  });
});
