import { getDb } from "../db";
import { Contact, IdentifyRequest, IdentifyResponse } from "../types";

// ── Helper: find contacts matching email OR phone ──────────────────────────

function findByEmailOrPhone(
  email: string | null,
  phoneNumber: string | null
): Contact[] {
  const db = getDb();

  if (email && phoneNumber) {
    return db
      .prepare(
        `SELECT * FROM Contact
         WHERE deletedAt IS NULL
           AND (email = ? OR phoneNumber = ?)
         ORDER BY createdAt ASC`
      )
      .all(email, phoneNumber) as Contact[];
  }

  if (email) {
    return db
      .prepare(
        `SELECT * FROM Contact
         WHERE deletedAt IS NULL AND email = ?
         ORDER BY createdAt ASC`
      )
      .all(email) as Contact[];
  }

  return db
    .prepare(
      `SELECT * FROM Contact
       WHERE deletedAt IS NULL AND phoneNumber = ?
       ORDER BY createdAt ASC`
    )
    .all(phoneNumber) as Contact[];
}

// ── Helper: get all contacts in a cluster (primary + its secondaries) ──────

function findCluster(primaryId: number): Contact[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM Contact
       WHERE deletedAt IS NULL
         AND (id = ? OR linkedId = ?)
       ORDER BY createdAt ASC`
    )
    .all(primaryId, primaryId) as Contact[];
}

// ── Helper: create a new contact row ──────────────────────────────────────

function createContact(
  email: string | null,
  phoneNumber: string | null,
  linkedId: number | null,
  linkPrecedence: "primary" | "secondary"
): Contact {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO Contact (email, phoneNumber, linkedId, linkPrecedence, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(email, phoneNumber, linkedId, linkPrecedence, now, now);

  return db
    .prepare(`SELECT * FROM Contact WHERE id = ?`)
    .get(result.lastInsertRowid) as Contact;
}

// ── Helper: walk up the chain to find the true primary id ─────────────────

function getRootPrimaryId(contact: Contact): number {
  const db = getDb();
  let current = contact;
  const visited = new Set<number>();

  while (current.linkPrecedence === "secondary" && current.linkedId !== null) {
    if (visited.has(current.id)) break; // safety: avoid infinite loop
    visited.add(current.id);
    current = db
      .prepare(`SELECT * FROM Contact WHERE id = ?`)
      .get(current.linkedId) as Contact;
  }

  return current.id;
}

// ── Main function ──────────────────────────────────────────────────────────

export function identifyContact(req: IdentifyRequest): IdentifyResponse {
  const email = req.email ?? null;
  const phoneNumber = req.phoneNumber ? String(req.phoneNumber) : null;

  if (!email && !phoneNumber) {
    throw new Error("At least one of email or phoneNumber must be provided.");
  }

  // Step 1: Find all contacts that match the incoming email or phone
  const matched = findByEmailOrPhone(email, phoneNumber);

  // ── No match: brand new customer ────────────────────────────────────────
  if (matched.length === 0) {
    const newContact = createContact(email, phoneNumber, null, "primary");
    return buildResponse(newContact.id);
  }

  // Step 2: Find the root primary id for each matched contact
  const rootIds = new Set(matched.map(getRootPrimaryId));

  // ── All matches belong to one cluster ───────────────────────────────────
  if (rootIds.size === 1) {
    const primaryId = [...rootIds][0];
    const cluster = findCluster(primaryId);

    // Check if the request brings new information
    const hasNewEmail =
      email !== null && !cluster.some((c) => c.email === email);
    const hasNewPhone =
      phoneNumber !== null &&
      !cluster.some((c) => c.phoneNumber === phoneNumber);

    if (hasNewEmail || hasNewPhone) {
      createContact(email, phoneNumber, primaryId, "secondary");
    }

    return buildResponse(primaryId);
  }

  // ── Matches span two clusters: will merge in Phase 4 ────────────────────
  // For now just return the oldest primary
  const db = getDb();
  const primaries = [...rootIds].map(
    (id) =>
      db.prepare(`SELECT * FROM Contact WHERE id = ?`).get(id) as Contact
  );
  primaries.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return buildResponse(primaries[0].id);
}

// ── Build the final response object ───────────────────────────────────────

function buildResponse(primaryId: number): IdentifyResponse {
  const cluster = findCluster(primaryId);

  const primary = cluster.find((c) => c.id === primaryId)!;
  const secondaries = cluster.filter((c) => c.id !== primaryId);

  const emails: string[] = [];
  const phones: string[] = [];
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  // Primary values always come first
  if (primary.email && !seenEmails.has(primary.email)) {
    seenEmails.add(primary.email);
    emails.push(primary.email);
  }
  if (primary.phoneNumber && !seenPhones.has(primary.phoneNumber)) {
    seenPhones.add(primary.phoneNumber);
    phones.push(primary.phoneNumber);
  }

  // Then secondary values
  for (const s of secondaries) {
    if (s.email && !seenEmails.has(s.email)) {
      seenEmails.add(s.email);
      emails.push(s.email);
    }
    if (s.phoneNumber && !seenPhones.has(s.phoneNumber)) {
      seenPhones.add(s.phoneNumber);
      phones.push(s.phoneNumber);
    }
  }

  return {
    contact: {
      primaryContatctId: primaryId,
      emails,
      phoneNumbers: phones,
      secondaryContactIds: secondaries.map((s) => s.id),
    },
  };
}